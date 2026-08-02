const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");
const { calculateSaleTotal } = require("../utils/calculations");
const { calculatePerSaleProfit, calculateTotalSaleProfit } = require("../utils/salesCalculations");

const PUBLIC_SALE_FIELDS = {
  id: true,
  companyId: true,
  partyId: true,
  partyName: true,
  supplierId: true,
  supplierName: true,
  supplierMobile: true,
  supplierEmail: true,
  supplierAddress: true,
  productName: true,
  productCode: true,
  sizeId: true,
  colorId: true,
  quantity: true,
  unit: true,
  salePrice: true,
  purchasePrice: true,
  total: true,
  perSaleProfit: true,
  totalSaleProfit: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const PUBLIC_SALE_WITH_RELATIONS_FIELDS = {
  id: true,
  companyId: true,
  partyId: true,
  partyName: true,
  supplierId: true,
  supplierName: true,
  supplierMobile: true,
  supplierEmail: true,
  supplierAddress: true,
  productName: true,
  productCode: true,
  sizeId: true,
  colorId: true,
  quantity: true,
  unit: true,
  salePrice: true,
  purchasePrice: true,
  total: true,
  perSaleProfit: true,
  totalSaleProfit: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  size: { select: { id: true, name: true } },
  color: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true, mobile: true } },
  party: { select: { id: true, partyName: true } },
};

const validateSaleInput = (body) => {
  const required = ["productName", "productCode", "sizeId", "colorId", "quantity", "salePrice", "purchasePrice", "unit", "status"];
  const missing = required.filter((field) => {
    const val = body[field];
    if (val === undefined || val === null || val === "") return true;
    if (typeof val === "string" && !val.trim()) return true;
    return false;
  });

  if (missing.length) throw new AppError(400, "Required fields are missing.", { fields: missing });

  if (Number.isNaN(parseInt(body.quantity, 10)) || parseInt(body.quantity, 10) < 1) {
    throw new AppError(400, "Quantity must be a positive integer.");
  }

  const salePrice = Number(body.salePrice);
  if (Number.isNaN(salePrice) || salePrice < 0) {
    throw new AppError(400, "Sale price must be a non-negative number.");
  }

  const purchasePrice = Number(body.purchasePrice);
  if (Number.isNaN(purchasePrice) || purchasePrice < 0) {
    throw new AppError(400, "Purchase price must be a non-negative number.");
  }

  if (!["PIECES", "DOZEN"].includes(body.unit)) {
    throw new AppError(400, "Unit must be PIECES or DOZEN.");
  }

  const status = body.status;
  if (typeof status !== "boolean" && status !== "ACTIVE" && status !== "INACTIVE" && status !== "true" && status !== "false") {
    throw new AppError(400, "Status must be ACTIVE, INACTIVE, true, or false.");
  }

  if (body.sizeId && Number.isNaN(parseInt(body.sizeId, 10))) {
    throw new AppError(400, "Invalid size id.");
  }

  if (body.colorId && Number.isNaN(parseInt(body.colorId, 10))) {
    throw new AppError(400, "Invalid color id.");
  }

  if (body.supplierId && Number.isNaN(parseInt(body.supplierId, 10))) {
    throw new AppError(400, "Invalid supplier id.");
  }

  if (body.partyId && Number.isNaN(parseInt(body.partyId, 10))) {
    throw new AppError(400, "Invalid party id.");
  }
};

const saleData = (body, values) => {
  const quantity = parseInt(body.quantity, 10);
  const salePrice = Number(body.salePrice);
  const purchasePrice = Number(body.purchasePrice);
  const unit = String(body.unit).toUpperCase();
  const total = calculateSaleTotal(quantity, salePrice, unit);
  const perSaleProfit = calculatePerSaleProfit(salePrice, purchasePrice, quantity);
  const totalSaleProfit = calculateTotalSaleProfit(salePrice, purchasePrice, quantity, unit);
  const status = body.status === true || body.status === "ACTIVE" || body.status === "true";

  return {
    ...values,
    partyId: body.partyId ? parseInt(body.partyId, 10) : null,
    partyName: body.partyName ? String(body.partyName).trim() : null,
    supplierId: body.supplierId ? parseInt(body.supplierId, 10) : null,
    supplierName: body.supplierName ? String(body.supplierName).trim() : null,
    supplierMobile: body.supplierMobile ? String(body.supplierMobile).trim() : null,
    supplierEmail: body.supplierEmail ? String(body.supplierEmail).trim().toLowerCase() : null,
    supplierAddress: body.supplierAddress ? String(body.supplierAddress).trim() : null,
    productName: body.productName.trim(),
    productCode: body.productCode.trim(),
    sizeId: parseInt(body.sizeId, 10),
    colorId: parseInt(body.colorId, 10),
    quantity,
    unit,
    salePrice,
    purchasePrice,
    total,
    perSaleProfit,
    totalSaleProfit,
    status,
  };
};

