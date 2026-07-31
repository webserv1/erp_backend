const fs = require("fs");
const path = require("path");
const multer = require("multer");
const AppError = require("../utils/app-error");

const uploadRoot = path.join(__dirname, "..", "uploads");
const photoDirectory = path.join(uploadRoot, "photos");
const signatureDirectory = path.join(uploadRoot, "signatures");
const documentDirectory = path.join(uploadRoot, "documents");
const productDirectory = path.join(uploadRoot, "products");

[photoDirectory, signatureDirectory, documentDirectory, productDirectory].forEach((directory) => {
  fs.mkdirSync(directory, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    const directory = file.fieldname === "photo"
      ? photoDirectory
      : file.fieldname === "signature"
        ? signatureDirectory
        : file.fieldname === "productImage"
          ? productDirectory
          : documentDirectory;
    callback(null, directory);
  },
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      return callback(new AppError(400, `${file.fieldname} must be an image file.`));
    }

    return callback(null, true);
  },
});

module.exports = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "signature", maxCount: 1 },
  { name: "pan", maxCount: 1 },
  { name: "aadhaar", maxCount: 1 },
  { name: "productImage", maxCount: 1 },
]);
