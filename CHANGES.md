# What changed in this update

## Delete these from your GitHub repo (they were removed)
- `frontend/public.zip`
- `backend/config/jwtSecret.js` (unused)

## New files
`README.md`, `LICENSE`, `.gitignore`, `.github/workflows/ci.yml`, `frontend/.env.example`,
`backend/app.js`, `backend/middleware/validateObjectId.js`, `backend/utils/errors.js`,
`backend/tests/api.test.js`, `backend/tests/setupEnv.js`

## Modified files
- `backend/server.js` now only starts the server; the Express app moved to `app.js`
- `backend/auth.js`: real client IP (`req.ip`), `optionalAuth`, safe audit logging
- `backend/controllers/*`: generic error responses; hidden assemblies admin-only; id validation
- `backend/routes/*`: ObjectId validation and `optionalAuth` on public routes
- `backend/models/AuditLog.js`: entries expire after 90 days
- `backend/.env.example`, `backend/package.json`, `backend/package-lock.json`
- `frontend/src/pages/LoginPage.js`, `frontend/src/pages/SettingsPage.js`, `frontend/README.md`

## Before you deploy
1. On Render make sure `ALLOWED_ORIGINS` is set to your Vercel URL (the old hard-coded default URL was removed).
2. Replace `YOUR-USERNAME` in `README.md` with your GitHub username and add screenshots.
3. New admin passwords must now be 12+ characters (existing passwords keep working).
