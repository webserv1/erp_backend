const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");
const {
  calculatePerSaleProfit,
  calculateRemainingAmount,
  calculateTotalPurchaseAmount,
  calculateTotalSalePrice,
} = require("../utils/salesCalculations");

const PAYMENT_STATUSES = ["UNPAID", "PARTIAL", "PAID", "OVERDUE"];
const VALID_UNITS = ["PIECES", "DOZEN"];
const isMissing = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && !value.trim());
const toBaseQuantity = (quantity, unit) =>
  (Number(quantity) || 0) * (String(unit || "PIECES").toUpperCase() === "DOZEN" ? 12 : 1);
const formatQuantityBreakdown = (pieces) => {
  const safePieces = Math.max(0, Number(pieces) || 0);
  const dozens = Math.floor(safePieces / 12);
  const remainder = safePieces % 12;
  if (!remainder) return `${safePieces} PIECES (${dozens} DOZENS)`;
  return `${safePieces} PIECES (${dozens} DOZENS + ${remainder} PIECES)`;
};

const SALE_SELECT = {
  id: true,
  companyId: true,
  saleNumber: true,
  partyId: true,
  partyName: true,
  supplierId: true,
  supplierName: true,
  productName: true,
  productCode: true,
  brandId: true,
  colorId: true,
  sizeId: true,
  quantity: true,
  unit: true,
  salePrice: true,
  purchasePrice: true,
  paidAmount: true,
  remainingAmount: true,
  paymentStatus: true,
  perSaleProfit: true,
  remarks: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  party: { select: { id: true, partyName: true } },
  supplier: { select: { id: true, name: true } },
  ProductMaster_Sale_brandIdToProductMaster: {
    select: { id: true, name: true },
  },
  color: { select: { id: true, name: true } },
  size: { select: { id: true, name: true } },
  selectedBrands: { select: { productMaster: { select: { id: true, name: true } } } },
  selectedColors: { select: { productMaster: { select: { id: true, name: true } } } },
  selectedSizes: { select: { productMaster: { select: { id: true, name: true } } } },
};

const INVOICE_SALE_SELECT = {
  ...SALE_SELECT,
  company: {
    select: { id: true, name: true, branding: { select: { logoUrl: true } } },
  },
};

const FIELD_ALIASES = {
  brandId: ["brandId", "brandIds", "brandIds[]"],
  colorId: ["colorId", "colorIds", "colorIds[]"],
  sizeId: ["sizeId", "sizeIds", "sizeIds[]"],
};

