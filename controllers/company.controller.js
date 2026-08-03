const fs = require("fs");
const path = require("path");
const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");

const BRANDING_DIRECTORY = path.join(__dirname, "..", "uploads", "branding");

const VALID_HEX_COLOR = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

const PUBLIC_BRANDING_FIELDS = {
  id: true,
  companyId: true,
  logoUrl: true,
  bgImageUrl: true,
  faviconUrl: true,
  primaryColor: true,
  secondaryColor: true,
  accentColor: true,
  createdAt: true,
  updatedAt: true,
};

const deleteFileIfExists = (filePath) => {
  if (!filePath) return;
  const absolutePath = path.join(__dirname, "..", filePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

const validateColor = (color, fieldName) => {
  if (color === undefined || color === null || color === "") return;
  if (!VALID_HEX_COLOR.test(color)) {
    throw new AppError(400, `${fieldName} must be a valid hex color (e.g., #FFF, #RRGGBB, #RRGGBBAA).`);
  }
};

exports.getBranding = async (req, res) => {
  const branding = await prisma.companyBranding.findUnique({
    where: { companyId: req.auth.companyId },
    select: PUBLIC_BRANDING_FIELDS,
  });

  if (!branding) {
    return res.json({ branding: null });
  }

  return res.json({ branding });
};

exports.upsertBranding = async (req, res) => {
  const { primaryColor, secondaryColor, accentColor } = req.body;

  validateColor(primaryColor, "primaryColor");
  validateColor(secondaryColor, "secondaryColor");
  validateColor(accentColor, "accentColor");

  const existing = await prisma.companyBranding.findUnique({
    where: { companyId: req.auth.companyId },
    select: { id: true, logoUrl: true, bgImageUrl: true, faviconUrl: true },
  });

  const logoFile = req.files?.logo?.[0];
  const backgroundFile = req.files?.background?.[0];
  const faviconFile = req.files?.favicon?.[0];

  if (existing) {
    if (logoFile) {
      deleteFileIfExists(existing.logoUrl);
    }
    if (backgroundFile) {
      deleteFileIfExists(existing.bgImageUrl);
    }
    if (faviconFile) {
      deleteFileIfExists(existing.faviconUrl);
    }
  }

  const data = {
    companyId: req.auth.companyId,
    logoUrl: logoFile ? `/uploads/branding/${logoFile.filename}` : undefined,
    bgImageUrl: backgroundFile ? `/uploads/branding/${backgroundFile.filename}` : undefined,
    faviconUrl: faviconFile ? `/uploads/branding/${faviconFile.filename}` : undefined,
    primaryColor: primaryColor || undefined,
    secondaryColor: secondaryColor || undefined,
    accentColor: accentColor || undefined,
  };

  const branding = await prisma.companyBranding.upsert({
    where: { companyId: req.auth.companyId },
    create: data,
    update: data,
    select: PUBLIC_BRANDING_FIELDS,
  });

  return res.json({ message: existing ? "Branding updated successfully." : "Branding created successfully.", branding });
};

exports.deleteLogo = async (req, res) => {
  const branding = await prisma.companyBranding.findUnique({
    where: { companyId: req.auth.companyId },
    select: { id: true, logoUrl: true },
  });
  if (!branding) throw new AppError(404, "Branding not found.");
  if (!branding.logoUrl) throw new AppError(400, "No logo to delete.");

  deleteFileIfExists(branding.logoUrl);

  await prisma.companyBranding.update({
    where: { id: branding.id },
    data: { logoUrl: null },
  });

  return res.json({ message: "Logo deleted successfully." });
};

exports.deleteBackground = async (req, res) => {
  const branding = await prisma.companyBranding.findUnique({
    where: { companyId: req.auth.companyId },
    select: { id: true, bgImageUrl: true },
  });
  if (!branding) throw new AppError(404, "Branding not found.");
  if (!branding.bgImageUrl) throw new AppError(400, "No background image to delete.");

  deleteFileIfExists(branding.bgImageUrl);

  await prisma.companyBranding.update({
    where: { id: branding.id },
    data: { bgImageUrl: null },
  });

  return res.json({ message: "Background image deleted successfully." });
};

exports.deleteFavicon = async (req, res) => {
  const branding = await prisma.companyBranding.findUnique({
    where: { companyId: req.auth.companyId },
    select: { id: true, faviconUrl: true },
  });
  if (!branding) throw new AppError(404, "Branding not found.");
  if (!branding.faviconUrl) throw new AppError(400, "No favicon to delete.");

  deleteFileIfExists(branding.faviconUrl);

  await prisma.companyBranding.update({
    where: { id: branding.id },
    data: { faviconUrl: null },
  });

  return res.json({ message: "Favicon deleted successfully." });
};