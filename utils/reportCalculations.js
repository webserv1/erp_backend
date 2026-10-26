const prisma = require("../lib/prisma");
const { getReturnAmountSum } = require("./partyReturnCalculations");
const { getReturnAmountReceivedSum } = require("./supplierReturnCalculations");
const {
  buildPartyOutstandingBalances,
  buildSupplierPayableBalances,
} = require("./balanceCalculations");

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
  const [salesAgg, oldBalanceProfitAgg, purchasesAgg, expensesAgg, topProducts, topParties, lowStock, salesTrend, balanceSales, balancePurchases, supplierRecords, partyReturnedProfit, supplierReturnReceived] = await Promise.all([
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
    prisma.oldBalance.aggregate({
      where: { companyId, status: true, createdAt: { gte: periodStart, lte: periodEnd } },
      _sum: { profit: true },
    }),
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
    prisma.stock.findMany({ where: { companyId, balanceStock: { gte: 18 }, status: true }, select: { id: true, productCode: true, productName: true, balanceStock: true }, orderBy: { balanceStock: "desc" }, take: 10 }),
    buildSalesTrend(companyId, periodStart, periodEnd),
    prisma.sale.findMany({
      where: { companyId, status: true, partyId: { not: null } },
      select: {
        id: true,
        saleNumber: true,
        partyId: true,
        partyName: true,
        remainingAmount: true,
        createdAt: true,
      },
    }),
    prisma.purchase.findMany({
      where: { companyId, status: true, supplierId: { not: null } },
      select: {
        supplierId: true,
        supplierName: true,
        totalPurchaseAmount: true,
      },
    }),
    prisma.supplier.findMany({ where: { companyId }, select: { id: true, name: true, paidAmount: true } }),
    getReturnAmountSum(companyId, { returnDate: { gte: periodStart, lte: periodEnd } }),
    getReturnAmountReceivedSum(companyId, { invoiceDate: { gte: periodStart, lte: periodEnd } }),
  ]);
  const parties = buildPartyOutstandingBalances(balanceSales).map((party) => ({
    ...party,
    balance: party.amount,
  }));
  const suppliers = buildSupplierPayableBalances(balancePurchases, supplierRecords).map((supplier) => ({
    ...supplier,
    balance: supplier.amount,
  }));
  const salesSummary = Array.isArray(salesAgg) ? salesAgg[0] : salesAgg;
  const totalSales = Number(salesSummary?.total) || 0;
  const totalPurchases = Number(purchasesAgg._sum.totalPurchaseAmount) || 0;
  const totalExpenses = Number(expensesAgg._sum.amount) || 0;
  const adjustedSalesProfit =
    (Number(salesSummary?.profit) || 0) +
    (Number(oldBalanceProfitAgg._sum.profit) || 0) -
    (Number(partyReturnedProfit) || 0) +
    (Number(supplierReturnReceived) || 0);
  return {
    sales: { count: Number(salesSummary?.count) || 0, total: totalSales, profit: adjustedSalesProfit },
    purchases: { count: purchasesAgg._count.id, total: totalPurchases },
    expenses: { count: expensesAgg._count.id, total: totalExpenses },
    netProfit:
      totalSales -
      totalPurchases -
      totalExpenses -
      (Number(partyReturnedProfit) || 0) +
      (Number(supplierReturnReceived) || 0),
    balances: {
      partyOutstanding: Number(parties.reduce((sum, party) => sum + party.balance, 0).toFixed(2)),
      supplierPayable: Number(suppliers.reduce((sum, supplier) => sum + supplier.balance, 0).toFixed(2)),
      parties: parties.map(({ amount: ignored, ...party }) => party),
      suppliers: suppliers.map(({ amount: ignored, ...supplier }) => supplier),
    },
    salesTrend,
    topProducts: topProducts.map((product) => ({ productCode: product.productCode, productName: product.productName, quantity: Number(product.quantity) || 0, total: Number(product.total) || 0 })),
    topParties: topParties.map((party) => ({ partyId: party.partyId, partyName: party.partyName, total: Number(party.total) || 0 })),
    lowStockAlerts: lowStock,
  };
};

module.exports = { getWeekRange, getMonthRange, buildReportData };
