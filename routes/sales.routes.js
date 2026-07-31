const express = require("express");
const sales = require("../controllers/sales.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(sales.getAll));
router.get("/:id", requireAuth, asyncHandler(sales.getById));
router.post("/", requireAuth, authorizeRoles("ADMIN"), asyncHandler(sales.create));
router.put("/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(sales.update));
router.delete("/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(sales.remove));

module.exports = router;