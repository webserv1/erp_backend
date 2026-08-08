const express = require("express");
const expense = require("../controllers/expense.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");
const upload = require("../middleware/upload");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(expense.getAll));
router.get("/summary", requireAuth, asyncHandler(expense.getSummary));
router.get("/:id", requireAuth, asyncHandler(expense.getById));
router.post("/", requireAuth, authorizeRoles("ADMIN"), upload, asyncHandler(expense.create));
router.put("/:id", requireAuth, authorizeRoles("ADMIN"), upload, asyncHandler(expense.update));
router.delete("/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(expense.remove));

module.exports = router;