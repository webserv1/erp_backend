const calculateRemainingAmount = (totalPurchaseAmount, paidAmount) =>
  Number(totalPurchaseAmount || 0) - Number(paidAmount || 0);

const toNonNegativeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
};

const purchaseData = (body, values, product, item) => {
  const purchasePrice = toNonNegativeNumber(
    item.purchasePrice,
    toNonNegativeNumber(product.purchasePrice, 0),
  );
  const quantity = Math.trunc(
    toNonNegativeNumber(item.quantity, toNonNegativeNumber(product.quantity, 0)),
  );
  const unit = String(item.unit || product.unit || "PIECES").toUpperCase();
  const quantityMultiplier = unit === "DOZEN" ? 12 : 1;
  const totalPurchaseAmount = quantity * quantityMultiplier * purchasePrice;

  return {
    ...values,
    purchaseNumber: String(body.purchaseNumber).trim(),
    supplierId: body.supplierId ? parseInt(body.supplierId, 10) : null,
    supplierName: body.supplierName ? String(body.supplierName).trim() : null,
    productCode: body.productCode ? String(body.productCode).trim() : null,
    productName: product.productName ? String(product.productName).trim() : null,
    createdById: body.createdById ? parseInt(body.createdById, 10) : null,
    invoiceDate: new Date(body.invoiceDate),
    // Legacy amount columns are retained in the database but no longer accepted or returned.
    subTotal: 0,
    gstAmount: 0,
    discount: 0,
    grandTotal: 0,
    purchasePrice,
    totalPurchaseAmount,
    quantity,
    unit,
    // Legacy columns are retained for historical records; supplier owns payments now.
    paidAmount: 0,
    remainingBalance: totalPurchaseAmount,
    status: body.status !== undefined ? (body.status === true || body.status === "ACTIVE" || body.status === "true") : true,
    remarks: body.remarks ? String(body.remarks).trim() : null,
  };
};

module.exports = { calculateRemainingAmount, purchaseData };
