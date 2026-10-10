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
      });
    }

    const invoice = invoiceKeyMap.get(mapKey);
    invoice.totalPurchase += lineTotal;
    invoice.remainingAmount = Math.max(invoice.remainingAmount, lineRemaining);
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
  };
};

module.exports = {
  calculatePartySalesTotals,
};
