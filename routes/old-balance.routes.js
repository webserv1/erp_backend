const express = require("express");
const oldBalance = require("../controllers/old-balance.controller");
const upload = require("../middleware/upload");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(oldBalance.getAll));
router.get("/:id", requireAuth, asyncHandler(oldBalance.getById));
router.post("/", requireAuth, authorizeRoles("ADMIN", "MANAGER"), upload, asyncHandler(oldBalance.create));
router.put("/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), upload, asyncHandler(oldBalance.update));
router.delete("/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(oldBalance.remove));

module.exports = router;
