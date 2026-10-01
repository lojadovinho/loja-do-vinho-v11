const prisma = require('../db');

async function createNotification(userId, title, body, type='GENERAL', data={}) {
  return prisma.notification.create({data:{userId,title,body,type,data}});
}

async function notifyOrderStatus(order, title, body, status) {
  await prisma.orderEvent.create({data:{orderId:order.id,status,title,message:body}});
  await createNotification(order.userId,title,body,'ORDER_STATUS',{orderId:order.id,status,orderNumber:order.number});
  return {ok:true};
}

module.exports={createNotification,notifyOrderStatus};
