const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");
const { calculateTotalPurchaseAmount } = require("../utils/salesCalculations");

const VALID_UNITS = ["PIECES", "DOZEN"];
const VALID_PAYMENT_STATUS = ["UNPAID", "PARTIAL", "PAID", "OVERDUE"];

const PUBLIC_SUPPLIER_RETURN_FIELDS = {
  id: true,
  companyId: true,
  purchaseNumber: true,
  supplierId: true,
  supplierName: true,
  supplierAddress: true,
  invoiceDate: true,
  paymentStatus: true,
  returnAmountReceived: true,
  reason: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      productCode: true,
      productName: true,
      sizeName: true,
      colorName: true,
      brandName: true,
      quantity: true,
      unit: true,
      purchaseAmount: true,
      totalPurchaseAmount: true,
    },
    orderBy: { id: "asc" },
  },
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

const normalizePaymentStatus = (value) => {
  const normalized = String(value || "UNPAID").toUpperCase();
  if (!VALID_PAYMENT_STATUS.includes(normalized)) {
    throw new AppError(400, "paymentStatus must be UNPAID, PARTIAL, PAID, or OVERDUE.");
  }
  return normalized;
};

const formatSupplierAddress = (supplier) =>
  [supplier.address, supplier.city, supplier.state, supplier.country, supplier.pincode]
    .filter((part) => !!String(part || "").trim())
    .join(", ");

const calculateNetTotalPurchaseAmount = (items) =>
  Number(
    items
      .reduce((sum, item) => sum + (Number(item.totalPurchaseAmount) || 0), 0)
      .toFixed(2),
  );

const loadProductMetaByCodes = async (companyId, productCodes) => {
  const products = await prisma.product.findMany({
    where: { companyId, productCode: { in: productCodes } },
    select: {
      productCode: true,
      productName: true,
      purchasePrice: true,
      unit: true,
      brand: { select: { name: true } },
      color: { select: { name: true } },
      size: { select: { name: true } },
    },
  });

  return new Map(
    products.map((product) => [
      product.productCode,
      {
        productName: product.productName || "",
        purchaseAmount: Number(product.purchasePrice) || 0,
        unit: product.unit || "PIECES",
        brandName: product.brand?.name || "",
        colorName: product.color?.name || "",
        sizeName: product.size?.name || "",
      },
    ]),
  );
};

const normalizeItems = (items) => {
  if (!Array.isArray(items) || !items.length) {
    throw new AppError(400, "At least one purchase product row is required.");
  }

  return items.map((item, index) => {
    const productCode = String(item.productCode || "").trim();
    const productName = String(item.productName || "").trim();
    const quantity = Number(item.quantity);
    const unit = String(item.unit || "PIECES").toUpperCase();
    const purchaseAmount = Number(item.purchaseAmount);
    const totalPurchaseAmount =
      item.totalPurchaseAmount !== undefined
        ? Number(item.totalPurchaseAmount)
        : calculateTotalPurchaseAmount(quantity, unit, purchaseAmount);

    if (!productCode) throw new AppError(400, `items[${index}].productCode is required.`);
    if (!productName) throw new AppError(400, `items[${index}].productName is required.`);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError(400, `items[${index}].quantity must be a positive integer.`);
    }
    if (!VALID_UNITS.includes(unit)) {
      throw new AppError(400, `items[${index}].unit must be PIECES or DOZEN.`);
    }
    if (Number.isNaN(purchaseAmount) || purchaseAmount < 0) {
      throw new AppError(400, `items[${index}].purchaseAmount must be a non-negative number.`);
    }
    if (Number.isNaN(totalPurchaseAmount) || totalPurchaseAmount < 0) {
      throw new AppError(400, `items[${index}].totalPurchaseAmount must be a non-negative number.`);
    }

    return {
      productCode,
      productName,
      sizeName: item.sizeName ? String(item.sizeName).trim() : null,
      colorName: item.colorName ? String(item.colorName).trim() : null,
      brandName: item.brandName ? String(item.brandName).trim() : null,
      quantity,
      unit,
      purchaseAmount,
      totalPurchaseAmount,
    };
  });
};

const ensurePurchaseNumberBelongsToCompany = async (companyId, purchaseNumber) => {
  if (!purchaseNumber) return null;
  const line = await prisma.purchase.findFirst({
    where: { companyId, purchaseNumber, status: true },
    select: { id: true },
  });
  if (!line) throw new AppError(404, "Selected purchase number does not exist.");
  return line;
};

