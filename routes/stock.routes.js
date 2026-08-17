const express = require("express");
const stock = require("../controllers/stock.controller");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(stock.getAll));
router.get("/:id", requireAuth, asyncHandler(stock.getById));

module.exports = router;
