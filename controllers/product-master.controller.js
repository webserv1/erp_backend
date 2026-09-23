const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");
const { calculateTotalPurchaseAmount } = require("../utils/productCalculations");

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

const withTotalPurchaseAmount = (master) => ({
  ...master,
  totalPurchaseAmount: calculateTotalPurchaseAmount(master.quantity, master.purchaseAmount, master.unit),
});

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

const attachNestedMasters = async (tx, companyId, categoryId, entries, type) => {
  for (const entry of entries) {
    const name = String(entry.name || "").trim();
    if (!name) continue;

    const existing = await tx.productMaster.findFirst({
      where: { companyId, type, name },
      select: { id: true },
    });

    if (existing) {
      await tx.productMaster.update({
        where: { id: existing.id },
        data: {
          categoryId,
          status: normalizeStatus(entry.status) ?? true,
        },
      });
    } else {
      await tx.productMaster.create({
        data: {
          companyId,
          type,
          name,
          categoryId,
          status: normalizeStatus(entry.status) ?? true,
        },
      });
    }
  }
};

// A master name is unique per company and type. When an existing master is
// selected for another category, re-attach it by updating categoryId.
const copySelectedMastersToCategory = async (tx, companyId, categoryId, masterIds, type) => {
  if (!masterIds.length) return;

  const masters = await tx.productMaster.findMany({
    where: { id: { in: masterIds }, companyId, type },
    select: {
      id: true, name: true, status: true, unit: true,
      quantity: true, purchaseAmount: true, saleAmount: true, categoryId: true,
    },
  });

  for (const master of masters) {
    if (master.categoryId === categoryId) continue;
    await tx.productMaster.update({
      where: { id: master.id },
      data: { categoryId },
    });
  }
};

const countMasterReferencesTx = async (tx, companyId, masterId) => {
  const [products, sales, stock] = await Promise.all([
    tx.product.count({
      where: {
        companyId,
        OR: [
          { brandId: masterId },
          { colorId: masterId },
          { sizeId: masterId },
          { brandIds: { hasSome: [masterId] } },
          { colorIds: { hasSome: [masterId] } },
          { sizeIds: { hasSome: [masterId] } },
        ],
      },
    }),
    tx.sale.count({
      where: {
        companyId,
        OR: [
          { brandId: masterId },
          { colorId: masterId },
          { sizeId: masterId },
          { selectedBrands: { some: { productMasterId: masterId } } },
          { selectedColors: { some: { productMasterId: masterId } } },
          { selectedSizes: { some: { productMasterId: masterId } } },
        ],
      },
    }),
    tx.stock.count({ where: { companyId, sizeId: masterId } }),
  ]);
  return { products, sales, stock };
};

