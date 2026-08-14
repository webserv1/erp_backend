const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");
const { calculatePerSaleProfit, calculateRemainingAmount } = require("../utils/salesCalculations");

const SALE_SELECT = {
  id: true, companyId: true, partyId: true, partyName: true, supplierId: true, supplierName: true,
  productName: true, productCode: true, brandId: true, colorId: true, sizeId: true, quantity: true,
  unit: true, salePrice: true, purchasePrice: true, paidAmount: true, remainingAmount: true, paymentStatus: true, perSaleProfit: true, remarks: true,
  status: true, createdAt: true, updatedAt: true,
  party: { select: { id: true, partyName: true } },
  supplier: { select: { id: true, name: true } },
  ProductMaster_Sale_brandIdToProductMaster: { select: { id: true, name: true } },
  color: { select: { id: true, name: true } },
  size: { select: { id: true, name: true } },
  selectedBrands: { select: { productMaster: { select: { id: true, name: true } } } },
  selectedColors: { select: { productMaster: { select: { id: true, name: true } } } },
  selectedSizes: { select: { productMaster: { select: { id: true, name: true } } } },
};

const INVOICE_SALE_SELECT = {
  ...SALE_SELECT,
  company: { select: { id: true, name: true, branding: { select: { logoUrl: true } } } },
};

const FIELD_ALIASES = {
  brandId: ["brandId", "brandIds", "brandIds[]"],
  colorId: ["colorId", "colorIds", "colorIds[]"],
  sizeId: ["sizeId", "sizeIds", "sizeIds[]"],
};

const toIds = (body, field) => {
  const raw = FIELD_ALIASES[field].flatMap((key) => body[key] === undefined ? [] : body[key]);
  const values = Array.isArray(raw) ? raw : [raw];
  return [...new Set(values.flatMap((value) => typeof value === "string" ? value.split(",") : [value])
    .map((value) => Number.parseInt(value, 10)).filter((id) => Number.isInteger(id) && id > 0))];
};

const selectedValues = (sale, relationField, legacyField, legacyRelation) => {
  const values = sale[relationField].map((entry) => entry.productMaster);
  return values.length ? values : sale[legacyRelation] ? [sale[legacyRelation]] : sale[legacyField] ? [{ id: sale[legacyField], name: `#${sale[legacyField]}` }] : [];
};

const serializeSale = (sale) => {
  const brands = selectedValues(sale, "selectedBrands", "brandId", "ProductMaster_Sale_brandIdToProductMaster");
  const colors = selectedValues(sale, "selectedColors", "colorId", "color");
  const sizes = selectedValues(sale, "selectedSizes", "sizeId", "size");
  const { selectedBrands, selectedColors, selectedSizes, ProductMaster_Sale_brandIdToProductMaster, ...data } = sale;
  return { ...data, brands, colors, sizes, brandIds: brands.map((item) => item.id), colorIds: colors.map((item) => item.id), sizeIds: sizes.map((item) => item.id) };
};

const validateSaleInput = (body) => {
  const required = ["productName", "productCode", "quantity", "salePrice", "purchasePrice", "unit", "status"];
  const missing = required.filter((field) => body[field] === undefined || body[field] === null || String(body[field]).trim() === "");
  ["colorId", "sizeId"].forEach((field) => { if (!toIds(body, field).length) missing.push(field); });
  if (missing.length) throw new AppError(400, "Required fields are missing.", { fields: missing });
  if (!Number.isInteger(Number(body.quantity)) || Number(body.quantity) < 1) throw new AppError(400, "Quantity must be a positive integer.");
  for (const field of ["salePrice", "purchasePrice", "paidAmount"]) if (body[field] !== undefined && (Number.isNaN(Number(body[field])) || Number(body[field]) < 0)) throw new AppError(400, `${field} must be a non-negative number.`);
  if (!["PIECES", "DOZEN"].includes(String(body.unit).toUpperCase())) throw new AppError(400, "Unit must be PIECES or DOZEN.");
  if (body.paymentStatus && !["UNPAID", "PARTIAL", "PAID", "OVERDUE"].includes(String(body.paymentStatus).toUpperCase())) throw new AppError(400, "paymentStatus must be UNPAID, PARTIAL, PAID, or OVERDUE.");
  if (![true, false, "ACTIVE", "INACTIVE", "true", "false"].includes(body.status)) throw new AppError(400, "Status must be ACTIVE, INACTIVE, true, or false.");
};

