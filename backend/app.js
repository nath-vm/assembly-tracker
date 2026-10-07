const express   = require("express");
const cors      = require("cors");
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan    = require("morgan");

const AppConfig = require("./models/AppConfig");
const { router: authRouter } = require("./auth");

const assemblyRoutes = require("./routes/assemblyRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const materialRoutes = require("./routes/materialRoutes");
const bomRoutes      = require("./routes/bomRoutes");
const settingsRoutes = require("./routes/settingsRoutes");

const app = express();

// ─── Trust Render's reverse proxy ─────────────────────────────────────────────
// Lets Express resolve the real client IP (req.ip) so rate limiting and the
// login lockout work per user instead of per proxy.
app.set("trust proxy", 1);

// ─── Security headers + logging ───────────────────────────────────────────────
app.use(helmet());
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

// ─── Body parsing with size limits ────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Set ALLOWED_ORIGINS on Render as a comma-separated list, e.g.
//   https://your-app.vercel.app,http://localhost:3000
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : ["http://localhost:3000"];

app.use(cors({ origin: allowedOrigins, credentials: true }));

// ─── Rate limiting ────────────────────────────────────────────────────────────
// General limit for the whole API, plus a much stricter one for login.
const apiLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             1000,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: "Too many requests. Please slow down." },
});

const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: "Too many login attempts. Please try again in 15 minutes." },
});

app.use(apiLimiter);

// ─── Login gate: lets an admin disable login entirely ─────────────────────────
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

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/ping", (req, res) => res.json({ status: "ok" }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/assemblies",   assemblyRoutes);
app.use("/categories",   categoryRoutes);
app.use("/materials",    materialRoutes);
app.use("/bom",          bomRoutes);
app.use("/api/settings", settingsRoutes);

app.use("/auth/login", loginLimiter, loginGate);
app.use("/auth",       authRouter);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// ─── Error handlers (must be last) ────────────────────────────────────────────
// Multer errors (file too large / wrong type) get a clear 400 instead of a generic 500.
app.use((err, req, res, next) => {
  if (err.name === "MulterError" || err.message?.includes("Invalid file type")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
