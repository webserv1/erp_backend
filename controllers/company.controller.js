const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { pipeline } = require("stream");
const { promisify } = require("util");
const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");

const BRANDING_DIRECTORY = path.join(__dirname, "..", "uploads", "branding");
const streamPipeline = promisify(pipeline);

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

const readDatabaseConfig = () => {
  const dbHost = process.env.DB_HOST;
  const dbPort = process.env.DB_PORT;
  const dbUser = process.env.DB_USER;
  const dbPassword = process.env.DB_PASSWORD;
  const dbName = process.env.DB_NAME;
  const dbSslMode = process.env.DB_SSLMODE || process.env.PGSSLMODE;

  if (dbHost && dbPort && dbUser && dbPassword && dbName) {
    return {
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      sslmode: dbSslMode || null,
    };
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new AppError(500, "Database connection env is missing. Configure DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME or DATABASE_URL.");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new AppError(500, "DATABASE_URL is invalid.");
  }

  const dbNameFromUrl = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!dbNameFromUrl) {
    throw new AppError(500, "DATABASE_URL must include a database name.");
  }

  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    user: decodeURIComponent(parsed.username || ""),
    password: decodeURIComponent(parsed.password || ""),
    database: dbNameFromUrl,
    sslmode: parsed.searchParams.get("sslmode") || dbSslMode || null,
  };
};

const runPgDumpToFile = (databaseConfig, outputFilePath) =>
  new Promise((resolve, reject) => {
    const args = [
      "--file",
      outputFilePath,
      "--format=plain",
      "--no-owner",
      "--no-privileges",
      "--encoding=UTF8",
      "--host",
      databaseConfig.host,
      "--port",
      databaseConfig.port,
      "--username",
      databaseConfig.user,
      databaseConfig.database,
    ];

    if (databaseConfig.sslmode) {
      args.push("--sslmode", databaseConfig.sslmode);
    }

    const env = { ...process.env };
    if (databaseConfig.password) {
      env.PGPASSWORD = databaseConfig.password;
    }

    const pgDump = spawn("pg_dump", args, { env });
    let stderr = "";

    pgDump.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    pgDump.on("error", (error) => {
      if (error.code === "ENOENT") {
        reject(new AppError(500, "pg_dump is not available on the server. Install PostgreSQL client tools and ensure pg_dump is in PATH."));
        return;
      }
      reject(error);
    });

    pgDump.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const details = stderr.trim();
      reject(new AppError(500, details ? `Database backup failed: ${details}` : "Database backup failed while running pg_dump."));
    });
  });

exports.downloadCompanyBackup = async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.auth.companyId },
    select: { id: true, name: true },
  });
  if (!company) {
    throw new AppError(404, "Company not found.");
  }

  const dbConfig = readDatabaseConfig();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeCompanyName = company.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const baseName = `erp_backup_${safeCompanyName}_${timestamp}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-db-backup-"));
  const sqlFilePath = path.join(tempDir, `${baseName}.sql`);
  const downloadFileName = `${baseName}.sql`;

  try {
    await runPgDumpToFile(dbConfig, sqlFilePath);

    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadFileName}"`);
    await streamPipeline(fs.createReadStream(sqlFilePath), res);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (!res.headersSent) {
      throw new AppError(500, "Failed to generate database backup.");
    }
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
};