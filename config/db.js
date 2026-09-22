const { Pool } = require("pg");

require("dotenv").config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({
  connectionString,
});

module.exports = pool;