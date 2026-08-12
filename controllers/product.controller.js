const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");

const PRODUCT_SELECT = {
  id: true, companyId: true, productCode: true, productName: true, categoryId: true,
  brandId: true, colorId: true, sizeId: true, brandIds: true, colorIds: true, sizeIds: true,
  productImage: true, gst: true, itemCode: true, status: true, createdAt: true, updatedAt: true,
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  color: { select: { id: true, name: true } },
  size: { select: { id: true, name: true } },
};

const FIELD_ALIASES = {
  brandId: ["brandId", "brandIds", "brandIds[]"],
  colorId: ["colorId", "colorIds", "colorIds[]"],
  sizeId: ["sizeId", "sizeIds", "sizeIds[]"],
};

const toIds = (body, field) => {
  const raw = field === "categoryId" ? body.categoryId : FIELD_ALIASES[field].flatMap((key) => body[key] === undefined ? [] : body[key]);
  const values = Array.isArray(raw) ? raw : [raw];
  return [...new Set(values.flatMap((value) => typeof value === "string" ? value.split(",") : [value])
    .map((value) => Number.parseInt(value, 10)).filter((id) => Number.isInteger(id) && id > 0))];
};

const selectedIds = (product, pluralField, singularField) => product[pluralField]?.length ? product[pluralField] : [product[singularField]];

const withSelectedMasters = async (products) => {
  if (!products.length) return products;
  const ids = [...new Set(products.flatMap((product) => [
    ...selectedIds(product, "brandIds", "brandId"),
    ...selectedIds(product, "colorIds", "colorId"),
    ...selectedIds(product, "sizeIds", "sizeId"),
  ]))];
  const masters = await prisma.productMaster.findMany({
    where: { companyId: products[0].companyId, id: { in: ids } },
    select: { id: true, name: true, type: true },
  });
  const masterById = new Map(masters.map((master) => [master.id, master]));
  const namesFor = (product, pluralField, singularField, type) => selectedIds(product, pluralField, singularField)
    .map((id) => masterById.get(id)).filter((master) => master?.type === type).map(({ id, name }) => ({ id, name }));

  return products.map((product) => ({
    ...product,
    brandIds: selectedIds(product, "brandIds", "brandId"),
    colorIds: selectedIds(product, "colorIds", "colorId"),
    sizeIds: selectedIds(product, "sizeIds", "sizeId"),
    brands: namesFor(product, "brandIds", "brandId", "BRAND"),
    colors: namesFor(product, "colorIds", "colorId", "COLOR"),
    sizes: namesFor(product, "sizeIds", "sizeId", "SIZE"),
  }));
};

const validateInput = (body) => {
  const missing = ["productCode", "productName", "gst", "itemCode"].filter((field) => !body[field] || !String(body[field]).trim());
  if (toIds(body, "categoryId").length !== 1) missing.push("categoryId");
  ["brandId", "colorId", "sizeId"].forEach((field) => { if (!toIds(body, field).length) missing.push(field); });
  if (missing.length) throw new AppError(400, "Required fields are missing or invalid.", { fields: missing });
};

const dataFrom = (body, files) => {
  const categoryId = toIds(body, "categoryId")[0];
  const brandIds = toIds(body, "brandId");
  const colorIds = toIds(body, "colorId");
  const sizeIds = toIds(body, "sizeId");
  return {
    productCode: String(body.productCode).trim(), productName: String(body.productName).trim(), categoryId,
    brandId: brandIds[0], colorId: colorIds[0], sizeId: sizeIds[0], brandIds, colorIds, sizeIds,
    productImage: files?.productImage?.[0] ? `/uploads/products/${files.productImage[0].filename}` : undefined,
    gst: String(body.gst).trim(), itemCode: String(body.itemCode).trim(),
  };
};

