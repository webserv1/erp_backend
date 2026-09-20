const toNumber = (value, field) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) throw new Error(`Invalid ${field}.`);
  return parsed;
};

const quantityMultiplier = (unit) => String(unit).toUpperCase() === "DOZEN" ? 12 : 1;

const calculateTotalSalePrice = (quantity, unit, salePrice) => {
  const qty = toNumber(quantity, "quantity");
  const price = toNumber(salePrice, "sale price");
  return qty * quantityMultiplier(unit) * price;
};

const calculateTotalPurchaseAmount = (quantity, unit, purchasePrice) => {
  const qty = toNumber(quantity, "quantity");
  const price = toNumber(purchasePrice, "purchase price");
  return qty * quantityMultiplier(unit) * price;
};

const calculatePerSaleProfit = (netTotalPurchase, netTotalSale) =>
  toNumber(netTotalSale, "net total sale") - toNumber(netTotalPurchase, "net total purchase");

const calculateRemainingAmount = (netTotalSale, paidAmount) => {
  const sale = toNumber(netTotalSale, "net total sale");
  const paid = Number(paidAmount) || 0;
  if (Number.isNaN(paid) || paid < 0) throw new Error("Invalid paid amount.");
  return sale - paid;
};

module.exports = {
  calculatePerSaleProfit,
  calculateRemainingAmount,
  calculateTotalSalePrice,
  calculateTotalPurchaseAmount,
};
