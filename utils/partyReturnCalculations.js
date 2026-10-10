const prisma = require("../lib/prisma");

const getInvoiceReturnAmountMap = async (companyId, saleNumbers) => {
  const filteredSaleNumbers = [...new Set((saleNumbers || []).filter((item) => !!item))];
  if (!filteredSaleNumbers.length) return new Map();

  const grouped = await prisma.partyReturn.groupBy({
    by: ["saleNumber"],
    where: {
      companyId,
      saleNumber: { in: filteredSaleNumbers },
    },
    _sum: { amountPaid: true },
  });

  return new Map(
    grouped.map((row) => [row.saleNumber, Number(row._sum.amountPaid) || 0]),
  );
};

const getPartyReturnAmountMap = async (companyId, partyIds) => {
  const filteredPartyIds = [...new Set((partyIds || []).filter((id) => Number.isInteger(id)))];
  if (!filteredPartyIds.length) return new Map();

  const grouped = await prisma.partyReturn.groupBy({
    by: ["partyId"],
    where: {
      companyId,
      partyId: { in: filteredPartyIds },
    },
    _sum: { amountPaid: true },
  });

  return new Map(
    grouped.map((row) => [row.partyId, Number(row._sum.amountPaid) || 0]),
  );
};

const getReturnAmountSum = async (companyId, where = {}) => {
  const aggregate = await prisma.partyReturn.aggregate({
    where: { companyId, ...where },
    _sum: { amountPaid: true },
  });
  return Number(aggregate._sum.amountPaid) || 0;
};

module.exports = {
  getInvoiceReturnAmountMap,
  getPartyReturnAmountMap,
  getReturnAmountSum,
};
