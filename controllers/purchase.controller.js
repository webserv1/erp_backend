const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");
const { calculateRemainingAmount, purchaseData } = require("../utils/purchaseCalculations");

const PURCHASE_SELECT = {
  id: true, companyId: true, purchaseNumber: true, supplierId: true, supplierName: true,
  productCode: true, productName: true, createdById: true, invoiceDate: true, purchasePrice: true,
  totalPurchaseAmount: true, quantity: true, unit: true, status: true, remarks: true,
  createdAt: true, updatedAt: true,
  supplier: { select: { id: true, name: true, mobile: true, paidAmount: true, paymentStatus: true } },
  createdBy: { select: { id: true, name: true } },
};

const PAYMENT_STATUSES = ["UNPAID", "PARTIAL", "PAID", "OVERDUE"];
const VALID_UNITS = ["PIECES", "DOZEN"];
const isMissing = (value) => value === undefined || value === null || (typeof value === "string" && !value.trim());

const getItems = (body) => {
  const items = Array.isArray(body.items)
    ? body.items
    : [{
        productCode: body.productCode,
        quantity: body.quantity,
        purchasePrice: body.purchasePrice,
        unit: body.unit,
        remarks: body.remarks,
      }];
  if (!items.length || items.some((item) => isMissing(item?.productCode))) {
    throw new AppError(400, "Add at least one product code for the purchase.");
  }
  return items;
};

const validatePurchaseInput = (body) => {
  const missing = ["purchaseNumber", "supplierId", "invoiceDate"].filter((field) => isMissing(body[field]));
  if (missing.length) throw new AppError(400, "Required fields are missing.", { fields: missing });
  if (!/^\d+$/.test(String(body.purchaseNumber).trim())) throw new AppError(400, "Purchase number must contain numbers only.");
  if (Number.isNaN(parseInt(body.supplierId, 10))) throw new AppError(400, "Invalid supplier id.");
  if (Number.isNaN(new Date(body.invoiceDate).getTime())) throw new AppError(400, "Enter a valid invoice date.");
  const items = getItems(body);
  items.forEach((item, index) => {
    if (!isMissing(item.quantity)) {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new AppError(400, `Invalid quantity for item ${index + 1}.`);
      }
    }
    if (!isMissing(item.purchasePrice)) {
      const purchasePrice = Number(item.purchasePrice);
      if (Number.isNaN(purchasePrice) || purchasePrice < 0) {
        throw new AppError(400, `Invalid purchase price for item ${index + 1}.`);
      }
    }
    if (!isMissing(item.unit)) {
      const unit = String(item.unit).toUpperCase();
      if (!VALID_UNITS.includes(unit)) {
        throw new AppError(400, `Invalid unit for item ${index + 1}.`);
      }
    }
  });
};

const getSupplier = async (companyId, supplierId) => {
  const supplier = await prisma.supplier.findUnique({ where: { id: parseInt(supplierId, 10) }, select: { id: true, companyId: true } });
  if (!supplier) throw new AppError(404, "Supplier not found.");
  if (supplier.companyId !== companyId) throw new AppError(403, "You do not have permission to use this supplier.");
};

const getProducts = async (companyId, items) => {
  const codes = [...new Set(items.map((item) => String(item.productCode).trim()))];
  const products = await prisma.product.findMany({
    where: { companyId, status: true, productCode: { in: codes } },
    select: { productCode: true, productName: true, quantity: true, purchasePrice: true, unit: true },
  });
  const productsByCode = new Map(products.map((product) => [product.productCode, product]));
  const missing = codes.filter((code) => !productsByCode.has(code));
  if (missing.length) throw new AppError(404, "Active product not found for one or more selected product codes.", { productCodes: missing });
  return productsByCode;
};

