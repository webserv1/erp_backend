const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");
const { calculateBalanceStock, calculateSaleValue } = require("../utils/stockCalculations");

const PUBLIC_STOCK_FIELDS = {
  id: true,
  companyId: true,
  productCode: true,
  productName: true,
  sizeId: true,
  qtyIn: true,
  qtyOut: true,
  balanceStock: true,
  salePrice: true,
  saleValue: true,
  remarks: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const PUBLIC_STOCK_WITH_RELATIONS_FIELDS = {
  id: true,
  companyId: true,
  productCode: true,
  productName: true,
  sizeId: true,
  qtyIn: true,
  qtyOut: true,
  balanceStock: true,
  salePrice: true,
  saleValue: true,
  remarks: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  size: { select: { id: true, name: true } },
};

const validateStockInput = (body) => {
  const required = ["productCode", "productName", "sizeId", "qtyIn", "qtyOut", "salePrice"];
  const missing = required.filter((field) => {
    const val = body[field];
    if (val === undefined || val === null || val === "") return true;
    if (typeof val === "string" && !val.trim()) return true;
    return false;
  });

  if (missing.length) throw new AppError(400, "Required fields are missing.", { fields: missing });

  if (Number.isNaN(parseInt(body.qtyIn, 10)) || parseInt(body.qtyIn, 10) < 0) {
    throw new AppError(400, "Qty In must be a non-negative integer.");
  }

  if (Number.isNaN(parseInt(body.qtyOut, 10)) || parseInt(body.qtyOut, 10) < 0) {
    throw new AppError(400, "Qty Out must be a non-negative integer.");
  }

  if (parseInt(body.qtyOut, 10) > parseInt(body.qtyIn, 10)) {
    throw new AppError(400, "Qty Out cannot be greater than Qty In.");
  }

  const salePrice = Number(body.salePrice);
  if (Number.isNaN(salePrice) || salePrice < 0) {
    throw new AppError(400, "Sale price must be a non-negative number.");
  }

  if (body.sizeId && Number.isNaN(parseInt(body.sizeId, 10))) {
    throw new AppError(400, "Invalid size id.");
  }
};

const stockData = (body, values) => {
  const qtyIn = parseInt(body.qtyIn, 10);
  const qtyOut = parseInt(body.qtyOut, 10);
  const balanceStock = calculateBalanceStock(qtyIn, qtyOut);
  const salePrice = Number(body.salePrice);
  const saleValue = calculateSaleValue(balanceStock, salePrice);

  return {
    ...values,
    productCode: body.productCode.trim(),
    productName: body.productName.trim(),
    sizeId: parseInt(body.sizeId, 10),
    qtyIn,
    qtyOut,
    balanceStock,
    salePrice,
    saleValue,
    remarks: body.remarks ? String(body.remarks).trim() : null,
  };
};

exports.getAll = async (req, res) => {
  const { search, sizeId, status } = req.query;

  const where = { companyId: req.auth.companyId };

  if (search) {
    where.OR = [
      { productName: { contains: search, mode: "insensitive" } },
      { productCode: { contains: search, mode: "insensitive" } },
    ];
  }

  if (sizeId) where.sizeId = parseInt(sizeId, 10);
  if (status !== undefined) where.status = status === "true" || status === true;

  const stocks = await prisma.stock.findMany({
    where,
    select: PUBLIC_STOCK_WITH_RELATIONS_FIELDS,
    orderBy: { createdAt: "desc" },
  });

  return res.json({ stocks });
};

exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid stock id.");

  const stock = await prisma.stock.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: PUBLIC_STOCK_WITH_RELATIONS_FIELDS,
  });
  if (!stock) throw new AppError(404, "Stock entry not found.");

  return res.json({ stock });
};

exports.create = async (req, res) => {
  validateStockInput(req.body);

  const size = await prisma.productMaster.findUnique({
    where: { id: parseInt(req.body.sizeId, 10) },
    select: { id: true, type: true, companyId: true },
  });
  if (!size) throw new AppError(404, "Size not found.");
  if (size.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this size.");
  if (size.type !== "SIZE") throw new AppError(400, "Selected size is not a valid size entry.");

  try {
    const stock = await prisma.stock.create({
      data: stockData(req.body, { companyId: req.auth.companyId }),
      select: PUBLIC_STOCK_WITH_RELATIONS_FIELDS,
    });
    return res.status(201).json({ message: "Stock entry created successfully.", stock });
  } catch (error) {
    if (error.code === "P2002") throw new AppError(409, "A stock entry with this product code already exists in this company.");
    throw error;
  }
};

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid stock id.");

  validateStockInput(req.body);

  const existing = await prisma.stock.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Stock entry not found.");

  const size = await prisma.productMaster.findUnique({
    where: { id: parseInt(req.body.sizeId, 10) },
    select: { id: true, type: true, companyId: true },
  });
  if (!size) throw new AppError(404, "Size not found.");
  if (size.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this size.");
  if (size.type !== "SIZE") throw new AppError(400, "Selected size is not a valid size entry.");

  const stock = await prisma.stock.update({
    where: { id },
    data: stockData(req.body, {}),
    select: PUBLIC_STOCK_WITH_RELATIONS_FIELDS,
  });

  return res.json({ message: "Stock entry updated successfully.", stock });
};

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid stock id.");

  const existing = await prisma.stock.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Stock entry not found.");

  await prisma.stock.delete({ where: { id } });
  return res.json({ message: "Stock entry deleted successfully." });
};