exports.getAll = async (req, res) => {
  const { search, sizeId, colorId, supplierId, partyId, startDate, endDate } = req.query;

  const where = { companyId: req.auth.companyId };

  if (search) {
    where.OR = [
      { productName: { contains: search, mode: "insensitive" } },
      { productCode: { contains: search, mode: "insensitive" } },
    ];
  }

  if (sizeId) where.sizeId = parseInt(sizeId, 10);
  if (colorId) where.colorId = parseInt(colorId, 10);
  if (supplierId) where.supplierId = parseInt(supplierId, 10);
  if (partyId) where.partyId = parseInt(partyId, 10);
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const sales = await prisma.sale.findMany({
    where,
    select: PUBLIC_SALE_WITH_RELATIONS_FIELDS,
    orderBy: { createdAt: "desc" },
  });

  return res.json({ sales });
};

exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid sale id.");

  const sale = await prisma.sale.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: PUBLIC_SALE_WITH_RELATIONS_FIELDS,
  });
  if (!sale) throw new AppError(404, "Sale not found.");

  return res.json({ sale });
};

exports.create = async (req, res) => {
  validateSaleInput(req.body);

  const size = await prisma.productMaster.findUnique({
    where: { id: parseInt(req.body.sizeId, 10) },
    select: { id: true, type: true, companyId: true },
  });
  if (!size) throw new AppError(404, "Size not found.");
  if (size.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this size.");
  if (size.type !== "SIZE") throw new AppError(400, "Selected size is not a valid size entry.");

  const color = await prisma.productMaster.findUnique({
    where: { id: parseInt(req.body.colorId, 10) },
    select: { id: true, type: true, companyId: true },
  });
  if (!color) throw new AppError(404, "Color not found.");
  if (color.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this color.");
  if (color.type !== "COLOR") throw new AppError(400, "Selected color is not a valid color entry.");

  if (req.body.supplierId) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: parseInt(req.body.supplierId, 10) },
      select: { id: true, companyId: true, name: true, mobile: true },
    });
    if (!supplier) throw new AppError(404, "Supplier not found.");
    if (supplier.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this supplier.");
  }

  if (req.body.partyId) {
    const party = await prisma.party.findUnique({
      where: { id: parseInt(req.body.partyId, 10) },
      select: { id: true, companyId: true, partyName: true },
    });
    if (!party) throw new AppError(404, "Party not found.");
    if (party.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this party.");
  }

  try {
    const sale = await prisma.sale.create({
      data: saleData(req.body, { companyId: req.auth.companyId }),
      select: PUBLIC_SALE_WITH_RELATIONS_FIELDS,
    });
    return res.status(201).json({ message: "Sale created successfully.", sale });
  } catch (error) {
    if (error.code === "P2002") throw new AppError(409, "A sale with this product code already exists in this company.");
    throw error;
  }
};

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid sale id.");

  validateSaleInput(req.body);

  const existing = await prisma.sale.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Sale not found.");

  const size = await prisma.productMaster.findUnique({
    where: { id: parseInt(req.body.sizeId, 10) },
    select: { id: true, type: true, companyId: true },
  });
  if (!size) throw new AppError(404, "Size not found.");
  if (size.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this size.");
  if (size.type !== "SIZE") throw new AppError(400, "Selected size is not a valid size entry.");

  const color = await prisma.productMaster.findUnique({
    where: { id: parseInt(req.body.colorId, 10) },
    select: { id: true, type: true, companyId: true },
  });
  if (!color) throw new AppError(404, "Color not found.");
  if (color.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this color.");
  if (color.type !== "COLOR") throw new AppError(400, "Selected color is not a valid color entry.");

  if (req.body.supplierId) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: parseInt(req.body.supplierId, 10) },
      select: { id: true, companyId: true, name: true, mobile: true },
    });
    if (!supplier) throw new AppError(404, "Supplier not found.");
    if (supplier.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this supplier.");
  }

  if (req.body.partyId) {
    const party = await prisma.party.findUnique({
      where: { id: parseInt(req.body.partyId, 10) },
      select: { id: true, companyId: true, partyName: true },
    });
    if (!party) throw new AppError(404, "Party not found.");
    if (party.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this party.");
  }

  const sale = await prisma.sale.update({
    where: { id },
    data: saleData(req.body, {}),
    select: PUBLIC_SALE_WITH_RELATIONS_FIELDS,
  });

  return res.json({ message: "Sale updated successfully.", sale });
};

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid sale id.");

  const existing = await prisma.sale.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Sale not found.");

  await prisma.sale.delete({ where: { id } });
  return res.json({ message: "Sale deleted successfully." });
};