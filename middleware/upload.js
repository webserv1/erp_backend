const multer = require("multer");
const AppError = require("../utils/app-error");
const path = require("path");
const uploadDirectories = require("../config/upload-paths");

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    const directory = file.fieldname === "photo"
      ? uploadDirectories.photos
      : file.fieldname === "signature"
        ? uploadDirectories.signatures
        : file.fieldname === "productImage"
          ? uploadDirectories.products
          : file.fieldname === "logo" || file.fieldname === "background" || file.fieldname === "favicon"
            ? uploadDirectories.branding
            : file.fieldname === "bill"
              ? uploadDirectories.expenses
              : uploadDirectories.documents;
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
  { name: "logo", maxCount: 1 },
  { name: "background", maxCount: 1 },
  { name: "favicon", maxCount: 1 },
  { name: "bill", maxCount: 1 },
]);
