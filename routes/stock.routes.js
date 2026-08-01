const express = require("express");
const stock = require("../controllers/stock.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(stock.getAll));
router.get("/:id", requireAuth, asyncHandler(stock.getById));
router.post("/", requireAuth, authorizeRoles("ADMIN"), asyncHandler(stock.create));
router.put("/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(stock.update));
router.delete("/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(stock.remove));

module.exports = router;