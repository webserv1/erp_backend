const express = require("express");
const companyProfile = require("../controllers/company-profile.controller");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(companyProfile.getCompanyProfile));

module.exports = router;