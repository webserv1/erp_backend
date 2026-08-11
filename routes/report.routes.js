const express = require("express");
const report = require("../controllers/report.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.post("/generate", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(report.generateReport));
router.get("/", requireAuth, asyncHandler(report.getAll));
router.get("/:id", requireAuth, asyncHandler(report.getById));

module.exports = router;
