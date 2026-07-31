const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");

const MASTER_TYPES = ["CATEGORY", "BRAND", "COLOR", "SIZE"];

const TYPE_MAP = {
  categories: "CATEGORY",
  brands: "BRAND",
  colors: "COLOR",
  sizes: "SIZE",
};

const PUBLIC_MASTER_FIELDS = {
  id: true,
  companyId: true,
  type: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const normalizeStatus = (status) => {
  if (typeof status === "boolean") return status;
  if (typeof status === "string") {
    const upper = status.trim().toUpperCase();
    if (upper === "ACTIVE") return true;
    if (upper === "INACTIVE") return false;
  }
  return null;
};

const validateMasterInput = (body) => {
  const required = ["name", "status"];
  const missing = required.filter((field) => !String(body[field] || "").trim());

  if (missing.length) throw new AppError(400, "Required fields are missing.", { fields: missing });
  const status = normalizeStatus(body.status);
  if (status === null) throw new AppError(400, "Status must be ACTIVE or INACTIVE.");
};

const masterData = (body, values) => ({
  ...values,
  name: body.name.trim(),
  status: normalizeStatus(body.status),
});

exports.getAll = async (req, res) => {
  const type = TYPE_MAP[String(req.params.type || "").toLowerCase()];
  if (!type) throw new AppError(400, "Type must be categories, brands, colors, or sizes.");

  const masters = await prisma.productMaster.findMany({
    where: { companyId: req.auth.companyId, type },
    select: PUBLIC_MASTER_FIELDS,
    orderBy: { name: "asc" },
  });

  return res.json({ masters });
};

exports.create = async (req, res) => {
  const type = TYPE_MAP[String(req.params.type || "").toLowerCase()];
  if (!type) throw new AppError(400, "Type must be categories, brands, colors, or sizes.");

  validateMasterInput(req.body);

  try {
    const master = await prisma.productMaster.create({
      data: masterData(req.body, { companyId: req.auth.companyId, type }),
      select: PUBLIC_MASTER_FIELDS,
    });
    return res.status(201).json({ message: `${type} created successfully.`, master });
  } catch (error) {
    if (error.code === "P2002") throw new AppError(409, `A ${type.toLowerCase()} with this name already exists in this company.`);
    throw error;
  }
};

exports.update = async (req, res) => {
  const type = TYPE_MAP[String(req.params.type || "").toLowerCase()];
  if (!type) throw new AppError(400, "Type must be categories, brands, colors, or sizes.");

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid master id.");

  validateMasterInput(req.body);

  const existing = await prisma.productMaster.findUnique({
    where: { id },
    select: PUBLIC_MASTER_FIELDS,
  });
  if (!existing) throw new AppError(404, "Master entry not found.");
  if (existing.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to update this entry.");

  const master = await prisma.productMaster.update({
    where: { id },
    data: masterData(req.body, { type }),
    select: PUBLIC_MASTER_FIELDS,
  });

  return res.json({ message: `${type} updated successfully.`, master });
};

exports.remove = async (req, res) => {
  const type = TYPE_MAP[String(req.params.type || "").toLowerCase()];
  if (!type) throw new AppError(400, "Type must be categories, brands, colors, or sizes.");

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid master id.");

  const existing = await prisma.productMaster.findUnique({
    where: { id },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Master entry not found.");
  if (existing.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to delete this entry.");

  await prisma.productMaster.delete({ where: { id } });
  return res.json({ message: `${type} deleted successfully.` });
};