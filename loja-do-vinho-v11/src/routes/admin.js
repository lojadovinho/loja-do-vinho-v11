const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const prisma = require("../db");
const { auth } = require("../middleware/auth");
const {notifyOrderStatus}=require('../services/notifications');
const {sendPushToUser}=require('../services/push');
const {sendWhatsAppText,orderStatusMessage}=require('../services/whatsapp');
const {markReady,markSent,markConfirmed,markError}=require('../services/pdv-orders');
const router = express.Router();
const uploadDir=path.join(__dirname,"../../public/uploads"); fs.mkdirSync(uploadDir,{recursive:true});
const upload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,Date.now()+"-"+Math.random().toString(36).slice(2)+path.extname(file.originalname).toLowerCase())}),limits:{fileSize:5*1024*1024},fileFilter:(req,file,cb)=>cb(null,/^image\/(jpeg|png|webp|avif)$/.test(file.mimetype))});
router.use(auth("ADMIN"));

router.get("/dashboard", async (req,res)=>{
  const [orders, pending, products, customers, revenue] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({where:{status:{in:["PAYMENT_PENDING","PAID","PREPARING","OUT_FOR_DELIVERY","SHIPPED"]}}}),
    prisma.product.count({where:{active:true}}),
    prisma.user.count({where:{role:"CUSTOMER",active:true}}),
    prisma.order.aggregate({where:{status:{in:["PAID","PREPARING","SHIPPED","OUT_FOR_DELIVERY","DELIVERED"]}},_sum:{totalCents:true}})
  ]);
  res.json({orders,pending,products,customers,revenueCents:revenue._sum.totalCents||0});
});

router.get("/orders", async (req,res)=>{
  const status=req.query.status;
  const where=status?{status}:{ };
  res.json(await prisma.order.findMany({where,orderBy:{createdAt:"desc"},take:100,include:{user:{select:{id:true,name:true,email:true,phone:true}},items:true,address:true,payment:true}}));
});
router.put("/orders/:id", async (req,res)=>{
  const allowed=["PENDING","PAYMENT_PENDING","PAID","PREPARING","SHIPPED","OUT_FOR_DELIVERY","DELIVERED","CANCELLED"];
  const {status,adminNote}=req.body;
  if(status && !allowed.includes(status)) return res.status(400).json({error:"Status inválido"});
  const current=await prisma.order.findUnique({where:{id:req.params.id},include:{items:true}});
  if(!current)return res.status(404).json({error:"Pedido não encontrado"});
  const paidStates=["PAID","PREPARING","SHIPPED","OUT_FOR_DELIVERY","DELIVERED"];
  const finalize=paidStates.includes(status)&&!paidStates.includes(current.status);
  const cancel=status==="CANCELLED"&&current.status!=="CANCELLED";
  const order=await prisma.$transaction(async tx=>{
    if(finalize){for(const i of current.items){await tx.product.update({where:{id:i.productId},data:{stock:{decrement:i.quantity},reservedStock:{decrement:i.quantity}}})}}
    if(cancel){for(const i of current.items){await tx.product.update({where:{id:i.productId},data:{reservedStock:{decrement:i.quantity}}})}}
    return tx.order.update({where:{id:current.id},data:{...(status?{status}:{}),...(adminNote!==undefined?{adminNote}: {}),...(finalize||cancel?{stockReleasedAt:new Date()}: {})}});
  });
  if(finalize){await require('../services/loyalty').earnForOrder(order.id).catch(()=>{}); await markReady(order.id).catch(()=>{});}
  if(cancel){await prisma.pdvOrderQueue.updateMany({where:{orderId:order.id,status:{not:'CONFIRMED'}},data:{status:'CANCELLED',lastError:'Pedido cancelado no e-commerce'}}).catch(()=>{});}
  if(status && status!==current.status){
    const title=`Pedido #${order.number} atualizado`;
    const body=({PAID:'Pagamento confirmado. 🍷',PREPARING:'Seu pedido está sendo preparado. 🍷',SHIPPED:'Seu pedido foi enviado. 📦',OUT_FOR_DELIVERY:'Seu pedido saiu para entrega. 🛵',DELIVERED:'Pedido entregue. Obrigado! 🍷',CANCELLED:'Seu pedido foi cancelado.'})[status]||`Status: ${status}`;
    await notifyOrderStatus(order,title,body,status);
    await sendPushToUser(order.userId,title,body,{orderId:order.id,status});
    if(order.user?.phone) await sendWhatsAppText(order.user.phone,orderStatusMessage(order,status)).catch(()=>{});
  }
  res.json(order);
});

