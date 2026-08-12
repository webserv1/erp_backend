const express = require("express");
const auth = require("../controllers/product-master.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/category", requireAuth, asyncHandler(auth.getCategories));
router.post("/category", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(auth.createCategory));
router.put("/category/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(auth.updateCategory));
router.delete("/category/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(auth.deleteCategory));

router.get("/:type", requireAuth, asyncHandler(auth.getAll));
router.post("/:type", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(auth.create));
router.put("/:type/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(auth.update));
router.delete("/:type/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(auth.remove));

module.exports = router;