const buildPurchaseDetails = async (companyId, purchaseNumber) => {
  const lines = await prisma.purchase.findMany({
    where: { companyId, purchaseNumber, status: true },
    select: {
      id: true,
      purchaseNumber: true,
      supplierId: true,
      supplierName: true,
      invoiceDate: true,
      productCode: true,
      productName: true,
      quantity: true,
      unit: true,
      purchasePrice: true,
      totalPurchaseAmount: true,
      supplier: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          country: true,
          pincode: true,
          paymentStatus: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
  if (!lines.length) throw new AppError(404, "Purchase number not found.");

  const productMeta = await loadProductMetaByCodes(
    companyId,
    [...new Set(lines.map((line) => line.productCode).filter(Boolean))],
  );

  const first = lines[0];
  const items = lines.map((line) => {
    const meta = productMeta.get(line.productCode) || {};
    return {
      id: line.id,
      productCode: line.productCode,
      productName: line.productName || meta.productName || "",
      sizeName: meta.sizeName || "",
      colorName: meta.colorName || "",
      brandName: meta.brandName || "",
      quantity: line.quantity,
      unit: line.unit || meta.unit || "PIECES",
      purchaseAmount: Number(line.purchasePrice) || 0,
      totalPurchaseAmount:
        Number(line.totalPurchaseAmount) ||
        Number(calculateTotalPurchaseAmount(line.quantity, line.unit, line.purchasePrice).toFixed(2)),
    };
  });
  const netTotalPurchaseAmount = calculateNetTotalPurchaseAmount(items);

  return {
    purchaseNumber: first.purchaseNumber,
    supplierId: first.supplierId,
    supplierName: first.supplier?.name || first.supplierName || "",
    supplierAddress: first.supplier ? formatSupplierAddress(first.supplier) : "",
    invoiceDate: first.invoiceDate,
    paymentStatus: first.supplier?.paymentStatus || "UNPAID",
    netTotalPurchaseAmount,
    items,
  };
};

exports.getPurchaseOptions = async (req, res) => {
  const rows = await prisma.purchase.findMany({
    where: {
      companyId: req.auth.companyId,
      status: true,
      purchaseNumber: { not: "" },
    },
    select: {
      purchaseNumber: true,
      supplierName: true,
      invoiceDate: true,
      createdAt: true,
    },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
  });

  const seenPurchaseNumbers = new Set();
  const purchases = [];
  for (const row of rows) {
    const purchaseNumber = String(row.purchaseNumber || "").trim();
    if (!purchaseNumber || seenPurchaseNumbers.has(purchaseNumber)) continue;
    seenPurchaseNumbers.add(purchaseNumber);
    purchases.push({
      purchaseNumber,
      supplierName: row.supplierName || "",
      invoiceDate: row.invoiceDate,
    });
  }

  return res.json({
    purchases,
  });
};

exports.getPurchaseDetails = async (req, res) => {
  const purchaseNumber = String(req.params.purchaseNumber || "").trim();
  if (!purchaseNumber) throw new AppError(400, "Purchase number is required.");
  return res.json({ purchase: await buildPurchaseDetails(req.auth.companyId, purchaseNumber) });
};

exports.getProductCodeOptions = async (req, res) => {
  const products = await prisma.product.findMany({
    where: { companyId: req.auth.companyId, status: true },
    select: { productCode: true, productName: true },
    orderBy: [{ productCode: "asc" }],
  });
  return res.json({
    products: products.map((product) => ({
      productCode: product.productCode,
      productName: product.productName,
    })),
  });
};

exports.getProductCodeDetails = async (req, res) => {
  const productCode = String(req.params.productCode || "").trim();
  if (!productCode) throw new AppError(400, "Product code is required.");

  const product = await prisma.product.findFirst({
    where: { companyId: req.auth.companyId, productCode, status: true },
    select: {
      productCode: true,
      productName: true,
      purchasePrice: true,
      unit: true,
      brand: { select: { name: true } },
      color: { select: { name: true } },
      size: { select: { name: true } },
    },
  });
  if (!product) throw new AppError(404, "Product code not found.");

  return res.json({
    product: {
      productCode: product.productCode,
      productName: product.productName || "",
      sizeName: product.size?.name || "",
      colorName: product.color?.name || "",
      brandName: product.brand?.name || "",
      unit: product.unit || "PIECES",
      purchaseAmount: Number(product.purchasePrice) || 0,
    },
  });
};

exports.getAll = async (req, res) => {
  const { search, purchaseNumber, startDate, endDate } = req.query;
  const where = { companyId: req.auth.companyId };

  if (search) {
    where.OR = [
      { supplierName: { contains: search, mode: "insensitive" } },
      { supplierAddress: { contains: search, mode: "insensitive" } },
      { purchaseNumber: { contains: search, mode: "insensitive" } },
    ];
  }
  if (purchaseNumber) where.purchaseNumber = String(purchaseNumber).trim();
  if (startDate || endDate) {
    where.invoiceDate = {};
    if (startDate) where.invoiceDate.gte = new Date(startDate);
    if (endDate) where.invoiceDate.lte = new Date(endDate);
  }

  const supplierReturns = await prisma.supplierReturn.findMany({
    where,
    select: PUBLIC_SUPPLIER_RETURN_FIELDS,
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
  });
  return res.json({ supplierReturns });
};

exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid supplier return id.");

  const supplierReturn = await prisma.supplierReturn.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: PUBLIC_SUPPLIER_RETURN_FIELDS,
  });
  if (!supplierReturn) throw new AppError(404, "Supplier return not found.");
  return res.json({ supplierReturn });
};