router.get("/products", async (req,res)=>res.json(await prisma.product.findMany({orderBy:{createdAt:"desc"},include:{category:true}})));
router.post("/products", async (req,res)=>{
  const d=req.body; if(!d.name||!d.slug) return res.status(400).json({error:"Nome e slug são obrigatórios"});
  const item=await prisma.product.create({data:{...d,priceCents:Number(d.priceCents),stock:Number(d.stock||0),reservedStock:Number(d.reservedStock||0)}}); res.status(201).json(item);
});
router.put("/products/:id", async (req,res)=>{
  const d={...req.body}; for(const k of ["priceCents","stock","reservedStock"]) if(d[k]!==undefined)d[k]=Number(d[k]);
  const item=await prisma.product.update({where:{id:req.params.id},data:d}); res.json(item);
});
router.delete("/products/:id", async(req,res)=>{await prisma.product.update({where:{id:req.params.id},data:{active:false}});res.status(204).end()});

router.get("/categories", async(req,res)=>res.json(await prisma.category.findMany({orderBy:{name:"asc"}})));
router.post("/categories", async(req,res)=>res.status(201).json(await prisma.category.create({data:req.body})));
router.put("/categories/:id", async(req,res)=>res.json(await prisma.category.update({where:{id:req.params.id},data:req.body})));

router.get("/customers", async(req,res)=>res.json(await prisma.user.findMany({where:{role:"CUSTOMER"},orderBy:{createdAt:"desc"},take:200,select:{id:true,name:true,email:true,phone:true,cpf:true,active:true,createdAt:true,addresses:true,_count:{select:{orders:true}}}})));
router.put("/customers/:id", async(req,res)=>res.json(await prisma.user.update({where:{id:req.params.id},data:{active:!!req.body.active}})));

router.get("/delivery/schedule", async (req,res)=>res.json(await prisma.deliverySchedule.findMany({orderBy:{dayOfWeek:"asc"}})));
router.put("/delivery/schedule/:day", async (req,res)=>res.json(await prisma.deliverySchedule.update({where:{dayOfWeek:Number(req.params.day)},data:{enabled:!!req.body.enabled,opensAt:req.body.opensAt,closesAt:req.body.closesAt}})));
router.get("/delivery/zones", async (req,res)=>res.json(await prisma.deliveryZone.findMany({orderBy:[{city:"asc"},{district:"asc"}]})));
router.post("/delivery/zones", async(req,res)=>res.status(201).json(await prisma.deliveryZone.create({data:{...req.body,priceCents:Number(req.body.priceCents),minOrderCents:req.body.minOrderCents==null?null:Number(req.body.minOrderCents)}})));
router.put("/delivery/zones/:id", async(req,res)=>res.json(await prisma.deliveryZone.update({where:{id:req.params.id},data:{...req.body,priceCents:req.body.priceCents===undefined?undefined:Number(req.body.priceCents),minOrderCents:req.body.minOrderCents===undefined?undefined:(req.body.minOrderCents==null?null:Number(req.body.minOrderCents))}})));
router.delete("/delivery/zones/:id", async(req,res)=>{await prisma.deliveryZone.delete({where:{id:req.params.id}});res.status(204).end()});

router.get("/payments", async(req,res)=>res.json(await prisma.paymentSetting.findMany({orderBy:{method:"asc"}})));
router.put("/payments/:method", async(req,res)=>res.json(await prisma.paymentSetting.update({where:{method:req.params.method},data:{enabled:!!req.body.enabled,config:req.body.config||undefined}})));
router.get("/shipping", async(req,res)=>res.json(await prisma.shippingSetting.findMany({orderBy:{name:"asc"}})));
router.put("/shipping/:name", async(req,res)=>res.json(await prisma.shippingSetting.update({where:{name:req.params.name},data:{enabled:!!req.body.enabled,config:req.body.config||undefined}})));

router.get("/coupons", async(req,res)=>res.json(await prisma.coupon.findMany({orderBy:{createdAt:"desc"},include:{products:true}})));
router.post("/coupons", async(req,res)=>{const d={...req.body,code:String(req.body.code).trim().toUpperCase()};res.status(201).json(await prisma.coupon.create({data:d}))});
router.put("/coupons/:id", async(req,res)=>res.json(await prisma.coupon.update({where:{id:req.params.id},data:req.body})));
router.post("/coupons/:id/deactivate", async(req,res)=>res.json(await prisma.coupon.update({where:{id:req.params.id},data:{active:false}})));


