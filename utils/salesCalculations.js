const { UNIT_MULTIPLIERS } = require("./calculations");

const calculatePerSaleProfit = (salePrice, purchasePrice, quantity) => {
  const sale = Number(salePrice);
  const purchase = Number(purchasePrice);
  const qty = parseInt(quantity, 10);

  if (Number.isNaN(sale) || sale < 0) throw new Error("Invalid sale price.");
  if (Number.isNaN(purchase) || purchase < 0) throw new Error("Invalid purchase price.");
  if (Number.isNaN(qty) || qty < 0) throw new Error("Invalid quantity.");

  return (sale - purchase) * qty;
};

const calculateTotalSaleProfit = (salePrice, purchasePrice, quantity, unit) => {
  const sale = Number(salePrice);
  const purchase = Number(purchasePrice);
  const qty = parseInt(quantity, 10);
  const multiplier = UNIT_MULTIPLIERS[unit] || 1;

  if (Number.isNaN(sale) || sale < 0) throw new Error("Invalid sale price.");
  if (Number.isNaN(purchase) || purchase < 0) throw new Error("Invalid purchase price.");
  if (Number.isNaN(qty) || qty < 0) throw new Error("Invalid quantity.");
  if (!unit || !UNIT_MULTIPLIERS[unit]) throw new Error("Invalid unit.");

  return (sale - purchase) * qty * multiplier;
};

const calculateTotalSalesProfit = (sales) => {
  if (!Array.isArray(sales)) return 0;
  return sales.reduce((total, sale) => {
    const profit = calculatePerSaleProfit(sale.salePrice, sale.purchasePrice, sale.quantity);
    return total + profit;
  }, 0);
};

const calculatePartyProfit = (sales) => {
  if (!Array.isArray(sales)) return 0;
  return sales.reduce((total, sale) => {
    const profit = calculatePerSaleProfit(sale.salePrice, sale.purchasePrice, sale.quantity);
    return total + profit;
  }, 0);
};

module.exports = { calculatePerSaleProfit, calculateTotalSaleProfit, calculateTotalSalesProfit, calculatePartyProfit };