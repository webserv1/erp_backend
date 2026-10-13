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

const selectedMasterIds = (product, field, legacyField) => {
  const ids = product?.[field] || [];
  return ids.length ? ids : product?.[legacyField] ? [product[legacyField]] : [];
};

const toBaseQuantity = (quantity, unit) => {
  const qty = Number(quantity) || 0;
  const normalizedUnit = String(unit || "PIECES").toUpperCase();
  return qty * (normalizedUnit === "DOZEN" ? 12 : 1);
};
const formatQuantityBreakdown = (pieces) => {
  const safePieces = Math.max(0, Number(pieces) || 0);
  const dozens = Math.floor(safePieces / 12);
  const remainingPieces = safePieces % 12;
  const dozenLabel = `${dozens} DOZEN${dozens === 1 ? "" : "S"}`;
  if (remainingPieces === 0) return `${safePieces} PIECES (${dozenLabel})`;
  return `${safePieces} PIECES (${dozenLabel} + ${remainingPieces} PIECES)`;
};
const formatEnteredUnitTotals = ({ pieces, dozens }) => {
  const pc = Number(pieces) || 0;
  const dz = Number(dozens) || 0;
  if (!pc && !dz) return "0 PIECES";
  if (pc && dz) return `${dz} DOZEN${dz === 1 ? "" : "S"} + ${pc} PIECES`;
  if (dz) return `${dz} DOZEN${dz === 1 ? "" : "S"}`;
  return `${pc} PIECES`;
};
const subtractUnitTotals = (soldUnits, returnedUnits) => {
  let dozens = (Number(soldUnits?.dozens) || 0) - (Number(returnedUnits?.dozens) || 0);
  let pieces = (Number(soldUnits?.pieces) || 0) - (Number(returnedUnits?.pieces) || 0);

  while (pieces < 0 && dozens > 0) {
    dozens -= 1;
    pieces += 12;
  }

  if (dozens < 0) return { dozens: 0, pieces: 0 };
  return { dozens, pieces: Math.max(pieces, 0) };
};
const summarizeReturnsBySource = (sourceLabel, units, reasons) => {
  const quantityText = formatEnteredUnitTotals(units);
  if (quantityText === "0 PIECES") return null;
  const safeReasons = [...new Set((reasons || []).map((reason) => String(reason || "").trim()).filter(Boolean))];
  return {
    returns: `${quantityText} (${sourceLabel})`,
    reason: safeReasons.length ? `${safeReasons.join(", ")} (${sourceLabel})` : `— (${sourceLabel})`,
  };
};

