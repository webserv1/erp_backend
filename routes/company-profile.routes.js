const express = require("express");
const companyProfile = require("../controllers/company-profile.controller");
const upload = require("../middleware/upload");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(companyProfile.getCompanyProfile));
router.put("/users/:userId", requireAuth, upload, asyncHandler(companyProfile.updateCompanyUserProfile));
router.delete("/users/:userId", requireAuth, asyncHandler(companyProfile.deleteCompanyUserProfile));

module.exports = router;