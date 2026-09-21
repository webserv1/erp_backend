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
    SELECT
      DATE("createdAt") as date,
      SUM("quantity" * CASE WHEN "unit" = 'DOZEN' THEN 12 ELSE 1 END * "salePrice") as sales,
      SUM("perSaleProfit") as profit
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
  const [salesAgg, purchasesAgg, expensesAgg, topProducts, topParties, lowStock, salesTrend, partyBalances, supplierPurchaseTotals, supplierRecords] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        COUNT(*)::int AS count,
        COALESCE(SUM("quantity" * CASE WHEN "unit" = 'DOZEN' THEN 12 ELSE 1 END * "salePrice"), 0) AS total,
        COALESCE(SUM("perSaleProfit"), 0) AS profit
      FROM "Sale"
      WHERE "companyId" = ${companyId}
        AND "createdAt" >= ${periodStart}
        AND "createdAt" <= ${periodEnd}
    `,
    prisma.purchase.aggregate({ where: periodWhere, _count: { id: true }, _sum: { totalPurchaseAmount: true } }),
    prisma.expense.aggregate({ where: { ...periodWhere, status: true }, _count: { id: true }, _sum: { amount: true } }),
    prisma.$queryRaw`
      SELECT
        "productCode",
        "productName",
        SUM("quantity") AS quantity,
        SUM("quantity" * CASE WHEN "unit" = 'DOZEN' THEN 12 ELSE 1 END * "salePrice") AS total
      FROM "Sale"
      WHERE "companyId" = ${companyId}
        AND "createdAt" >= ${periodStart}
        AND "createdAt" <= ${periodEnd}
      GROUP BY "productCode", "productName"
      ORDER BY total DESC
      LIMIT 5
    `,
    prisma.$queryRaw`
      SELECT
        "partyId",
        "partyName",
        SUM("quantity" * CASE WHEN "unit" = 'DOZEN' THEN 12 ELSE 1 END * "salePrice") AS total
      FROM "Sale"
      WHERE "companyId" = ${companyId}
        AND "createdAt" >= ${periodStart}
        AND "createdAt" <= ${periodEnd}
        AND "partyId" IS NOT NULL
      GROUP BY "partyId", "partyName"
      ORDER BY total DESC
      LIMIT 5
    `,
    prisma.stock.findMany({ where: { companyId, balanceStock: { lt: 10 }, status: true }, select: { id: true, productCode: true, productName: true, balanceStock: true }, orderBy: { balanceStock: "asc" }, take: 10 }),
    buildSalesTrend(companyId, periodStart, periodEnd),
    prisma.sale.groupBy({ by: ["partyId", "partyName"], where: { companyId, status: true, partyId: { not: null } }, _sum: { remainingAmount: true }, orderBy: { _sum: { remainingAmount: "desc" } } }),
    prisma.purchase.groupBy({ by: ["supplierId"], where: { companyId, status: true, supplierId: { not: null } }, _sum: { totalPurchaseAmount: true } }),
    prisma.supplier.findMany({ where: { companyId }, select: { id: true, name: true, paidAmount: true } }),
  ]);
  const parties = partyBalances.map((party) => ({ id: party.partyId, name: party.partyName || "Unknown Party", balance: Number(party._sum.remainingAmount) || 0 }));
  const supplierById = new Map(supplierRecords.map((supplier) => [supplier.id, supplier]));
  const suppliers = supplierPurchaseTotals.map((total) => {
    const supplier = supplierById.get(total.supplierId);
    const netTotalPurchaseAmount = Number(total._sum.totalPurchaseAmount) || 0;
    return {
      id: total.supplierId,
      name: supplier?.name || "Unknown Supplier",
      balance: netTotalPurchaseAmount - (Number(supplier?.paidAmount) || 0),
    };
  }).sort((a, b) => b.balance - a.balance);
  const salesSummary = Array.isArray(salesAgg) ? salesAgg[0] : salesAgg;
  return {
    sales: { count: Number(salesSummary?.count) || 0, total: Number(salesSummary?.total) || 0, profit: Number(salesSummary?.profit) || 0 },
    purchases: { count: purchasesAgg._count.id, total: Number(purchasesAgg._sum.totalPurchaseAmount) || 0 },
    expenses: { count: expensesAgg._count.id, total: Number(expensesAgg._sum.amount) || 0 },
    netProfit: (Number(salesSummary?.profit) || 0) - (Number(expensesAgg._sum.amount) || 0),
    balances: { partyOutstanding: parties.reduce((sum, party) => sum + party.balance, 0), supplierPayable: suppliers.reduce((sum, supplier) => sum + supplier.balance, 0), parties, suppliers },
    salesTrend,
    topProducts: topProducts.map((product) => ({ productCode: product.productCode, productName: product.productName, quantity: Number(product.quantity) || 0, total: Number(product.total) || 0 })),
    topParties: topParties.map((party) => ({ partyId: party.partyId, partyName: party.partyName, total: Number(party.total) || 0 })),
    lowStockAlerts: lowStock,
  };
};

module.exports = { getWeekRange, getMonthRange, buildReportData };
