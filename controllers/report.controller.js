const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");

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
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const buildSalesTrend = async (companyId, periodStart, periodEnd) => {
  const salesByDate = await prisma.$queryRaw`
    SELECT DATE("createdAt") as date, SUM("total") as sales, SUM("perSaleProfit") as profit
    FROM "Sale"
    WHERE "companyId" = ${companyId}
      AND "createdAt" >= ${periodStart}
      AND "createdAt" <= ${periodEnd}
    GROUP BY DATE("createdAt")
  `;

  const salesMap = new Map();
  for (const row of salesByDate) {
    salesMap.set(new Date(row.date).toISOString().split("T")[0], {
      sales: Number(row.sales) || 0,
      profit: Number(row.profit) || 0,
    });
  }

  const dates = getDateRange(periodStart, periodEnd);
  return dates.map((d) => {
    const key = d.toISOString().split("T")[0];
    const entry = salesMap.get(key);
    return {
      date: key,
      sales: entry ? entry.sales : 0,
      profit: entry ? entry.profit : 0,
    };
  });
};

const buildReportData = async (companyId, periodStart, periodEnd) => {
  const [salesAgg, purchasesAgg, expensesAgg, topProducts, topParties, lowStock, salesTrend] = await Promise.all([
    prisma.sale.aggregate({
      where: { companyId, createdAt: { gte: periodStart, lte: periodEnd } },
      _count: { id: true },
      _sum: { total: true, perSaleProfit: true },
    }),
    prisma.purchase.aggregate({
      where: { companyId, createdAt: { gte: periodStart, lte: periodEnd } },
      _count: { id: true },
      _sum: { grandTotal: true },
    }),
    prisma.expense.aggregate({
      where: { companyId, createdAt: { gte: periodStart, lte: periodEnd }, status: true },
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.sale.groupBy({
      by: ["productCode", "productName"],
      where: { companyId, createdAt: { gte: periodStart, lte: periodEnd } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
    prisma.purchase.groupBy({
      by: ["partyId", "partyName"],
      where: { companyId, createdAt: { gte: periodStart, lte: periodEnd }, partyId: { not: null } },
      _sum: { grandTotal: true },
      orderBy: { _sum: { grandTotal: "desc" } },
      take: 5,
    }),
    prisma.stock.findMany({
      where: { companyId, balanceStock: { lt: 10 }, status: true },
      select: { id: true, productCode: true, productName: true, balanceStock: true },
      orderBy: { balanceStock: "asc" },
      take: 10,
    }),
    buildSalesTrend(companyId, periodStart, periodEnd),
  ]);

  return {
    sales: {
      count: salesAgg._count.id,
      total: Number(salesAgg._sum.total) || 0,
      profit: Number(salesAgg._sum.perSaleProfit) || 0,
    },
    purchases: {
      count: purchasesAgg._count.id,
      total: Number(purchasesAgg._sum.grandTotal) || 0,
    },
    expenses: {
      count: expensesAgg._count.id,
      total: Number(expensesAgg._sum.amount) || 0,
    },
    netProfit: Number(salesAgg._sum.perSaleProfit) - Number(expensesAgg._sum.amount) || 0,
    salesTrend,
    topProducts: topProducts.map((p) => ({
      productCode: p.productCode,
      productName: p.productName,
      quantity: p._sum.quantity,
      total: Number(p._sum.total),
    })),
    topParties: topParties.map((p) => ({
      partyId: p.partyId,
      partyName: p.partyName,
      total: Number(p._sum.grandTotal),
    })),
    lowStockAlerts: lowStock.map((item) => ({
      id: item.id,
      productCode: item.productCode,
      productName: item.productName,
      balanceStock: item.balanceStock,
    })),
  };
};

exports.generateReport = async (req, res) => {
  const { type } = req.body;

  if (!type || !["WEEKLY", "MONTHLY"].includes(type.toUpperCase())) {
    throw new AppError(400, "Report type must be WEEKLY or MONTHLY.");
  }

  const upperType = type.toUpperCase();
  const { start, end } = upperType === "WEEKLY" ? getWeekRange() : getMonthRange();

  const data = await buildReportData(req.auth.companyId, start, end);

  const report = await prisma.report.create({
    data: {
      companyId: req.auth.companyId,
      type: upperType,
      periodStart: start,
      periodEnd: end,
      data,
      generatedById: req.auth.sub,
    },
    select: {
      id: true,
      companyId: true,
      type: true,
      periodStart: true,
      periodEnd: true,
      data: true,
      generatedById: true,
      createdAt: true,
      generatedBy: { select: { id: true, name: true } },
    },
  });

  return res.status(201).json({ message: "Report generated successfully.", report });
};

exports.getAll = async (req, res) => {
  const { type } = req.query;
  const where = { companyId: req.auth.companyId };
  if (type) where.type = type.toUpperCase();

  const reports = await prisma.report.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      type: true,
      periodStart: true,
      periodEnd: true,
      data: true,
      generatedById: true,
      createdAt: true,
      generatedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return res.json({ reports });
};

exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid report id.");

  const report = await prisma.report.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: {
      id: true,
      companyId: true,
      type: true,
      periodStart: true,
      periodEnd: true,
      data: true,
      generatedById: true,
      createdAt: true,
      generatedBy: { select: { id: true, name: true } },
    },
  });
  if (!report) throw new AppError(404, "Report not found.");

  return res.json({ report });
};