const detachOrDeleteNestedMasters = async (tx, companyId, masters) => {
  for (const master of masters) {
    const refs = await countMasterReferencesTx(tx, companyId, master.id);
    if (!refs.products && !refs.sales && !refs.stock) {
      await tx.productMaster.delete({ where: { id: master.id } });
      continue;
    }
    try {
      await tx.productMaster.update({
        where: { id: master.id },
        data: { categoryId: null },
      });
    } catch (error) {
      if (error.code === "P2002") {
        throw new AppError(
          409,
          `Cannot detach ${master.type.toLowerCase()} "${master.name}" because another ${master.type.toLowerCase()} with the same name already exists. Rename it or remove old references first.`,
        );
      }
      throw error;
    }
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

  return res.json({ masters: masters.map(withTotalPurchaseAmount) });
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
    return res.status(201).json({ message: `${type} created successfully.`, master: withTotalPurchaseAmount(master) });
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

  return res.json({ message: `${type} updated successfully.`, master: withTotalPurchaseAmount(master) });
};

const countMasterReferences = async (companyId, masterIds) => {
  if (!masterIds.length) return { products: 0, sales: 0, stock: 0 };

  const [products, sales, stock] = await Promise.all([
    prisma.product.count({
      where: {
        companyId,
        OR: [
          { brandId: { in: masterIds } },
          { colorId: { in: masterIds } },
          { sizeId: { in: masterIds } },
          { brandIds: { hasSome: masterIds } },
          { colorIds: { hasSome: masterIds } },
          { sizeIds: { hasSome: masterIds } },
        ],
      },
    }),
    prisma.sale.count({
      where: {
        companyId,
        OR: [
          { brandId: { in: masterIds } },
          { colorId: { in: masterIds } },
          { sizeId: { in: masterIds } },
          { selectedBrands: { some: { productMasterId: { in: masterIds } } } },
          { selectedColors: { some: { productMasterId: { in: masterIds } } } },
          { selectedSizes: { some: { productMasterId: { in: masterIds } } } },
        ],
      },
    }),
    prisma.stock.count({ where: { companyId, sizeId: { in: masterIds } } }),
  ]);

  return { products, sales, stock };
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

  const references = await countMasterReferences(req.auth.companyId, [id]);
  if (references.products || references.sales || references.stock) {
    throw new AppError(409, `This ${type.toLowerCase()} is in use by ${references.sales ? "sales" : references.products ? "products" : "stock"} and cannot be deleted. Remove the reference first or set this master to inactive.`);
  }

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
    ...withTotalPurchaseAmount(category),
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

  let category;
  try {
    category = await prisma.$transaction(async (tx) => {
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

      await attachNestedMasters(tx, req.auth.companyId, newCategory.id, uniqueBrands, "BRAND");
      await attachNestedMasters(tx, req.auth.companyId, newCategory.id, uniqueColors, "COLOR");
      await attachNestedMasters(tx, req.auth.companyId, newCategory.id, uniqueSizes, "SIZE");

      const validBrandIds = (Array.isArray(brandIds) ? brandIds : [brandIds]).filter((id) => !Number.isNaN(parseInt(id, 10))).map((id) => parseInt(id, 10));
      const validColorIds = (Array.isArray(colorIds) ? colorIds : [colorIds]).filter((id) => !Number.isNaN(parseInt(id, 10))).map((id) => parseInt(id, 10));
      const validSizeIds = (Array.isArray(sizeIds) ? sizeIds : [sizeIds]).filter((id) => !Number.isNaN(parseInt(id, 10))).map((id) => parseInt(id, 10));

      await copySelectedMastersToCategory(tx, req.auth.companyId, newCategory.id, validBrandIds, "BRAND");
      await copySelectedMastersToCategory(tx, req.auth.companyId, newCategory.id, validColorIds, "COLOR");
      await copySelectedMastersToCategory(tx, req.auth.companyId, newCategory.id, validSizeIds, "SIZE");

      const related = await tx.productMaster.findMany({
        where: { companyId: req.auth.companyId, categoryId: newCategory.id },
        select: PUBLIC_MASTER_FIELDS,
      });

      return {
        ...withTotalPurchaseAmount(newCategory),
        brands: related.filter((m) => m.type === "BRAND"),
        colors: related.filter((m) => m.type === "COLOR"),
        sizes: related.filter((m) => m.type === "SIZE"),
      };
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError(409, "One or more selected brand/color/size names already exist and caused a duplicate.");
    }
    throw error;
  }

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
  const hasBrandUpdate =
    Object.prototype.hasOwnProperty.call(req.body, "brands") ||
    Object.prototype.hasOwnProperty.call(req.body, "brandIds");
  const hasColorUpdate =
    Object.prototype.hasOwnProperty.call(req.body, "colors") ||
    Object.prototype.hasOwnProperty.call(req.body, "colorIds");
  const hasSizeUpdate =
    Object.prototype.hasOwnProperty.call(req.body, "sizes") ||
    Object.prototype.hasOwnProperty.call(req.body, "sizeIds");

  let updatedCategory;
  try {
    updatedCategory = await prisma.$transaction(async (tx) => {
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

    const validBrandIds = (Array.isArray(brandIds) ? brandIds : [brandIds]).filter((entry) => !Number.isNaN(parseInt(entry, 10))).map((entry) => parseInt(entry, 10));
    const validColorIds = (Array.isArray(colorIds) ? colorIds : [colorIds]).filter((entry) => !Number.isNaN(parseInt(entry, 10))).map((entry) => parseInt(entry, 10));
    const validSizeIds = (Array.isArray(sizeIds) ? sizeIds : [sizeIds]).filter((entry) => !Number.isNaN(parseInt(entry, 10))).map((entry) => parseInt(entry, 10));

    const brandNames = new Set(normalizedBrands.map((b) => b.name.trim()));
    const colorNames = new Set(normalizedColors.map((c) => c.name.trim()));
    const sizeNames = new Set(normalizedSizes.map((s) => s.name.trim()));
    existingBrands
      .filter((brand) => validBrandIds.includes(brand.id))
      .forEach((brand) => brandNames.add(brand.name));
    existingColors
      .filter((color) => validColorIds.includes(color.id))
      .forEach((color) => colorNames.add(color.name));
    existingSizes
      .filter((size) => validSizeIds.includes(size.id))
      .forEach((size) => sizeNames.add(size.name));

    const brandsToDelete = hasBrandUpdate
      ? existingBrands.filter((brand) => !brandNames.has(brand.name))
      : [];
    const colorsToDelete = hasColorUpdate
      ? existingColors.filter((color) => !colorNames.has(color.name))
      : [];
    const sizesToDelete = hasSizeUpdate
      ? existingSizes.filter((size) => !sizeNames.has(size.name))
      : [];

    if (brandsToDelete.length > 0) {
      await detachOrDeleteNestedMasters(tx, req.auth.companyId, brandsToDelete.map((brand) => ({ ...brand, type: "BRAND" })));
    }
    if (colorsToDelete.length > 0) {
      await detachOrDeleteNestedMasters(tx, req.auth.companyId, colorsToDelete.map((color) => ({ ...color, type: "COLOR" })));
    }
    if (sizesToDelete.length > 0) {
      await detachOrDeleteNestedMasters(tx, req.auth.companyId, sizesToDelete.map((size) => ({ ...size, type: "SIZE" })));
    }

    const brandsToCreate = hasBrandUpdate
      ? normalizedBrands.filter((brand) => !existingBrands.some((existingBrand) => existingBrand.name === brand.name.trim()))
      : [];
    const colorsToCreate = hasColorUpdate
      ? normalizedColors.filter((color) => !existingColors.some((existingColor) => existingColor.name === color.name.trim()))
      : [];
    const sizesToCreate = hasSizeUpdate
      ? normalizedSizes.filter((size) => !existingSizes.some((existingSize) => existingSize.name === size.name.trim()))
      : [];

    await attachNestedMasters(tx, req.auth.companyId, id, brandsToCreate, "BRAND");
    await attachNestedMasters(tx, req.auth.companyId, id, colorsToCreate, "COLOR");
    await attachNestedMasters(tx, req.auth.companyId, id, sizesToCreate, "SIZE");
    if (hasBrandUpdate) {
      await copySelectedMastersToCategory(tx, req.auth.companyId, id, validBrandIds, "BRAND");
    }
    if (hasColorUpdate) {
      await copySelectedMastersToCategory(tx, req.auth.companyId, id, validColorIds, "COLOR");
    }
    if (hasSizeUpdate) {
      await copySelectedMastersToCategory(tx, req.auth.companyId, id, validSizeIds, "SIZE");
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
        totalPurchaseAmount: calculateTotalPurchaseAmount(quantity, purchaseAmount, normalizedUnit),
        saleAmount: saleAmount ? Number(saleAmount) : null,
        brands: related.filter((m) => m.type === "BRAND"),
        colors: related.filter((m) => m.type === "COLOR"),
        sizes: related.filter((m) => m.type === "SIZE"),
      };
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError(409, "One or more selected brand/color/size names already exist and caused a duplicate.");
    }
    throw error;
  }

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

  const childMasters = await prisma.productMaster.findMany({
    where: { companyId: req.auth.companyId, categoryId: id },
    select: { id: true },
  });
  const references = await countMasterReferences(req.auth.companyId, childMasters.map((master) => master.id));
  if (references.products || references.sales || references.stock) {
    throw new AppError(409, `This category cannot be deleted because its brands, colors, or sizes are in use by ${references.sales ? "sales" : references.products ? "products" : "stock"}. Remove the reference first or set the category to inactive.`);
  }

  await prisma.productMaster.deleteMany({
    where: { companyId: req.auth.companyId, categoryId: id },
  });

  await prisma.productMaster.delete({ where: { id } });
  return res.json({ message: "Category deleted successfully." });
};
