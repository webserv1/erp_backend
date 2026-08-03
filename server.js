const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const path = require("path");
const pool = require("./config/db");
const prisma = require("./lib/prisma");
const authRoutes = require("./routes/auth.routes");
const productMasterRoutes = require("./routes/product-master.routes");
const productRoutes = require("./routes/product.routes");
const partyRoutes = require("./routes/party.routes");
const supplierRoutes = require("./routes/supplier.routes");
const purchaseRoutes = require("./routes/purchase.routes");
const salesRoutes = require("./routes/sales.routes");
const stockRoutes = require("./routes/stock.routes");
const companyRoutes = require("./routes/company.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const AppError = require("./utils/app-error");

dotenv.config();

if (!process.env.JWT_SECRET || !process.env.SESSION_SECRET) {
  throw new Error("JWT_SECRET and SESSION_SECRET must be configured in .env before starting the server.");
}

const app = express();
const PgSession = connectPgSimple(session);
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) app.set("trust proxy", 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    store: new PgSession({ pool, tableName: "session", createTableIfMissing: false }),
    name: "erp.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", async (req, res, next) => {
  try {
    const result = await prisma.$queryRaw`SELECT NOW() AS time`;
    res.json({ message: "Server is running", time: result[0] });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/product-masters", productMasterRoutes);
app.use("/api/products", productRoutes);
app.use("/api/parties", partyRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use((req, res, next) => next(new AppError(404, "Route not found.")));

app.use((error, req, res, next) => {
  if (error.name === "MulterError") {
    return res.status(400).json({ message: error.message });
  }

  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(error);
  return res.status(statusCode).json({
    message: statusCode === 500 ? "An unexpected server error occurred." : error.message,
    ...(error.details ? { details: error.details } : {}),
  });
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Server running on port ${port}`));

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
