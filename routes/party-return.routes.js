const express = require("express");
const partyReturn = require("../controllers/party-return.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/invoices", requireAuth, asyncHandler(partyReturn.getInvoiceOptions));
router.get("/invoices/:invoiceNumber", requireAuth, asyncHandler(partyReturn.getInvoiceDetails));
router.get("/", requireAuth, asyncHandler(partyReturn.getAll));
router.get("/:id", requireAuth, asyncHandler(partyReturn.getById));
router.post("/", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(partyReturn.create));
router.put("/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(partyReturn.update));
router.delete("/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(partyReturn.remove));

module.exports = router;
