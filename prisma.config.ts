import "dotenv/config";
import { defineConfig } from "prisma/config";

const required = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} must be set in .env`);
  }

  return value;
};

const databaseUrl = `postgresql://${encodeURIComponent(required("DB_USER"))}:${encodeURIComponent(required("DB_PASSWORD"))}@${required("DB_HOST")}:${required("DB_PORT")}/${encodeURIComponent(required("DB_NAME"))}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
