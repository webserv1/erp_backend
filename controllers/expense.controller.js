 const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");
const { deleteUploadAsset } = require("../utils/upload-asset-store");

const PUBLIC_EXPENSE_FIELDS = {
  id: true,
  companyId: true,
  category: true,
  details: true,
  amount: true,
  paymentMode: true,
  expenseDate: true,
  billUrl: true,
  createdById: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const PUBLIC_PROFIT_WITHDRAWAL_FIELDS = {
  id: true,
  companyId: true,
  sqAmount: true,
  arsAmount: true,
  entryDate: true,
  notes: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
};

const PUBLIC_SALARY_ENTRY_FIELDS = {
  id: true,
  companyId: true,
  sqAmount: true,
  arsAmount: true,
  workerAmount: true,
  entryDate: true,
  notes: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
};

const deleteFileIfExists = (filePath) => {
  if (!filePath) return;
  return deleteUploadAsset(filePath);
};

const parseExpenseDate = (value) => {
  if (!value || !String(value).trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toNonNegativeNumber = (value, fieldName) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new AppError(400, `${fieldName} must be a non-negative number.`);
  }
  return parsed;
};

const normalizeCompanyName = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const ensureSqarsGarmentsCompany = async (companyId) => {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });

  if (!company) throw new AppError(404, "Company not found.");

  if (normalizeCompanyName(company.name) !== "sqars garments") {
    throw new AppError(403, "Profit withdrawals are available only for Sqars Garments.");
  }
};

const getProfitSummary = async (companyId) => {
  const [profitAggregate, withdrawalAggregate] = await Promise.all([
    prisma.sale.aggregate({
      where: { companyId, status: true },
      _sum: { perSaleProfit: true },
    }),
    prisma.profitWithdrawal.aggregate({
      where: { companyId },
      _sum: { sqAmount: true, arsAmount: true },
    }),
  ]);

  const totalProfit = Number(profitAggregate._sum.perSaleProfit) || 0;
  const totalTaken =
    (Number(withdrawalAggregate._sum.sqAmount) || 0) + (Number(withdrawalAggregate._sum.arsAmount) || 0);

  return {
    totalProfit,
    totalTaken,
    remainingProfit: totalProfit - totalTaken,
  };
};

const mapProfitWithdrawalsWithBalance = (profitWithdrawals, totalProfit) => {
  const ordered = [...profitWithdrawals].sort((a, b) => {
    const dateDiff = new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.id - b.id;
  });

  let cumulativeTaken = 0;
  const balanceById = new Map();
  for (const item of ordered) {
    cumulativeTaken += (Number(item.sqAmount) || 0) + (Number(item.arsAmount) || 0);
    balanceById.set(item.id, totalProfit - cumulativeTaken);
  }

  return profitWithdrawals.map((item) => {
    const takenAmount = (Number(item.sqAmount) || 0) + (Number(item.arsAmount) || 0);
    return {
      ...item,
      takenAmount,
      balanceAfterEntry: balanceById.get(item.id) ?? totalProfit,
    };
  });
};

exports.getSummary = async (req, res) => {
  const companyId = req.auth.companyId;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [thisMonthTotal, overallTotal, totalRecords, activeExpenses] = await Promise.all([
    prisma.expense.aggregate({
      where: { companyId, expenseDate: { gte: monthStart, lte: monthEnd }, status: true },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { companyId, status: true },
      _sum: { amount: true },
    }),
    prisma.expense.count({ where: { companyId } }),
    prisma.expense.count({ where: { companyId, status: true } }),
  ]);

  return res.json({
    summary: {
      thisMonthTotal: Number(thisMonthTotal._sum.amount) || 0,
      overallTotal: Number(overallTotal._sum.amount) || 0,
      totalRecords,
      activeExpenses,
    },
  });
};

exports.getAll = async (req, res) => {
  const { search, category, paymentMode, startDate, endDate, status } = req.query;

  const where = { companyId: req.auth.companyId };

  if (search) {
    where.OR = [
      { category: { contains: search, mode: "insensitive" } },
      { details: { contains: search, mode: "insensitive" } },
    ];
  }

  if (category) where.category = { contains: category, mode: "insensitive" };
  if (paymentMode) where.paymentMode = { equals: paymentMode, mode: "insensitive" };
  if (status !== undefined) where.status = status === "true" || status === true;

  if (startDate || endDate) {
    where.expenseDate = {};
    if (startDate) where.expenseDate.gte = new Date(startDate);
    if (endDate) where.expenseDate.lte = new Date(endDate);
  }

  const expenses = await prisma.expense.findMany({
    where,
    select: PUBLIC_EXPENSE_FIELDS,
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
  });

  return res.json({ expenses });
};

exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid expense id.");

  const expense = await prisma.expense.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: PUBLIC_EXPENSE_FIELDS,
  });
  if (!expense) throw new AppError(404, "Expense not found.");

  return res.json({ expense });
};

exports.create = async (req, res) => {
  const { category, details, amount, paymentMode, expenseDate } = req.body;

  if (!category || !String(category).trim()) {
    throw new AppError(400, "Category is required.");
  }
  if (amount === undefined || amount === null || Number.isNaN(Number(amount)) || Number(amount) < 0) {
    throw new AppError(400, "Amount must be a non-negative number.");
  }
  if (!paymentMode || !String(paymentMode).trim()) {
    throw new AppError(400, "Payment mode is required.");
  }
  const parsedExpenseDate = parseExpenseDate(expenseDate);
  if (!parsedExpenseDate) {
    throw new AppError(400, "Expense date is required.");
  }

  const billFile = req.files?.bill?.[0];

  const expense = await prisma.expense.create({
    data: {
      companyId: req.auth.companyId,
      category: String(category).trim(),
      details: details ? String(details).trim() : null,
      amount: Number(amount),
      paymentMode: String(paymentMode).trim().toUpperCase(),
      expenseDate: parsedExpenseDate,
      billUrl: billFile ? `/uploads/expenses/${billFile.filename}` : null,
      createdById: req.auth.sub,
    },
    select: PUBLIC_EXPENSE_FIELDS,
  });

  return res.status(201).json({ message: "Expense created successfully.", expense });
};

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid expense id.");

  const existing = await prisma.expense.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true, billUrl: true },
  });
  if (!existing) throw new AppError(404, "Expense not found.");

  const { category, details, amount, paymentMode, expenseDate } = req.body;

  if (category !== undefined && !String(category).trim()) {
    throw new AppError(400, "Category cannot be empty.");
  }
  if (amount !== undefined && (Number.isNaN(Number(amount)) || Number(amount) < 0)) {
    throw new AppError(400, "Amount must be a non-negative number.");
  }
  if (expenseDate !== undefined && !parseExpenseDate(expenseDate)) {
    throw new AppError(400, "Enter a valid expense date.");
  }

  const billFile = req.files?.bill?.[0];

  if (billFile) {
    await deleteFileIfExists(existing.billUrl);
  }

  const data = {
    category: category ? String(category).trim() : undefined,
    details: details !== undefined ? (details ? String(details).trim() : null) : undefined,
    amount: amount !== undefined ? Number(amount) : undefined,
    paymentMode: paymentMode ? String(paymentMode).trim().toUpperCase() : undefined,
    expenseDate: expenseDate !== undefined ? parseExpenseDate(expenseDate) : undefined,
    billUrl: billFile ? `/uploads/expenses/${billFile.filename}` : undefined,
  };

  const expense = await prisma.expense.update({
    where: { id },
    data,
    select: PUBLIC_EXPENSE_FIELDS,
  });

  return res.json({ message: "Expense updated successfully.", expense });
};

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid expense id.");

  const existing = await prisma.expense.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true, billUrl: true },
  });
  if (!existing) throw new AppError(404, "Expense not found.");

  await deleteFileIfExists(existing.billUrl);

  await prisma.expense.delete({ where: { id } });
  return res.json({ message: "Expense deleted successfully." });
};

