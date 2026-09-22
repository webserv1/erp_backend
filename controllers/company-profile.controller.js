const prisma = require("../lib/prisma");
const { Gender } = require("@prisma/client");
const AppError = require("../utils/app-error");
const { deleteUploadAsset } = require("../utils/upload-asset-store");

const PROFILE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  mobile: true,
  dateOfBirth: true,
  gender: true,
  address: true,
  photoUrl: true,
  signatureUrl: true,
  panUrl: true,
  aadhaarUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const parseBooleanInput = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return null;
};

exports.getCompanyProfile = async (req, res) => {
  const companyId = req.auth.companyId;

  const [company, roles, currentUser, users] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    }),
    prisma.role.findMany({
      select: { id: true, name: true },
    }),
    prisma.user.findFirst({
      where: { id: req.auth.sub, companyId },
      select: PROFILE_USER_SELECT,
    }),
    prisma.user.findMany({
      where: { companyId },
      select: PROFILE_USER_SELECT,
      orderBy: [{ roleId: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  if (!company) {
    return res.status(404).json({ message: "Company not found." });
  }
  if (!currentUser) {
    return res.status(404).json({ message: "User profile not found." });
  }

  return res.json({
    company: {
      id: company.id,
      name: company.name,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    },
    roles,
    currentUser,
    users,
  });
};

exports.updateCompanyUserProfile = async (req, res) => {
  const companyId = req.auth.companyId;
  const requesterId = req.auth.sub;
  const requesterRole = req.auth.role;
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new AppError(400, "A valid userId is required.");
  }

  const targetUser = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true, role: { select: { name: true } }, photoUrl: true, signatureUrl: true, panUrl: true, aadhaarUrl: true },
  });
  if (!targetUser) {
    throw new AppError(404, "User profile not found.");
  }

  const isSelf = targetUser.id === requesterId;
  if (requesterRole !== "ADMIN" && !isSelf) {
    throw new AppError(403, "You do not have permission to update this profile.");
  }

  const data = {};
  const { body, files } = req;

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new AppError(400, "Name cannot be empty.");
    data.name = name;
  }

  if (body.email !== undefined) {
    const email = normalizeEmail(body.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new AppError(400, "Enter a valid email address.");
    data.email = email;
  }

  if (body.mobile !== undefined) {
    const mobile = String(body.mobile).trim();
    if (!/^\+?[0-9]{7,15}$/.test(mobile)) throw new AppError(400, "Enter a valid mobile number with 7 to 15 digits.");
    data.mobile = mobile;
  }

  if (body.dob !== undefined || body.dateOfBirth !== undefined) {
    const rawDob = body.dob !== undefined ? body.dob : body.dateOfBirth;
    const dob = new Date(rawDob);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) {
      throw new AppError(400, "Enter a valid date of birth in the past.");
    }
    data.dateOfBirth = dob;
  }

  if (body.gender !== undefined) {
    const gender = String(body.gender).trim().toUpperCase();
    if (!Object.values(Gender).includes(gender)) {
      throw new AppError(400, "Gender must be MALE, FEMALE, OTHER, or PREFER_NOT_TO_SAY.");
    }
    data.gender = gender;
  }

  if (body.address !== undefined) {
    const address = String(body.address).trim();
    if (!address) throw new AppError(400, "Address cannot be empty.");
    data.address = address;
  }

  if (body.role !== undefined) {
    if (requesterRole !== "ADMIN") {
      throw new AppError(403, "Only an admin can change roles.");
    }

    const roleName = String(body.role).trim().toUpperCase();
    if (!["ADMIN", "MANAGER", "WORKER"].includes(roleName)) {
      throw new AppError(400, "Role must be ADMIN, MANAGER, or WORKER.");
    }
    if (isSelf && roleName !== targetUser.role.name) {
      throw new AppError(400, "You cannot change your own role.");
    }

    const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
    if (!role) throw new AppError(500, "Default roles are not configured. Run the latest migration.");
    data.roleId = role.id;
  }

  if (body.status !== undefined) {
    if (requesterRole !== "ADMIN") {
      throw new AppError(403, "Only an admin can change status.");
    }

    const parsedStatus = parseBooleanInput(body.status);
    if (parsedStatus === null) throw new AppError(400, "Status must be true or false.");
    if (isSelf && !parsedStatus) {
      throw new AppError(400, "You cannot deactivate your own account.");
    }
    data.status = parsedStatus;
  }

  if (files?.photo?.[0]) {
    await deleteUploadAsset(targetUser.photoUrl);
    data.photoUrl = `/uploads/photos/${files.photo[0].filename}`;
  }
  if (files?.signature?.[0]) {
    await deleteUploadAsset(targetUser.signatureUrl);
    data.signatureUrl = `/uploads/signatures/${files.signature[0].filename}`;
  }
  if (files?.pan?.[0]) {
    await deleteUploadAsset(targetUser.panUrl);
    data.panUrl = `/uploads/documents/${files.pan[0].filename}`;
  }
  if (files?.aadhaar?.[0]) {
    await deleteUploadAsset(targetUser.aadhaarUrl);
    data.aadhaarUrl = `/uploads/documents/${files.aadhaar[0].filename}`;
  }

  if (Object.keys(data).length === 0) {
    throw new AppError(400, "No profile fields were provided for update.");
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: targetUser.id },
      data,
      select: PROFILE_USER_SELECT,
    });
    return res.json({ message: "Profile updated successfully.", user: updatedUser });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError(409, "An account with this email or mobile number already exists in this company.");
    }
    throw error;
  }
};

exports.deleteCompanyUserProfile = async (req, res) => {
  const companyId = req.auth.companyId;
  const requesterId = req.auth.sub;
  const requesterRole = req.auth.role;
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new AppError(400, "A valid userId is required.");
  }
  if (requesterRole !== "ADMIN") {
    throw new AppError(403, "Only an admin can delete user profiles.");
  }
  if (userId === requesterId) {
    throw new AppError(400, "You cannot delete your own profile.");
  }

  const targetUser = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true, name: true, role: { select: { name: true } }, photoUrl: true, signatureUrl: true, panUrl: true, aadhaarUrl: true },
  });
  if (!targetUser) {
    throw new AppError(404, "User profile not found.");
  }
  if (targetUser.role.name === "ADMIN") {
    throw new AppError(400, "Admin profiles cannot be deleted.");
  }

  try {
    await Promise.all([
      deleteUploadAsset(targetUser.photoUrl),
      deleteUploadAsset(targetUser.signatureUrl),
      deleteUploadAsset(targetUser.panUrl),
      deleteUploadAsset(targetUser.aadhaarUrl),
    ]);
    await prisma.user.delete({ where: { id: targetUser.id } });
    return res.json({ message: "User profile deleted successfully." });
  } catch (error) {
    if (error.code === "P2003") {
      throw new AppError(409, "This user has linked records and cannot be deleted. Please reassign or remove dependent records first.");
    }
    throw error;
  }
};