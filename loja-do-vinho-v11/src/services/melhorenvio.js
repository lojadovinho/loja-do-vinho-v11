const BASE = process.env.MELHOR_ENVIO_ENV === 'sandbox' ? 'https://sandbox.melhorenvio.com.br' : 'https://www.melhorenvio.com.br';
function enabled(){return Boolean(process.env.MELHOR_ENVIO_TOKEN);}
async function calculate({toZip,products}){
  if(!enabled()) throw new Error('MELHOR_ENVIO_TOKEN_NAO_CONFIGURADO');
  const from=process.env.MELHOR_ENVIO_ORIGIN_ZIP;
  if(!from) throw new Error('MELHOR_ENVIO_ORIGIN_ZIP_NAO_CONFIGURADO');
  const payload={from:{postal_code:from},to:{postal_code:String(toZip).replace(/\D/g,'')},products:products.map(p=>({name:p.productName||p.name,quantity:p.quantity,unitary_value:(p.unitCents||p.priceCents)/100,weight:Number(p.weightKg||0.75),width:Number(p.widthCm||12),height:Number(p.heightCm||18),length:Number(p.lengthCm||12)}))};
  const r=await fetch(`${BASE}/api/v2/me/shipment/calculate`,{method:'POST',headers:{Authorization:`Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,Accept:'application/json','Content-Type':'application/json','User-Agent':`${process.env.MELHOR_ENVIO_APP||'Loja do Vinho'} (${process.env.SUPPORT_EMAIL||'suporte@lojaadovinho.com.br'})`},body:JSON.stringify(payload)});
  const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={raw:text}};
  if(!r.ok) throw Object.assign(new Error(data.message||`Melhor Envio HTTP ${r.status}`),{status:r.status,details:data});
  return Array.isArray(data)?data:[];
}
module.exports={calculate,enabled};
