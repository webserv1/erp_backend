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

module.exports = { calculatePerSaleProfit };