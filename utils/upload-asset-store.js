const fs = require("fs");
const prisma = require("../lib/prisma");
const uploadDirectories = require("../config/upload-paths");

const DIRECTORY_BY_FIELD = {
  photo: "photos",
  signature: "signatures",
  pan: "documents",
  aadhaar: "documents",
  productImage: "products",
  logo: "branding",
  background: "branding",
  favicon: "branding",
  bill: "expenses",
};

const buildUrlPath = (fieldName, fileName) => {
  const directory = DIRECTORY_BY_FIELD[fieldName];
  if (!directory) return null;
  return `/uploads/${directory}/${fileName}`;
};

const upsertUploadAsset = async ({ path, mimeType, data }) => {
  await prisma.$executeRaw`
    INSERT INTO "UploadAsset" ("path", "mimeType", "data", "updatedAt")
    VALUES (${path}, ${mimeType}, ${data}, CURRENT_TIMESTAMP)
    ON CONFLICT ("path")
    DO UPDATE SET
      "mimeType" = EXCLUDED."mimeType",
      "data" = EXCLUDED."data",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
};

const persistUploadedFiles = async (files) => {
  const allFiles = Object.values(files || {}).flat();
  for (const file of allFiles) {
    const urlPath = buildUrlPath(file.fieldname, file.filename);
    if (!urlPath || !file.path) continue;
    const content = await fs.promises.readFile(file.path);
    await upsertUploadAsset({ path: urlPath, mimeType: file.mimetype || "application/octet-stream", data: content });
    await fs.promises.unlink(file.path).catch(() => {});
  }
};

const getUploadAsset = async (urlPath) => {
  if (!urlPath || typeof urlPath !== "string") return null;
  const rows = await prisma.$queryRaw`
    SELECT "mimeType", "data"
    FROM "UploadAsset"
    WHERE "path" = ${urlPath}
    LIMIT 1
  `;
  return rows[0] || null;
};

const deleteUploadAsset = async (urlPath) => {
  if (!urlPath || typeof urlPath !== "string") return;
  await prisma.$executeRaw`DELETE FROM "UploadAsset" WHERE "path" = ${urlPath}`;
  const localPath = uploadDirectories.resolveUploadPath(urlPath);
  if (localPath && fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
  }
};

module.exports = {
  persistUploadedFiles,
  getUploadAsset,
  deleteUploadAsset,
};
