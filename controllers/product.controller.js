const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");

const PUBLIC_PRODUCT_FIELDS = {
  id: true,
  companyId: true,
  productCode: true,
  productName: true,
  categoryId: true,
  brandId: true,
  colorId: true,
  sizeId: true,
  productImage: true,
  gst: true,
  itemCode: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const PUBLIC_PRODUCT_WITH_RELATIONS_FIELDS = {
  id: true,
  companyId: true,
  productCode: true,
  productName: true,
  categoryId: true,
  brandId: true,
  colorId: true,
  sizeId: true,
  productImage: true,
  gst: true,
  itemCode: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  color: { select: { id: true, name: true } },
  size: { select: { id: true, name: true } },
};

const validateProductInput = (body, files) => {
  const required = ["productCode", "productName", "categoryId", "brandId", "colorId", "sizeId", "gst", "itemCode"];

  const categoryIds = Array.isArray(body.categoryId) ? body.categoryId : [body.categoryId];
  const brandIds = Array.isArray(body.brandId) ? body.brandId : [body.brandId];
  const colorIds = Array.isArray(body.colorId) ? body.colorId : [body.colorId];
  const sizeIds = Array.isArray(body.sizeId) ? body.sizeId : [body.sizeId];

  const missing = required.filter((field) => {
    const val = field === "categoryId" ? categoryIds[0] :
      field === "brandId" ? brandIds[0] :
        field === "colorId" ? colorIds[0] :
          field === "sizeId" ? sizeIds[0] :
            body[field];
    return !val || (typeof val === "string" && !val.trim());
  });

  if (missing.length) throw new AppError(400, "Required fields are missing.", { fields: missing });
};

const productData = (body, files, values) => {
  const categoryId = Array.isArray(body.categoryId) ? body.categoryId[0] : body.categoryId;
  const brandId = Array.isArray(body.brandId) ? body.brandId[0] : body.brandId;
  const colorId = Array.isArray(body.colorId) ? body.colorId[0] : body.colorId;
  const sizeId = Array.isArray(body.sizeId) ? body.sizeId[0] : body.sizeId;

  const productImage = files?.productImage?.[0]
    ? `/uploads/products/${files.productImage[0].filename}`
    : undefined;

  return {
    ...values,
    productCode: body.productCode.trim(),
    productName: body.productName.trim(),
    categoryId: parseInt(categoryId, 10),
    brandId: parseInt(brandId, 10),
    colorId: parseInt(colorId, 10),
    sizeId: parseInt(sizeId, 10),
    productImage,
    gst: body.gst.trim(),
    itemCode: body.itemCode.trim(),
  };
};

const masterTypeMap = {
  CATEGORY: "categoryId",
  BRAND: "brandId",
  COLOR: "colorId",
  SIZE: "sizeId",
};

exports.getAll = async (req, res) => {
  const { search, categoryId, brandId, colorId, sizeId, status } = req.query;

  const where = { companyId: req.auth.companyId };

  if (search) {
    where.OR = [
      { productName: { contains: search, mode: "insensitive" } },
      { productCode: { contains: search, mode: "insensitive" } },
      { itemCode: { contains: search, mode: "insensitive" } },
    ];
  }

  if (categoryId) {
    const ids = Array.isArray(categoryId) ? categoryId : [categoryId];
    where.categoryId = { in: ids.map((id) => parseInt(id, 10)) };
  }
  if (brandId) {
    const ids = Array.isArray(brandId) ? brandId : [brandId];
    where.brandId = { in: ids.map((id) => parseInt(id, 10)) };
  }
  if (colorId) {
    const ids = Array.isArray(colorId) ? colorId : [colorId];
    where.colorId = { in: ids.map((id) => parseInt(id, 10)) };
  }
  if (sizeId) {
    const ids = Array.isArray(sizeId) ? sizeId : [sizeId];
    where.sizeId = { in: ids.map((id) => parseInt(id, 10)) };
  }
  if (status !== undefined) where.status = status === "true" || status === true;

  const products = await prisma.product.findMany({
    where,
    select: PUBLIC_PRODUCT_WITH_RELATIONS_FIELDS,
    orderBy: { createdAt: "desc" },
  });

  return res.json({ products });
};

exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid product id.");

  const product = await prisma.product.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: PUBLIC_PRODUCT_WITH_RELATIONS_FIELDS,
  });
  if (!product) throw new AppError(404, "Product not found.");

  return res.json({ product });
};

