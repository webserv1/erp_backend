const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const required = (name) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} must be set in .env`);
  }

  return value;
};

const connectionString = `postgresql://${encodeURIComponent(required("DB_USER"))}:${encodeURIComponent(required("DB_PASSWORD"))}@${required("DB_HOST")}:${required("DB_PORT")}/${encodeURIComponent(required("DB_NAME"))}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