exports.getProfitWithdrawals = async (req, res) => {
  const companyId = req.auth.companyId;
  await ensureSqarsGarmentsCompany(companyId);

  const [summary, profitWithdrawals] = await Promise.all([
    getProfitSummary(companyId),
    prisma.profitWithdrawal.findMany({
      where: { companyId },
      select: PUBLIC_PROFIT_WITHDRAWAL_FIELDS,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  return res.json({
    summary,
    profitWithdrawals: mapProfitWithdrawalsWithBalance(profitWithdrawals, summary.totalProfit),
  });
};

exports.createProfitWithdrawal = async (req, res) => {
  const companyId = req.auth.companyId;
  await ensureSqarsGarmentsCompany(companyId);

  const { sqAmount, arsAmount, entryDate, notes } = req.body;
  const parsedEntryDate = parseExpenseDate(entryDate);
  if (!parsedEntryDate) throw new AppError(400, "Entry date is required.");

  const sq = toNonNegativeNumber(sqAmount ?? 0, "SQ amount");
  const ars = toNonNegativeNumber(arsAmount ?? 0, "ARS amount");
  if (sq === 0 && ars === 0) {
    throw new AppError(400, "Either SQ amount or ARS amount must be greater than zero.");
  }

  const profitWithdrawal = await prisma.profitWithdrawal.create({
    data: {
      companyId,
      sqAmount: sq,
      arsAmount: ars,
      entryDate: parsedEntryDate,
      notes: notes ? String(notes).trim() : null,
      createdById: req.auth.sub,
    },
    select: PUBLIC_PROFIT_WITHDRAWAL_FIELDS,
  });

  const summary = await getProfitSummary(companyId);
  const allRows = await prisma.profitWithdrawal.findMany({
    where: { companyId },
    select: PUBLIC_PROFIT_WITHDRAWAL_FIELDS,
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
  });
  const recordWithBalance =
    mapProfitWithdrawalsWithBalance(allRows, summary.totalProfit).find((item) => item.id === profitWithdrawal.id) ||
    {
      ...profitWithdrawal,
      takenAmount: (Number(profitWithdrawal.sqAmount) || 0) + (Number(profitWithdrawal.arsAmount) || 0),
      balanceAfterEntry: summary.remainingProfit,
    };

  return res.status(201).json({
    message: "Profit withdrawal entry created successfully.",
    profitWithdrawal: recordWithBalance,
    summary,
  });
};

exports.updateProfitWithdrawal = async (req, res) => {
  const companyId = req.auth.companyId;
  await ensureSqarsGarmentsCompany(companyId);

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid profit withdrawal id.");

  const existing = await prisma.profitWithdrawal.findFirst({
    where: { id, companyId },
    select: { id: true, sqAmount: true, arsAmount: true },
  });
  if (!existing) throw new AppError(404, "Profit withdrawal entry not found.");

  const { sqAmount, arsAmount, entryDate, notes } = req.body;

  const data = {};
  const nextSqAmount = sqAmount !== undefined ? toNonNegativeNumber(sqAmount, "SQ amount") : Number(existing.sqAmount);
  const nextArsAmount =
    arsAmount !== undefined ? toNonNegativeNumber(arsAmount, "ARS amount") : Number(existing.arsAmount);

  if (nextSqAmount === 0 && nextArsAmount === 0) {
    throw new AppError(400, "Either SQ amount or ARS amount must be greater than zero.");
  }

  if (sqAmount !== undefined) data.sqAmount = nextSqAmount;
  if (arsAmount !== undefined) data.arsAmount = nextArsAmount;
  if (entryDate !== undefined) {
    const parsedEntryDate = parseExpenseDate(entryDate);
    if (!parsedEntryDate) throw new AppError(400, "Enter a valid entry date.");
    data.entryDate = parsedEntryDate;
  }
  if (notes !== undefined) data.notes = notes ? String(notes).trim() : null;

  const updated = await prisma.profitWithdrawal.update({
    where: { id },
    data,
    select: PUBLIC_PROFIT_WITHDRAWAL_FIELDS,
  });

  const summary = await getProfitSummary(companyId);
  const allRows = await prisma.profitWithdrawal.findMany({
    where: { companyId },
    select: PUBLIC_PROFIT_WITHDRAWAL_FIELDS,
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
  });
  const recordWithBalance =
    mapProfitWithdrawalsWithBalance(allRows, summary.totalProfit).find((item) => item.id === updated.id) ||
    {
      ...updated,
      takenAmount: (Number(updated.sqAmount) || 0) + (Number(updated.arsAmount) || 0),
      balanceAfterEntry: summary.remainingProfit,
    };

  return res.json({
    message: "Profit withdrawal entry updated successfully.",
    profitWithdrawal: recordWithBalance,
    summary,
  });
};

exports.deleteProfitWithdrawal = async (req, res) => {
  const companyId = req.auth.companyId;
  await ensureSqarsGarmentsCompany(companyId);

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid profit withdrawal id.");

  const existing = await prisma.profitWithdrawal.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Profit withdrawal entry not found.");

  await prisma.profitWithdrawal.delete({ where: { id } });
  const summary = await getProfitSummary(companyId);

  return res.json({ message: "Profit withdrawal entry deleted successfully.", summary });
};

exports.getSalaryEntries = async (req, res) => {
  const companyId = req.auth.companyId;

  const [salaryEntries, totals] = await Promise.all([
    prisma.salaryEntry.findMany({
      where: { companyId },
      select: PUBLIC_SALARY_ENTRY_FIELDS,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.salaryEntry.aggregate({
      where: { companyId },
      _sum: { sqAmount: true, arsAmount: true, workerAmount: true },
    }),
  ]);

  const summary = {
    totalSqAmount: Number(totals._sum.sqAmount) || 0,
    totalArsAmount: Number(totals._sum.arsAmount) || 0,
    totalWorkerAmount: Number(totals._sum.workerAmount) || 0,
  };
  summary.totalSalaryAmount = summary.totalSqAmount + summary.totalArsAmount + summary.totalWorkerAmount;

  return res.json({ salaryEntries, summary });
};

exports.createSalaryEntry = async (req, res) => {
  const companyId = req.auth.companyId;
  const { sqAmount, arsAmount, workerAmount, entryDate, notes } = req.body;

  const parsedEntryDate = parseExpenseDate(entryDate);
  if (!parsedEntryDate) throw new AppError(400, "Entry date is required.");

  const sq = toNonNegativeNumber(sqAmount ?? 0, "SQ amount");
  const ars = toNonNegativeNumber(arsAmount ?? 0, "ARS amount");
  const worker = toNonNegativeNumber(workerAmount ?? 0, "Worker amount");

  if (sq === 0 && ars === 0 && worker === 0) {
    throw new AppError(400, "At least one salary amount must be greater than zero.");
  }

  const salaryEntry = await prisma.salaryEntry.create({
    data: {
      companyId,
      sqAmount: sq,
      arsAmount: ars,
      workerAmount: worker,
      entryDate: parsedEntryDate,
      notes: notes ? String(notes).trim() : null,
      createdById: req.auth.sub,
    },
    select: PUBLIC_SALARY_ENTRY_FIELDS,
  });

  return res.status(201).json({ message: "Salary entry created successfully.", salaryEntry });
};

exports.updateSalaryEntry = async (req, res) => {
  const companyId = req.auth.companyId;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid salary entry id.");

  const existing = await prisma.salaryEntry.findFirst({
    where: { id, companyId },
    select: { id: true, sqAmount: true, arsAmount: true, workerAmount: true },
  });
  if (!existing) throw new AppError(404, "Salary entry not found.");

  const { sqAmount, arsAmount, workerAmount, entryDate, notes } = req.body;
  const data = {};

  const nextSqAmount = sqAmount !== undefined ? toNonNegativeNumber(sqAmount, "SQ amount") : Number(existing.sqAmount);
  const nextArsAmount =
    arsAmount !== undefined ? toNonNegativeNumber(arsAmount, "ARS amount") : Number(existing.arsAmount);
  const nextWorkerAmount =
    workerAmount !== undefined ? toNonNegativeNumber(workerAmount, "Worker amount") : Number(existing.workerAmount);

  if (nextSqAmount === 0 && nextArsAmount === 0 && nextWorkerAmount === 0) {
    throw new AppError(400, "At least one salary amount must be greater than zero.");
  }

  if (sqAmount !== undefined) data.sqAmount = nextSqAmount;
  if (arsAmount !== undefined) data.arsAmount = nextArsAmount;
  if (workerAmount !== undefined) data.workerAmount = nextWorkerAmount;
  if (entryDate !== undefined) {
    const parsedEntryDate = parseExpenseDate(entryDate);
    if (!parsedEntryDate) throw new AppError(400, "Enter a valid entry date.");
    data.entryDate = parsedEntryDate;
  }
  if (notes !== undefined) data.notes = notes ? String(notes).trim() : null;

  const salaryEntry = await prisma.salaryEntry.update({
    where: { id },
    data,
    select: PUBLIC_SALARY_ENTRY_FIELDS,
  });

  return res.json({ message: "Salary entry updated successfully.", salaryEntry });
};

exports.deleteSalaryEntry = async (req, res) => {
  const companyId = req.auth.companyId;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid salary entry id.");

  const existing = await prisma.salaryEntry.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Salary entry not found.");

  await prisma.salaryEntry.delete({ where: { id } });
  return res.json({ message: "Salary entry deleted successfully." });
};