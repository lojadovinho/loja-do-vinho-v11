const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const prisma = require("../db");
const { auth } = require("../middleware/auth");
const {OAuth2Client}=require("google-auth-library");
const {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse}=require("@simplewebauthn/server");
const crypto=require("crypto");
const challenges=new Map();
const googleClient=new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
function session(res,user){const token=jwt.sign({id:user.id,role:user.role,name:user.name},process.env.JWT_SECRET,{expiresIn:"7d"});res.cookie("lv_token",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*24*60*60*1000});}
function origin(){return process.env.APP_URL||"http://localhost:3000"}
function rpID(){if(process.env.WEBAUTHN_RP_ID)return process.env.WEBAUTHN_RP_ID;try{return new URL(origin()).hostname}catch{return "localhost"}}

const router = express.Router();

router.get("/config",(req,res)=>res.json({googleClientId:process.env.GOOGLE_CLIENT_ID||null,passkeyEnabled:Boolean(process.env.WEBAUTHN_RP_ID||process.env.APP_URL)}));

router.post("/register", async (req,res) => {
  const data = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    phone: z.string().optional()
  }).parse(req.body);

  const exists = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() }});
  if (exists) return res.status(409).json({ error: "E-mail já cadastrado." });

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: { ...data, email: data.email.toLowerCase(), passwordHash }
  });
  res.status(201).json({ id: user.id, name: user.name, email: user.email });
});

router.post("/login", async (req,res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }});
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "E-mail ou senha inválidos." });
  }

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie("lv_token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7*24*60*60*1000 });
  res.json({ id: user.id, name: user.name, role: user.role });
});

router.post("/google", async (req,res)=>{try{
  if(!process.env.GOOGLE_CLIENT_ID)return res.status(503).json({error:"Login com Google ainda não configurado."});
  const ticket=await googleClient.verifyIdToken({idToken:req.body.credential,audience:process.env.GOOGLE_CLIENT_ID});
  const p=ticket.getPayload(); if(!p?.sub||!p.email||p.email_verified===false)return res.status(401).json({error:"Conta Google não verificada."});
  let user=await prisma.user.findUnique({where:{email:p.email.toLowerCase()}});
  if(!user) user=await prisma.user.create({data:{name:p.name||p.email.split('@')[0],email:p.email.toLowerCase(),passwordHash:await bcrypt.hash(crypto.randomBytes(24).toString('hex'),12)}});
  if(!user.active)return res.status(403).json({error:"Conta desativada."}); session(res,user);res.json({id:user.id,name:user.name,email:user.email,role:user.role});
}catch(e){console.error(e);res.status(401).json({error:"Não foi possível validar o Google."})}});

router.get("/passkey/register/options",auth(),async(req,res)=>{try{
 const user=await prisma.user.findUnique({where:{id:req.user.id},include:{passkeys:true}}); if(!user)return res.status(404).json({error:"Usuário não encontrado."});
 const options=await generateRegistrationOptions({rpName:"Loja do Vinho",rpID:rpID(),userID:new TextEncoder().encode(user.id),userName:user.email,attestationType:'none',excludeCredentials:user.passkeys.map(p=>({id:p.credentialId,transports:p.transports?JSON.parse(p.transports):undefined})),authenticatorSelection:{residentKey:'preferred',userVerification:'required',authenticatorAttachment:'platform'}});
 challenges.set(`reg:${user.id}`,options.challenge);res.json(options);
}catch(e){console.error(e);res.status(500).json({error:"Não foi possível iniciar o cadastro biométrico."})}});
router.post("/passkey/register/verify",auth(),async(req,res)=>{try{
 const expectedChallenge=challenges.get(`reg:${req.user.id}`); if(!expectedChallenge)return res.status(400).json({error:"Sessão biométrica expirada."});
 const v=await verifyRegistrationResponse({response:req.body,expectedChallenge,expectedOrigin:origin(),expectedRPID:rpID(),requireUserVerification:true});
 if(!v.verified||!v.registrationInfo)return res.status(400).json({error:"Biometria não validada."});
 const c=v.registrationInfo.credential; await prisma.passkeyCredential.create({data:{userId:req.user.id,credentialId:c.id,publicKey:Buffer.from(c.publicKey),counter:c.counter,transports:c.transports?JSON.stringify(c.transports):null}});challenges.delete(`reg:${req.user.id}`);res.json({ok:true});
}catch(e){console.error(e);res.status(400).json({error:"Não foi possível cadastrar a biometria."})}});
router.post("/passkey/options",async(req,res)=>{try{const email=String(req.body.email||'').toLowerCase();const user=await prisma.user.findUnique({where:{email},include:{passkeys:true}});if(!user||!user.active||!user.passkeys.length)return res.status(404).json({error:"Nenhuma biometria cadastrada para esta conta."});const options=await generateAuthenticationOptions({rpID:rpID(),allowCredentials:user.passkeys.map(p=>({id:p.credentialId,transports:p.transports?JSON.parse(p.transports):undefined})),userVerification:'required'});challenges.set(`auth:${user.id}`,options.challenge);res.json({userId:user.id,options});}catch(e){res.status(500).json({error:"Não foi possível iniciar a biometria."})}});
router.post("/passkey/verify",async(req,res)=>{try{const user=await prisma.user.findUnique({where:{id:req.body.userId},include:{passkeys:true}});if(!user||!user.active)return res.status(401).json({error:"Conta inválida."});const challenge=challenges.get(`auth:${user.id}`);const credId=req.body.response?.id;const c=user.passkeys.find(x=>x.credentialId===credId);if(!challenge||!c)return res.status(401).json({error:"Credencial biométrica inválida ou expirada."});const v=await verifyAuthenticationResponse({response:req.body.response,expectedChallenge:challenge,expectedOrigin:origin(),expectedRPID:rpID(),credential:{id:c.credentialId,publicKey:new Uint8Array(c.publicKey),counter:c.counter,transports:c.transports?JSON.parse(c.transports):undefined},requireUserVerification:true});if(!v.verified)return res.status(401).json({error:"Biometria não validada."});await prisma.passkeyCredential.update({where:{id:c.id},data:{counter:v.authenticationInfo.newCounter,lastUsedAt:new Date()}});challenges.delete(`auth:${user.id}`);session(res,user);res.json({id:user.id,name:user.name,email:user.email,role:user.role});}catch(e){console.error(e);res.status(401).json({error:"Falha na autenticação biométrica."})}});

router.post("/logout", (req,res) => {
  res.clearCookie("lv_token");
  res.json({ ok: true });
});

router.get("/me", auth(), async (req,res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id:true, name:true, email:true, phone:true, role:true }
  });
  res.json(user);
});

module.exports = router;
