const express = require("express");
const party = require("../controllers/party.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(party.getAll));
router.get("/:id", requireAuth, asyncHandler(party.getById));
router.post("/", requireAuth, authorizeRoles("ADMIN"), asyncHandler(party.create));
router.put("/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(party.update));
router.delete("/:id", requireAuth, authorizeRoles("ADMIN"), asyncHandler(party.remove));

module.exports = router;