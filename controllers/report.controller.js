const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");
const { getWeekRange, getMonthRange, buildReportData } = require("../utils/reportCalculations");

const REPORT_SELECT = {
  id: true, companyId: true, type: true, periodStart: true, periodEnd: true, data: true,
  generatedById: true, createdAt: true, generatedBy: { select: { id: true, name: true } },
};

const redactProfitData = (data) => {
  const { netProfit, salesTrend = [], sales = {}, ...safeData } = data;
  const { profit, ...safeSales } = sales;
  return { ...safeData, sales: safeSales, salesTrend: salesTrend.map(({ profit: ignored, ...point }) => point) };
};

const presentReport = (report, role) => role === "ADMIN" ? report : { ...report, data: redactProfitData(report.data) };

exports.generateReport = async (req, res) => {
  const type = String(req.body.type || "").toUpperCase();
  if (!["WEEKLY", "MONTHLY"].includes(type)) throw new AppError(400, "Report type must be WEEKLY or MONTHLY.");

  const { start, end } = type === "WEEKLY" ? getWeekRange() : getMonthRange();
  const report = await prisma.report.create({
    data: {
      companyId: req.auth.companyId,
      type,
      periodStart: start,
      periodEnd: end,
      data: await buildReportData(req.auth.companyId, start, end),
      generatedById: req.auth.sub,
    },
    select: REPORT_SELECT,
  });
  return res.status(201).json({ message: "Report generated successfully.", report: presentReport(report, req.auth.role) });
};

exports.getAll = async (req, res) => {
  const where = { companyId: req.auth.companyId };
  if (req.query.type) where.type = String(req.query.type).toUpperCase();
  const reports = await prisma.report.findMany({ where, select: REPORT_SELECT, orderBy: { createdAt: "desc" } });
  return res.json({ reports: reports.map((report) => presentReport(report, req.auth.role)) });
};

exports.getById = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, "Invalid report id.");
  const report = await prisma.report.findFirst({ where: { id, companyId: req.auth.companyId }, select: REPORT_SELECT });
  if (!report) throw new AppError(404, "Report not found.");
  return res.json({ report: presentReport(report, req.auth.role) });
};
