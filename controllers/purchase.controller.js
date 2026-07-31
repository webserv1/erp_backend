const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");

const PUBLIC_PURCHASE_FIELDS = {
  id: true,
  companyId: true,
  purchaseNumber: true,
  supplierId: true,
  createdById: true,
  invoiceDate: true,
  dueDate: true,
  subTotal: true,
  gstAmount: true,
  discount: true,
  grandTotal: true,
  paidAmount: true,
  paymentStatus: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
};

const PUBLIC_PURCHASE_WITH_RELATIONS_FIELDS = {
  id: true,
  companyId: true,
  purchaseNumber: true,
  supplierId: true,
  createdById: true,
  invoiceDate: true,
  dueDate: true,
  subTotal: true,
  gstAmount: true,
  discount: true,
  grandTotal: true,
  paidAmount: true,
  paymentStatus: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  supplier: { select: { id: true, name: true, mobile: true } },
  createdBy: { select: { id: true, name: true } },
};

const PaymentStatusValues = ["UNPAID", "PARTIAL", "PAID", "OVERDUE"];

const validatePurchaseInput = (body) => {
  const required = ["purchaseNumber", "supplierId", "invoiceDate", "subTotal", "gstAmount", "grandTotal"];
  const missing = required.filter((field) => {
    const val = body[field];
    if (val === undefined || val === null || val === "") return true;
    if (typeof val === "string" && !val.trim()) return true;
    return false;
  });

  if (missing.length) throw new AppError(400, "Required fields are missing.", { fields: missing });

  const numericFields = ["subTotal", "gstAmount", "discount", "grandTotal", "paidAmount"];
  for (const field of numericFields) {
    if (body[field] !== undefined && body[field] !== null && (Number.isNaN(Number(body[field])) || Number(body[field]) < 0)) {
      throw new AppError(400, `${field} must be a non-negative number.`);
    }
  }

  if (body.supplierId && Number.isNaN(parseInt(body.supplierId, 10))) {
    throw new AppError(400, "Invalid supplier id.");
  }

  if (body.createdById && Number.isNaN(parseInt(body.createdById, 10))) {
    throw new AppError(400, "Invalid user id.");
  }

  if (body.paymentStatus && !PaymentStatusValues.includes(body.paymentStatus)) {
    throw new AppError(400, "Payment status must be UNPAID, PARTIAL, PAID, or OVERDUE.");
  }

  if (body.invoiceDate && Number.isNaN(new Date(body.invoiceDate).getTime())) {
    throw new AppError(400, "Enter a valid invoice date.");
  }

  if (body.dueDate && Number.isNaN(new Date(body.dueDate).getTime())) {
    throw new AppError(400, "Enter a valid due date.");
  }
};

const purchaseData = (body, values) => ({
  ...values,
  purchaseNumber: String(body.purchaseNumber).trim(),
  supplierId: parseInt(body.supplierId, 10),
  createdById: body.createdById ? parseInt(body.createdById, 10) : null,
  invoiceDate: new Date(body.invoiceDate),
  dueDate: body.dueDate ? new Date(body.dueDate) : null,
  subTotal: Number(body.subTotal),
  gstAmount: Number(body.gstAmount),
  discount: body.discount !== undefined ? Number(body.discount) : 0,
  grandTotal: Number(body.grandTotal),
  paidAmount: body.paidAmount !== undefined ? Number(body.paidAmount) : 0,
  paymentStatus: body.paymentStatus ? String(body.paymentStatus).toUpperCase() : "UNPAID",
  remarks: body.remarks ? String(body.remarks).trim() : null,
});

exports.getAll = async (req, res) => {
  const { search, supplierId, paymentStatus, startDate, endDate } = req.query;

  const where = { companyId: req.auth.companyId };

  if (search) {
    where.OR = [
      { purchaseNumber: { contains: search, mode: "insensitive" } },
      { remarks: { contains: search, mode: "insensitive" } },
    ];
  }

  if (supplierId) where.supplierId = parseInt(supplierId, 10);
  if (paymentStatus) {
    const upper = String(paymentStatus).toUpperCase();
    if (!PaymentStatusValues.includes(upper)) throw new AppError(400, "Invalid payment status.");
    where.paymentStatus = upper;
  }
  if (startDate || endDate) {
    where.invoiceDate = {};
    if (startDate) where.invoiceDate.gte = new Date(startDate);
    if (endDate) where.invoiceDate.lte = new Date(endDate);
  }

  const purchases = await prisma.purchase.findMany({
    where,
    select: PUBLIC_PURCHASE_WITH_RELATIONS_FIELDS,
    orderBy: { createdAt: "desc" },
  });

  return res.json({ purchases });
};

exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid purchase id.");

  const purchase = await prisma.purchase.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: PUBLIC_PURCHASE_WITH_RELATIONS_FIELDS,
  });
  if (!purchase) throw new AppError(404, "Purchase not found.");

  return res.json({ purchase });
};

exports.create = async (req, res) => {
  validatePurchaseInput(req.body);

  const supplier = await prisma.supplier.findUnique({
    where: { id: parseInt(req.body.supplierId, 10) },
    select: { id: true, companyId: true },
  });
  if (!supplier) throw new AppError(404, "Supplier not found.");
  if (supplier.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this supplier.");

  try {
    const purchase = await prisma.purchase.create({
      data: purchaseData(req.body, { companyId: req.auth.companyId }),
      select: PUBLIC_PURCHASE_WITH_RELATIONS_FIELDS,
    });
    return res.status(201).json({ message: "Purchase created successfully.", purchase });
  } catch (error) {
    if (error.code === "P2002") throw new AppError(409, "A purchase with this purchase number already exists in this company.");
    throw error;
  }
};

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid purchase id.");

  validatePurchaseInput(req.body);

  const existing = await prisma.purchase.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Purchase not found.");

  const supplier = await prisma.supplier.findUnique({
    where: { id: parseInt(req.body.supplierId, 10) },
    select: { id: true, companyId: true },
  });
  if (!supplier) throw new AppError(404, "Supplier not found.");
  if (supplier.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this supplier.");

  const purchase = await prisma.purchase.update({
    where: { id },
    data: purchaseData(req.body, {}),
    select: PUBLIC_PURCHASE_WITH_RELATIONS_FIELDS,
  });

  return res.json({ message: "Purchase updated successfully.", purchase });
};

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid purchase id.");

  const existing = await prisma.purchase.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Purchase not found.");

  await prisma.purchase.delete({ where: { id } });
  return res.json({ message: "Purchase deleted successfully." });
};