const toIds = (source, field) => {
  const aliases = FIELD_ALIASES[field] || [field];
  const rawValues = aliases.flatMap((key) =>
    source[key] === undefined ? [] : source[key],
  );
  const values = Array.isArray(rawValues) ? rawValues : [rawValues];
  return [
    ...new Set(
      values
        .flatMap((value) =>
          typeof value === "string" ? value.split(",") : [value],
        )
        .map((value) => Number.parseInt(value, 10))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
};

const selectedValues = (sale, relationField, legacyField, legacyRelation) => {
  const values = sale[relationField].map((entry) => entry.productMaster);
  if (values.length) return values;
  if (sale[legacyRelation]) return [sale[legacyRelation]];
  if (sale[legacyField]) return [{ id: sale[legacyField], name: `#${sale[legacyField]}` }];
  return [];
};

const serializeLine = (sale) => {
  const brands = selectedValues(
    sale,
    "selectedBrands",
    "brandId",
    "ProductMaster_Sale_brandIdToProductMaster",
  );
  const colors = selectedValues(sale, "selectedColors", "colorId", "color");
  const sizes = selectedValues(sale, "selectedSizes", "sizeId", "size");
  const {
    selectedBrands,
    selectedColors,
    selectedSizes,
    ProductMaster_Sale_brandIdToProductMaster,
    ...data
  } = sale;
  const unit = String(data.unit || "PIECES").toUpperCase();
  const totalSalePrice = calculateTotalSalePrice(data.quantity, unit, data.salePrice);
  const totalPurchaseAmount = calculateTotalPurchaseAmount(
    data.quantity,
    unit,
    data.purchasePrice,
  );

  return {
    ...data,
    unit,
    brands,
    colors,
    sizes,
    brandIds: brands.map((item) => item.id),
    colorIds: colors.map((item) => item.id),
    sizeIds: sizes.map((item) => item.id),
    totalSalePrice: Number(totalSalePrice.toFixed(2)),
    totalPurchaseAmount: Number(totalPurchaseAmount.toFixed(2)),
  };
};

const groupSales = (sales) => {
  const groups = new Map();
  sales.forEach((entry) => {
    const line = serializeLine(entry);
    const saleNumber = line.saleNumber || `SALE-${line.id}`;
    const key = `${line.companyId}:${saleNumber}`;
    if (!groups.has(key)) {
      groups.set(key, {
        ...line,
        saleNumber,
        items: [],
        netTotalSalePrice: 0,
        netTotalPurchaseAmount: 0,
      });
    }
    const group = groups.get(key);
    group.items.push({
      id: line.id,
      productId: line.productId || null,
      productCode: line.productCode,
      productName: line.productName,
      supplierId: line.supplierId,
      supplierName: line.supplierName,
      brandIds: line.brandIds,
      colorIds: line.colorIds,
      sizeIds: line.sizeIds,
      brands: line.brands,
      colors: line.colors,
      sizes: line.sizes,
      quantity: line.quantity,
      unit: line.unit,
      salePrice: line.salePrice,
      purchasePrice: line.purchasePrice,
      totalPurchaseAmount: line.totalPurchaseAmount,
      totalSalePrice: line.totalSalePrice,
      Totalsaleprice: line.totalSalePrice,
    });
    group.netTotalSalePrice += Number(line.totalSalePrice) || 0;
    group.netTotalPurchaseAmount += Number(line.totalPurchaseAmount) || 0;
  });

  return [...groups.values()].map((group) => {
    const netTotalSalePrice = Number(group.netTotalSalePrice.toFixed(2));
    const netTotalPurchaseAmount = Number(group.netTotalPurchaseAmount.toFixed(2));
    const paidAmount = Number(group.paidAmount) || 0;
    const remainingAmount = Number(
      calculateRemainingAmount(netTotalSalePrice, paidAmount).toFixed(2),
    );
    const perSaleProfit = Number(
      calculatePerSaleProfit(netTotalPurchaseAmount, netTotalSalePrice).toFixed(2),
    );

    return {
      ...group,
      productCode: group.items[0]?.productCode || group.productCode,
      productName: group.items[0]?.productName || group.productName,
      quantity: group.items[0]?.quantity || group.quantity,
      unit: group.items[0]?.unit || group.unit,
      salePrice: group.items[0]?.salePrice || group.salePrice,
      purchasePrice: group.items[0]?.purchasePrice || group.purchasePrice,
      totalSalePrice: group.items[0]?.totalSalePrice || group.totalSalePrice || 0,
      netTotalSalePrice,
      NetTotalsaleprice: netTotalSalePrice,
      netTotalPurchaseAmount,
      netTotalpurchaseamount: netTotalPurchaseAmount,
      remainingAmount,
      perSaleProfit,
      persaleprofit: perSaleProfit,
    };
  });
};

const getItems = (body) => {
  if (Array.isArray(body.items) && body.items.length) return body.items;
  return [
    {
      productName: body.productName,
      productCode: body.productCode,
      supplierId: body.supplierId,
      supplierName: body.supplierName,
      brandIds: body.brandIds,
      colorIds: body.colorIds,
      sizeIds: body.sizeIds,
      quantity: body.quantity,
      unit: body.unit,
      salePrice: body.salePrice,
      purchasePrice: body.purchasePrice,
      remarks: body.remarks,
    },
  ].filter((item) => !isMissing(item.productCode));
};

const normalizeStatus = (value) =>
  value === true || value === "ACTIVE" || String(value).toLowerCase() === "true";

const parseSelectionIds = (item, field) => {
  const plural = `${field}s`;
  const idsFromArray = Array.isArray(item[plural]) ? item[plural] : [];
  if (idsFromArray.length) {
    return [...new Set(idsFromArray.map((value) => Number(value)).filter(Number.isInteger))];
  }
  return toIds(item, field);
};

const normalizeLine = (item, body) => {
  const quantity = Number(item.quantity);
  const salePrice = Number(item.salePrice);
  const purchasePrice = Number(item.purchasePrice);
  const unit = String(item.unit || "PIECES").toUpperCase();
  const brandIds = parseSelectionIds(item, "brandId");
  const colorIds = parseSelectionIds(item, "colorId");
  const sizeIds = parseSelectionIds(item, "sizeId");

  return {
    productName: String(item.productName || "").trim(),
    productCode: String(item.productCode || "").trim(),
    supplierId: item.supplierId ? Number.parseInt(item.supplierId, 10) : null,
    supplierName: item.supplierName ? String(item.supplierName).trim() : null,
    quantity,
    unit,
    salePrice,
    purchasePrice,
    remarks: item.remarks ? String(item.remarks).trim() : body.remarks ? String(body.remarks).trim() : null,
    selections: { brandIds, colorIds, sizeIds },
  };
};

const validateSaleInput = (body) => {
  if (isMissing(body.partyId)) throw new AppError(400, "partyId is required.");

  const items = getItems(body);
  if (!items.length) throw new AppError(400, "Add at least one product line.");

  const lineErrors = [];
  items.forEach((item, index) => {
    if (isMissing(item.productName)) lineErrors.push(`items[${index}].productName`);
    if (isMissing(item.productCode)) lineErrors.push(`items[${index}].productCode`);
    if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) {
      lineErrors.push(`items[${index}].quantity`);
    }
    if (Number.isNaN(Number(item.salePrice)) || Number(item.salePrice) < 0) {
      lineErrors.push(`items[${index}].salePrice`);
    }
    if (Number.isNaN(Number(item.purchasePrice)) || Number(item.purchasePrice) < 0) {
      lineErrors.push(`items[${index}].purchasePrice`);
    }
    if (!VALID_UNITS.includes(String(item.unit || "").toUpperCase())) {
      lineErrors.push(`items[${index}].unit`);
    }
    if (!parseSelectionIds(item, "colorId").length) {
      lineErrors.push(`items[${index}].colorIds`);
    }
    if (!parseSelectionIds(item, "sizeId").length) {
      lineErrors.push(`items[${index}].sizeIds`);
    }
  });

  if (lineErrors.length) {
    throw new AppError(400, "Required fields are missing or invalid.", {
      fields: lineErrors,
    });
  }

  if (
    body.paymentStatus &&
    !PAYMENT_STATUSES.includes(String(body.paymentStatus).toUpperCase())
  ) {
    throw new AppError(
      400,
      "paymentStatus must be UNPAID, PARTIAL, PAID, or OVERDUE.",
    );
  }
  if (![true, false, "ACTIVE", "INACTIVE", "true", "false"].includes(body.status)) {
    throw new AppError(400, "Status must be ACTIVE, INACTIVE, true, or false.");
  }
  if (
    body.paidAmount !== undefined &&
    (Number.isNaN(Number(body.paidAmount)) || Number(body.paidAmount) < 0)
  ) {
    throw new AppError(400, "paidAmount must be a non-negative number.");
  }

  const saleNumber = String(body.saleNumber || "").trim();
  if (saleNumber && !/^\d+$/.test(saleNumber)) {
    throw new AppError(400, "Sale number must contain numbers only.");
  }

  return items;
};

const validateMasterSelections = async (companyId, lines) => {
  const requested = lines.flatMap((line) => [
    ...line.selections.brandIds.map((id) => ({ id, type: "BRAND" })),
    ...line.selections.colorIds.map((id) => ({ id, type: "COLOR" })),
    ...line.selections.sizeIds.map((id) => ({ id, type: "SIZE" })),
  ]);
  if (!requested.length) return;

  const masters = await prisma.productMaster.findMany({
    where: { id: { in: requested.map((item) => item.id) } },
    select: { id: true, companyId: true, type: true },
  });
  const byId = new Map(masters.map((master) => [master.id, master]));

  for (const requestedMaster of requested) {
    const master = byId.get(requestedMaster.id);
    if (!master) {
      throw new AppError(404, `${requestedMaster.type.toLowerCase()} not found.`);
    }
    if (master.companyId !== companyId) {
      throw new AppError(403, "You do not have permission to use this master entry.");
    }
    if (master.type !== requestedMaster.type) {
      throw new AppError(
        400,
        `Selected entry is not a valid ${requestedMaster.type.toLowerCase()}.`,
      );
    }
  }
};

const validatePartyAndSuppliers = async (companyId, partyId, lines) => {
  const party = await prisma.party.findFirst({
    where: { id: Number.parseInt(partyId, 10), companyId },
    select: { id: true },
  });
  if (!party) throw new AppError(404, "Party not found.");

  const supplierIds = [
    ...new Set(
      lines
        .map((line) => line.supplierId)
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ];
  if (!supplierIds.length) return;

  const suppliers = await prisma.supplier.findMany({
    where: { companyId, id: { in: supplierIds } },
    select: { id: true },
  });
  const supplierSet = new Set(suppliers.map((supplier) => supplier.id));
  const missing = supplierIds.filter((id) => !supplierSet.has(id));
  if (missing.length) throw new AppError(404, "Supplier not found.");
};

const validateAvailableQuantity = async (
  companyId,
  lines,
  existingSaleNumber,
  existingId,
) => {
  const productCodes = [...new Set(lines.map((line) => line.productCode))];
  if (!productCodes.length) return;

  const saleWhere = {
    companyId,
    status: true,
    productCode: { in: productCodes },
  };
  if (existingSaleNumber) {
    saleWhere.NOT = { saleNumber: existingSaleNumber };
  } else if (existingId) {
    saleWhere.NOT = { id: existingId };
  }

  const [purchases, sales] = await Promise.all([
    prisma.purchase.findMany({
      where: { companyId, status: true, productCode: { in: productCodes } },
      select: { productCode: true, quantity: true, unit: true },
    }),
    prisma.sale.findMany({
      where: saleWhere,
      select: { productCode: true, quantity: true, unit: true },
    }),
  ]);

  const qtyInByCode = purchases.reduce((map, entry) => {
    map.set(
      entry.productCode,
      (map.get(entry.productCode) || 0) + toBaseQuantity(entry.quantity, entry.unit),
    );
    return map;
  }, new Map());
  const qtyOutByCode = sales.reduce((map, entry) => {
    map.set(
      entry.productCode,
      (map.get(entry.productCode) || 0) + toBaseQuantity(entry.quantity, entry.unit),
    );
    return map;
  }, new Map());
  const requestedByCode = lines.reduce((map, line) => {
    map.set(
      line.productCode,
      (map.get(line.productCode) || 0) + toBaseQuantity(line.quantity, line.unit),
    );
    return map;
  }, new Map());

  for (const productCode of productCodes) {
    const available = (qtyInByCode.get(productCode) || 0) - (qtyOutByCode.get(productCode) || 0);
    const requested = requestedByCode.get(productCode) || 0;
    if (requested > available) {
      throw new AppError(
        400,
        `Only ${formatQuantityBreakdown(Math.max(available, 0))} is remaining for this product (${productCode}).`,
      );
    }
  }
};

const buildLineWriteData = (body, line, saleNumber, netTotalSalePrice) => {
  const lineTotalSalePrice = calculateTotalSalePrice(line.quantity, line.unit, line.salePrice);
  const lineTotalPurchase = calculateTotalPurchaseAmount(
    line.quantity,
    line.unit,
    line.purchasePrice,
  );
  const lineProfit = calculatePerSaleProfit(lineTotalPurchase, lineTotalSalePrice);

  return {
    saleNumber,
    partyId: Number.parseInt(body.partyId, 10),
    partyName: body.partyName ? String(body.partyName).trim() : null,
    supplierId: line.supplierId,
    supplierName: line.supplierName,
    productName: line.productName,
    productCode: line.productCode,
    brandId: line.selections.brandIds[0] || null,
    colorId: line.selections.colorIds[0],
    sizeId: line.selections.sizeIds[0],
    quantity: line.quantity,
    unit: line.unit,
    salePrice: line.salePrice,
    purchasePrice: line.purchasePrice,
    total: 0,
    paidAmount: body.paidAmount === undefined ? 0 : Number(body.paidAmount),
    remainingAmount: calculateRemainingAmount(
      netTotalSalePrice,
      body.paidAmount === undefined ? 0 : Number(body.paidAmount),
    ),
    paymentStatus: body.paymentStatus
      ? String(body.paymentStatus).toUpperCase()
      : "UNPAID",
    perSaleProfit: Number(lineProfit.toFixed(2)),
    status:
      body.status !== undefined
        ? normalizeStatus(body.status)
        : true,
    remarks: line.remarks,
    selectedBrands: {
      create: line.selections.brandIds.map((productMasterId) => ({ productMasterId })),
    },
    selectedColors: {
      create: line.selections.colorIds.map((productMasterId) => ({ productMasterId })),
    },
    selectedSizes: {
      create: line.selections.sizeIds.map((productMasterId) => ({ productMasterId })),
    },
  };
};

const loadInvoice = async (companyId, saleNumber) => {
  const lines = await prisma.sale.findMany({
    where: { companyId, saleNumber },
    select: SALE_SELECT,
    orderBy: { id: "asc" },
  });
  return groupSales(lines)[0] || null;
};

exports.getProductDetails = async (req, res) => {
  const productCode = String(req.query.productCode || "").trim();
  if (!productCode) {
    throw new AppError(400, "productCode query parameter is required.");
  }

  const product = await prisma.product.findFirst({
    where: { companyId: req.auth.companyId, productCode, status: true },
    select: {
      id: true,
      productCode: true,
      productName: true,
      brandId: true,
      colorId: true,
      sizeId: true,
      brandIds: true,
      colorIds: true,
      sizeIds: true,
      quantity: true,
      unit: true,
      purchasePrice: true,
    },
  });
  if (!product) {
    throw new AppError(404, "Active product not found for this product code.");
  }

  const ids = [
    ...new Set([
      ...(product.brandIds.length ? product.brandIds : [product.brandId]),
      ...(product.colorIds.length ? product.colorIds : [product.colorId]),
      ...(product.sizeIds.length ? product.sizeIds : [product.sizeId]),
    ]),
  ];
  const masters = await prisma.productMaster.findMany({
    where: { companyId: req.auth.companyId, id: { in: ids } },
    select: { id: true, name: true, type: true },
  });
  const values = (selectedIds, type) =>
    selectedIds
      .map((id) =>
        masters.find((master) => master.id === id && master.type === type),
      )
      .filter(Boolean)
      .map(({ id, name }) => ({ id, name }));

  const recentPurchases = await prisma.purchase.findMany({
    where: { companyId: req.auth.companyId, productCode, status: true },
    orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
    take: 2,
    select: {
      supplierId: true,
      supplierName: true,
      purchasePrice: true,
      supplier: { select: { id: true, name: true } },
    },
  });
  const purchase = recentPurchases[0] || null;
  const previousPurchase = recentPurchases[1] || null;
  const [allPurchases, allSales] = await Promise.all([
    prisma.purchase.findMany({
      where: { companyId: req.auth.companyId, productCode, status: true },
      select: { quantity: true, unit: true },
    }),
    prisma.sale.findMany({
      where: { companyId: req.auth.companyId, productCode, status: true },
      select: { quantity: true, unit: true },
    }),
  ]);
  const totalQtyInPieces = allPurchases.reduce(
    (sum, item) => sum + toBaseQuantity(item.quantity, item.unit),
    0,
  );
  const totalQtyOutPieces = allSales.reduce(
    (sum, item) => sum + toBaseQuantity(item.quantity, item.unit),
    0,
  );
  const balanceQtyPieces = Math.max(totalQtyInPieces - totalQtyOutPieces, 0);

  return res.json({
    product: {
      id: product.id,
      productCode: product.productCode,
      productName: product.productName,
      quantity: product.quantity,
      unit: product.unit,
      purchasePrice: product.purchasePrice,
      lastPurchasePrice: purchase ? Number(purchase.purchasePrice) : null,
      previousPurchasePrice: previousPurchase
        ? Number(previousPurchase.purchasePrice)
        : null,
      balanceQuantity: balanceQtyPieces,
      balanceQuantityDisplay: formatQuantityBreakdown(balanceQtyPieces),
      totalPurchaseAmount:
        Number(product.quantity || 0) *
        (String(product.unit).toUpperCase() === "DOZEN" ? 12 : 1) *
        Number(product.purchasePrice || 0),
      brandIds: product.brandIds.length ? product.brandIds : [product.brandId],
      colorIds: product.colorIds.length ? product.colorIds : [product.colorId],
      sizeIds: product.sizeIds.length ? product.sizeIds : [product.sizeId],
      brands: values(
        product.brandIds.length ? product.brandIds : [product.brandId],
        "BRAND",
      ),
      colors: values(
        product.colorIds.length ? product.colorIds : [product.colorId],
        "COLOR",
      ),
      sizes: values(
        product.sizeIds.length ? product.sizeIds : [product.sizeId],
        "SIZE",
      ),
    },
    supplier: purchase?.supplierId
      ? { id: purchase.supplierId, name: purchase.supplier?.name || purchase.supplierName }
      : null,
  });
};

exports.getAll = async (req, res) => {
  const { search, brandId, colorId, sizeId, supplierId, partyId, startDate, endDate } =
    req.query;
  const where = { companyId: req.auth.companyId };
  if (search) {
    where.OR = [
      { saleNumber: { contains: search, mode: "insensitive" } },
      { productName: { contains: search, mode: "insensitive" } },
      { productCode: { contains: search, mode: "insensitive" } },
      { partyName: { contains: search, mode: "insensitive" } },
    ];
  }
  const addSelectionFilter = (relation, value) => {
    const ids = (Array.isArray(value) ? value : [value])
      .map(Number)
      .filter(Number.isInteger);
    if (ids.length) where[relation] = { some: { productMasterId: { in: ids } } };
  };
  if (brandId) addSelectionFilter("selectedBrands", brandId);
  if (colorId) addSelectionFilter("selectedColors", colorId);
  if (sizeId) addSelectionFilter("selectedSizes", sizeId);
  if (supplierId) where.supplierId = Number.parseInt(supplierId, 10);
  if (partyId) where.partyId = Number.parseInt(partyId, 10);
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const sales = await prisma.sale.findMany({
    where,
    select: SALE_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return res.json({ sales: groupSales(sales) });
};

exports.getById = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, "Invalid sale id.");

  const sale = await prisma.sale.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, saleNumber: true },
  });
  if (!sale) throw new AppError(404, "Sale not found.");

  if (sale.saleNumber) {
    return res.json({ sale: await loadInvoice(req.auth.companyId, sale.saleNumber) });
  }

  const line = await prisma.sale.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: SALE_SELECT,
  });
  return res.json({ sale: groupSales([line])[0] });
};

