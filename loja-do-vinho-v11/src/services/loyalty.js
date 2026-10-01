const prisma=require('../db');
async function config(){
  const rows=await prisma.securityRule.findMany({where:{key:{in:['LOYALTY_POINTS_PER_CENTS','LOYALTY_REDEEM_CENTS_PER_POINT','LOYALTY_MAX_REDEMPTION_PERCENT','LOYALTY_EXPIRY_DAYS']}}});
  const d=Object.fromEntries(rows.map(r=>[r.key,Number(r.value)]));
  return {earnEveryCents:d.LOYALTY_POINTS_PER_CENTS||2000,redeemCentsPerPoint:d.LOYALTY_REDEEM_CENTS_PER_POINT||5,maxPercent:d.LOYALTY_MAX_REDEMPTION_PERCENT||5,expiryDays:d.LOYALTY_EXPIRY_DAYS||180};
}
async function getAccount(userId){return prisma.loyaltyAccount.upsert({where:{userId},create:{userId},update:{}})}
async function earnForOrder(orderId){
 const order=await prisma.order.findUnique({where:{id:orderId},include:{user:true}}); if(!order)return null;
 const cfg=await config(); const eligible=Math.max(0,order.subtotalCents-order.discountCents); const points=Math.floor(eligible/cfg.earnEveryCents); if(points<=0)return getAccount(order.userId);
 const account=await getAccount(order.userId); const exists=await prisma.loyaltyLedger.findFirst({where:{accountId:account.id,orderId,type:'EARN'}}); if(exists)return account;
 const expires=new Date(Date.now()+cfg.expiryDays*86400000);
 return prisma.$transaction(async tx=>{const a=await tx.loyaltyAccount.update({where:{id:account.id},data:{points:{increment:points},lifetimeEarned:{increment:points}}});await tx.loyaltyLedger.create({data:{accountId:account.id,orderId,type:'EARN',points,description:`Pontos do pedido #${order.number}`,expiresAt:expires}});return a});
}
async function quoteRedemption(userId,requestedPoints,orderTotalCents){const cfg=await config();const a=await getAccount(userId);const active=await prisma.loyaltyLedger.aggregate({where:{accountId:a.id,type:'EARN',expiresAt:{gt:new Date()}},_sum:{points:true}});const available=Math.min(a.points,active._sum.points||a.points);const maxPoints=Math.floor((orderTotalCents*(cfg.maxPercent/100))/cfg.redeemCentsPerPoint);const points=Math.max(0,Math.min(Number(requestedPoints||0),available,maxPoints));return {points,discountCents:points*cfg.redeemCentsPerPoint,available,maxPoints,config:cfg}}
async function redeem(userId,points,orderId){const q=await quoteRedemption(userId,points,99999999);if(q.points<=0)return {points:0,discountCents:0};const a=await getAccount(userId);return prisma.$transaction(async tx=>{const account=await tx.loyaltyAccount.update({where:{id:a.id},data:{points:{decrement:q.points},lifetimeRedeemed:{increment:q.points}}});await tx.loyaltyLedger.create({data:{accountId:a.id,orderId,type:'REDEEM',points:-q.points,description:`Resgate no pedido${orderId?` #${orderId}`:''}`}});return {account,points:q.points,discountCents:q.discountCents}})}
module.exports={config,getAccount,earnForOrder,quoteRedemption,redeem};
