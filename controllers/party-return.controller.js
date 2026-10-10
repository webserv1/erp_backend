const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");
const { calculateTotalSalePrice } = require("../utils/salesCalculations");

const PUBLIC_PARTY_RETURN_FIELDS = {
  id: true,
  companyId: true,
  saleNumber: true,
  partyId: true,
  partyName: true,
  shopName: true,
  productDetails: true,
  amountDetails: true,
  reason: true,
  amountPaid: true,
  returnDate: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
};

const parseDate = (value) => {
  if (!value || !String(value).trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toNonNegativeNumber = (value, field) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new AppError(400, `${field} must be a non-negative number.`);
  }
  return parsed;
};

const normalizeJson = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

const serializeInvoice = (lines) => {
  if (!lines.length) return null;

  const first = lines[0];
  const items = lines.map((line) => ({
    id: line.id,
    productCode: line.productCode,
    productName: line.productName,
    quantity: line.quantity,
    unit: line.unit,
    salePrice: Number(line.salePrice) || 0,
    totalSalePrice: Number(
      calculateTotalSalePrice(line.quantity, line.unit, line.salePrice).toFixed(2),
    ),
  }));

  const amountDetails = {
    netTotalSalePrice: Number(
      items.reduce((sum, item) => sum + (Number(item.totalSalePrice) || 0), 0).toFixed(2),
    ),
    paidAmount: Number(first.paidAmount) || 0,
    discount: Number(first.discount) || 0,
    transport: Number(first.transport) || 0,
    remainingAmount: Number(first.remainingAmount) || 0,
    paymentStatus: first.paymentStatus || "UNPAID",
  };

  return {
    invoiceNumber: first.saleNumber || `SALE-${first.id}`,
    partyId: first.partyId,
    partyName: first.partyName || first.party?.partyName || "",
    shopName: first.party?.shopName || "",
    saleDate: first.saleDate,
    productDetails: items,
    amountDetails,
  };
};

const ensureInvoiceBelongsToCompany = async (companyId, saleNumber) => {
  if (!saleNumber) return null;
  const line = await prisma.sale.findFirst({
    where: { companyId, saleNumber, status: true },
    select: { id: true },
  });
  if (!line) {
    throw new AppError(404, "Selected invoice number does not exist.");
  }
  return line;
};

exports.getInvoiceOptions = async (req, res) => {
  const rows = await prisma.sale.findMany({
    where: {
      companyId: req.auth.companyId,
      status: true,
      saleNumber: { not: null },
    },
    distinct: ["saleNumber"],
    select: {
      saleNumber: true,
      partyName: true,
      saleDate: true,
      party: { select: { shopName: true } },
    },
    orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
  });

  return res.json({
    invoices: rows.map((row) => ({
      invoiceNumber: row.saleNumber,
      partyName: row.partyName || "",
      shopName: row.party?.shopName || "",
      saleDate: row.saleDate,
    })),
  });
};

exports.getInvoiceDetails = async (req, res) => {
  const saleNumber = String(req.params.invoiceNumber || "").trim();
  if (!saleNumber) throw new AppError(400, "Invoice number is required.");

  const lines = await prisma.sale.findMany({
    where: { companyId: req.auth.companyId, saleNumber, status: true },
    select: {
      id: true,
      saleNumber: true,
      partyId: true,
      partyName: true,
      productCode: true,
      productName: true,
      quantity: true,
      unit: true,
      salePrice: true,
      paidAmount: true,
      discount: true,
      transport: true,
      remainingAmount: true,
      paymentStatus: true,
      saleDate: true,
      party: { select: { shopName: true } },
    },
    orderBy: { id: "asc" },
  });
  if (!lines.length) throw new AppError(404, "Invoice not found.");

  return res.json({ invoice: serializeInvoice(lines) });
};

exports.getAll = async (req, res) => {
  const { search, invoiceNumber, startDate, endDate } = req.query;
  const where = { companyId: req.auth.companyId };

  if (search) {
    where.OR = [
      { partyName: { contains: search, mode: "insensitive" } },
      { shopName: { contains: search, mode: "insensitive" } },
      { reason: { contains: search, mode: "insensitive" } },
    ];
  }
  if (invoiceNumber) where.saleNumber = String(invoiceNumber).trim();
  if (startDate || endDate) {
    where.returnDate = {};
    if (startDate) where.returnDate.gte = new Date(startDate);
    if (endDate) where.returnDate.lte = new Date(endDate);
  }

  const partyReturns = await prisma.partyReturn.findMany({
    where,
    select: PUBLIC_PARTY_RETURN_FIELDS,
    orderBy: [{ returnDate: "desc" }, { createdAt: "desc" }],
  });
  return res.json({ partyReturns });
};

exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid party return id.");

  const partyReturn = await prisma.partyReturn.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: PUBLIC_PARTY_RETURN_FIELDS,
  });
  if (!partyReturn) throw new AppError(404, "Party return not found.");
  return res.json({ partyReturn });
};

exports.create = async (req, res) => {
  const {
    invoiceNumber,
    partyId,
    partyName,
    shopName,
    productDetails,
    amountDetails,
    reason,
    amountPaid,
    returnDate,
  } = req.body;

  const parsedReturnDate = parseDate(returnDate);
  if (!parsedReturnDate) throw new AppError(400, "Return date is required.");
  if (!reason || !String(reason).trim()) throw new AppError(400, "Reason for return is required.");
  if (!partyName || !String(partyName).trim()) throw new AppError(400, "Party name is required.");
  if (!shopName || !String(shopName).trim()) throw new AppError(400, "Shop name is required.");
  const paid = toNonNegativeNumber(amountPaid, "Amount paid");

  const normalizedInvoiceNumber = invoiceNumber ? String(invoiceNumber).trim() : null;
  await ensureInvoiceBelongsToCompany(req.auth.companyId, normalizedInvoiceNumber);

  const record = await prisma.partyReturn.create({
    data: {
      companyId: req.auth.companyId,
      saleNumber: normalizedInvoiceNumber,
      partyId: Number.isInteger(Number(partyId)) ? Number(partyId) : null,
      partyName: String(partyName).trim(),
      shopName: String(shopName).trim(),
      productDetails: normalizeJson(productDetails),
      amountDetails: normalizeJson(amountDetails),
      reason: String(reason).trim(),
      amountPaid: paid,
      returnDate: parsedReturnDate,
      createdById: req.auth.sub,
    },
    select: PUBLIC_PARTY_RETURN_FIELDS,
  });

  return res.status(201).json({ message: "Party return added successfully.", partyReturn: record });
};

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid party return id.");

  const existing = await prisma.partyReturn.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Party return not found.");

  const data = {};
  if (req.body.invoiceNumber !== undefined) {
    const saleNumber = req.body.invoiceNumber ? String(req.body.invoiceNumber).trim() : null;
    await ensureInvoiceBelongsToCompany(req.auth.companyId, saleNumber);
    data.saleNumber = saleNumber;
  }
  if (req.body.partyId !== undefined) {
    data.partyId = Number.isInteger(Number(req.body.partyId)) ? Number(req.body.partyId) : null;
  }
  if (req.body.partyName !== undefined) {
    if (!String(req.body.partyName).trim()) throw new AppError(400, "Party name cannot be empty.");
    data.partyName = String(req.body.partyName).trim();
  }
  if (req.body.shopName !== undefined) {
    if (!String(req.body.shopName).trim()) throw new AppError(400, "Shop name cannot be empty.");
    data.shopName = String(req.body.shopName).trim();
  }
  if (req.body.productDetails !== undefined) data.productDetails = normalizeJson(req.body.productDetails);
  if (req.body.amountDetails !== undefined) data.amountDetails = normalizeJson(req.body.amountDetails);
  if (req.body.reason !== undefined) {
    if (!String(req.body.reason).trim()) throw new AppError(400, "Reason cannot be empty.");
    data.reason = String(req.body.reason).trim();
  }
  if (req.body.amountPaid !== undefined) data.amountPaid = toNonNegativeNumber(req.body.amountPaid, "Amount paid");
  if (req.body.returnDate !== undefined) {
    const parsedReturnDate = parseDate(req.body.returnDate);
    if (!parsedReturnDate) throw new AppError(400, "Enter a valid return date.");
    data.returnDate = parsedReturnDate;
  }

  const partyReturn = await prisma.partyReturn.update({
    where: { id },
    data,
    select: PUBLIC_PARTY_RETURN_FIELDS,
  });

  return res.json({ message: "Party return updated successfully.", partyReturn });
};

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid party return id.");

  const existing = await prisma.partyReturn.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Party return not found.");

  await prisma.partyReturn.delete({ where: { id } });
  return res.json({ message: "Party return deleted successfully." });
};