exports.getInvoice = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, "Invalid sale id.");

  const sale = await prisma.sale.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { saleNumber: true },
  });
  if (!sale) throw new AppError(404, "Sale not found.");

  const invoiceGroup = sale.saleNumber
    ? await loadInvoice(req.auth.companyId, sale.saleNumber)
    : groupSales([
        await prisma.sale.findFirst({
          where: { id, companyId: req.auth.companyId },
          select: SALE_SELECT,
        }),
      ])[0];

  const invoiceLine = await prisma.sale.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: INVOICE_SALE_SELECT,
  });

  return res.json({
    invoice: {
      invoiceNumber: invoiceGroup?.saleNumber || `SALE-${String(id).padStart(6, "0")}`,
      issueDate: invoiceLine.createdAt,
      company: {
        id: invoiceLine.company.id,
        name: invoiceLine.company.name,
        logoUrl: invoiceLine.company.branding?.logoUrl || null,
      },
      customer: invoiceLine.party
        ? { id: invoiceLine.party.id, name: invoiceLine.party.partyName }
        : null,
      sale: invoiceGroup,
    },
  });
};

const saveSaleInvoice = async (req, existingSaleNumber, existingId) => {
  const rawItems = validateSaleInput(req.body);
  const lines = rawItems.map((item) => normalizeLine(item, req.body));
  await Promise.all([
    validateMasterSelections(req.auth.companyId, lines),
    validatePartyAndSuppliers(req.auth.companyId, req.body.partyId, lines),
    validateAvailableQuantity(
      req.auth.companyId,
      lines,
      existingSaleNumber,
      existingId,
    ),
  ]);

  const netTotalSalePrice = Number(
    lines
      .reduce(
        (sum, line) =>
          sum +
          calculateTotalSalePrice(line.quantity, line.unit, line.salePrice),
        0,
      )
      .toFixed(2),
  );

  const requestedSaleNumber = String(req.body.saleNumber || "").trim();
  const saleNumber =
    requestedSaleNumber || existingSaleNumber || String(Date.now());

  const lineWrites = lines.map((line) =>
    buildLineWriteData(req.body, line, saleNumber, netTotalSalePrice),
  );

  if (!existingSaleNumber || existingSaleNumber !== saleNumber) {
    const conflict = await prisma.sale.findFirst({
      where: { companyId: req.auth.companyId, saleNumber },
      select: { id: true },
    });
    if (conflict) {
      throw new AppError(
        409,
        "This sale number already exists. Edit that invoice to manage product lines.",
      );
    }
  }

  if (existingSaleNumber || existingId) {
    const deleteOperation = existingSaleNumber
      ? prisma.sale.deleteMany({
          where: { companyId: req.auth.companyId, saleNumber: existingSaleNumber },
        })
      : prisma.sale.delete({ where: { id: existingId } });
    await prisma.$transaction([
      deleteOperation,
      ...lineWrites.map((line) =>
        prisma.sale.create({
          data: { ...line, companyId: req.auth.companyId },
          select: { id: true },
        }),
      ),
    ]);
  } else {
    await prisma.$transaction(
      lineWrites.map((line) =>
        prisma.sale.create({
          data: { ...line, companyId: req.auth.companyId },
          select: { id: true },
        }),
      ),
    );
  }

  return loadInvoice(req.auth.companyId, saleNumber);
};

exports.create = async (req, res) => {
  const sale = await saveSaleInvoice(req);
  return res.status(201).json({
    message: "Sale invoice created successfully.",
    sale,
  });
};

exports.update = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, "Invalid sale id.");

  const existing = await prisma.sale.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { saleNumber: true },
  });
  if (!existing) throw new AppError(404, "Sale not found.");

  const sale = await saveSaleInvoice(req, existing.saleNumber, id);
  return res.json({ message: "Sale invoice updated successfully.", sale });
};

exports.remove = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, "Invalid sale id.");

  const existing = await prisma.sale.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { saleNumber: true },
  });
  if (!existing) throw new AppError(404, "Sale not found.");

  if (existing.saleNumber) {
    await prisma.sale.deleteMany({
      where: { companyId: req.auth.companyId, saleNumber: existing.saleNumber },
    });
  } else {
    await prisma.sale.delete({ where: { id } });
  }
  return res.json({ message: "Sale deleted successfully." });
};
