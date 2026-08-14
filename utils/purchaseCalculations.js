const calculateRemainingBalance = (purchasePrice, paidAmount) => {
  const total = Number(purchasePrice);
  const paid = Number(paidAmount) || 0;
  if (Number.isNaN(total) || total < 0) throw new Error("Invalid purchase price.");
  if (Number.isNaN(paid) || paid < 0) throw new Error("Invalid paid amount.");
  return total - paid;
};

const purchaseData = (body, values) => {
  const purchasePrice = Number(body.purchasePrice);
  const paidAmount = body.paidAmount !== undefined ? Number(body.paidAmount) : 0;
  const remainingBalance = calculateRemainingBalance(purchasePrice, paidAmount);

  return {
    ...values,
    purchaseNumber: String(body.purchaseNumber).trim(),
    supplierId: body.supplierId ? parseInt(body.supplierId, 10) : null,
    supplierName: body.supplierName ? String(body.supplierName).trim() : null,
    productCode: body.productCode ? String(body.productCode).trim() : null,
    createdById: body.createdById ? parseInt(body.createdById, 10) : null,
    invoiceDate: new Date(body.invoiceDate),
    // Legacy amount columns are retained in the database but no longer accepted or returned.
    subTotal: 0,
    gstAmount: 0,
    discount: 0,
    grandTotal: 0,
    purchasePrice,
    paidAmount,
    remainingBalance,
    paymentStatus: body.paymentStatus ? String(body.paymentStatus).toUpperCase() : "UNPAID",
    status: body.status !== undefined ? (body.status === true || body.status === "ACTIVE" || body.status === "true") : true,
    remarks: body.remarks ? String(body.remarks).trim() : null,
  };
};

module.exports = { calculateRemainingBalance, purchaseData };