const validateMasters = async (companyId, data) => {
  const selected = [
    { id: data.categoryId, type: "CATEGORY", field: "categoryId" },
    ...data.brandIds.map((id) => ({ id, type: "BRAND", field: "brandId" })),
    ...data.colorIds.map((id) => ({ id, type: "COLOR", field: "colorId" })),
    ...data.sizeIds.map((id) => ({ id, type: "SIZE", field: "sizeId" })),
  ];
  const masters = await prisma.productMaster.findMany({ where: { id: { in: selected.map((entry) => entry.id) } }, select: { id: true, companyId: true, type: true, categoryId: true } });
  const byId = new Map(masters.map((master) => [master.id, master]));
  for (const entry of selected) {
    const master = byId.get(entry.id);
    if (!master) throw new AppError(404, `${entry.field} entry not found.`);
    if (master.companyId !== companyId) throw new AppError(403, "You do not have permission to use this master entry.");
    if (master.type !== entry.type) throw new AppError(400, `Selected ${entry.field} is not a valid ${entry.type.toLowerCase()} entry.`);
    if (entry.type !== "CATEGORY" && master.categoryId && master.categoryId !== data.categoryId) throw new AppError(400, `Selected ${entry.field} does not belong to the selected category.`);
  }
};

exports.getAll = async (req, res) => {
  const { search, categoryId, brandId, colorId, sizeId, status } = req.query;
  const where = { companyId: req.auth.companyId };
  if (search) where.OR = [{ productName: { contains: search, mode: "insensitive" } }, { productCode: { contains: search, mode: "insensitive" } }, { itemCode: { contains: search, mode: "insensitive" } }];
  if (categoryId) where.categoryId = { in: (Array.isArray(categoryId) ? categoryId : [categoryId]).map(Number).filter(Number.isInteger) };
  for (const [field, value] of Object.entries({ brandId, colorId, sizeId })) {
    if (value) where[`${field}s`] = { hasSome: (Array.isArray(value) ? value : [value]).map(Number).filter(Number.isInteger) };
  }
  if (status !== undefined) where.status = status === "true" || status === true;
  const products = await prisma.product.findMany({ where, select: PRODUCT_SELECT, orderBy: { createdAt: "desc" } });
  return res.json({ products: await withSelectedMasters(products) });
};

exports.getById = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, "Invalid product id.");
  const product = await prisma.product.findFirst({ where: { id, companyId: req.auth.companyId }, select: PRODUCT_SELECT });
  if (!product) throw new AppError(404, "Product not found.");
  return res.json({ product: (await withSelectedMasters([product]))[0] });
};

exports.create = async (req, res) => {
  validateInput(req.body);
  const data = dataFrom(req.body, req.files);
  await validateMasters(req.auth.companyId, data);
  try {
    const product = await prisma.product.create({ data: { ...data, companyId: req.auth.companyId }, select: PRODUCT_SELECT });
    return res.status(201).json({ message: "Product created successfully.", product: (await withSelectedMasters([product]))[0] });
  } catch (error) {
    if (error.code === "P2002") throw new AppError(409, "A product with this product code already exists in this company.");
    throw error;
  }
};

exports.update = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, "Invalid product id.");
  validateInput(req.body);
  const existing = await prisma.product.findFirst({ where: { id, companyId: req.auth.companyId }, select: { id: true } });
  if (!existing) throw new AppError(404, "Product not found.");
  const data = dataFrom(req.body, req.files);
  await validateMasters(req.auth.companyId, data);
  try {
    const product = await prisma.product.update({ where: { id }, data, select: PRODUCT_SELECT });
    return res.json({ message: "Product updated successfully.", product: (await withSelectedMasters([product]))[0] });
  } catch (error) {
    if (error.code === "P2002") throw new AppError(409, "A product with this product code already exists in this company.");
    throw error;
  }
};

exports.remove = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, "Invalid product id.");
  const existing = await prisma.product.findFirst({ where: { id, companyId: req.auth.companyId }, select: { id: true } });
  if (!existing) throw new AppError(404, "Product not found.");
  await prisma.product.delete({ where: { id } });
  return res.json({ message: "Product deleted successfully." });
};
