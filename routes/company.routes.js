const express = require("express");
const company = require("../controllers/company.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");
const upload = require("../middleware/upload");

const router = express.Router();

router.get("/branding", requireAuth, asyncHandler(company.getBranding));
router.put("/branding", requireAuth, authorizeRoles("ADMIN"), upload, asyncHandler(company.upsertBranding));
router.delete("/branding/logo", requireAuth, authorizeRoles("ADMIN"), asyncHandler(company.deleteLogo));
router.delete("/branding/background", requireAuth, authorizeRoles("ADMIN"), asyncHandler(company.deleteBackground));
router.delete("/branding/favicon", requireAuth, authorizeRoles("ADMIN"), asyncHandler(company.deleteFavicon));

module.exports = router;