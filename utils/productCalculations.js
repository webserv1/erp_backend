const calculateTotalPurchaseAmount = (quantity, purchasePrice) => {
  const normalizedQuantity = Number(quantity);
  const normalizedPrice = Number(purchasePrice);

  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity < 0) return 0;
  if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) return 0;

  return normalizedQuantity * normalizedPrice;
};

module.exports = { calculateTotalPurchaseAmount };
