const prisma = require('../db');
const crypto = require('crypto');

function buildPayload(order) {
  return {
    integrationVersion: '1.0',
    source: 'LOJA_DO_VINHO_ECOMMERCE',
    idempotencyKey: `LV-${order.id}`,
    orderId: order.id,
    orderNumber: order.number,
    createdAt: order.createdAt,
    customer: { id: order.user?.id, name: order.user?.name, email: order.user?.email, phone: order.user?.phone, cpf: order.user?.cpf },
    address: order.address ? { zipCode: order.address.zipCode, street: order.address.street, number: order.address.number, complement: order.address.complement, district: order.address.district, city: order.address.city, state: order.address.state } : null,
    payment: { method: order.paymentMethod, totalCents: order.totalCents },
    shipping: { method: order.shippingMethod, amountCents: order.shippingCents },
    items: (order.items || []).map(i => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, unitCents: i.unitCents, subtotalCents: i.subtotalCents }))
  };
}

async function enqueueOrder(orderId, status='READY') {
  const order = await prisma.order.findUnique({ where:{id:orderId}, include:{items:true,user:true,address:true} });
  if (!order) throw new Error('Pedido não encontrado.');
  const existing = await prisma.pdvOrderQueue.findUnique({where:{orderId}});
  if (existing) {
    if (existing.status === 'WAITING_PAYMENT' && status === 'READY') return prisma.pdvOrderQueue.update({where:{id:existing.id},data:{status,lastError:null}});
    return existing;
  }
  const idempotencyKey = `LV-${order.id}`;
  return prisma.pdvOrderQueue.create({data:{orderId,idempotencyKey,status,payload:buildPayload(order)}});
}

async function markReady(orderId) { return enqueueOrder(orderId,'READY'); }

async function markSent(id, externalRef) {
  return prisma.pdvOrderQueue.update({where:{id},data:{status:'SENT',sentAt:new Date(),attempts:{increment:1},externalRef:externalRef||null,lastError:null}});
}
async function markConfirmed(id, externalRef) {
  return prisma.pdvOrderQueue.update({where:{id},data:{status:'CONFIRMED',confirmedAt:new Date(),externalRef:externalRef||undefined,lastError:null}});
}
async function markError(id,error) {
  return prisma.pdvOrderQueue.update({where:{id},data:{status:'ERROR',attempts:{increment:1},lastError:String(error).slice(0,1000)}});
}

module.exports={enqueueOrder,markReady,markSent,markConfirmed,markError,buildPayload};
