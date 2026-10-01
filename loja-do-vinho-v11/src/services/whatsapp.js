async function sendWhatsAppText(to, body) {
  const token=process.env.WHATSAPP_ACCESS_TOKEN, phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  if(!token || !phoneId) return {sent:false,configured:false};
  const version=process.env.WHATSAPP_GRAPH_VERSION||'v23.0';
  const r=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,text:{preview_url:false,body}})});
  const data=await r.json().catch(()=>({}));
  return {sent:r.ok,configured:true,status:r.status,data};
}
function orderStatusMessage(order,status){
 const map={PAID:'Pagamento confirmado. Estamos preparando seu pedido 🍷.',PREPARING:'Seu pedido está sendo preparado. 🍷',SHIPPED:'Seu pedido foi enviado para transporte. 📦',OUT_FOR_DELIVERY:'Seu pedido saiu para entrega. 🛵',DELIVERED:'Pedido entregue. Obrigado por comprar na Loja do Vinho! 🍷',CANCELLED:'Seu pedido foi cancelado. Entre em contato conosco se precisar de ajuda.'};
 return `Loja do Vinho — Pedido #${order.number}\n\n${map[status]||`Status atualizado: ${status}`}`;
}
module.exports={sendWhatsAppText,orderStatusMessage};