const validateMasterSelections = async (companyId, selections) => {
  const requested = [
    ...selections.brandIds.map((id) => ({ id, type: "BRAND" })),
    ...selections.colorIds.map((id) => ({ id, type: "COLOR" })),
    ...selections.sizeIds.map((id) => ({ id, type: "SIZE" })),
  ];
  const masters = await prisma.productMaster.findMany({ where: { id: { in: requested.map((item) => item.id) } }, select: { id: true, companyId: true, type: true } });
  const byId = new Map(masters.map((master) => [master.id, master]));
  for (const requestedMaster of requested) {
    const master = byId.get(requestedMaster.id);
    if (!master) throw new AppError(404, `${requestedMaster.type.toLowerCase()} not found.`);
    if (master.companyId !== companyId) throw new AppError(403, "You do not have permission to use this master entry.");
    if (master.type !== requestedMaster.type) throw new AppError(400, `Selected entry is not a valid ${requestedMaster.type.toLowerCase()}.`);
  }
};

const relationData = (ids, updating) => updating
  ? { deleteMany: {}, ...(ids.length ? { create: ids.map((productMasterId) => ({ productMasterId })) } : {}) }
  : { create: ids.map((productMasterId) => ({ productMasterId })) };

const saleData = (body) => {
  const brandIds = toIds(body, "brandId");
  const colorIds = toIds(body, "colorId");
  const sizeIds = toIds(body, "sizeId");
  const quantity = Number(body.quantity); const salePrice = Number(body.salePrice); const purchasePrice = Number(body.purchasePrice); const unit = String(body.unit).toUpperCase();
  return {
    partyId: body.partyId ? Number.parseInt(body.partyId, 10) : null,
    partyName: body.partyName ? String(body.partyName).trim() : null,
    supplierId: body.supplierId ? Number.parseInt(body.supplierId, 10) : null,
    supplierName: body.supplierName ? String(body.supplierName).trim() : null,
    productName: String(body.productName).trim(), productCode: String(body.productCode).trim(),
    brandId: brandIds[0] || null, colorId: colorIds[0], sizeId: sizeIds[0],
    quantity, unit, salePrice, purchasePrice,
    // The legacy database column remains for compatibility but is no longer exposed or calculated.
    total: 0,
    paidAmount: body.paidAmount === undefined ? 0 : Number(body.paidAmount),
    remainingAmount: calculateRemainingAmount(salePrice, body.paidAmount),
    paymentStatus: body.paymentStatus ? String(body.paymentStatus).toUpperCase() : "UNPAID",
    perSaleProfit: calculatePerSaleProfit(salePrice, purchasePrice),
    status: body.status === true || body.status === "ACTIVE" || body.status === "true",
    remarks: body.remarks ? String(body.remarks).trim() : null,
    selections: { brandIds, colorIds, sizeIds },
  };
};

const validatePartyAndSupplier = async (companyId, body) => {
  if (body.partyId) {
    const party = await prisma.party.findFirst({ where: { id: Number.parseInt(body.partyId, 10), companyId }, select: { id: true } });
    if (!party) throw new AppError(404, "Party not found.");
  }
  if (body.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: Number.parseInt(body.supplierId, 10), companyId }, select: { id: true } });
    if (!supplier) throw new AppError(404, "Supplier not found.");
  }
};

exports.getProductDetails = async (req, res) => {
  const productCode = String(req.query.productCode || "").trim();
  if (!productCode) throw new AppError(400, "productCode query parameter is required.");
  const product = await prisma.product.findFirst({
    where: { companyId: req.auth.companyId, productCode, status: true },
    select: { id: true, productCode: true, productName: true, brandId: true, colorId: true, sizeId: true, brandIds: true, colorIds: true, sizeIds: true, quantity: true, unit: true, purchasePrice: true },
  });
  if (!product) throw new AppError(404, "Active product not found for this product code.");
  const ids = [...new Set([...(product.brandIds.length ? product.brandIds : [product.brandId]), ...(product.colorIds.length ? product.colorIds : [product.colorId]), ...(product.sizeIds.length ? product.sizeIds : [product.sizeId])])];
  const masters = await prisma.productMaster.findMany({ where: { companyId: req.auth.companyId, id: { in: ids } }, select: { id: true, name: true, type: true } });
  const values = (selectedIds, type) => selectedIds.map((id) => masters.find((master) => master.id === id && master.type === type)).filter(Boolean).map(({ id, name }) => ({ id, name }));
  const purchase = await prisma.purchase.findFirst({ where: { companyId: req.auth.companyId, productCode, status: true }, orderBy: [{ invoiceDate: "desc" }, { id: "desc" }], select: { supplierId: true, supplierName: true, supplier: { select: { id: true, name: true } } } });
  return res.json({ product: { id: product.id, productCode: product.productCode, productName: product.productName, quantity: product.quantity, unit: product.unit, purchasePrice: product.purchasePrice, brandIds: product.brandIds.length ? product.brandIds : [product.brandId], colorIds: product.colorIds.length ? product.colorIds : [product.colorId], sizeIds: product.sizeIds.length ? product.sizeIds : [product.sizeId], brands: values(product.brandIds.length ? product.brandIds : [product.brandId], "BRAND"), colors: values(product.colorIds.length ? product.colorIds : [product.colorId], "COLOR"), sizes: values(product.sizeIds.length ? product.sizeIds : [product.sizeId], "SIZE") }, supplier: purchase?.supplierId ? { id: purchase.supplierId, name: purchase.supplier?.name || purchase.supplierName } : null });
};

