const BASE = process.env.PAGBANK_ENV === 'production' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';

function enabled(){ return Boolean(process.env.PAGBANK_TOKEN); }
async function request(path, options={}){
  if(!enabled()) throw new Error('PAGBANK_TOKEN_NAO_CONFIGURADO');
  const r=await fetch(`${BASE}${path}`,{...options,headers:{Authorization:`Bearer ${process.env.PAGBANK_TOKEN}`,'Content-Type':'application/json',Accept:'application/json',...(options.headers||{})}});
  const text=await r.text(); let data={}; try{data=text?JSON.parse(text):{};}catch{data={raw:text};}
  if(!r.ok){const e=new Error(data.message||data.error||`PagBank HTTP ${r.status}`);e.status=r.status;e.details=data;throw e;}
  return data;
}
function payUrl(data){return data?.links?.find(x=>x.rel==='PAY')?.href || data?.links?.find(x=>x.rel==='pay')?.href || null;}
function paymentTypes(method){
  if(method==='PIX_ONLINE') return [{type:'PIX'}];
  return [{type:'CREDIT_CARD'}];
}
async function createCheckout({order,user,address,items,method,shippingCents,discountCents,baseUrl}){
  const payload={
    reference_id: String(order.id).slice(0,64), customer_modifiable:false,
    customer:{name:user.name,email:user.email,tax_id:user.cpf||undefined},
    items:items.map(i=>({reference_id:i.productId,name:i.productName,quantity:i.quantity,unit_amount:i.unitCents})),
    additional_amount: shippingCents,
    discount_amount: discountCents,
    payment_methods: paymentTypes(method),
    redirect_url:`${baseUrl}/?pagbank=return&order=${encodeURIComponent(order.id)}`,
    return_url:`${baseUrl}/?pagbank=return&order=${encodeURIComponent(order.id)}`,
    notification_urls:[`${baseUrl}/api/payments/pagbank/webhook`],
    payment_notification_urls:[`${baseUrl}/api/payments/pagbank/webhook`]
  };
  if(address){payload.shipping={type:shippingCents?'FIXED':'FREE',amount:shippingCents,address:{country:'BRA',region_code:address.state,city:address.city,postal_code:address.zipCode,street:address.street,number:address.number,locality:address.district,complement:address.complement||undefined}};}
  return request('/checkouts',{method:'POST',body:JSON.stringify(payload)});
}
module.exports={createCheckout,payUrl,enabled};