const enrichStocks = async (companyId, stocks) => {
  if (!stocks.length) return [];

  const products = await prisma.product.findMany({
    where: { companyId, productCode: { in: stocks.map((stock) => stock.productCode) } },
    select: {
      productCode: true, productName: true, brandId: true, colorId: true, sizeId: true,
      brandIds: true, colorIds: true, sizeIds: true, purchasePrice: true,
    },
  });
  const productByCode = new Map(products.map((product) => [product.productCode, product]));
  const masterIds = [...new Set(products.flatMap((product) => [
    ...selectedMasterIds(product, "brandIds", "brandId"),
    ...selectedMasterIds(product, "colorIds", "colorId"),
    ...selectedMasterIds(product, "sizeIds", "sizeId"),
  ]))];
  const masters = await prisma.productMaster.findMany({
    where: { companyId, id: { in: masterIds } },
    select: { id: true, name: true, type: true },
  });
  const namesFor = (ids, type) => ids.map((id) => masters.find((master) => master.id === id && master.type === type)).filter(Boolean).map(({ id, name }) => ({ id, name }));

  return stocks.map((stock) => {
    const product = productByCode.get(stock.productCode);
    const brandIds = selectedMasterIds(product, "brandIds", "brandId");
    const colorIds = selectedMasterIds(product, "colorIds", "colorId");
    const sizeIds = selectedMasterIds(product, "sizeIds", "sizeId");
    const sizes = namesFor(sizeIds, "SIZE");
    return {
      ...stock,
      productName: product?.productName || stock.productName,
      purchasePrice: product?.purchasePrice === null || product?.purchasePrice === undefined ? 0 : Number(product.purchasePrice),
      brandIds,
      colorIds,
      sizeIds,
      brands: namesFor(brandIds, "BRAND"),
      colors: namesFor(colorIds, "COLOR"),
      sizes: sizes.length ? sizes : stock.size ? [stock.size] : [],
    };
  });
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
  const productWhere = { companyId: req.auth.companyId };
  if (search) productWhere.OR = [{ productName: { contains: search, mode: "insensitive" } }, { productCode: { contains: search, mode: "insensitive" } }];
  if (sizeId) productWhere.sizeId = parseInt(sizeId, 10);
  if (status !== undefined) productWhere.status = status === "true" || status === true;

  const products = await prisma.product.findMany({
    where: productWhere,
    select: {
      id: true, companyId: true, productCode: true, productName: true, brandId: true, colorId: true, sizeId: true,
      brandIds: true, colorIds: true, sizeIds: true, quantity: true, purchasePrice: true, status: true,
      category: { select: { saleAmount: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!products.length) return res.json({ stocks: [] });

  const productCodes = products.map((product) => product.productCode);
  const [sales, purchases, legacyStocks, partyReturnItems, supplierReturnItems] = await Promise.all([
    prisma.sale.findMany({
      where: { companyId: req.auth.companyId, productCode: { in: productCodes }, status: true },
      select: { productCode: true, quantity: true, unit: true },
    }),
    prisma.purchase.findMany({
      where: { companyId: req.auth.companyId, productCode: { in: productCodes }, status: true },
      select: { productCode: true, quantity: true, unit: true, purchasePrice: true, invoiceDate: true, id: true },
      orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
    }),
    prisma.stock.findMany({ where: { companyId: req.auth.companyId, productCode: { in: productCodes } }, select: { id: true, productCode: true, salePrice: true, createdAt: true, updatedAt: true } }),
    prisma.partyReturnItem.findMany({
      where: { productCode: { in: productCodes }, partyReturn: { companyId: req.auth.companyId } },
      select: {
        productCode: true,
        quantity: true,
        unit: true,
        partyReturn: { select: { reason: true } },
      },
    }),
    prisma.supplierReturnItem.findMany({
      where: { productCode: { in: productCodes }, supplierReturn: { companyId: req.auth.companyId } },
      select: {
        productCode: true,
        quantity: true,
        unit: true,
        supplierReturn: { select: { reason: true } },
      },
    }),
  ]);

  const soldQtyByCode = sales.reduce((map, sale) => {
    map.set(
      sale.productCode,
      (map.get(sale.productCode) || 0) + toBaseQuantity(sale.quantity, sale.unit),
    );
    return map;
  }, new Map());
  const returnedQtyByCode = partyReturnItems.reduce((map, item) => {
    map.set(
      item.productCode,
      (map.get(item.productCode) || 0) + toBaseQuantity(item.quantity, item.unit),
    );
    return map;
  }, new Map());
  const returnedQtyUnitsByCode = partyReturnItems.reduce((map, item) => {
    if (!map.has(item.productCode)) {
      map.set(item.productCode, { pieces: 0, dozens: 0 });
    }
    const units = map.get(item.productCode);
    const qty = Number(item.quantity) || 0;
    if (String(item.unit).toUpperCase() === "DOZEN") {
      units.dozens += qty;
    } else {
      units.pieces += qty;
    }
    return map;
  }, new Map());
  const soldQtyUnitsByCode = sales.reduce((map, sale) => {
    if (!map.has(sale.productCode)) {
      map.set(sale.productCode, { pieces: 0, dozens: 0 });
    }
    const units = map.get(sale.productCode);
    const qty = Number(sale.quantity) || 0;
    if (String(sale.unit).toUpperCase() === "DOZEN") {
      units.dozens += qty;
    } else {
      units.pieces += qty;
    }
    return map;
  }, new Map());
  const qtyOutUnitsByCode = new Map(
    productCodes.map((productCode) => [
      productCode,
      subtractUnitTotals(
        soldQtyUnitsByCode.get(productCode) || { pieces: 0, dozens: 0 },
        returnedQtyUnitsByCode.get(productCode) || { pieces: 0, dozens: 0 },
      ),
    ]),
  );
  const qtyOutByCode = new Map(
    productCodes.map((productCode) => {
      const unitTotals = qtyOutUnitsByCode.get(productCode) || { pieces: 0, dozens: 0 };
      const unitBasedQtyOut = (Number(unitTotals.dozens) || 0) * 12 + (Number(unitTotals.pieces) || 0);
      const netQtyOut =
        (soldQtyByCode.get(productCode) || 0) - (returnedQtyByCode.get(productCode) || 0);
      return [productCode, Math.max(Math.min(unitBasedQtyOut, Math.max(netQtyOut, 0)), 0)];
    }),
  );
  const partyReturnUnitsByCode = partyReturnItems.reduce((map, item) => {
    if (!map.has(item.productCode)) {
      map.set(item.productCode, { pieces: 0, dozens: 0 });
    }
    const units = map.get(item.productCode);
    const qty = Number(item.quantity) || 0;
    if (String(item.unit).toUpperCase() === "DOZEN") {
      units.dozens += qty;
    } else {
      units.pieces += qty;
    }
    return map;
  }, new Map());
  const supplierReturnUnitsByCode = supplierReturnItems.reduce((map, item) => {
    if (!map.has(item.productCode)) {
      map.set(item.productCode, { pieces: 0, dozens: 0 });
    }
    const units = map.get(item.productCode);
    const qty = Number(item.quantity) || 0;
    if (String(item.unit).toUpperCase() === "DOZEN") {
      units.dozens += qty;
    } else {
      units.pieces += qty;
    }
    return map;
  }, new Map());
  const partyReturnReasonsByCode = partyReturnItems.reduce((map, item) => {
    if (!map.has(item.productCode)) map.set(item.productCode, []);
    const reason = String(item.partyReturn?.reason || "").trim();
    if (reason) map.get(item.productCode).push(reason);
    return map;
  }, new Map());
  const supplierReturnReasonsByCode = supplierReturnItems.reduce((map, item) => {
    if (!map.has(item.productCode)) map.set(item.productCode, []);
    const reason = String(item.supplierReturn?.reason || "").trim();
    if (reason) map.get(item.productCode).push(reason);
    return map;
  }, new Map());
  const qtyInByCode = purchases.reduce((map, purchase) => {
    map.set(
      purchase.productCode,
      (map.get(purchase.productCode) || 0) +
        toBaseQuantity(purchase.quantity, purchase.unit),
    );
    return map;
  }, new Map());
  const qtyInUnitsByCode = purchases.reduce((map, purchase) => {
    if (!map.has(purchase.productCode)) {
      map.set(purchase.productCode, { pieces: 0, dozens: 0 });
    }
    const units = map.get(purchase.productCode);
    const qty = Number(purchase.quantity) || 0;
    if (String(purchase.unit).toUpperCase() === "DOZEN") {
      units.dozens += qty;
    } else {
      units.pieces += qty;
    }
    return map;
  }, new Map());
  const latestPurchaseByCode = new Map();
  const previousPurchaseByCode = new Map();
  const previousPurchasePriceByCode = new Map();
  purchases.forEach((purchase) => {
    if (!latestPurchaseByCode.has(purchase.productCode)) {
      latestPurchaseByCode.set(purchase.productCode, purchase);
      return;
    }
    if (!previousPurchaseByCode.has(purchase.productCode)) {
      previousPurchaseByCode.set(purchase.productCode, purchase);
    }
    if (!previousPurchasePriceByCode.has(purchase.productCode)) {
      previousPurchasePriceByCode.set(
        purchase.productCode,
        Number(purchase.purchasePrice) || 0,
      );
    }
  });

  const legacyStockByCode = new Map(legacyStocks.map((stock) => [stock.productCode, stock]));
  const masterIds = [...new Set(products.flatMap((product) => [
    ...selectedMasterIds(product, "brandIds", "brandId"),
    ...selectedMasterIds(product, "colorIds", "colorId"),
    ...selectedMasterIds(product, "sizeIds", "sizeId"),
  ]))];
  const masters = await prisma.productMaster.findMany({ where: { companyId: req.auth.companyId, id: { in: masterIds } }, select: { id: true, name: true, type: true } });
  const namesFor = (ids, type) => ids.map((id) => masters.find((master) => master.id === id && master.type === type)).filter(Boolean).map(({ id, name }) => ({ id, name }));

  const stocks = products.map((product) => {
    const brandIds = selectedMasterIds(product, "brandIds", "brandId");
    const colorIds = selectedMasterIds(product, "colorIds", "colorId");
    const sizeIds = selectedMasterIds(product, "sizeIds", "sizeId");
    const qtyIn = qtyInByCode.has(product.productCode)
      ? qtyInByCode.get(product.productCode)
      : product.quantity || 0;
    const qtyOut = qtyOutByCode.get(product.productCode) || 0;
    const balanceStock = qtyIn - qtyOut;
    const latestPurchase = latestPurchaseByCode.get(product.productCode);
    const latestQtyIn = latestPurchase
      ? toBaseQuantity(latestPurchase.quantity, latestPurchase.unit)
      : 0;
    const previousPurchase = previousPurchaseByCode.get(product.productCode);
    const previousQtyIn = previousPurchase
      ? toBaseQuantity(previousPurchase.quantity, previousPurchase.unit)
      : 0;
    const qtyInUnits = qtyInUnitsByCode.get(product.productCode) || {
      pieces: 0,
      dozens: 0,
    };
    const qtyOutUnits = qtyOutUnitsByCode.get(product.productCode) || {
      pieces: 0,
      dozens: 0,
    };
    const partyReturnSummary = summarizeReturnsBySource(
      "party",
      partyReturnUnitsByCode.get(product.productCode) || { pieces: 0, dozens: 0 },
      partyReturnReasonsByCode.get(product.productCode) || [],
    );
    const supplierReturnSummary = summarizeReturnsBySource(
      "supplier",
      supplierReturnUnitsByCode.get(product.productCode) || { pieces: 0, dozens: 0 },
      supplierReturnReasonsByCode.get(product.productCode) || [],
    );
    const returnsSummaries = [partyReturnSummary, supplierReturnSummary].filter(Boolean);
    const latestPurchasePrice = latestPurchase
      ? Number(latestPurchase.purchasePrice) || 0
      : product.purchasePrice === null
        ? 0
        : Number(product.purchasePrice);
    const previousPurchasePrice = previousPurchasePriceByCode.has(product.productCode)
      ? previousPurchasePriceByCode.get(product.productCode)
      : null;
    const legacyStock = legacyStockByCode.get(product.productCode);
    const salePrice = legacyStock?.salePrice ?? product.category?.saleAmount ?? 0;
    return {
      id: legacyStock?.id ?? product.id, companyId: product.companyId, productCode: product.productCode, productName: product.productName,
      sizeId: product.sizeId, qtyIn, qtyOut, balanceStock, salePrice, saleValue: balanceStock * salePrice,
      qtyInDisplay: formatQuantityBreakdown(qtyIn),
      qtyInUnitDisplay: formatEnteredUnitTotals(qtyInUnits),
      qtyOutDisplay: formatQuantityBreakdown(qtyOut),
      qtyOutUnitDisplay: formatEnteredUnitTotals(qtyOutUnits),
      balanceStockDisplay: formatQuantityBreakdown(balanceStock),
      returns: returnsSummaries.map((entry) => entry.returns).join(", ") || "—",
      returnReason: returnsSummaries.map((entry) => entry.reason).join(", ") || "—",
      latestQtyIn,
      latestQtyInDisplay: formatQuantityBreakdown(latestQtyIn),
      latestQtyInUnitDisplay: latestPurchase
        ? `${latestPurchase.quantity} ${String(latestPurchase.unit).toUpperCase()}`
        : "0 PIECES",
      previousQtyIn,
      previousQtyInDisplay: formatQuantityBreakdown(previousQtyIn),
      previousQtyInUnitDisplay: previousPurchase
        ? `${previousPurchase.quantity} ${String(previousPurchase.unit).toUpperCase()}`
        : null,
      latestPurchasePrice,
      previousPurchasePrice,
      latestPurchaseAt: latestPurchase ? latestPurchase.invoiceDate : null,
      purchasePrice: product.purchasePrice === null ? 0 : Number(product.purchasePrice), status: product.status,
      createdAt: legacyStock?.createdAt ?? null, updatedAt: legacyStock?.updatedAt ?? null,
      brandIds, colorIds, sizeIds, brands: namesFor(brandIds, "BRAND"), colors: namesFor(colorIds, "COLOR"), sizes: namesFor(sizeIds, "SIZE"),
    };
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

  return res.json({ stock: (await enrichStocks(req.auth.companyId, [stock]))[0] });
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
