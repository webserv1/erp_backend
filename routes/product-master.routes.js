const express = require("express");
const auth = require("../controllers/product-master.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/:type", requireAuth, asyncHandler(auth.getAll));
router.post("/:type", requireAuth, authorizeRoles("ADMIN"), asyncHandler(auth.create));
router.put("/:type/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(auth.update));
router.delete("/:type/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(auth.remove));

module.exports = router;