router.get("/payment-price-rules", async(req,res)=>res.json(await prisma.paymentPriceRule.findMany({orderBy:[{scope:"asc"},{method:"asc"},{installments:"asc"}]})));
router.post("/payment-price-rules", async(req,res)=>{const d=req.body;res.status(201).json(await prisma.paymentPriceRule.create({data:{method:d.method,scope:d.scope||"ALL",installments:d.installments==null?null:Number(d.installments),adjustmentType:d.adjustmentType||"PERCENT_DISCOUNT",adjustmentValue:Number(d.adjustmentValue||0),label:d.label||null,active:d.active!==false}}))});
router.put("/payment-price-rules/:id", async(req,res)=>{const d=req.body;res.json(await prisma.paymentPriceRule.update({where:{id:req.params.id},data:{...d,installments:d.installments==null?null:Number(d.installments),adjustmentValue:d.adjustmentValue===undefined?undefined:Number(d.adjustmentValue)}}))});
router.delete("/payment-price-rules/:id", async(req,res)=>{await prisma.paymentPriceRule.delete({where:{id:req.params.id}});res.status(204).end()});
router.post("/products/:id/photos/upload", upload.single("photo"), async(req,res)=>{if(!req.file)return res.status(400).json({error:"Envie uma imagem JPG, PNG, WEBP ou AVIF de até 5MB."});const photo=await prisma.productPhoto.create({data:{productId:req.params.id,url:"/uploads/"+req.file.filename,alt:req.body.alt||null,sortOrder:Number(req.body.sortOrder||0)}});res.status(201).json(photo)});
router.get("/products/:id/photos", async(req,res)=>res.json(await prisma.productPhoto.findMany({where:{productId:req.params.id},orderBy:{sortOrder:"asc"}})));
router.post("/products/:id/photos", async(req,res)=>res.status(201).json(await prisma.productPhoto.create({data:{productId:req.params.id,url:req.body.url,alt:req.body.alt||null,sortOrder:Number(req.body.sortOrder||0)}})));
router.delete("/products/:id/photos/:photoId", async(req,res)=>{await prisma.productPhoto.delete({where:{id:req.params.photoId}});res.status(204).end()});
router.post("/pdv/sync", async(req,res)=>{const rows=Array.isArray(req.body.products)?req.body.products:[];let updated=0,created=0;for(const r of rows){if(!r.pdvId)continue;const category=r.categorySlug?await prisma.category.findUnique({where:{slug:r.categorySlug}}):null;const data={name:r.name,slug:r.slug||String(r.name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''),priceCents:Number(r.priceCents||0),stock:Number(r.stock||0),categoryId:category?.id||null,pdvManaged:true,active:r.active!==false};const old=await prisma.product.findUnique({where:{pdvId:String(r.pdvId)}});if(old){await prisma.product.update({where:{id:old.id},data});updated++}else{await prisma.product.create({data:{...data,pdvId:String(r.pdvId)}});created++}}res.json({updated,created,total:rows.length})});

