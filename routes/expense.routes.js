const express = require("express");
const expense = require("../controllers/expense.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");
const upload = require("../middleware/upload");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(expense.getAll));
router.get("/summary", requireAuth, authorizeRoles("ADMIN"), asyncHandler(expense.getSummary));
router.get(
  "/profit-withdrawals",
  requireAuth,
  authorizeRoles("ADMIN"),
  asyncHandler(expense.getProfitWithdrawals),
);
router.post(
  "/profit-withdrawals",
  requireAuth,
  authorizeRoles("ADMIN"),
  asyncHandler(expense.createProfitWithdrawal),
);
router.put(
  "/profit-withdrawals/:id",
  requireAuth,
  authorizeRoles("ADMIN"),
  asyncHandler(expense.updateProfitWithdrawal),
);
router.delete(
  "/profit-withdrawals/:id",
  requireAuth,
  authorizeRoles("ADMIN"),
  asyncHandler(expense.deleteProfitWithdrawal),
);
router.get("/salary-entries", requireAuth, authorizeRoles("ADMIN"), asyncHandler(expense.getSalaryEntries));
router.post("/salary-entries", requireAuth, authorizeRoles("ADMIN"), asyncHandler(expense.createSalaryEntry));
router.put("/salary-entries/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(expense.updateSalaryEntry));
router.delete(
  "/salary-entries/:id",
  requireAuth,
  authorizeRoles("ADMIN"),
  asyncHandler(expense.deleteSalaryEntry),
);
router.get("/:id", requireAuth, asyncHandler(expense.getById));
router.post("/", requireAuth, authorizeRoles("ADMIN", "MANAGER"), upload, asyncHandler(expense.create));
router.put("/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), upload, asyncHandler(expense.update));
router.delete("/:id", requireAuth, authorizeRoles("ADMIN", "MANAGER"), asyncHandler(expense.remove));

module.exports = router;
