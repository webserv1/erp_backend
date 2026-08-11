const express = require("express");
const supplier = require("../controllers/supplier.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(supplier.getAll));
router.get("/:id", requireAuth, asyncHandler(supplier.getById));
router.post("/", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(supplier.create));
router.put("/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(supplier.update));
router.delete("/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(supplier.remove));

module.exports = router;
