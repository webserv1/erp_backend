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
  categoryId: true,
  unit: true,
  quantity: true,
  purchaseAmount: true,
  saleAmount: true,
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

const validateNestedMaster = (item, index, type) => {
  if (typeof item === "string") return;
  if (!item || !String(item.name || "").trim()) {
    throw new AppError(400, `${type} name is required at index ${index}.`);
  }
  if (item.status !== undefined && normalizeStatus(item.status) === null) {
    throw new AppError(400, `Invalid status for ${type} at index ${index}.`);
  }
};

const masterData = (body, values) => ({
  ...values,
  name: body.name.trim(),
  status: normalizeStatus(body.status),
  categoryId: body.categoryId ? parseInt(body.categoryId, 10) : null,
  unit: body.unit ? body.unit.toUpperCase() : "PIECES",
  quantity: body.quantity ? parseInt(body.quantity, 10) : null,
  purchaseAmount: body.purchaseAmount ? Number(body.purchaseAmount) : null,
  saleAmount: body.saleAmount ? Number(body.saleAmount) : null,
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

exports.getCategories = async (req, res) => {
  const companyId = req.auth.companyId;

  const categories = await prisma.productMaster.findMany({
    where: { companyId, type: "CATEGORY" },
    select: PUBLIC_MASTER_FIELDS,
    orderBy: { name: "asc" },
  });

  const categoryIds = categories.map((c) => c.id);

  if (categoryIds.length === 0) {
    return res.json({ categories: [] });
  }

  const [brands, colors, sizes] = await Promise.all([
    prisma.productMaster.findMany({
      where: { companyId, type: "BRAND", categoryId: { in: categoryIds } },
      select: PUBLIC_MASTER_FIELDS,
      orderBy: { name: "asc" },
    }),
    prisma.productMaster.findMany({
      where: { companyId, type: "COLOR", categoryId: { in: categoryIds } },
      select: PUBLIC_MASTER_FIELDS,
      orderBy: { name: "asc" },
    }),
    prisma.productMaster.findMany({
      where: { companyId, type: "SIZE", categoryId: { in: categoryIds } },
      select: PUBLIC_MASTER_FIELDS,
      orderBy: { name: "asc" },
    }),
  ]);

  const categoriesWithNested = categories.map((category) => ({
    ...category,
    brands: brands.filter((b) => b.categoryId === category.id),
    colors: colors.filter((c) => c.categoryId === category.id),
    sizes: sizes.filter((s) => s.categoryId === category.id),
  }));

  return res.json({ categories: categoriesWithNested });
};

exports.createCategory = async (req, res) => {
  const { name, status, unit, quantity, purchaseAmount, saleAmount, brands = [], colors = [], sizes = [], brandIds = [], colorIds = [], sizeIds = [] } = req.body;

  if (!name || !String(name).trim()) {
    throw new AppError(400, "Category name is required.");
  }
  const normalizedStatus = normalizeStatus(status);
  if (normalizedStatus === null) throw new AppError(400, "Status must be ACTIVE or INACTIVE.");

  const normalizedUnit = unit && ["PIECES", "DOZEN"].includes(unit.toUpperCase()) ? unit.toUpperCase() : "PIECES";

  const normalizedBrands = Array.isArray(brands)
    ? brands.map((b) => (typeof b === "string" ? { name: b } : b))
    : [];
  const normalizedColors = Array.isArray(colors)
    ? colors.map((c) => (typeof c === "string" ? { name: c } : c))
    : [];
  const normalizedSizes = Array.isArray(sizes)
    ? sizes.map((s) => (typeof s === "string" ? { name: s } : s))
    : [];

  normalizedBrands.forEach((b, i) => validateNestedMaster(b, i, "Brand"));
  normalizedColors.forEach((c, i) => validateNestedMaster(c, i, "Color"));
  normalizedSizes.forEach((s, i) => validateNestedMaster(s, i, "Size"));

  const trimmedName = name.trim();
  const existing = await prisma.productMaster.findFirst({
    where: { companyId: req.auth.companyId, type: "CATEGORY", name: trimmedName },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(409, `A category with the name "${trimmedName}" already exists in this company.`);
  }

  const uniqueBrands = Array.from(new Map(normalizedBrands.map((b) => [b.name.trim(), b])).values());
  const uniqueColors = Array.from(new Map(normalizedColors.map((c) => [c.name.trim(), c])).values());
  const uniqueSizes = Array.from(new Map(normalizedSizes.map((s) => [s.name.trim(), s])).values());

  const category = await prisma.$transaction(async (tx) => {
    const newCategory = await tx.productMaster.create({
      data: {
        companyId: req.auth.companyId,
        type: "CATEGORY",
        name: trimmedName,
        status: normalizedStatus,
        unit: normalizedUnit,
        quantity: quantity ? parseInt(quantity, 10) : null,
        purchaseAmount: purchaseAmount ? Number(purchaseAmount) : null,
        saleAmount: saleAmount ? Number(saleAmount) : null,
      },
      select: PUBLIC_MASTER_FIELDS,
    });

    if (uniqueBrands.length > 0) {
      await tx.productMaster.createMany({
        data: uniqueBrands.map((b) => ({
          companyId: req.auth.companyId,
          type: "BRAND",
          name: b.name.trim(),
          status: normalizeStatus(b.status) ?? true,
          categoryId: newCategory.id,
        })),
        skipDuplicates: true,
      });
    }

    if (uniqueColors.length > 0) {
      await tx.productMaster.createMany({
        data: uniqueColors.map((c) => ({
          companyId: req.auth.companyId,
          type: "COLOR",
          name: c.name.trim(),
          status: normalizeStatus(c.status) ?? true,
          categoryId: newCategory.id,
        })),
        skipDuplicates: true,
      });
    }

    if (uniqueSizes.length > 0) {
      await tx.productMaster.createMany({
        data: uniqueSizes.map((s) => ({
          companyId: req.auth.companyId,
          type: "SIZE",
          name: s.name.trim(),
          status: normalizeStatus(s.status) ?? true,
          categoryId: newCategory.id,
        })),
        skipDuplicates: true,
      });
    }

    const validBrandIds = (Array.isArray(brandIds) ? brandIds : [brandIds]).filter((id) => !Number.isNaN(parseInt(id, 10))).map((id) => parseInt(id, 10));
    const validColorIds = (Array.isArray(colorIds) ? colorIds : [colorIds]).filter((id) => !Number.isNaN(parseInt(id, 10))).map((id) => parseInt(id, 10));
    const validSizeIds = (Array.isArray(sizeIds) ? sizeIds : [sizeIds]).filter((id) => !Number.isNaN(parseInt(id, 10))).map((id) => parseInt(id, 10));

    if (validBrandIds.length > 0) {
      await tx.productMaster.updateMany({
        where: { id: { in: validBrandIds }, companyId: req.auth.companyId, type: "BRAND" },
        data: { categoryId: newCategory.id },
      });
    }
    if (validColorIds.length > 0) {
      await tx.productMaster.updateMany({
        where: { id: { in: validColorIds }, companyId: req.auth.companyId, type: "COLOR" },
        data: { categoryId: newCategory.id },
      });
    }
    if (validSizeIds.length > 0) {
      await tx.productMaster.updateMany({
        where: { id: { in: validSizeIds }, companyId: req.auth.companyId, type: "SIZE" },
        data: { categoryId: newCategory.id },
      });
    }

    const related = await tx.productMaster.findMany({
      where: { companyId: req.auth.companyId, categoryId: newCategory.id },
      select: PUBLIC_MASTER_FIELDS,
    });

    return {
      ...newCategory,
      brands: related.filter((m) => m.type === "BRAND"),
      colors: related.filter((m) => m.type === "COLOR"),
      sizes: related.filter((m) => m.type === "SIZE"),
    };
  });

  return res.status(201).json({ message: "Category created successfully.", category });
};

exports.updateCategory = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid category id.");

  const existing = await prisma.productMaster.findFirst({
    where: { id, companyId: req.auth.companyId, type: "CATEGORY" },
    select: PUBLIC_MASTER_FIELDS,
  });
  if (!existing) throw new AppError(404, "Category not found.");

  const { name, status, unit, quantity, purchaseAmount, saleAmount, brands = [], colors = [], sizes = [], brandIds = [], colorIds = [], sizeIds = [] } = req.body;

  if (!name || !String(name).trim()) {
    throw new AppError(400, "Category name is required.");
  }
  const normalizedStatus = normalizeStatus(status);
  if (normalizedStatus === null) throw new AppError(400, "Status must be ACTIVE or INACTIVE.");

  const normalizedUnit = unit && ["PIECES", "DOZEN"].includes(unit.toUpperCase()) ? unit.toUpperCase() : existing.unit || "PIECES";

  const trimmedName = name.trim();
  if (trimmedName !== existing.name) {
    const duplicate = await prisma.productMaster.findFirst({
      where: { companyId: req.auth.companyId, type: "CATEGORY", name: trimmedName, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppError(409, `A category with the name "${trimmedName}" already exists in this company.`);
    }
  }

  const normalizedBrands = Array.isArray(brands)
    ? brands.map((b) => (typeof b === "string" ? { name: b } : b))
    : [];
  const normalizedColors = Array.isArray(colors)
    ? colors.map((c) => (typeof c === "string" ? { name: c } : c))
    : [];
  const normalizedSizes = Array.isArray(sizes)
    ? sizes.map((s) => (typeof s === "string" ? { name: s } : s))
    : [];

  normalizedBrands.forEach((b, i) => validateNestedMaster(b, i, "Brand"));
  normalizedColors.forEach((c, i) => validateNestedMaster(c, i, "Color"));
  normalizedSizes.forEach((s, i) => validateNestedMaster(s, i, "Size"));

  const updatedCategory = await prisma.$transaction(async (tx) => {
    await tx.productMaster.update({
      where: { id },
      data: {
        name: name.trim(),
        status: normalizedStatus,
        unit: normalizedUnit,
        quantity: quantity ? parseInt(quantity, 10) : null,
        purchaseAmount: purchaseAmount ? Number(purchaseAmount) : null,
        saleAmount: saleAmount ? Number(saleAmount) : null,
      },
    });

    const existingBrands = await tx.productMaster.findMany({
      where: { companyId: req.auth.companyId, categoryId: id, type: "BRAND" },
      select: { id: true, name: true },
    });
    const existingColors = await tx.productMaster.findMany({
      where: { companyId: req.auth.companyId, categoryId: id, type: "COLOR" },
      select: { id: true, name: true },
    });
    const existingSizes = await tx.productMaster.findMany({
      where: { companyId: req.auth.companyId, categoryId: id, type: "SIZE" },
      select: { id: true, name: true },
    });

    const brandNames = normalizedBrands.map((b) => b.name.trim());
    const colorNames = normalizedColors.map((c) => c.name.trim());
    const sizeNames = normalizedSizes.map((s) => s.name.trim());

    const brandsToDelete = existingBrands.filter((b) => !brandNames.includes(b.name));
    const colorsToDelete = existingColors.filter((c) => !colorNames.includes(c.name));
    const sizesToDelete = existingSizes.filter((s) => !sizeNames.includes(s.name));

    if (brandsToDelete.length > 0) {
      await tx.productMaster.deleteMany({
        where: { id: { in: brandsToDelete.map((b) => b.id) } },
      });
    }
    if (colorsToDelete.length > 0) {
      await tx.productMaster.deleteMany({
        where: { id: { in: colorsToDelete.map((c) => c.id) } },
      });
    }
    if (sizesToDelete.length > 0) {
      await tx.productMaster.deleteMany({
        where: { id: { in: sizesToDelete.map((s) => s.id) } },
      });
    }

    const brandsToCreate = normalizedBrands.filter((b) => !existingBrands.some((eb) => eb.name === b.name.trim()));
    const colorsToCreate = normalizedColors.filter((c) => !existingColors.some((ec) => ec.name === c.name.trim()));
    const sizesToCreate = normalizedSizes.filter((s) => !existingSizes.some((es) => es.name === s.name.trim()));

    if (brandsToCreate.length > 0) {
      await tx.productMaster.createMany({
        data: brandsToCreate.map((b) => ({
          companyId: req.auth.companyId,
          type: "BRAND",
          name: b.name.trim(),
          status: normalizeStatus(b.status) ?? true,
          categoryId: id,
        })),
        skipDuplicates: true,
      });
    }
    if (colorsToCreate.length > 0) {
      await tx.productMaster.createMany({
        data: colorsToCreate.map((c) => ({
          companyId: req.auth.companyId,
          type: "COLOR",
          name: c.name.trim(),
          status: normalizeStatus(c.status) ?? true,
          categoryId: id,
        })),
        skipDuplicates: true,
      });
    }
    if (sizesToCreate.length > 0) {
      await tx.productMaster.createMany({
        data: sizesToCreate.map((s) => ({
          companyId: req.auth.companyId,
          type: "SIZE",
          name: s.name.trim(),
          status: normalizeStatus(s.status) ?? true,
          categoryId: id,
        })),
        skipDuplicates: true,
      });
    }

    const validBrandIds = (Array.isArray(brandIds) ? brandIds : [brandIds]).filter((id) => !Number.isNaN(parseInt(id, 10))).map((id) => parseInt(id, 10));
    const validColorIds = (Array.isArray(colorIds) ? colorIds : [colorIds]).filter((id) => !Number.isNaN(parseInt(id, 10))).map((id) => parseInt(id, 10));
    const validSizeIds = (Array.isArray(sizeIds) ? sizeIds : [sizeIds]).filter((id) => !Number.isNaN(parseInt(id, 10))).map((id) => parseInt(id, 10));

    if (validBrandIds.length > 0) {
      await tx.productMaster.updateMany({
        where: { id: { in: validBrandIds }, companyId: req.auth.companyId, type: "BRAND" },
        data: { categoryId: id },
      });
    }
    if (validColorIds.length > 0) {
      await tx.productMaster.updateMany({
        where: { id: { in: validColorIds }, companyId: req.auth.companyId, type: "COLOR" },
        data: { categoryId: id },
      });
    }
    if (validSizeIds.length > 0) {
      await tx.productMaster.updateMany({
        where: { id: { in: validSizeIds }, companyId: req.auth.companyId, type: "SIZE" },
        data: { categoryId: id },
      });
    }

    const related = await tx.productMaster.findMany({
      where: { companyId: req.auth.companyId, categoryId: id },
      select: PUBLIC_MASTER_FIELDS,
    });

    return {
      ...existing,
      name: name.trim(),
      status: normalizedStatus,
      unit: normalizedUnit,
      quantity: quantity ? parseInt(quantity, 10) : null,
      purchaseAmount: purchaseAmount ? Number(purchaseAmount) : null,
      saleAmount: saleAmount ? Number(saleAmount) : null,
      brands: related.filter((m) => m.type === "BRAND"),
      colors: related.filter((m) => m.type === "COLOR"),
      sizes: related.filter((m) => m.type === "SIZE"),
    };
  });

  return res.json({ message: "Category updated successfully.", category: updatedCategory });
};

exports.deleteCategory = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new AppError(400, "Invalid category id.");

  const existing = await prisma.productMaster.findFirst({
    where: { id, companyId: req.auth.companyId, type: "CATEGORY" },
    select: { id: true, companyId: true },
  });
  if (!existing) throw new AppError(404, "Category not found.");

  const productCount = await prisma.product.count({
    where: { companyId: req.auth.companyId, categoryId: id },
  });

  if (productCount > 0) {
    throw new AppError(409, "This category is in use by products and cannot be deleted. Remove the products first or set them to inactive.");
  }

  await prisma.productMaster.deleteMany({
    where: { companyId: req.auth.companyId, categoryId: id },
  });

  await prisma.productMaster.delete({ where: { id } });
  return res.json({ message: "Category deleted successfully." });
};