const withSupplierBalances = async (purchases, companyId) => {
  if (!purchases.length) return [];
  const supplierIds = [...new Set(purchases.map((purchase) => purchase.supplierId).filter(Number.isInteger))];
  const [totals, suppliers] = await Promise.all([
    prisma.purchase.groupBy({ by: ["supplierId"], where: { companyId, status: true, supplierId: { in: supplierIds } }, _sum: { totalPurchaseAmount: true } }),
    prisma.supplier.findMany({ where: { companyId, id: { in: supplierIds } }, select: { id: true, paidAmount: true, paymentStatus: true } }),
  ]);
  const totalBySupplier = new Map(totals.map((row) => [row.supplierId, Number(row._sum.totalPurchaseAmount) || 0]));
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  return purchases.map((purchase) => {
    const supplier = supplierById.get(purchase.supplierId);
    const paidAmount = Number(supplier?.paidAmount) || 0;
    return {
      ...purchase,
      totalPurchaseAmount: Number(purchase.totalPurchaseAmount) || 0,
      paidAmount,
      remainingAmount: calculateRemainingAmount(totalBySupplier.get(purchase.supplierId) || 0, paidAmount),
      paymentStatus: supplier?.paymentStatus || "UNPAID",
    };
  });
};

const resetSupplierPaymentsWhenNoPurchases = async (tx, companyId, supplierIds) => {
  const normalizedSupplierIds = [...new Set((supplierIds || []).filter(Number.isInteger))];
  if (!normalizedSupplierIds.length) return;

  const [totals, suppliers] = await Promise.all([
    tx.purchase.groupBy({
      by: ["supplierId"],
      where: { companyId, status: true, supplierId: { in: normalizedSupplierIds } },
      _sum: { totalPurchaseAmount: true },
    }),
    tx.supplier.findMany({
      where: { companyId, id: { in: normalizedSupplierIds } },
      select: { id: true, paidAmount: true, paymentStatus: true },
    }),
  ]);

  const totalBySupplier = new Map(totals.map((row) => [row.supplierId, Number(row._sum.totalPurchaseAmount) || 0]));
  const suppliersToReset = suppliers
    .filter((supplier) => (totalBySupplier.get(supplier.id) || 0) <= 0 && ((Number(supplier.paidAmount) || 0) !== 0 || supplier.paymentStatus !== "UNPAID"))
    .map((supplier) => supplier.id);

  for (const supplierId of suppliersToReset) {
    await tx.supplier.update({
      where: { id: supplierId },
      data: { paidAmount: 0, paymentStatus: "UNPAID" },
    });
  }
};

const groupPurchases = (purchases) => {
  const groups = new Map();
  purchases.forEach((purchase) => {
    const key = `${purchase.companyId}:${purchase.purchaseNumber}`;
    if (!groups.has(key)) groups.set(key, { ...purchase, items: [], netTotalPurchaseAmount: 0 });
    const group = groups.get(key);
    group.items.push({
      id: purchase.id,
      productCode: purchase.productCode,
      productName: purchase.productName,
      quantity: purchase.quantity,
      unit: purchase.unit,
      purchasePrice: purchase.purchasePrice,
      totalPurchaseAmount: purchase.totalPurchaseAmount,
      remarks: purchase.remarks,
    });
    group.netTotalPurchaseAmount += Number(purchase.totalPurchaseAmount) || 0;
  });
  return [...groups.values()].map((group) => {
    const netTotalPurchaseAmount = Number(group.netTotalPurchaseAmount.toFixed(2));
    return {
      ...group,
      totalPurchaseAmount: netTotalPurchaseAmount,
      netTotalPurchaseAmount,
      remainingAmount: calculateRemainingAmount(netTotalPurchaseAmount, group.paidAmount),
    };
  });
};

const loadInvoice = async (companyId, purchaseNumber) => {
  const lines = await prisma.purchase.findMany({ where: { companyId, purchaseNumber }, select: PURCHASE_SELECT, orderBy: { id: "asc" } });
  return groupPurchases(await withSupplierBalances(lines, companyId))[0] || null;
};

const lineData = (body, item, product, companyId) => purchaseData(
  { ...body, productCode: item.productCode, remarks: item.remarks ?? body.remarks },
  { companyId },
  product,
  item,
);

