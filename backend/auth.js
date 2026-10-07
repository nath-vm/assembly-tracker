const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const router = express.Router();
const AppConfig = require("./models/AppConfig");
const AuditLog = require("./models/AuditLog");

// ─── Audit helper (never lets a logging failure break the request) ────────────
async function audit(entry) {
  try {
    await AuditLog.create(entry);
  } catch (err) {
    console.error("Audit log write failed:", err.message);
  }
}

// ─── Brute-force lockout (in-memory per IP) ───────────────────────────────────
// After MAX_ATTEMPTS failures within WINDOW_MS, the IP is locked out for
// LOCKOUT_MS. This is intentionally in-memory: on restart the slate clears,
// which is fine — persistent lockout needs Redis and is overkill here.
const MAX_ATTEMPTS  = 5;
const WINDOW_MS     = 15 * 60 * 1000;  // 15 minutes
const LOCKOUT_MS    = 15 * 60 * 1000;  // 15 minutes lockout

const failedAttempts = new Map(); // ip → { count, firstAttempt, lockedUntil }

function checkLockout(ip) {
  const record = failedAttempts.get(ip);
  if (!record) return null;

  const now = Date.now();

  // Active lockout
  if (record.lockedUntil && now < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil - now) / 60000);
    return `Too many failed login attempts. Try again in ${remaining} minute${remaining !== 1 ? "s" : ""}.`;
  }

  // Window expired — reset
  if (now - record.firstAttempt > WINDOW_MS) {
    failedAttempts.delete(ip);
    return null;
  }

  return null;
}

function recordFailure(ip) {
  const now    = Date.now();
  const record = failedAttempts.get(ip) || { count: 0, firstAttempt: now, lockedUntil: null };

  // Reset window if it's expired
  if (now - record.firstAttempt > WINDOW_MS) {
    record.count        = 0;
    record.firstAttempt = now;
    record.lockedUntil  = null;
  }

  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }

  failedAttempts.set(ip, record);
}

function clearFailures(ip) {
  failedAttempts.delete(ip);
}

// ─── Helper to get client IP ─────────────────────────────────────────────────
function getClientIp(req) {
  // `trust proxy` is set in app.js, so Express resolves the real client IP safely.
  // Reading X-Forwarded-For directly would let a client spoof their IP and dodge the lockout.
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// ─── Login ────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { password } = req.body || {};
  const ip = getClientIp(req);

  if (!password || typeof password !== "string") {
    await audit({ 
      action: 'LOGIN_FAILED', 
      ip, 
      success: false, 
      detail: 'No password provided' 
    });
    return res.status(400).json({ error: "Password is required" });
  }

  // ─── Brute-force lockout check ────────────────────────────────────────────
  const lockoutMsg = checkLockout(ip);
  if (lockoutMsg) {
    await audit({
      action: 'LOGIN_BLOCKED',
      ip,
      success: false,
      detail: 'IP locked out due to too many failed attempts'
    });
    return res.status(429).json({ error: lockoutMsg });
  }

  try {
    // Get stored password hash from DB
    let cfg = await AppConfig.findOne({ key: "main" });
    
    // Handle initial setup - migrate from .env if needed
    if (!cfg || !cfg.passwordHash) {
      if (password === process.env.SECRET_KEY) {
        // Migrate to DB hash
        const hash = await bcrypt.hash(password, 10);
        if (cfg) {
          cfg.passwordHash = hash;
          cfg.lastPasswordChange = new Date();
          await cfg.save();
        } else {
          cfg = await AppConfig.create({ 
            key: "main", 
            passwordHash: hash,
            lastPasswordChange: new Date(),
            loginEnabled: true
          });
        }
        
        clearFailures(ip);
        const token = jwt.sign({ access: true }, process.env.JWT_SECRET, { expiresIn: "8h" });
        await audit({ 
          action: 'LOGIN_SUCCESS', 
          ip, 
          success: true, 
          actor: 'system',
          detail: 'Initial setup login'
        });
        return res.json({ token });
      }
      recordFailure(ip);
      await audit({ 
        action: 'LOGIN_FAILED', 
        ip, 
        success: false, 
        detail: 'Invalid password' 
      });
      return res.status(401).json({ error: "Incorrect password" });
    }

    // Check if login is enabled
    if (cfg.loginEnabled === false) {
      await audit({ 
        action: 'LOGIN_FAILED', 
        ip, 
        success: false, 
        detail: 'Login disabled by admin' 
      });
      return res.status(403).json({ error: "Login is currently disabled by the administrator." });
    }

    // Verify password against stored hash
    const isValid = await bcrypt.compare(password, cfg.passwordHash);
    if (!isValid) {
      recordFailure(ip);
      await audit({ 
        action: 'LOGIN_FAILED', 
        ip, 
        success: false, 
        detail: 'Invalid password' 
      });
      return res.status(401).json({ error: "Incorrect password" });
    }

    clearFailures(ip);
    const token = jwt.sign({ access: true }, process.env.JWT_SECRET, { expiresIn: "8h" });
    await audit({ 
      action: 'LOGIN_SUCCESS', 
      ip, 
      success: true, 
      actor: 'system' 
    });
    res.json({ token });
  } catch (err) {
    console.error("Login error:", err);
    await audit({ 
      action: 'LOGIN_FAILED', 
      ip, 
      success: false, 
      detail: 'Server error' 
    });
    res.status(500).json({ error: "Server error during login" });
  }
});

// ─── Middleware ───────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

// Non-blocking: attaches req.isAdmin = true when a valid token is present.
// Public routes use it to decide whether admin-only data (hidden assemblies) may be returned.
// An invalid/expired token is treated as "not admin" rather than an error.
function optionalAuth(req, res, next) {
  req.isAdmin = false;
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      req.isAdmin = true;
    } catch { /* ignore — treated as public visitor */ }
  }
  next();
}

module.exports = { router, requireAuth, optionalAuth };