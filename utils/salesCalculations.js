const calculatePerSaleProfit = (salePrice, purchasePrice) => {
  const sale = Number(salePrice);
  const purchase = Number(purchasePrice);

  if (Number.isNaN(sale) || sale < 0) throw new Error("Invalid sale price.");
  if (Number.isNaN(purchase) || purchase < 0) throw new Error("Invalid purchase price.");

  return sale - purchase;
};

const calculateRemainingAmount = (salePrice, paidAmount) => {
  const sale = Number(salePrice);
  const paid = Number(paidAmount) || 0;
  if (Number.isNaN(sale) || sale < 0) throw new Error("Invalid sale price.");
  if (Number.isNaN(paid) || paid < 0) throw new Error("Invalid paid amount.");
  return sale - paid;
};

module.exports = { calculatePerSaleProfit, calculateRemainingAmount };
