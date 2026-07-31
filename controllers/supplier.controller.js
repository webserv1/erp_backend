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

const PUBLIC_SUPPLIER_FIELDS = {
  id: true,
  companyId: true,
  name: true,
  mobile: true,
  email: true,
  address: true,
  city: true,
  state: true,
  country: true,
  pincode: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const validateSupplierInput = (body) => {
  const required = ["name", "mobile", "address", "city", "state", "country", "pincode", "status"];
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
  if (normalizeStatus(body.status) === null) {
    throw new AppError(400, "Status must be ACTIVE or INACTIVE.");
  }
};

const supplierData = (body, values) => ({
  ...values,
  name: body.name.trim(),
  mobile: String(body.mobile).trim(),
  email: body.email ? String(body.email).trim().toLowerCase() : null,
  address: body.address.trim(),
  city: body.city.trim(),
  state: body.state.trim(),
  country: body.country.trim(),
  pincode: String(body.pincode).trim(),
  status: normalizeStatus(body.status),
});

exports.getAll = async (req, res) => {
  const { search, status } = req.query;

  const where = { companyId: req.auth.companyId };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { mobile: { contains: search } },
    ];
  }

  if (status !== undefined) {
    const normalizedStatus = normalizeStatus(status);
    if (normalizedStatus === null) throw new AppError(400, "Status must be true, false, ACTIVE, or INACTIVE.");
    where.status = normalizedStatus;
  }

  const suppliers = await prisma.supplier.findMany({
    where,
    select: PUBLIC_SUPPLIER_FIELDS,
    orderBy: { createdAt: "desc" },
  });

  return res.json({ suppliers });
};

exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid supplier id.");

  const supplier = await prisma.supplier.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: PUBLIC_SUPPLIER_FIELDS,
  });
  if (!supplier) throw new AppError(404, "Supplier not found.");

  return res.json({ supplier });
};

exports.create = async (req, res) => {
  validateSupplierInput(req.body);

  try {
    const supplier = await prisma.supplier.create({
      data: supplierData(req.body, { companyId: req.auth.companyId }),
      select: PUBLIC_SUPPLIER_FIELDS,
    });
    return res.status(201).json({ message: "Supplier created successfully.", supplier });
  } catch (error) {
    if (error.code === "P2002") throw new AppError(409, "A supplier with this mobile number already exists in this company.");
    throw error;
  }
};

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid supplier id.");

  validateSupplierInput(req.body);

  const existing = await prisma.supplier.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Supplier not found.");

  const supplier = await prisma.supplier.update({
    where: { id },
    data: supplierData(req.body, {}),
    select: PUBLIC_SUPPLIER_FIELDS,
  });

  return res.json({ message: "Supplier updated successfully.", supplier });
};

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid supplier id.");

  const existing = await prisma.supplier.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Supplier not found.");

  const purchaseCount = await prisma.purchase.count({
    where: { supplierId: id, companyId: req.auth.companyId },
  });
  if (purchaseCount > 0) {
    throw new AppError(409, "This supplier has purchases and cannot be deleted. Set its status to Inactive instead.");
  }

  await prisma.supplier.delete({ where: { id } });
  return res.json({ message: "Supplier deleted successfully." });
};
