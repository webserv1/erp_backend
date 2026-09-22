const fs = require("fs");
const path = require("path");

const uploadRoot = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, "..", "uploads");

const directories = {
  root: uploadRoot,
  photos: path.join(uploadRoot, "photos"),
  signatures: path.join(uploadRoot, "signatures"),
  documents: path.join(uploadRoot, "documents"),
  products: path.join(uploadRoot, "products"),
  branding: path.join(uploadRoot, "branding"),
  expenses: path.join(uploadRoot, "expenses"),
};

Object.values(directories).forEach((directory) => {
  fs.mkdirSync(directory, { recursive: true });
});

const resolveUploadPath = (fileUrlPath) => {
  if (!fileUrlPath || typeof fileUrlPath !== "string" || !fileUrlPath.startsWith("/uploads/")) {
    return null;
  }
  return path.join(uploadRoot, fileUrlPath.replace("/uploads/", ""));
};

module.exports = {
  ...directories,
  resolveUploadPath,
};
