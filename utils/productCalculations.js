const calculateTotalPurchaseAmount = (quantity, purchasePrice, unit = "PIECES") => {
  const normalizedQuantity = Number(quantity);
  const normalizedPrice = Number(purchasePrice);

  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity < 0) return 0;
  if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) return 0;

  const multiplier = String(unit).toUpperCase() === "DOZEN" ? 12 : 1;
  return normalizedQuantity * multiplier * normalizedPrice;
};

module.exports = { calculateTotalPurchaseAmount };
