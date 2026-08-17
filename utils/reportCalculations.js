const prisma = require("../lib/prisma");

const getWeekRange = () => {
  const now = new Date();
  const day = now.getDay() || 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

const getDateRange = (start, end) => {
  const dates = [];
  const current = new Date(start);
  while (current <= end) { dates.push(new Date(current)); current.setDate(current.getDate() + 1); }
  return dates;
};

const buildSalesTrend = async (companyId, periodStart, periodEnd) => {
  const salesByDate = await prisma.$queryRaw`
    SELECT DATE("createdAt") as date, SUM("salePrice") as sales, SUM("perSaleProfit") as profit
    FROM "Sale"
    WHERE "companyId" = ${companyId} AND "createdAt" >= ${periodStart} AND "createdAt" <= ${periodEnd}
    GROUP BY DATE("createdAt")
  `;
  const salesMap = new Map(salesByDate.map((row) => [new Date(row.date).toISOString().split("T")[0], { sales: Number(row.sales) || 0, profit: Number(row.profit) || 0 }]));
  return getDateRange(periodStart, periodEnd).map((date) => {
    const key = date.toISOString().split("T")[0];
    const entry = salesMap.get(key);
    return { date: key, sales: entry?.sales || 0, profit: entry?.profit || 0 };
  });
};

const buildReportData = async (companyId, periodStart, periodEnd) => {
  const periodWhere = { companyId, createdAt: { gte: periodStart, lte: periodEnd } };
  const [salesAgg, purchasesAgg, expensesAgg, topProducts, topParties, lowStock, salesTrend, partyBalances, supplierBalances] = await Promise.all([
    prisma.sale.aggregate({ where: periodWhere, _count: { id: true }, _sum: { salePrice: true, perSaleProfit: true } }),
    prisma.purchase.aggregate({ where: periodWhere, _count: { id: true }, _sum: { purchasePrice: true } }),
    prisma.expense.aggregate({ where: { ...periodWhere, status: true }, _count: { id: true }, _sum: { amount: true } }),
    prisma.sale.groupBy({ by: ["productCode", "productName"], where: periodWhere, _sum: { quantity: true, salePrice: true }, orderBy: { _sum: { salePrice: "desc" } }, take: 5 }),
    prisma.sale.groupBy({ by: ["partyId", "partyName"], where: { ...periodWhere, partyId: { not: null } }, _sum: { salePrice: true }, orderBy: { _sum: { salePrice: "desc" } }, take: 5 }),
    prisma.stock.findMany({ where: { companyId, balanceStock: { lt: 10 }, status: true }, select: { id: true, productCode: true, productName: true, balanceStock: true }, orderBy: { balanceStock: "asc" }, take: 10 }),
    buildSalesTrend(companyId, periodStart, periodEnd),
    prisma.sale.groupBy({ by: ["partyId", "partyName"], where: { companyId, status: true, partyId: { not: null } }, _sum: { remainingAmount: true }, orderBy: { _sum: { remainingAmount: "desc" } } }),
    prisma.purchase.groupBy({ by: ["supplierId", "supplierName"], where: { companyId, status: true, supplierId: { not: null } }, _sum: { remainingBalance: true }, orderBy: { _sum: { remainingBalance: "desc" } } }),
  ]);
  const parties = partyBalances.map((party) => ({ id: party.partyId, name: party.partyName || "Unknown Party", balance: Number(party._sum.remainingAmount) || 0 }));
  const suppliers = supplierBalances.map((supplier) => ({ id: supplier.supplierId, name: supplier.supplierName || "Unknown Supplier", balance: Number(supplier._sum.remainingBalance) || 0 }));
  return {
    sales: { count: salesAgg._count.id, total: Number(salesAgg._sum.salePrice) || 0, profit: Number(salesAgg._sum.perSaleProfit) || 0 },
    purchases: { count: purchasesAgg._count.id, total: Number(purchasesAgg._sum.purchasePrice) || 0 },
    expenses: { count: expensesAgg._count.id, total: Number(expensesAgg._sum.amount) || 0 },
    netProfit: (Number(salesAgg._sum.perSaleProfit) || 0) - (Number(expensesAgg._sum.amount) || 0),
    balances: { partyOutstanding: parties.reduce((sum, party) => sum + party.balance, 0), supplierPayable: suppliers.reduce((sum, supplier) => sum + supplier.balance, 0), parties, suppliers },
    salesTrend,
    topProducts: topProducts.map((product) => ({ productCode: product.productCode, productName: product.productName, quantity: product._sum.quantity, total: Number(product._sum.salePrice) || 0 })),
    topParties: topParties.map((party) => ({ partyId: party.partyId, partyName: party.partyName, total: Number(party._sum.salePrice) || 0 })),
    lowStockAlerts: lowStock,
  };
};

module.exports = { getWeekRange, getMonthRange, buildReportData };
