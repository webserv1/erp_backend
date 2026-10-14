const toAmount = (value) => Number(value) || 0;

const buildPartyInvoiceMap = (sales) => {
  const invoiceMap = new Map();

  (sales || []).forEach((sale) => {
    const partyId = Number.isInteger(sale.partyId) ? sale.partyId : null;
    if (!partyId) return;

    const invoiceKey = sale.saleNumber ? `INV:${sale.saleNumber}` : `LINE:${sale.id}`;
    const mapKey = `${partyId}:${invoiceKey}`;
    const lineRemaining = Math.max(toAmount(sale.remainingAmount), 0);

    if (!invoiceMap.has(mapKey)) {
      invoiceMap.set(mapKey, {
        partyId,
        partyName: sale.partyName || "Unknown Party",
        remainingAmount: lineRemaining,
        createdAt: sale.createdAt || null,
      });
      return;
    }

    const invoice = invoiceMap.get(mapKey);
    invoice.remainingAmount = Math.max(invoice.remainingAmount, lineRemaining);
    if (!invoice.partyName && sale.partyName) invoice.partyName = sale.partyName;
    if (!invoice.createdAt && sale.createdAt) invoice.createdAt = sale.createdAt;
  });

  return [...invoiceMap.values()];
};

const buildPartyOutstandingBalances = (sales) => {
  const partyMap = new Map();
  const invoices = buildPartyInvoiceMap(sales).filter((invoice) => invoice.remainingAmount > 0);

  invoices.forEach((invoice) => {
    if (!partyMap.has(invoice.partyId)) {
      partyMap.set(invoice.partyId, {
        id: invoice.partyId,
        name: invoice.partyName || "Unknown Party",
        amount: 0,
      });
    }

    const party = partyMap.get(invoice.partyId);
    party.amount += invoice.remainingAmount;
    if (!party.name && invoice.partyName) party.name = invoice.partyName;
  });

  return [...partyMap.values()]
    .map((party) => ({ ...party, amount: Number(party.amount.toFixed(2)) }))
    .sort((a, b) => b.amount - a.amount);
};

const buildOverduePartyReminders = (sales, overdueDate) => {
  const reminderMap = new Map();
  const invoices = buildPartyInvoiceMap(sales).filter((invoice) =>
    invoice.remainingAmount > 0 && invoice.createdAt && new Date(invoice.createdAt) <= overdueDate,
  );

  invoices.forEach((invoice) => {
    if (!reminderMap.has(invoice.partyId)) {
      reminderMap.set(invoice.partyId, {
        id: invoice.partyId,
        name: invoice.partyName || "Unknown Party",
        amount: 0,
        overdueSince: invoice.createdAt,
      });
    }

    const reminder = reminderMap.get(invoice.partyId);
    reminder.amount += invoice.remainingAmount;
    if (invoice.createdAt && (!reminder.overdueSince || new Date(invoice.createdAt) < new Date(reminder.overdueSince))) {
      reminder.overdueSince = invoice.createdAt;
    }
  });

  return [...reminderMap.values()]
    .map((party) => ({
      ...party,
      amount: Number(party.amount.toFixed(2)),
    }))
    .sort((a, b) => new Date(a.overdueSince).getTime() - new Date(b.overdueSince).getTime());
};

const buildSupplierPayableBalances = (purchases, suppliers) => {
  const totalsBySupplier = new Map();
  const supplierNameById = new Map();

  (purchases || []).forEach((purchase) => {
    const supplierId = Number.isInteger(purchase.supplierId) ? purchase.supplierId : null;
    if (!supplierId) return;

    totalsBySupplier.set(
      supplierId,
      (totalsBySupplier.get(supplierId) || 0) + toAmount(purchase.totalPurchaseAmount),
    );

    if (!supplierNameById.has(supplierId) && purchase.supplierName) {
      supplierNameById.set(supplierId, purchase.supplierName);
    }
  });

  const supplierById = new Map((suppliers || []).map((supplier) => [supplier.id, supplier]));
  const balances = [];

  totalsBySupplier.forEach((totalPurchaseAmount, supplierId) => {
    const supplier = supplierById.get(supplierId);
    const paidAmount = toAmount(supplier?.paidAmount);
    const amount = Math.max(totalPurchaseAmount - paidAmount, 0);

    if (amount <= 0) return;

    balances.push({
      id: supplierId,
      name: supplier?.name || supplierNameById.get(supplierId) || "Unknown Supplier",
      amount: Number(amount.toFixed(2)),
    });
  });

  return balances.sort((a, b) => b.amount - a.amount);
};

module.exports = {
  buildPartyOutstandingBalances,
  buildOverduePartyReminders,
  buildSupplierPayableBalances,
};