exports.getAll = async (req, res) => {
  const { search, brandId, colorId, sizeId, supplierId, partyId, startDate, endDate } = req.query;
  const where = { companyId: req.auth.companyId };
  if (search) where.OR = [{ productName: { contains: search, mode: "insensitive" } }, { productCode: { contains: search, mode: "insensitive" } }];
  const addSelectionFilter = (relation, value) => { const ids = (Array.isArray(value) ? value : [value]).map(Number).filter(Number.isInteger); if (ids.length) where[relation] = { some: { productMasterId: { in: ids } } }; };
  if (brandId) addSelectionFilter("selectedBrands", brandId); if (colorId) addSelectionFilter("selectedColors", colorId); if (sizeId) addSelectionFilter("selectedSizes", sizeId);
  if (supplierId) where.supplierId = Number.parseInt(supplierId, 10); if (partyId) where.partyId = Number.parseInt(partyId, 10);
  if (startDate || endDate) { where.createdAt = {}; if (startDate) where.createdAt.gte = new Date(startDate); if (endDate) where.createdAt.lte = new Date(endDate); }
  const sales = await prisma.sale.findMany({ where, select: SALE_SELECT, orderBy: { createdAt: "desc" } });
  return res.json({ sales: sales.map(serializeSale) });
};

exports.getById = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10); if (!Number.isInteger(id)) throw new AppError(400, "Invalid sale id.");
  const sale = await prisma.sale.findFirst({ where: { id, companyId: req.auth.companyId }, select: SALE_SELECT });
  if (!sale) throw new AppError(404, "Sale not found.");
  return res.json({ sale: serializeSale(sale) });
};

exports.getInvoice = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, "Invalid sale id.");

  const sale = await prisma.sale.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: INVOICE_SALE_SELECT,
  });
  if (!sale) throw new AppError(404, "Sale not found.");

  const serialized = serializeSale(sale);
  const { company, supplier, supplierName, purchasePrice, remainingAmount, perSaleProfit, ...invoiceSale } = serialized;
  return res.json({
    invoice: {
      invoiceNumber: `SALE-${String(sale.id).padStart(6, "0")}`,
      issueDate: sale.createdAt,
      company: { id: sale.company.id, name: sale.company.name, logoUrl: sale.company.branding?.logoUrl || null },
      customer: sale.party ? { id: sale.party.id, name: sale.party.partyName } : null,
      sale: invoiceSale,
    },
  });
};

const saveSale = async (req, id) => {
  validateSaleInput(req.body);
  const data = saleData(req.body); const { selections, ...writeData } = data;
  await Promise.all([validateMasterSelections(req.auth.companyId, selections), validatePartyAndSupplier(req.auth.companyId, req.body)]);
  const selectionsData = {
    selectedBrands: relationData(selections.brandIds, Boolean(id)),
    selectedColors: relationData(selections.colorIds, Boolean(id)),
    selectedSizes: relationData(selections.sizeIds, Boolean(id)),
  };
  const sale = id
    ? await prisma.sale.update({ where: { id }, data: { ...writeData, ...selectionsData }, select: SALE_SELECT })
    : await prisma.sale.create({ data: { ...writeData, ...selectionsData, companyId: req.auth.companyId }, select: SALE_SELECT });
  return serializeSale(sale);
};

exports.create = async (req, res) => res.status(201).json({ message: "Sale created successfully.", sale: await saveSale(req) });
exports.update = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10); if (!Number.isInteger(id)) throw new AppError(400, "Invalid sale id.");
  const existing = await prisma.sale.findFirst({ where: { id, companyId: req.auth.companyId }, select: { id: true } }); if (!existing) throw new AppError(404, "Sale not found.");
  return res.json({ message: "Sale updated successfully.", sale: await saveSale(req, id) });
};
exports.remove = async (req, res) => { const id = Number.parseInt(req.params.id, 10); if (!Number.isInteger(id)) throw new AppError(400, "Invalid sale id."); const existing = await prisma.sale.findFirst({ where: { id, companyId: req.auth.companyId }, select: { id: true } }); if (!existing) throw new AppError(404, "Sale not found."); await prisma.sale.delete({ where: { id } }); return res.json({ message: "Sale deleted successfully." }); };
