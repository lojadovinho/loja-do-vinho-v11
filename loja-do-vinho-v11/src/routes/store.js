const express = require('express');const prisma=require('../db');const {getDeliveryStatus,quote}=require('../services/delivery');const {validateCoupon}=require('../services/coupons');const {auth}=require('../middleware/auth');const {calculate,enabled}=require('../services/melhorenvio');
const router=express.Router();
const {scopeFor,getRules,apply}=require('../services/pricing');

router.get('/about',async(req,res)=>{const p=await prisma.storeProfile.findFirst({where:{active:true}});res.json(p||{tradeName:'Loja do Vinho',story:'',city:'Juazeiro',state:'BA'});});
router.get('/loyalty',auth(),async(req,res)=>{const {getAccount,config}=require('../services/loyalty');const [a,c]=await Promise.all([getAccount(req.user.id),config()]);res.json({points:a.points,lifetimeEarned:a.lifetimeEarned,lifetimeRedeemed:a.lifetimeRedeemed,config:c});});
router.post('/loyalty/quote',auth(),async(req,res)=>{const {quoteRedemption}=require('../services/loyalty');res.json(await quoteRedemption(req.user.id,Number(req.body.points||0),Number(req.body.orderTotalCents||0)));});
router.get('/products',async(req,res)=>{const ps=await prisma.product.findMany({where:{active:true},include:{category:true,photos:{where:{active:true},orderBy:{sortOrder:'asc'}}},orderBy:[{featured:'desc'},{name:'asc'}]});const scope=scopeFor(req.query.city,req.query.state);const rules=await getRules(scope);res.json(ps.map(p=>({...p,availableStock:Math.max(0,p.stock-(p.reservedStock||0)),paymentPrices:Object.fromEntries(Object.entries(rules).map(([method,r])=>[method,{cents:apply(p.priceCents,r),label:r.label,installments:r.installments,scope:r.scope}]))})));});
router.get('/payment-prices',async(req,res)=>{const scope=scopeFor(req.query.city,req.query.state);const rules=await getRules(scope);res.json(Object.values(rules));});
router.get('/payment-methods',async(req,res)=>res.json(await prisma.paymentSetting.findMany({where:{enabled:true},select:{method:true,config:true}})));
router.get('/shipping-methods',async(req,res)=>res.json(await prisma.shippingSetting.findMany({where:{enabled:true},select:{name:true,config:true}})));
router.get('/delivery/status',async(req,res)=>res.json(await getDeliveryStatus()));
router.post('/delivery/quote',async(req,res)=>res.json(await quote(req.body.city,req.body.state,req.body.district,Number(req.body.subtotalCents||0))));
router.post('/melhor-envio/quote',auth(),async(req,res)=>{try{if(!enabled())return res.status(503).json({error:'Melhor Envio não configurado.'});const {zipCode,items}=req.body;const ids=(items||[]).map(x=>x.productId);const ps=await prisma.product.findMany({where:{id:{in:ids},active:true}});const rows=(items||[]).map(x=>{const p=ps.find(y=>y.id===x.productId);if(!p)throw Error('Produto inválido.');return {...p,productName:p.name,quantity:Math.max(1,Number(x.quantity||1)),unitCents:p.priceCents};});const data=await calculate({toZip:zipCode,products:rows});res.json(data.map(q=>({id:q.id,name:q.name,company:q.company,priceCents:Math.round(Number(q.custom_price??q.price??0)*100),deliveryTime:q.custom_delivery_time??q.delivery_time})));}catch(e){res.status(e.status||500).json({error:e.message||'Erro ao cotar Melhor Envio.'});}});
router.post('/coupon/validate',auth(),async(req,res)=>res.json(await validateCoupon({...req.body,userId:req.user.id})));
router.get('/addresses',auth(),async(req,res)=>res.json(await prisma.address.findMany({where:{userId:req.user.id},orderBy:{createdAt:'desc'}})));
router.post('/addresses',auth(),async(req,res)=>res.status(201).json(await prisma.address.create({data:{...req.body,userId:req.user.id}})));
router.get('/orders',auth(),async(req,res)=>res.json(await prisma.order.findMany({where:{userId:req.user.id},include:{items:true,payment:true},orderBy:{createdAt:'desc'}})));
module.exports=router;
