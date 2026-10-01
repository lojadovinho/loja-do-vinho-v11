const express=require('express');
const prisma=require('../db');
const {auth}=require('../middleware/auth');
const {quote}=require('../services/delivery');
const {validateCoupon}=require('../services/coupons');
const {checkoutLink}=require('../services/whatsapp');
const {priceFor}=require('../services/pricing');
const crypto=require('crypto');
const {enqueueOrder}=require('../services/pdv-orders');
const r=express.Router();

r.post('/',auth(),async(req,res)=>{try{
 const {items,addressId,paymentMethod,shippingMethod,couponCode,notes}=req.body;
 if(!['PIX_ONLINE','CARD_ONLINE','PAGBANK','CASH_ON_DELIVERY','PIX_ON_DELIVERY','CARD_MACHINE'].includes(paymentMethod)) return res.status(400).json({error:'Forma de pagamento inválida.'});
 if(!['MELHOR_ENVIO','DELIVERY','PICKUP'].includes(shippingMethod)) return res.status(400).json({error:'Forma de envio inválida.'});
 if(!items?.length)return res.status(400).json({error:'Carrinho vazio.'});
 const products=await prisma.product.findMany({where:{id:{in:items.map(x=>x.productId)},active:true}});
 let subtotal=0;const rows=[];
 for(const x of items){const p=products.find(y=>y.id===x.productId);const q=Math.max(1,parseInt(x.quantity));if(!p||q>(p.stock-(p.reservedStock||0)))return res.status(400).json({error:'Estoque insuficiente ou produto inválido.'});const sub=p.priceCents*q;subtotal+=sub;rows.push({productId:p.id,productName:p.name,unitCents:p.priceCents,quantity:q,subtotalCents:sub});}
 const address=await prisma.address.findFirst({where:{id:addressId,userId:req.user.id}});if(!address)return res.status(400).json({error:'Endereço inválido.'});
 const previousOrders=await prisma.order.count({where:{userId:req.user.id}}); const customer=await prisma.user.findUnique({where:{id:req.user.id},select:{phone:true}}); const riskFlags=[]; if(previousOrders===0)riskFlags.push('PRIMEIRO_PEDIDO'); if(!customer?.phone)riskFlags.push('SEM_TELEFONE_CADASTRADO'); if(['CASH_ON_DELIVERY','PIX_ON_DELIVERY','CARD_MACHINE'].includes(paymentMethod))riskFlags.push('PAGAMENTO_NA_ENTREGA'); const riskScore=Math.min(100,riskFlags.length*30); const deliveryCode=shippingMethod==='DELIVERY'?String(crypto.randomInt(100000,1000000)):null;
 let shipping=0;if(shippingMethod==='DELIVERY'){const q=await quote(address.city,address.state,address.district,subtotal);if(!q.available)return res.status(400).json({error:q.reason==='fora_do_horario'?'Delivery fechado neste momento.':'Delivery indisponível para este endereço.'});shipping=q.priceCents;}
 let discount=0,coupon=null;if(couponCode){const v=await validateCoupon({code:couponCode,userId:req.user.id,subtotalCents:subtotal,shippingCents:shipping,city:address.city,state:address.state,district:address.district,productIds:rows.map(x=>x.productId)});if(!v.valid)return res.status(400).json({error:v.message});coupon=v.coupon;discount=v.discountCents;shipping=v.shippingCents;}
 const priced=await priceFor(Math.max(0,subtotal-discount),paymentMethod,address.city,address.state);
 const paymentAdjustment=priced.cents-Math.max(0,subtotal-discount);
 const total=Math.max(0,priced.cents+shipping);
 const order=await prisma.$transaction(async tx=>{
   for(const x of rows){const u=await tx.product.updateMany({where:{id:x.productId,active:true,stock:{gte:x.quantity}},data:{reservedStock:{increment:x.quantity}}});if(u.count!==1)throw Error('ESTOQUE_CONCORRENTE');}
   const o=await tx.order.create({data:{userId:req.user.id,addressId,status:'PAYMENT_PENDING',paymentMethod,shippingMethod,subtotalCents:subtotal,shippingCents:shipping,discountCents:discount+Math.max(0,-paymentAdjustment),totalCents:total,couponId:coupon?.id,deliveryCity:address.city,deliveryDistrict:address.district,notes,stockReservedAt:new Date(),deliveryCode,riskScore,riskFlags,items:{create:rows},payment:{create:{method:paymentMethod,provider:paymentMethod==='PAGBANK'?'PAGBANK':null,amountCents:total}}},include:{items:true,payment:true}});
   if(coupon){await tx.coupon.update({where:{id:coupon.id},data:{usedCount:{increment:1},...(coupon.maxUses&&coupon.autoDisableOnExhaustion&&coupon.usedCount+1>=coupon.maxUses?{active:false}:{})}});await tx.couponUsage.create({data:{couponId:coupon.id,userId:req.user.id,orderId:o.id}})}
   return o;
 });
 const fresh=await prisma.order.findUnique({where:{id:order.id},include:{items:true,user:true,address:true}});
 await enqueueOrder(fresh.id, ['CASH_ON_DELIVERY','PIX_ON_DELIVERY','CARD_MACHINE','PICKUP'].includes(fresh.paymentMethod) ? 'READY' : 'WAITING_PAYMENT');
 res.status(201).json({order:fresh,whatsappUrl:checkoutLink(fresh),paymentOnline:['PIX_ONLINE','CARD_ONLINE','PAGBANK'].includes(fresh.paymentMethod)});
}catch(e){console.error(e);res.status(e.message==='ESTOQUE_CONCORRENTE'?409:500).json({error:e.message==='ESTOQUE_CONCORRENTE'?'Estoque acabou para um dos produtos.':'Não foi possível criar o pedido.'})}});
module.exports=r;
