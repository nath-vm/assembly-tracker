const express      = require("express");
const mongoose     = require("mongoose");
const cors         = require("cors");
const dotenv       = require("dotenv");
const helmet       = require("helmet");
const rateLimit    = require("express-rate-limit");
const morgan       = require("morgan");

dotenv.config();

// ─── Startup guard — fail fast if critical secrets are missing ─────────────────
if (!process.env.JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET environment variable is not set. Refusing to start.");
  process.exit(1);
}

const app = express();

// ─── Trust Render's reverse proxy ─────────────────────────────────────────────
// Without this, express-rate-limit sees every request coming from the same
// proxy IP and will throttle ALL users simultaneously after 10 requests.
app.set("trust proxy", 1);

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ─── Request Logging ─────────────────────────────────────────────────────────
// Use 'combined' in production for full Apache-style logs; 'dev' locally.
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ─── Middleware with size limits ──────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ─── CORS ─────────────────────────────────────────────────────────────────────
// ALLOWED_ORIGINS env var lets you add Vercel preview URLs without code changes.
// Set it in Render dashboard as a comma-separated list, e.g.:
//   http://localhost:3000,https://assemblies-log.vercel.app
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3000", "https://assemblies-log.vercel.app"];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// ─── Rate Limiting (login only) ───────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: "Too many login attempts. Please try again in 15 minutes." }
});

// ─── Login gate middleware ─────────────────────────────────────────────────────
const AppConfig = require("./models/AppConfig");

async function loginGate(req, res, next) {
  try {
    const cfg = await AppConfig.findOne({ key: "main" });
    if (cfg && cfg.loginEnabled === false) {
      return res.status(403).json({ error: "Login is currently disabled by the administrator." });
    }
    next();
  } catch {
    next();
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────
const assemblyRoutes  = require("./routes/assemblyRoutes");
const categoryRoutes  = require("./routes/categoryRoutes");
const materialRoutes  = require("./routes/materialRoutes");
const bomRoutes       = require("./routes/bomRoutes");
const settingsRoutes  = require("./routes/settingsRoutes");
const { router: authRouter } = require("./auth");

app.use("/assemblies",   assemblyRoutes);
app.use("/categories",   categoryRoutes);
app.use("/materials",    materialRoutes);
app.use("/bom",          bomRoutes);
app.use("/api/settings", settingsRoutes);

app.use("/auth/login", loginLimiter, loginGate);
app.use("/auth",       authRouter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/ping", (req, res) => res.json({ status: "ok" }));

// ─── Database ─────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// ─── Multer error handler (must be before global error handler) ───────────────
// Without this, file-type/size errors return a generic 500 instead of a clear message.
app.use((err, req, res, next) => {
  if (err.name === "MulterError" || err.message?.includes("Invalid file type")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Server ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
