const express = require("express");
const product = require("../controllers/product.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");
const upload = require("../middleware/upload");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(product.getAll));
router.get("/:id", requireAuth, asyncHandler(product.getById));
router.post("/", requireAuth, authorizeRoles("ADMIN"), upload, asyncHandler(product.create));
router.put("/:id", requireAuth, authorizeRoles("ADMIN"), upload, asyncHandler(product.update));
router.delete("/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(product.remove));

module.exports = router;