router.get("/reports/sales", async(req,res)=>{
 const orders=await prisma.order.findMany({where:{status:{in:["PAID","PREPARING","SHIPPED","OUT_FOR_DELIVERY","DELIVERED"]}},orderBy:{createdAt:"desc"},include:{items:true}});
 const byProduct={}; for(const o of orders) for(const i of o.items){byProduct[i.productName]=(byProduct[i.productName]||0)+i.quantity}
 res.json({orders:orders.length,revenueCents:orders.reduce((a,o)=>a+o.totalCents,0),topProducts:Object.entries(byProduct).sort((a,b)=>b[1]-a[1]).slice(0,10)});
});
router.get('/about',async(req,res)=>res.json(await prisma.storeProfile.findFirst()||{}));
router.put('/about',async(req,res)=>{const data=req.body;const old=await prisma.storeProfile.findFirst();res.json(old?await prisma.storeProfile.update({where:{id:old.id},data}):await prisma.storeProfile.create({data:{...data,tradeName:data.tradeName||'Loja do Vinho'}}));});
router.get('/security-rules',async(req,res)=>res.json(await prisma.securityRule.findMany({orderBy:{key:'asc'}})));
router.put('/security-rules/:key',async(req,res)=>res.json(await prisma.securityRule.upsert({where:{key:req.params.key},create:{key:req.params.key,value:String(req.body.value)},update:{value:String(req.body.value)}})));
router.get('/loyalty/summary',async(req,res)=>res.json(await prisma.loyaltyAccount.findMany({include:{user:{select:{id:true,name:true,email:true}},ledger:{orderBy:{createdAt:'desc'},take:10}},orderBy:{points:'desc'},take:200})));
router.post('/pdv/sync-sqlite',async(req,res)=>{try{const {sync}=require('../services/pdv');res.json(await sync())}catch(e){console.error(e);res.status(500).json({error:e.message})}});
router.get('/pdv/sync-logs',async(req,res)=>res.json(await prisma.pdvSyncLog.findMany({orderBy:{startedAt:'desc'},take:20})));
router.get('/pdv/orders',async(req,res)=>{
  const status=req.query.status;
  const where=status?{status}:{};
  res.json(await prisma.pdvOrderQueue.findMany({where,orderBy:{createdAt:'desc'},take:100,include:{order:{select:{number:true,status:true,totalCents:true,paymentMethod:true,shippingMethod:true,createdAt:true,user:{select:{name:true,phone:true}},items:true,address:true}}}}));
});
router.get('/pdv/orders/:id/export',async(req,res)=>{
  const q=await prisma.pdvOrderQueue.findUnique({where:{id:req.params.id}});
  if(!q)return res.status(404).json({error:'Fila não encontrada.'});
  res.setHeader('Content-Disposition',`attachment; filename=pedido-${q.orderId}.json`);
  res.json(q.payload);
});
router.post('/pdv/orders/:id/ready',async(req,res)=>res.json(await markReady(req.params.id).catch(e=>{res.status(400);return {error:e.message}})));
router.post('/pdv/orders/:id/sent',async(req,res)=>{try{res.json(await markSent(req.params.id,req.body.externalRef))}catch(e){res.status(400).json({error:e.message})}});
router.post('/pdv/orders/:id/confirmed',async(req,res)=>{try{res.json(await markConfirmed(req.params.id,req.body.externalRef))}catch(e){res.status(400).json({error:e.message})}});
router.post('/pdv/orders/:id/error',async(req,res)=>{try{res.json(await markError(req.params.id,req.body.error||'Erro de integração'))}catch(e){res.status(400).json({error:e.message})}});
router.get('/pdv/queue-summary',async(req,res)=>{try{const {queueSummary}=require('../services/pdv-reconciliation');res.json(await queueSummary())}catch(e){res.status(500).json({error:e.message})}});
router.post('/pdv/reconcile',async(req,res)=>{try{const {reconcileInventory}=require('../services/pdv-reconciliation');res.json(await reconcileInventory())}catch(e){res.status(500).json({error:e.message})}});
router.get('/pdv/reconciliation',async(req,res)=>{try{const {latestReconciliation}=require('../services/pdv-reconciliation');res.json(await latestReconciliation(req.query.limit||100))}catch(e){res.status(500).json({error:e.message})}});
router.get('/integration/audit',async(req,res)=>res.json(await prisma.integrationAudit.findMany({orderBy:{createdAt:'desc'},take:100})));
router.get('/pdv/health',async(req,res)=>{try{const {health}=require('../services/pdv');res.json(await health())}catch(e){res.status(503).json({ok:false,error:e.message})}});
router.get('/pdv/product/:barcode',async(req,res)=>{try{const {productByBarcode}=require('../services/pdv');const x=await productByBarcode(req.params.barcode);if(!x)return res.status(404).json({error:'Produto não encontrado no PDV.'});res.json(x)}catch(e){res.status(500).json({error:e.message})}});
router.post('/orders/:id/deliver',async(req,res)=>{const code=String(req.body.code||'');const o=await prisma.order.findUnique({where:{id:req.params.id}});if(!o)return res.status(404).json({error:'Pedido não encontrado.'});if(o.shippingMethod!=='DELIVERY')return res.status(400).json({error:'Pedido não é delivery.'});if(!o.deliveryCode||code!==o.deliveryCode)return res.status(403).json({error:'Código de entrega inválido.'});const order=await prisma.order.update({where:{id:o.id},data:{status:'DELIVERED',verifiedAt:new Date(),deliveredAt:new Date()}});res.json(order)});

module.exports=router;
