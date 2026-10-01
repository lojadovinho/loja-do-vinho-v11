const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("troque123", 12);

  await prisma.user.upsert({
    where: { email: "admin@lojaadovinho.com.br" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@lojaadovinho.com.br",
      passwordHash: hash,
      role: "ADMIN"
    }
  });

  const cats = [
    ["Tintos", "tintos"],
    ["Brancos", "brancos"],
    ["Rosés", "roses"],
    ["Espumantes", "espumantes"],
    ["Licores", "licores"],
    ["Produtos Regionais", "regionais"]
  ];

  for (const [name, slug] of cats) {
    await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name, slug }
    });
  }

  for (const dayOfWeek of [0,1,2,3,4,5,6]) {
    await prisma.deliverySchedule.upsert({
      where: { dayOfWeek },
      update: {},
      create: {
        dayOfWeek,
        enabled: dayOfWeek !== 0,
        opensAt: "09:00",
        closesAt: "19:00"
      }
    });
  }

  const paymentMethods = [
    "PIX_ONLINE","CARD_ONLINE","PAGBANK",
    "CASH_ON_DELIVERY","PIX_ON_DELIVERY","CARD_MACHINE"
  ];

  for (const method of paymentMethods) {
    await prisma.paymentSetting.upsert({
      where: { method },
      update: {},
      create: { method, enabled: true }
    });
  }

  for (const name of ["DELIVERY", "MELHOR_ENVIO", "PICKUP"]) {
    await prisma.shippingSetting.upsert({
      where: { name },
      update: {},
      create: { name, enabled: name !== "MELHOR_ENVIO" ? true : false }
    });
  }

  const sample = await prisma.category.findUnique({ where: { slug: "regionais" }});
  await prisma.product.upsert({
    where: { slug: "arraia-do-quiabo-maracuja-cremoso" },
    update: {},
    create: {
      name: "Arraiá do Quiabo — Maracujá Cremoso 900 ml",
      slug: "arraia-do-quiabo-maracuja-cremoso",
      priceCents: 3500,
      stock: 11,
      featured: true,
      categoryId: sample.id
    }
  });

  await prisma.securityRule.createMany({data:[
    {key:'LOYALTY_POINTS_PER_CENTS',value:'2000'},
    {key:'LOYALTY_REDEEM_CENTS_PER_POINT',value:'5'},
    {key:'LOYALTY_MAX_REDEMPTION_PERCENT',value:'5'},
    {key:'LOYALTY_EXPIRY_DAYS',value:'180'}
  ],skipDuplicates:true});
  const profile=await prisma.storeProfile.findFirst();
  if(!profile) await prisma.storeProfile.create({data:{tradeName:'Loja do Vinho',story:'Conte aqui a história da Loja do Vinho, sua trajetória, equipe e compromisso com os clientes.',city:'Juazeiro',state:'BA'}});

  console.log("Seed concluído. Admin: admin@lojaadovinho.com.br / troque123");
}

main().finally(() => prisma.$disconnect());
