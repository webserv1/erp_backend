-- Seed required application roles
INSERT INTO "Role" ("name")
VALUES
  ('ADMIN'),
  ('MANAGER'),
  ('WORKER')
ON CONFLICT ("name") DO NOTHING;
