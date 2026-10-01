const prisma = require('../db');

async function reconcileInventory() {
  const products = await prisma.product.findMany({
    where: { pdvManaged: true, pdvId: { not: null } },
    select: { id: true, pdvId: true, name: true, stock: true, reservedStock: true, active: true }
  });
  const snapshots = products.map(p => {
    const physical = Math.max(0, p.stock || 0);
    const reserved = Math.max(0, p.reservedStock || 0);
    const available = Math.max(0, physical - reserved);
    const difference = physical - reserved - available;
    return {
      pdvId: String(p.pdvId), productId: p.id, productName: p.name,
      physicalStock: physical, reservedStock: reserved, availableStock: available,
      difference, status: reserved > physical ? 'CONFLICT' : (available === 0 ? 'OUT_OF_STOCK' : 'OK')
    };
  });
  await prisma.pdvInventorySnapshot.createMany({ data: snapshots });
  const conflicts = snapshots.filter(x => x.status === 'CONFLICT');
  await prisma.integrationAudit.create({
    data: { area: 'PDV', action: 'INVENTORY_RECONCILIATION', success: conflicts.length === 0,
      message: conflicts.length ? `${conflicts.length} conflito(s) de estoque.` : 'Conciliação sem conflitos.',
      metadata: { products: snapshots.length, conflicts: conflicts.length } }
  });
  return { products: snapshots.length, conflicts: conflicts.length, outOfStock: snapshots.filter(x => x.status === 'OUT_OF_STOCK').length };
}

async function latestReconciliation(limit=100) {
  return prisma.pdvInventorySnapshot.findMany({ orderBy: { createdAt: 'desc' }, take: Number(limit) });
}

async function queueSummary() {
  const rows = await prisma.pdvOrderQueue.groupBy({ by: ['status'], _count: { _all: true } });
  return Object.fromEntries(rows.map(r => [r.status, r._count._all]));
}

module.exports = { reconcileInventory, latestReconciliation, queueSummary };
