const UNIT_MULTIPLIERS = {
  PIECES: 1,
  DOZEN: 12,
};

const calculateSaleTotal = (quantity, salePrice, unit) => {
  const qty = parseInt(quantity, 10);
  const price = Number(salePrice);
  const multiplier = unit ? (UNIT_MULTIPLIERS[unit] || 1) : 1;

  if (Number.isNaN(qty) || qty < 0) throw new Error("Invalid quantity.");
  if (Number.isNaN(price) || price < 0) throw new Error("Invalid sale price.");
  if (!unit || !UNIT_MULTIPLIERS[unit]) throw new Error("Invalid unit.");

  return qty * multiplier * price;
};

const calculatePurchaseTotal = (quantity, purchasePrice) => {
  const qty = parseInt(quantity, 10);
  const price = Number(purchasePrice);
  if (Number.isNaN(qty) || qty < 0) throw new Error("Invalid quantity.");
  if (Number.isNaN(price) || price < 0) throw new Error("Invalid purchase price.");
  return qty * price;
};

const calculateGrandTotal = (subTotal, gstAmount, discount) => {
  const sub = Number(subTotal);
  const gst = Number(gstAmount);
  const disc = Number(discount) || 0;
  if (Number.isNaN(sub) || sub < 0) throw new Error("Invalid sub total.");
  if (Number.isNaN(gst) || gst < 0) throw new Error("Invalid GST amount.");
  if (Number.isNaN(disc) || disc < 0) throw new Error("Invalid discount.");
  return sub + gst - disc;
};

module.exports = { calculateSaleTotal, calculatePurchaseTotal, calculateGrandTotal, UNIT_MULTIPLIERS };