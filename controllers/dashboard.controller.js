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

  const todayPurchaseWhere = { companyId, createdAt: { gte: startOfDay, lte: endOfDay } };
  const todaySaleWhere = { companyId, createdAt: { gte: startOfDay, lte: endOfDay } };

  const [totalProducts, totalSuppliers, totalParties, totalSales, todayPurchases,       todaySales, lowStockItems, todaySalesProfit, totalSalesProfit, lastSupplierPurchases] =
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
      prisma.$queryRaw`
        SELECT DISTINCT ON ("supplierId")
          "id", "purchaseNumber", "purchasePrice", "createdAt", "supplierId", "supplierName"
        FROM "Purchase"
        WHERE "companyId" = ${companyId} AND "supplierId" IS NOT NULL
        ORDER BY "supplierId", "createdAt" DESC
      `,
    ]);

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
      lastSupplierPurchases: lastSupplierPurchases.map((purchase) => ({
        id: purchase.id,
        purchaseNumber: purchase.purchaseNumber,
        purchasePrice: Number(purchase.purchasePrice),
        createdAt: purchase.createdAt,
        supplierId: purchase.supplierId,
        supplierName: purchase.supplierName,
      })),
    },
  });
};