exports.create = async (req, res) => {
  const {
    purchaseNumber,
    supplierId,
    supplierName,
    supplierAddress,
    invoiceDate,
    paymentStatus,
    returnAmountReceived,
    reason,
    items,
  } = req.body;

  const parsedInvoiceDate = parseDate(invoiceDate);
  if (!parsedInvoiceDate) throw new AppError(400, "Invoice date is required.");
  if (!purchaseNumber || !String(purchaseNumber).trim()) {
    throw new AppError(400, "Purchase number is required.");
  }
  if (!supplierName || !String(supplierName).trim()) throw new AppError(400, "Supplier name is required.");
  if (!supplierAddress || !String(supplierAddress).trim()) throw new AppError(400, "Supplier address is required.");
  if (!reason || !String(reason).trim()) throw new AppError(400, "Reason for return is required.");

  const normalizedPurchaseNumber = String(purchaseNumber).trim();
  await ensurePurchaseNumberBelongsToCompany(req.auth.companyId, normalizedPurchaseNumber);
  const normalizedItems = normalizeItems(items);

  const supplierReturn = await prisma.supplierReturn.create({
    data: {
      companyId: req.auth.companyId,
      purchaseNumber: normalizedPurchaseNumber,
      supplierId: Number.isInteger(Number(supplierId)) ? Number(supplierId) : null,
      supplierName: String(supplierName).trim(),
      supplierAddress: String(supplierAddress).trim(),
      invoiceDate: parsedInvoiceDate,
      paymentStatus: normalizePaymentStatus(paymentStatus),
      returnAmountReceived: toNonNegativeNumber(returnAmountReceived, "Return amount received"),
      reason: String(reason).trim(),
      createdById: req.auth.sub,
      items: { create: normalizedItems },
    },
    select: PUBLIC_SUPPLIER_RETURN_FIELDS,
  });

  return res.status(201).json({
    message: "Supplier return added successfully.",
    supplierReturn,
  });
};

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid supplier return id.");

  const existing = await prisma.supplierReturn.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Supplier return not found.");

  const data = {};
  if (req.body.purchaseNumber !== undefined) {
    const normalizedPurchaseNumber = String(req.body.purchaseNumber || "").trim();
    if (!normalizedPurchaseNumber) throw new AppError(400, "Purchase number cannot be empty.");
    await ensurePurchaseNumberBelongsToCompany(req.auth.companyId, normalizedPurchaseNumber);
    data.purchaseNumber = normalizedPurchaseNumber;
  }
  if (req.body.supplierId !== undefined) {
    data.supplierId = Number.isInteger(Number(req.body.supplierId)) ? Number(req.body.supplierId) : null;
  }
  if (req.body.supplierName !== undefined) {
    if (!String(req.body.supplierName).trim()) throw new AppError(400, "Supplier name cannot be empty.");
    data.supplierName = String(req.body.supplierName).trim();
  }
  if (req.body.supplierAddress !== undefined) {
    if (!String(req.body.supplierAddress).trim()) throw new AppError(400, "Supplier address cannot be empty.");
    data.supplierAddress = String(req.body.supplierAddress).trim();
  }
  if (req.body.invoiceDate !== undefined) {
    const parsedInvoiceDate = parseDate(req.body.invoiceDate);
    if (!parsedInvoiceDate) throw new AppError(400, "Enter a valid invoice date.");
    data.invoiceDate = parsedInvoiceDate;
  }
  if (req.body.paymentStatus !== undefined) {
    data.paymentStatus = normalizePaymentStatus(req.body.paymentStatus);
  }
  if (req.body.returnAmountReceived !== undefined) {
    data.returnAmountReceived = toNonNegativeNumber(
      req.body.returnAmountReceived,
      "Return amount received",
    );
  }
  if (req.body.reason !== undefined) {
    if (!String(req.body.reason).trim()) throw new AppError(400, "Reason cannot be empty.");
    data.reason = String(req.body.reason).trim();
  }

  const normalizedItems = req.body.items !== undefined ? normalizeItems(req.body.items) : null;

  const supplierReturn = await prisma.$transaction(async (tx) => {
    if (normalizedItems) {
      await tx.supplierReturnItem.deleteMany({ where: { supplierReturnId: id } });
    }

    return tx.supplierReturn.update({
      where: { id },
      data: {
        ...data,
        ...(normalizedItems
          ? {
              items: {
                create: normalizedItems,
              },
            }
          : {}),
      },
      select: PUBLIC_SUPPLIER_RETURN_FIELDS,
    });
  });

  return res.json({
    message: "Supplier return updated successfully.",
    supplierReturn,
  });
};

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid supplier return id.");

  const existing = await prisma.supplierReturn.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Supplier return not found.");

  await prisma.supplierReturn.delete({ where: { id } });
  return res.json({ message: "Supplier return deleted successfully." });
};