exports.getAll = async (req, res) => {
  const { search, supplierId, paymentStatus, startDate, endDate, status } = req.query;
  const where = { companyId: req.auth.companyId };
  if (search) where.OR = [
    { purchaseNumber: { contains: search, mode: "insensitive" } }, { supplierName: { contains: search, mode: "insensitive" } },
    { productCode: { contains: search, mode: "insensitive" } }, { remarks: { contains: search, mode: "insensitive" } },
  ];
  if (supplierId) where.supplierId = parseInt(supplierId, 10);
  if (paymentStatus) {
    const value = String(paymentStatus).toUpperCase();
    if (!PAYMENT_STATUSES.includes(value)) throw new AppError(400, "Invalid payment status.");
    where.supplier = { is: { paymentStatus: value } };
  }
  if (status !== undefined) where.status = String(status).toLowerCase() === "true" || String(status).toUpperCase() === "ACTIVE";
  if (startDate || endDate) {
    where.invoiceDate = {};
    if (startDate) where.invoiceDate.gte = new Date(startDate);
    if (endDate) where.invoiceDate.lte = new Date(endDate);
  }
  const lines = await prisma.purchase.findMany({ where, select: PURCHASE_SELECT, orderBy: [{ invoiceDate: "desc" }, { id: "asc" }] });
  return res.json({ purchases: groupPurchases(await withSupplierBalances(lines, req.auth.companyId)) });
};

exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid purchase id.");
  const line = await prisma.purchase.findFirst({ where: { id, companyId: req.auth.companyId }, select: { purchaseNumber: true } });
  if (!line) throw new AppError(404, "Purchase not found.");
  return res.json({ purchase: await loadInvoice(req.auth.companyId, line.purchaseNumber) });
};

exports.create = async (req, res) => {
  validatePurchaseInput(req.body);
  const items = getItems(req.body);
  const purchaseNumber = String(req.body.purchaseNumber).trim();
  await getSupplier(req.auth.companyId, req.body.supplierId);
  const products = await getProducts(req.auth.companyId, items);
  const existing = await prisma.purchase.findFirst({ where: { companyId: req.auth.companyId, purchaseNumber }, select: { id: true } });
  if (existing) throw new AppError(409, "This purchase number already exists. Edit that invoice to manage its product lines.");
  await prisma.$transaction(items.map((item) => prisma.purchase.create({ data: lineData(req.body, item, products.get(String(item.productCode).trim()), req.auth.companyId) })));
  return res.status(201).json({ message: "Purchase invoice created successfully.", purchase: await loadInvoice(req.auth.companyId, purchaseNumber) });
};

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid purchase id.");
  validatePurchaseInput(req.body);
  const existing = await prisma.purchase.findFirst({ where: { id, companyId: req.auth.companyId }, select: { purchaseNumber: true } });
  if (!existing) throw new AppError(404, "Purchase not found.");
  const items = getItems(req.body);
  await getSupplier(req.auth.companyId, req.body.supplierId);
  const products = await getProducts(req.auth.companyId, items);
  const purchaseNumber = String(req.body.purchaseNumber).trim();
  await prisma.$transaction(async (tx) => {
    const existingLines = await tx.purchase.findMany({
      where: { companyId: req.auth.companyId, purchaseNumber: existing.purchaseNumber },
      select: { supplierId: true },
    });

    await tx.purchase.deleteMany({ where: { companyId: req.auth.companyId, purchaseNumber: existing.purchaseNumber } });

    for (const item of items) {
      await tx.purchase.create({ data: lineData(req.body, item, products.get(String(item.productCode).trim()), req.auth.companyId) });
    }

    const supplierIdsToCheck = [
      ...existingLines.map((line) => line.supplierId),
      parseInt(req.body.supplierId, 10),
    ];
    await resetSupplierPaymentsWhenNoPurchases(tx, req.auth.companyId, supplierIdsToCheck);
  });
  return res.json({ message: "Purchase invoice updated successfully.", purchase: await loadInvoice(req.auth.companyId, purchaseNumber) });
};

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid purchase id.");
  const existing = await prisma.purchase.findFirst({ where: { id, companyId: req.auth.companyId }, select: { purchaseNumber: true } });
  if (!existing) throw new AppError(404, "Purchase not found.");
  await prisma.$transaction(async (tx) => {
    const lines = await tx.purchase.findMany({
      where: { companyId: req.auth.companyId, purchaseNumber: existing.purchaseNumber },
      select: { supplierId: true },
    });
    await tx.purchase.deleteMany({ where: { companyId: req.auth.companyId, purchaseNumber: existing.purchaseNumber } });
    await resetSupplierPaymentsWhenNoPurchases(tx, req.auth.companyId, lines.map((line) => line.supplierId));
  });
  return res.json({ message: "Purchase invoice deleted successfully." });
};
