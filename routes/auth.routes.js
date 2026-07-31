const express = require("express");
const rateLimit = require("express-rate-limit");
const auth = require("../controllers/auth.controller");
const upload = require("../middleware/upload");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again in 15 minutes." },
});


router.post("/register", upload, asyncHandler(auth.register));
router.post("/login", loginLimiter, asyncHandler(auth.login));
router.get("/me", requireAuth, asyncHandler(auth.me));
router.post("/users", requireAuth, authorizeRoles("ADMIN"), upload, asyncHandler(auth.createCompanyUser));
router.post("/logout", auth.logout);

module.exports = router;
