const calculateBalanceStock = (qtyIn, qtyOut) => {
  const inQty = parseInt(qtyIn, 10);
  const outQty = parseInt(qtyOut, 10);
  if (Number.isNaN(inQty) || inQty < 0) throw new Error("Invalid Qty In.");
  if (Number.isNaN(outQty) || outQty < 0) throw new Error("Invalid Qty Out.");
  return inQty - outQty;
};

const calculateSaleValue = (balanceStock, salePrice) => {
  const stock = parseInt(balanceStock, 10);
  const price = Number(salePrice);
  if (Number.isNaN(stock) || stock < 0) throw new Error("Invalid balance stock.");
  if (Number.isNaN(price) || price < 0) throw new Error("Invalid sale price.");
  return stock * price;
};

module.exports = { calculateBalanceStock, calculateSaleValue };