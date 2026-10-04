const prisma = require("../lib/prisma");

const getTodayRange = () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { startOfDay, endOfDay };
};

const calculateLineTotalSalePrice = (quantity, unit, salePrice) => {
  const qty = Number(quantity) || 0;
  const price = Number(salePrice) || 0;
  const multiplier = String(unit || "PIECES").toUpperCase() === "DOZEN" ? 12 : 1;
  return qty * multiplier * price;
};

const invoiceKeyFromSale = (sale) => sale.saleNumber || `SALE-${sale.id}`;

const buildWorkerOverview = (sales) => {
  const invoiceMap = new Map();

  sales.forEach((line) => {
    const invoiceKey = invoiceKeyFromSale(line);
    if (!invoiceMap.has(invoiceKey)) {
      invoiceMap.set(invoiceKey, {
        invoiceNumber: invoiceKey,
        createdAt: line.createdAt,
        remainingAmount: Number(line.remainingAmount) || 0,
        partyId: line.partyId,
        partyName: line.partyName || line.party?.partyName || "Unknown Party",
        shopName: line.party?.shopName || null,
        mobile: line.party?.mobile || null,
        products: new Set(),
      });
    }

    const invoice = invoiceMap.get(invoiceKey);
    invoice.products.add(line.productName || line.productCode || "Unknown Product");
  });

  const partyMap = new Map();
  [...invoiceMap.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .forEach((invoice) => {
      const partyKey = String(invoice.partyId || 0);
      if (!partyMap.has(partyKey)) {
        partyMap.set(partyKey, {
          partyId: invoice.partyId,
          partyName: invoice.partyName,
          shopName: invoice.shopName,
          mobile: invoice.mobile,
          pendingAmount: 0,
          totalInvoiceCount: 0,
          invoices: [],
        });
      }

      const party = partyMap.get(partyKey);
      party.totalInvoiceCount += 1;
      if (invoice.remainingAmount > 0) {
        party.pendingAmount += invoice.remainingAmount;
      }
      party.invoices.push({
        invoiceNumber: invoice.invoiceNumber,
        generatedAt: invoice.createdAt,
        remainingAmount: invoice.remainingAmount,
        products: [...invoice.products],
      });
    });

  return [...partyMap.values()]
    .filter((party) => party.pendingAmount > 0)
    .map((party) => ({
      ...party,
      pendingAmount: Number(party.pendingAmount.toFixed(2)),
    }))
    .sort((a, b) => b.pendingAmount - a.pendingAmount);
};

exports.getDashboard = async (req, res) => {
  const companyId = req.auth.companyId;
  const isAdmin = req.auth.role === "ADMIN";
  const isWorker = req.auth.role === "WORKER";
  const lowStockThreshold = parseInt(req.query.lowStockThreshold, 10) || 18;
  const { startOfDay, endOfDay } = getTodayRange();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const overdueDate = new Date();
  overdueDate.setDate(overdueDate.getDate() - 30);

  if (isWorker) {
    const workerSales = await prisma.sale.findMany({
      where: { companyId, status: true, partyId: { not: null } },
      select: {
        id: true,
        saleNumber: true,
        partyId: true,
        partyName: true,
        productName: true,
        productCode: true,
        remainingAmount: true,
        createdAt: true,
        party: {
          select: {
            partyName: true,
            shopName: true,
            mobile: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return res.json({
      dashboard: {
        workerOverview: buildWorkerOverview(workerSales),
      },
    });
  }

  const todayPurchaseWhere = { companyId, createdAt: { gte: startOfDay, lte: endOfDay } };
  const todaySaleWhere = { companyId, createdAt: { gte: startOfDay, lte: endOfDay } };

  const [totalProducts, totalSuppliers, totalParties, totalSales, todayPurchases, todaySales, thisMonthExpenses, overallExpenses, lowStockItems, todaySalesProfit, totalSalesProfit, partyBalances, supplierPurchaseTotals, supplierRecords, overdueParties, lastPartySale] =
    await Promise.all([
      prisma.product.count({ where: { companyId } }),
      prisma.supplier.count({ where: { companyId } }),
      prisma.party.count({ where: { companyId } }),
      prisma.sale.count({ where: { companyId } }),
      prisma.purchase.aggregate({
        where: todayPurchaseWhere,
        _count: { id: true },
        _sum: { totalPurchaseAmount: true },
      }),
      prisma.sale.aggregate({
        where: todaySaleWhere,
        _count: { id: true },
        _sum: { salePrice: true },
      }),
      prisma.expense.aggregate({
        where: { companyId, status: true, expenseDate: { gte: monthStart, lte: monthEnd } },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: { companyId, status: true },
        _sum: { amount: true },
      }),
      prisma.stock.findMany({
        where: { companyId, balanceStock: { gte: lowStockThreshold }, status: true },
        select: { id: true, productCode: true, productName: true, balanceStock: true, salePrice: true },
        orderBy: { balanceStock: "desc" },
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
      prisma.purchase.groupBy({ by: ["supplierId"], where: { companyId, status: true, supplierId: { not: null } }, _sum: { totalPurchaseAmount: true } }),
      prisma.supplier.findMany({ where: { companyId }, select: { id: true, name: true, paidAmount: true } }),
      prisma.sale.groupBy({ by: ["partyId", "partyName"], where: { companyId, status: true, partyId: { not: null }, remainingAmount: { gt: 0 }, createdAt: { lte: overdueDate } }, _sum: { remainingAmount: true }, _min: { createdAt: true }, orderBy: { _min: { createdAt: "asc" } } }),
      prisma.sale.findFirst({
        where: { companyId, status: true, partyId: { not: null } },
        select: { id: true, productCode: true, productName: true, salePrice: true, quantity: true, unit: true, createdAt: true, partyId: true, partyName: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  let lastPartyNetTotalSalePrice = 0;
  if (lastPartySale?.partyId) {
    const partySales = await prisma.sale.findMany({
      where: { companyId, status: true, partyId: lastPartySale.partyId },
      select: { quantity: true, unit: true, salePrice: true },
    });
    lastPartyNetTotalSalePrice = Number(
      partySales
        .reduce((sum, line) => sum + calculateLineTotalSalePrice(line.quantity, line.unit, line.salePrice), 0)
        .toFixed(2),
    );
  }

  const parties = partyBalances.map((party) => ({ id: party.partyId, name: party.partyName || "Unknown Party", amount: Number(party._sum.remainingAmount) || 0 }));
  const supplierById = new Map(supplierRecords.map((supplier) => [supplier.id, supplier]));
  const suppliers = supplierPurchaseTotals.map((total) => {
    const supplier = supplierById.get(total.supplierId);
    const netTotalPurchaseAmount = Number(total._sum.totalPurchaseAmount) || 0;
    return {
      id: total.supplierId,
      name: supplier?.name || "Unknown Supplier",
      amount: netTotalPurchaseAmount - (Number(supplier?.paidAmount) || 0),
    };
  }).sort((a, b) => b.amount - a.amount);

  return res.json({
    dashboard: {
      totalProducts,
      totalSuppliers,
      totalParties,
      totalSales,
      today: {
        purchaseCount: todayPurchases._count.id,
        purchaseTotal: Number(todayPurchases._sum.totalPurchaseAmount) || 0,
        saleCount: todaySales._count.id,
        saleTotal: Number(todaySales._sum.salePrice) || 0,
        ...(isAdmin ? { salesProfit: Number(todaySalesProfit._sum.perSaleProfit) || 0 } : {}),
      },
      ...(isAdmin ? { totalSalesProfit: Number(totalSalesProfit._sum.perSaleProfit) || 0 } : {}),
      expenses: {
        thisMonthTotal: Number(thisMonthExpenses._sum.amount) || 0,
        overallTotal: Number(overallExpenses._sum.amount) || 0,
      },
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
      lastPartyPurchase: lastPartySale
        ? {
            id: lastPartySale.id,
            partyId: lastPartySale.partyId,
            partyName: lastPartySale.partyName || "Unknown Party",
            productCode: lastPartySale.productCode,
            productName: lastPartySale.productName,
            salePrice: lastPartyNetTotalSalePrice,
            netTotalSalePrice: lastPartyNetTotalSalePrice,
            createdAt: lastPartySale.createdAt,
          }
        : null,
    },
  });
};
