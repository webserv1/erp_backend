const prisma = require("../lib/prisma");

const getReturnAmountReceivedSum = async (companyId, where = {}) => {
  const aggregate = await prisma.supplierReturn.aggregate({
    where: { companyId, ...where },
    _sum: { returnAmountReceived: true },
  });
  return Number(aggregate._sum.returnAmountReceived) || 0;
};

module.exports = {
  getReturnAmountReceivedSum,
};
