const express = require("express");
const purchase = require("../controllers/purchase.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(purchase.getAll));
router.get("/:id", requireAuth, asyncHandler(purchase.getById));
router.post("/", requireAuth, authorizeRoles("ADMIN"), asyncHandler(purchase.create));
router.put("/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(purchase.update));
router.delete("/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(purchase.remove));

module.exports = router;