const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");

const normalizeStatus = (status) => {
  if (typeof status === "boolean") return status;
  if (typeof status === "string") {
    const upper = status.trim().toUpperCase();
    if (upper === "ACTIVE" || upper === "TRUE") return true;
    if (upper === "INACTIVE" || upper === "FALSE") return false;
  }
  return null;
};

const PUBLIC_PARTY_FIELDS = {
  id: true,
  companyId: true,
  partyName: true,
  shopName: true,
  mobile: true,
  email: true,
  address: true,
  city: true,
  state: true,
  country: true,
  pincode: true,
  partyProfit: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const validatePartyInput = (body) => {
  const required = ["partyName", "shopName", "mobile", "address", "city", "state", "country", "pincode", "status"];
  const missing = required.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || (typeof value === "string" && !value.trim());
  });

  if (missing.length) throw new AppError(400, "Required fields are missing.", { fields: missing });
  if (!/^\+?[0-9]{7,15}$/.test(String(body.mobile).trim())) {
    throw new AppError(400, "Enter a valid mobile number with 7 to 15 digits.");
  }
  if (body.email && !/^\S+@\S+\.\S+$/.test(body.email.trim())) {
    throw new AppError(400, "Enter a valid email address.");
  }
  if (body.partyProfit !== undefined && (Number.isNaN(Number(body.partyProfit)) || Number(body.partyProfit) < 0)) {
    throw new AppError(400, "Party profit must be a non-negative number.");
  }
  if (normalizeStatus(body.status) === null) {
    throw new AppError(400, "Status must be ACTIVE or INACTIVE.");
  }
};

const partyData = (body, values) => ({
  ...values,
  partyName: body.partyName.trim(),
  shopName: body.shopName.trim(),
  mobile: String(body.mobile).trim(),
  email: body.email ? String(body.email).trim().toLowerCase() : null,
  address: body.address.trim(),
  city: body.city.trim(),
  state: body.state.trim(),
  country: body.country.trim(),
  pincode: String(body.pincode).trim(),
  partyProfit: body.partyProfit !== undefined ? Number(body.partyProfit) : 0,
  status: normalizeStatus(body.status),
});

exports.getAll = async (req, res) => {
  const { search, status } = req.query;

  const where = { companyId: req.auth.companyId };

  if (search) {
    where.OR = [
      { partyName: { contains: search, mode: "insensitive" } },
      { shopName: { contains: search, mode: "insensitive" } },
      { mobile: { contains: search } },
    ];
  }

  if (status !== undefined) {
    const normalizedStatus = normalizeStatus(status);
    if (normalizedStatus === null) throw new AppError(400, "Status must be true, false, ACTIVE, or INACTIVE.");
    where.status = normalizedStatus;
  }

  const parties = await prisma.party.findMany({
    where,
    select: PUBLIC_PARTY_FIELDS,
    orderBy: { createdAt: "desc" },
  });

  return res.json({ parties });
};

exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid party id.");

  const party = await prisma.party.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: PUBLIC_PARTY_FIELDS,
  });
  if (!party) throw new AppError(404, "Party not found.");

  return res.json({ party });
};

exports.create = async (req, res) => {
  validatePartyInput(req.body);

  try {
    const party = await prisma.party.create({
      data: partyData(req.body, { companyId: req.auth.companyId }),
      select: PUBLIC_PARTY_FIELDS,
    });
    return res.status(201).json({ message: "Party created successfully.", party });
  } catch (error) {
    if (error.code === "P2002") throw new AppError(409, "A party with this mobile number already exists in this company.");
    throw error;
  }
};

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid party id.");

  validatePartyInput(req.body);

  const existing = await prisma.party.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Party not found.");

  const party = await prisma.party.update({
    where: { id },
    data: partyData(req.body, {}),
    select: PUBLIC_PARTY_FIELDS,
  });

  return res.json({ message: "Party updated successfully.", party });
};

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid party id.");

  const existing = await prisma.party.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Party not found.");

  await prisma.party.delete({ where: { id } });
  return res.json({ message: "Party deleted successfully." });
};
