const prisma = require("../lib/prisma");

exports.getCompanyProfile = async (req, res) => {
  const companyId = req.auth.companyId;

  const [company, roles] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    }),
    prisma.role.findMany({
      select: { id: true, name: true },
    }),
  ]);

  if (!company) {
    return res.status(404).json({ message: "Company not found." });
  }

  return res.json({
    company: {
      id: company.id,
      name: company.name,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    },
    roles,
  });
};