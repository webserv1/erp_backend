const fs = require("fs");
const path = require("path");
const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");

const EXPENSE_DIRECTORY = path.join(__dirname, "..", "uploads", "expenses");

const PUBLIC_EXPENSE_FIELDS = {
  id: true,
  companyId: true,
  category: true,
  details: true,
  amount: true,
  paymentMode: true,
  billUrl: true,
  createdById: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const deleteFileIfExists = (filePath) => {
  if (!filePath) return;
  const absolutePath = path.join(__dirname, "..", filePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

exports.getSummary = async (req, res) => {
  const companyId = req.auth.companyId;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [thisMonthTotal, totalRecords, activeExpenses] = await Promise.all([
    prisma.expense.aggregate({
      where: { companyId, createdAt: { gte: monthStart, lte: monthEnd }, status: true },
      _sum: { amount: true },
    }),
    prisma.expense.count({ where: { companyId } }),
    prisma.expense.count({ where: { companyId, status: true } }),
  ]);

  return res.json({
    summary: {
      thisMonthTotal: Number(thisMonthTotal._sum.amount) || 0,
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
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const expenses = await prisma.expense.findMany({
    where,
    select: PUBLIC_EXPENSE_FIELDS,
    orderBy: { createdAt: "desc" },
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
  const { category, details, amount, paymentMode } = req.body;

  if (!category || !String(category).trim()) {
    throw new AppError(400, "Category is required.");
  }
  if (amount === undefined || amount === null || Number.isNaN(Number(amount)) || Number(amount) < 0) {
    throw new AppError(400, "Amount must be a non-negative number.");
  }
  if (!paymentMode || !String(paymentMode).trim()) {
    throw new AppError(400, "Payment mode is required.");
  }

  const billFile = req.files?.bill?.[0];

  const expense = await prisma.expense.create({
    data: {
      companyId: req.auth.companyId,
      category: String(category).trim(),
      details: details ? String(details).trim() : null,
      amount: Number(amount),
      paymentMode: String(paymentMode).trim().toUpperCase(),
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

  const { category, details, amount, paymentMode } = req.body;

  if (category !== undefined && !String(category).trim()) {
    throw new AppError(400, "Category cannot be empty.");
  }
  if (amount !== undefined && (Number.isNaN(Number(amount)) || Number(amount) < 0)) {
    throw new AppError(400, "Amount must be a non-negative number.");
  }

  const billFile = req.files?.bill?.[0];

  if (billFile) {
    deleteFileIfExists(existing.billUrl);
  }

  const data = {
    category: category ? String(category).trim() : undefined,
    details: details !== undefined ? (details ? String(details).trim() : null) : undefined,
    amount: amount !== undefined ? Number(amount) : undefined,
    paymentMode: paymentMode ? String(paymentMode).trim().toUpperCase() : undefined,
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

  deleteFileIfExists(existing.billUrl);

  await prisma.expense.delete({ where: { id } });
  return res.json({ message: "Expense deleted successfully." });
};