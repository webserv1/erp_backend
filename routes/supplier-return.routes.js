const express = require("express");
const supplierReturn = require("../controllers/supplier-return.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/purchases", requireAuth, asyncHandler(supplierReturn.getPurchaseOptions));
router.get("/purchases/:purchaseNumber", requireAuth, asyncHandler(supplierReturn.getPurchaseDetails));
router.get("/product-codes", requireAuth, asyncHandler(supplierReturn.getProductCodeOptions));
router.get("/product-codes/:productCode", requireAuth, asyncHandler(supplierReturn.getProductCodeDetails));
router.get("/", requireAuth, asyncHandler(supplierReturn.getAll));
router.get("/:id", requireAuth, asyncHandler(supplierReturn.getById));
router.post("/", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(supplierReturn.create));
router.put("/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(supplierReturn.update));
router.delete("/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(supplierReturn.remove));

module.exports = router;
