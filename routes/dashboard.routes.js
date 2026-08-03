const express = require("express");
const dashboard = require("../controllers/dashboard.controller");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(dashboard.getDashboard));

module.exports = router;