const express=require('express'); const prisma=require('../db'); const {auth}=require('../middleware/auth'); const {sendPushToUser}=require('../services/push');
const router=express.Router();
router.use(auth());
router.post('/push-token',async(req,res)=>{const {token,platform}=req.body;if(!token)return res.status(400).json({error:'Token obrigatório'});const item=await prisma.pushToken.upsert({where:{token},update:{userId:req.user.id,platform,active:true},create:{userId:req.user.id,token,platform}});res.json(item)});
router.get('/',async(req,res)=>res.json(await prisma.notification.findMany({where:{userId:req.user.id},orderBy:{createdAt:'desc'},take:100})));
router.post('/:id/read',async(req,res)=>res.json(await prisma.notification.updateMany({where:{id:req.params.id,userId:req.user.id},data:{readAt:new Date()}})));
router.get('/orders/:orderId/timeline',async(req,res)=>{const order=await prisma.order.findFirst({where:{id:req.params.orderId,userId:req.user.id}});if(!order)return res.status(404).json({error:'Pedido não encontrado'});res.json(await prisma.orderEvent.findMany({where:{orderId:order.id},orderBy:{createdAt:'asc'}}));});
module.exports=router;
