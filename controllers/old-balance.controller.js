const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");
const { deleteUploadAsset } = require("../utils/upload-asset-store");

const PUBLIC_OLD_BALANCE_FIELDS = {
  id: true,
  companyId: true,
  partyId: true,
  partyName: true,
  oldBalanceAmount: true,
  qty: true,
  purchasePrice: true,
  salePrice: true,
  profit: true,
  billUrl: true,
  createdById: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  party: {
    select: {
      id: true,
      partyName: true,
      shopName: true,
      mobile: true,
    },
  },
};

const parseDateOrNull = (value) => {
  if (!value || !String(value).trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseNonNegative = (value, field) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new AppError(400, `${field} must be a non-negative number.`);
  }
  return parsed;
};

const parseStatus = (value) => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "TRUE") return true;
  if (normalized === "INACTIVE" || normalized === "FALSE") return false;
  throw new AppError(400, "Status must be ACTIVE or INACTIVE.");
};

const ensureParty = async (companyId, partyId) => {
  if (!Number.isInteger(partyId)) throw new AppError(400, "Valid party is required.");
  const party = await prisma.party.findFirst({
    where: { id: partyId, companyId, status: true },
    select: { id: true, partyName: true },
  });
  if (!party) throw new AppError(404, "Active party not found.");
  return party;
};

const buildOldBalanceData = async (companyId, body, files, createdById, existing) => {
  const partyId = body.partyId !== undefined ? Number.parseInt(body.partyId, 10) : existing?.partyId;
  const party = await ensureParty(companyId, partyId);
  const oldBalanceAmount = body.oldBalanceAmount !== undefined
    ? parseNonNegative(body.oldBalanceAmount, "Old balance amount")
    : existing?.oldBalanceAmount;
  const purchasePrice = body.purchasePrice !== undefined
    ? parseNonNegative(body.purchasePrice, "Purchase price")
    : existing?.purchasePrice;
  const salePrice = body.salePrice !== undefined
    ? parseNonNegative(body.salePrice, "Sale price")
    : existing?.salePrice;
  const providedProfit = body.profit !== undefined && String(body.profit).trim() !== ""
    ? Number(body.profit)
    : undefined;
  if (providedProfit !== undefined && Number.isNaN(providedProfit)) {
    throw new AppError(400, "Profit must be a valid number.");
  }
  const qty = 1;
  const calculatedProfit = Number((salePrice - purchasePrice).toFixed(2));
  const profit = Number((providedProfit !== undefined ? providedProfit : calculatedProfit).toFixed(2));
  const billFile = files?.bill?.[0];
  const status = parseStatus(body.status);

  return {
    partyId: party.id,
    partyName: party.partyName,
    oldBalanceAmount: Number(oldBalanceAmount.toFixed(2)),
    qty,
    purchasePrice: Number(purchasePrice.toFixed(2)),
    salePrice: Number(salePrice.toFixed(2)),
    profit,
    billUrl: billFile ? `/uploads/expenses/${billFile.filename}` : undefined,
    status: status === undefined ? existing?.status ?? true : status,
    createdById: createdById || existing?.createdById || null,
  };
};

exports.getAll = async (req, res) => {
  const { search, partyId, status, startDate, endDate } = req.query;
  const where = { companyId: req.auth.companyId };

  if (search) {
    where.OR = [
      { partyName: { contains: String(search), mode: "insensitive" } },
      { party: { shopName: { contains: String(search), mode: "insensitive" } } },
    ];
  }
  if (partyId) where.partyId = Number.parseInt(partyId, 10);
  if (status !== undefined) where.status = parseStatus(status);
  if (startDate || endDate) {
    where.createdAt = {};
    const start = parseDateOrNull(startDate);
    const end = parseDateOrNull(endDate);
    if (startDate && !start) throw new AppError(400, "Invalid start date.");
    if (endDate && !end) throw new AppError(400, "Invalid end date.");
    if (start) where.createdAt.gte = start;
    if (end) where.createdAt.lte = end;
  }

  const oldBalances = await prisma.oldBalance.findMany({
    where,
    select: PUBLIC_OLD_BALANCE_FIELDS,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return res.json({ oldBalances });
};

exports.getById = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, "Invalid old balance id.");

  const oldBalance = await prisma.oldBalance.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: PUBLIC_OLD_BALANCE_FIELDS,
  });
  if (!oldBalance) throw new AppError(404, "Old balance entry not found.");
  return res.json({ oldBalance });
};

exports.create = async (req, res) => {
  const data = await buildOldBalanceData(req.auth.companyId, req.body, req.files, req.auth.sub);
  const oldBalance = await prisma.oldBalance.create({
    data: {
      companyId: req.auth.companyId,
      ...data,
    },
    select: PUBLIC_OLD_BALANCE_FIELDS,
  });
  return res.status(201).json({ message: "Old balance added successfully.", oldBalance });
};

exports.update = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, "Invalid old balance id.");

  const existing = await prisma.oldBalance.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: {
      id: true,
      companyId: true,
      partyId: true,
      oldBalanceAmount: true,
      purchasePrice: true,
      salePrice: true,
      status: true,
      createdById: true,
      billUrl: true,
    },
  });
  if (!existing) throw new AppError(404, "Old balance entry not found.");

  const data = await buildOldBalanceData(req.auth.companyId, req.body, req.files, req.auth.sub, existing);
  if (data.billUrl && existing.billUrl) {
    await deleteUploadAsset(existing.billUrl);
  }

  const oldBalance = await prisma.oldBalance.update({
    where: { id: existing.id },
    data,
    select: PUBLIC_OLD_BALANCE_FIELDS,
  });
  return res.json({ message: "Old balance updated successfully.", oldBalance });
};

exports.remove = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, "Invalid old balance id.");

  const existing = await prisma.oldBalance.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, billUrl: true },
  });
  if (!existing) throw new AppError(404, "Old balance entry not found.");

  if (existing.billUrl) await deleteUploadAsset(existing.billUrl);
  await prisma.oldBalance.delete({ where: { id: existing.id } });
  return res.json({ message: "Old balance deleted successfully." });
};
