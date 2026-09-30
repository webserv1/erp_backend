const { calculateTotalSalePrice } = require("./salesCalculations");

const calculatePartySalesTotals = (sales) => {
  const totalPurchaseMap = new Map();
  const remainingBalanceMap = new Map();

  sales.forEach((sale) => {
    const partyId = sale.partyId;
    if (!Number.isInteger(partyId)) return;

    totalPurchaseMap.set(
      partyId,
      (totalPurchaseMap.get(partyId) || 0) +
        calculateTotalSalePrice(sale.quantity, sale.unit, sale.salePrice),
    );
    remainingBalanceMap.set(
      partyId,
      (remainingBalanceMap.get(partyId) || 0) +
        (Number(sale.remainingAmount) || 0),
    );
  });

  return { totalPurchaseMap, remainingBalanceMap };
};

module.exports = {
  calculatePartySalesTotals,
};
