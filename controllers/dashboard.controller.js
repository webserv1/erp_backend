const prisma = require("../lib/prisma");

const getTodayRange = () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { startOfDay, endOfDay };
};

exports.getDashboard = async (req, res) => {
  const companyId = req.auth.companyId;
  const isAdmin = req.auth.role === "ADMIN";
  const lowStockThreshold = parseInt(req.query.lowStockThreshold, 10) || 10;
  const { startOfDay, endOfDay } = getTodayRange();
  const overdueDate = new Date();
  overdueDate.setDate(overdueDate.getDate() - 30);

  const todayPurchaseWhere = { companyId, createdAt: { gte: startOfDay, lte: endOfDay } };
  const todaySaleWhere = { companyId, createdAt: { gte: startOfDay, lte: endOfDay } };

  const [totalProducts, totalSuppliers, totalParties, totalSales, todayPurchases, todaySales, lowStockItems, todaySalesProfit, totalSalesProfit, partyBalances, supplierBalances, overdueParties, lastPartySale] =
    await Promise.all([
      prisma.product.count({ where: { companyId } }),
      prisma.supplier.count({ where: { companyId } }),
      prisma.party.count({ where: { companyId } }),
      prisma.sale.count({ where: { companyId } }),
      prisma.purchase.aggregate({
        where: todayPurchaseWhere,
        _count: { id: true },
        _sum: { purchasePrice: true },
      }),
      prisma.sale.aggregate({
        where: todaySaleWhere,
        _count: { id: true },
        _sum: { salePrice: true },
      }),
      prisma.stock.findMany({
        where: { companyId, balanceStock: { lt: lowStockThreshold }, status: true },
        select: { id: true, productCode: true, productName: true, balanceStock: true, salePrice: true },
        orderBy: { balanceStock: "asc" },
      }),
      isAdmin ? prisma.sale.aggregate({
        where: todaySaleWhere,
        _sum: { perSaleProfit: true },
      }) : Promise.resolve(null),
      isAdmin ? prisma.sale.aggregate({
        where: { companyId },
        _sum: { perSaleProfit: true },
      }) : Promise.resolve(null),
      prisma.sale.groupBy({ by: ["partyId", "partyName"], where: { companyId, status: true, partyId: { not: null } }, _sum: { remainingAmount: true }, orderBy: { _sum: { remainingAmount: "desc" } } }),
      prisma.purchase.groupBy({ by: ["supplierId", "supplierName"], where: { companyId, status: true, supplierId: { not: null } }, _sum: { remainingBalance: true }, orderBy: { _sum: { remainingBalance: "desc" } } }),
      prisma.sale.groupBy({ by: ["partyId", "partyName"], where: { companyId, status: true, partyId: { not: null }, remainingAmount: { gt: 0 }, createdAt: { lte: overdueDate } }, _sum: { remainingAmount: true }, _min: { createdAt: true }, orderBy: { _min: { createdAt: "asc" } } }),
      prisma.sale.findFirst({ where: { companyId, status: true, partyId: { not: null } }, select: { id: true, productCode: true, productName: true, salePrice: true, createdAt: true, partyId: true, partyName: true }, orderBy: { createdAt: "desc" } }),
    ]);

  const parties = partyBalances.map((party) => ({ id: party.partyId, name: party.partyName || "Unknown Party", amount: Number(party._sum.remainingAmount) || 0 }));
  const suppliers = supplierBalances.map((supplier) => ({ id: supplier.supplierId, name: supplier.supplierName || "Unknown Supplier", amount: Number(supplier._sum.remainingBalance) || 0 }));

  return res.json({
    dashboard: {
      totalProducts,
      totalSuppliers,
      totalParties,
      totalSales,
      today: {
        purchaseCount: todayPurchases._count.id,
        purchaseTotal: Number(todayPurchases._sum.purchasePrice) || 0,
        saleCount: todaySales._count.id,
        saleTotal: Number(todaySales._sum.salePrice) || 0,
        ...(isAdmin ? { salesProfit: Number(todaySalesProfit._sum.perSaleProfit) || 0 } : {}),
      },
      ...(isAdmin ? { totalSalesProfit: Number(totalSalesProfit._sum.perSaleProfit) || 0 } : {}),
      lowStockAlerts: lowStockItems.map((item) => ({
        id: item.id,
        productCode: item.productCode,
        productName: item.productName,
        balanceStock: item.balanceStock,
        salePrice: Number(item.salePrice),
      })),
      balances: {
        partyOutstanding: parties.reduce((sum, party) => sum + party.amount, 0),
        supplierPayable: suppliers.reduce((sum, supplier) => sum + supplier.amount, 0),
        highestParty: parties[0] || null,
        highestSupplier: suppliers[0] || null,
      },
      overduePartyReminders: overdueParties.map((party) => ({ id: party.partyId, name: party.partyName || "Unknown Party", amount: Number(party._sum.remainingAmount) || 0, overdueSince: party._min.createdAt })),
      lastPartyPurchase: lastPartySale ? { id: lastPartySale.id, partyId: lastPartySale.partyId, partyName: lastPartySale.partyName || "Unknown Party", productCode: lastPartySale.productCode, productName: lastPartySale.productName, salePrice: Number(lastPartySale.salePrice), createdAt: lastPartySale.createdAt } : null,
    },
  });
};
