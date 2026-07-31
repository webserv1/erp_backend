const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Gender } = require("@prisma/client");
const prisma = require("../lib/prisma");
const AppError = require("../utils/app-error");

const PUBLIC_USER_FIELDS = {
  id: true,
  companyId: true,
  roleId: true,
  name: true,
  dateOfBirth: true,
  mobile: true,
  email: true,
  gender: true,
  address: true,
  photoUrl: true,
  signatureUrl: true,
  panUrl: true,
  aadhaarUrl: true,
  status: true,
  lastLogin: true,
  createdAt: true,
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const validateUserInput = (body, files, { requireCompanyName = false } = {}) => {
  const required = ["name", "dob", "mobile", "email", "gender", "address", "password", "confirmPassword"];
  if (requireCompanyName) required.unshift("companyName");
  const missing = required.filter((field) => !String(body[field] || "").trim());

  if (missing.length) throw new AppError(400, "Required fields are missing.", { fields: missing });
  if (!/^\S+@\S+\.\S+$/.test(normalizeEmail(body.email))) throw new AppError(400, "Enter a valid email address.");
  if (!/^\+?[0-9]{7,15}$/.test(String(body.mobile).trim())) throw new AppError(400, "Enter a valid mobile number with 7 to 15 digits.");
  if (!Object.values(Gender).includes(body.gender)) throw new AppError(400, "Gender must be MALE, FEMALE, OTHER, or PREFER_NOT_TO_SAY.");
  if (Number.isNaN(new Date(body.dob).getTime()) || new Date(body.dob) > new Date()) throw new AppError(400, "Enter a valid date of birth in the past.");
  if (body.password.length < 8) throw new AppError(400, "Password must contain at least 8 characters.");
  if (body.password !== body.confirmPassword) throw new AppError(400, "Password and confirmPassword do not match.");
  if (!files?.photo?.[0]) throw new AppError(400, "A profile photo is required.");
  if (!files?.signature?.[0]) throw new AppError(400, "A signature image is required.");
  if (!files?.pan?.[0]) throw new AppError(400, "A PAN card image is required.");
  if (!files?.aadhaar?.[0]) throw new AppError(400, "An Aadhaar card image is required.");
};

const userData = (body, files, values) => ({
  ...values,
  name: body.name.trim(),
  dateOfBirth: new Date(body.dob),
  mobile: String(body.mobile).trim(),
  email: normalizeEmail(body.email),
  gender: body.gender,
  address: body.address.trim(),
  photoUrl: `/uploads/photos/${files.photo[0].filename}`,
  signatureUrl: `/uploads/signatures/${files.signature[0].filename}`,
  panUrl: `/uploads/documents/${files.pan[0].filename}`,
  aadhaarUrl: `/uploads/documents/${files.aadhaar[0].filename}`,
});

const issueToken = (user) =>
  jwt.sign(
    { sub: user.id, companyId: user.companyId, role: user.role.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" },
  );

const saveSession = (req, user) =>
  new Promise((resolve, reject) => {
    req.session.user = { id: user.id, companyId: user.companyId, role: user.role.name };
    req.session.save((error) => (error ? reject(error) : resolve()));
  });

exports.register = async (req, res) => {
  validateUserInput(req.body, req.files, { requireCompanyName: true });
  const email = normalizeEmail(req.body.email);
  const passwordHash = await bcrypt.hash(req.body.password, Number(process.env.BCRYPT_ROUNDS || 12));

  try {
    const user = await prisma.$transaction(async (tx) => {
      const adminRole = await tx.role.findUnique({ where: { name: "ADMIN" } });
      if (!adminRole) throw new AppError(500, "Default roles are not configured. Run the latest migration.");

      const company = await tx.company.create({ data: { name: req.body.companyName.trim() } });
      return tx.user.create({
        data: userData(req.body, req.files, { companyId: company.id, roleId: adminRole.id, passwordHash }),
        select: { ...PUBLIC_USER_FIELDS, company: { select: { id: true, name: true } }, role: { select: { id: true, name: true } } },
      });
    });
    return res.status(201).json({ message: "Company and administrator account created successfully.", user });
  } catch (error) {
    if (error.code === "P2002") throw new AppError(409, "An account with this email or mobile number already exists in this company.");
    throw error;
  }
};

exports.login = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  if (!email || !password) throw new AppError(400, "Email and password are required.");

  const user = await prisma.user.findFirst({
    where: { email },
    include: { company: { select: { id: true, name: true, status: true } }, role: { select: { id: true, name: true } } },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new AppError(401, "Invalid email or password.");
  if (!user.status || !user.company.status) throw new AppError(403, "This account is inactive. Contact your administrator.");

  user.lastLogin = new Date();
  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: user.lastLogin } });
  await saveSession(req, user);
  const token = issueToken(user);
  const { passwordHash, ...safeUser } = user;
  return res.status(200).json({ message: "Login successful.", token, user: safeUser });
};

exports.createCompanyUser = async (req, res) => {
  validateUserInput(req.body, req.files);
  const roleName = String(req.body.role || "").toUpperCase();
  if (!["MANAGER", "WORKER"].includes(roleName)) throw new AppError(400, "Role must be MANAGER or WORKER.");

  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) throw new AppError(500, "Default roles are not configured. Run the latest migration.");

  const email = normalizeEmail(req.body.email);
  const passwordHash = await bcrypt.hash(req.body.password, Number(process.env.BCRYPT_ROUNDS || 12));
  try {
    const user = await prisma.user.create({
      data: userData(req.body, req.files, { companyId: req.auth.companyId, roleId: role.id, passwordHash }),
      select: { ...PUBLIC_USER_FIELDS, role: { select: { id: true, name: true } } },
    });
    return res.status(201).json({ message: "User account created successfully.", user });
  } catch (error) {
    if (error.code === "P2002") throw new AppError(409, "An account with this email or mobile number already exists in this company.");
    throw error;
  }
};

exports.me = async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.auth.sub, companyId: req.auth.companyId, status: true },
    select: { ...PUBLIC_USER_FIELDS, company: { select: { id: true, name: true } }, role: { select: { id: true, name: true } } },
  });
  if (!user) throw new AppError(404, "User account was not found.");
  return res.json({ user });
};

exports.logout = (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("erp.sid");
    return res.json({ message: "Logout successful." });
  });
};
