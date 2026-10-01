const express=require('express'); const prisma=require('../db'); const {auth}=require('../middleware/auth'); const {createNotification}=require('../services/notifications'); const {sendPushToUser}=require('../services/push');
const router=express.Router(); router.use(auth('ADMIN'));
router.get('/campaigns',async(req,res)=>res.json(await prisma.campaign.findMany({orderBy:{createdAt:'desc'}})));
router.post('/campaigns',async(req,res)=>res.status(201).json(await prisma.campaign.create({data:req.body})));
router.post('/campaigns/:id/send',async(req,res)=>{const c=await prisma.campaign.findUnique({where:{id:req.params.id}});if(!c)return res.status(404).json({error:'Campanha não encontrada'});const users=await prisma.user.findMany({where:{role:'CUSTOMER',active:true},select:{id:true}});let sent=0;for(const u of users){await createNotification(u.id,c.title,c.body,'CAMPAIGN',{campaignId:c.id,couponCode:c.couponCode||''});const r=await sendPushToUser(u.id,c.title,c.body,{type:'CAMPAIGN',campaignId:c.id});sent+=r.sent||0;}await prisma.campaign.update({where:{id:c.id},data:{sentAt:new Date()}});res.json({users:users.length,pushSent:sent});});
module.exports=router;
