const { calculateTotalSalePrice } = require("./salesCalculations");

const calculatePartySalesTotals = (sales) => {
  const totalPurchaseMap = new Map();
  const remainingBalanceMap = new Map();
  const invoiceCountMap = new Map();
  const invoiceNumbersMap = new Map();
  const invoiceKeyMap = new Map();

  sales.forEach((sale) => {
    const partyId = sale.partyId;
    if (!Number.isInteger(partyId)) return;

    const invoiceKey = sale.saleNumber ? `INV:${sale.saleNumber}` : `LINE:${sale.id}`;
    const mapKey = `${partyId}:${invoiceKey}`;
    const lineTotal = calculateTotalSalePrice(sale.quantity, sale.unit, sale.salePrice);
    const lineRemaining = Number(sale.remainingAmount) || 0;

    if (!invoiceKeyMap.has(mapKey)) {
      invoiceKeyMap.set(mapKey, {
        partyId,
        totalPurchase: 0,
        remainingAmount: lineRemaining,
        invoiceNumber: sale.saleNumber || `SALE-${sale.id}`,
        saleNumber: sale.saleNumber || null,
        paymentStatus: String(sale.paymentStatus || "UNPAID").toUpperCase(),
      });
    }

    const invoice = invoiceKeyMap.get(mapKey);
    invoice.totalPurchase += lineTotal;
    invoice.remainingAmount = Math.max(invoice.remainingAmount, lineRemaining);
    if (!invoice.saleNumber && sale.saleNumber) {
      invoice.saleNumber = sale.saleNumber;
    }
    const normalizedStatus = String(sale.paymentStatus || "UNPAID").toUpperCase();
    if (normalizedStatus === "UNPAID" || normalizedStatus === "PARTIAL") {
      invoice.paymentStatus = normalizedStatus;
    }
  });

  invoiceKeyMap.forEach((invoice) => {
    totalPurchaseMap.set(
      invoice.partyId,
      (totalPurchaseMap.get(invoice.partyId) || 0) + invoice.totalPurchase,
    );
    remainingBalanceMap.set(
      invoice.partyId,
      (remainingBalanceMap.get(invoice.partyId) || 0) + invoice.remainingAmount,
    );
    invoiceCountMap.set(
      invoice.partyId,
      (invoiceCountMap.get(invoice.partyId) || 0) + 1,
    );

    const numbers = invoiceNumbersMap.get(invoice.partyId) || [];
    numbers.push(invoice.invoiceNumber);
    invoiceNumbersMap.set(invoice.partyId, numbers);
  });

  return {
    totalPurchaseMap,
    remainingBalanceMap,
    invoiceCountMap,
    invoiceNumbersMap,
    invoiceSummaries: [...invoiceKeyMap.values()],
  };
};

module.exports = {
  calculatePartySalesTotals,
};