exports.create = async (req, res) => {
  validateProductInput(req.body, req.files);

  const categoryId = Array.isArray(req.body.categoryId) ? req.body.categoryId[0] : req.body.categoryId;
  const brandId = Array.isArray(req.body.brandId) ? req.body.brandId[0] : req.body.brandId;
  const colorId = Array.isArray(req.body.colorId) ? req.body.colorId[0] : req.body.colorId;
  const sizeId = Array.isArray(req.body.sizeId) ? req.body.sizeId[0] : req.body.sizeId;

  const masterIds = {
    [masterTypeMap.CATEGORY]: parseInt(categoryId, 10),
    [masterTypeMap.BRAND]: parseInt(brandId, 10),
    [masterTypeMap.COLOR]: parseInt(colorId, 10),
    [masterTypeMap.SIZE]: parseInt(sizeId, 10),
  };

  for (const [type, id] of Object.entries(masterIds)) {
    if (Number.isNaN(id)) throw new AppError(400, `Invalid ${type} id.`);
    const master = await prisma.productMaster.findUnique({
      where: { id },
      select: { id: true, type: true, companyId: true },
    });
    if (!master) throw new AppError(404, `${type} not found.`);
    if (master.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this master entry.");
  }

  try {
    const product = await prisma.product.create({
      data: productData(req.body, req.files, { companyId: req.auth.companyId }),
      select: PUBLIC_PRODUCT_WITH_RELATIONS_FIELDS,
    });
    return res.status(201).json({ message: "Product created successfully.", product });
  } catch (error) {
    if (error.code === "P2002") throw new AppError(409, "A product with this product code already exists in this company.");
    throw error;
  }
};

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid product id.");

  validateProductInput(req.body, req.files);

  const existing = await prisma.product.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Product not found.");

  const categoryId = Array.isArray(req.body.categoryId) ? req.body.categoryId[0] : req.body.categoryId;
  const brandId = Array.isArray(req.body.brandId) ? req.body.brandId[0] : req.body.brandId;
  const colorId = Array.isArray(req.body.colorId) ? req.body.colorId[0] : req.body.colorId;
  const sizeId = Array.isArray(req.body.sizeId) ? req.body.sizeId[0] : req.body.sizeId;

  const masterIds = {
    [masterTypeMap.CATEGORY]: parseInt(categoryId, 10),
    [masterTypeMap.BRAND]: parseInt(brandId, 10),
    [masterTypeMap.COLOR]: parseInt(colorId, 10),
    [masterTypeMap.SIZE]: parseInt(sizeId, 10),
  };

  for (const [type, masterId] of Object.entries(masterIds)) {
    if (Number.isNaN(masterId)) throw new AppError(400, `Invalid ${type} id.`);
    const master = await prisma.productMaster.findUnique({
      where: { id: masterId },
      select: { id: true, type: true, companyId: true },
    });
    if (!master) throw new AppError(404, `${type} not found.`);
    if (master.companyId !== req.auth.companyId) throw new AppError(403, "You do not have permission to use this master entry.");
  }

  const product = await prisma.product.update({
    where: { id },
    data: productData(req.body, req.files, {}),
    select: PUBLIC_PRODUCT_WITH_RELATIONS_FIELDS,
  });

  return res.json({ message: "Product updated successfully.", product });
};

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid product id.");

  const existing = await prisma.product.findFirst({
    where: { id, companyId: req.auth.companyId },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Product not found.");

  await prisma.product.delete({ where: { id } });
  return res.json({ message: "Product deleted successfully." });
};