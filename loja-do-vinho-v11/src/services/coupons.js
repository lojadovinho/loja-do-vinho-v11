const prisma = require("../db");

async function validateCoupon({ code, userId, subtotalCents, shippingCents, city, state, district, productIds = [] }) {
  const coupon = await prisma.coupon.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { products: true }
  });

  if (!coupon || !coupon.active) return { valid: false, message: "Cupom inválido ou desativado." };

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) return { valid: false, message: "Cupom ainda não iniciou." };
  if (coupon.endsAt && now > coupon.endsAt) return { valid: false, message: "Cupom expirado." };
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return { valid: false, message: "Limite de usos atingido." };
  if (coupon.customerOnlyUserId && coupon.customerOnlyUserId !== userId) {
    return { valid: false, message: "Cupom exclusivo para outro cliente." };
  }
  if (coupon.minOrderCents && subtotalCents < coupon.minOrderCents) {
    return { valid: false, message: `Pedido mínimo de R$ ${(coupon.minOrderCents/100).toFixed(2)}.` };
  }
  if (coupon.city && coupon.city.toLowerCase() !== city?.toLowerCase()) {
    return { valid: false, message: "Cupom não válido para esta cidade." };
  }
  if (coupon.state && coupon.state.toLowerCase() !== state?.toLowerCase()) {
    return { valid: false, message: "Cupom não válido para este estado." };
  }
  if (coupon.district && coupon.district.toLowerCase() !== district?.toLowerCase()) {
    return { valid: false, message: "Cupom não válido para este bairro." };
  }

  if (coupon.maxUsesPerCustomer) {
    const count = await prisma.couponUsage.count({ where: { couponId: coupon.id, userId }});
    if (count >= coupon.maxUsesPerCustomer) {
      return { valid: false, message: "Você já atingiu o limite deste cupom." };
    }
  }

  if (coupon.products.length) {
    const allowed = coupon.products.map(p => p.productId);
    if (!productIds.some(id => allowed.includes(id))) {
      return { valid: false, message: "Cupom não se aplica aos produtos deste carrinho." };
    }
  }

  let discountCents = 0;
  let finalShippingCents = shippingCents;

  if (coupon.type === "PERCENT") {
    discountCents = Math.floor(subtotalCents * coupon.value / 100);
    if (coupon.maxDiscountCents) discountCents = Math.min(discountCents, coupon.maxDiscountCents);
  } else if (coupon.type === "FIXED") {
    discountCents = Math.min(coupon.value, subtotalCents);
  } else if (coupon.type === "FREE_SHIPPING") {
    finalShippingCents = 0;
  }

  return {
    valid: true,
    coupon,
    discountCents,
    shippingCents: finalShippingCents,
    totalCents: Math.max(0, subtotalCents - discountCents + finalShippingCents)
  };
}

module.exports = { validateCoupon };
