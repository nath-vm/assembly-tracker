# AssemblyTracker

[![CI](https://github.com/nath-vm/assembly-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/nath-vm/assembly-tracker/actions/workflows/ci.yml)

A full-stack web app for cataloguing **assemblies** (a named group of materials), managing a shared **materials** price list, and exporting a combined **Bill of Materials (BOM)** for any selection of assemblies. Visitors can browse and export; an admin signs in to manage the catalogue.

**Live demo:** https://assemblies-p3.vercel.app
**API:** https://assembly-tracker.onrender.com/ping *(hosted on Render's free tier, so the first request after idle can take ~30 s to wake up)*

## Features

- **Browse and search** assemblies by title, material code or description, with category filters, sorting and pagination.
- **BOM builder:** select assemblies, set quantities, merge duplicate materials across assemblies, flag price conflicts, and export to **Excel** and **PDF**.
- **Admin dashboard** (password protected):
  - create, edit, duplicate, hide/show and delete assemblies, singly or in bulk
  - upload assembly images (stored on Cloudinary, auto-resized)
  - manage categories and the materials price list, including bulk import from spreadsheets with duplicate resolution
  - change the admin password, enable/disable login, and review an **audit log**
- Responsive UI with an error boundary and toast notifications.

## How it works

1. **Browse:** anyone can open the live demo, search the catalogue and filter by category.
2. **Build a BOM:** add assemblies to the selection, set a quantity for each, and the app merges identical materials across assemblies, totals quantities and prices, and highlights materials whose price differs between assemblies.
3. **Export:** download the combined BOM, with a per-assembly breakdown, as an Excel or PDF file.
4. **Manage (admin):** the admin area is password protected, so it isn't open to visitors. After signing in, the admin can maintain assemblies, categories and the materials price list, import materials in bulk from a spreadsheet, and review the audit log.

## Tech stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 19 (Create React App), ExcelJS, jsPDF, React-Toastify. Deployed on **Vercel** |
| Backend  | Node.js, Express 5, Mongoose. Deployed on **Render** |
| Database | MongoDB Atlas |
| Images   | Cloudinary (via Multer) |
| Testing / CI | Jest + Supertest, GitHub Actions |

## Architecture

```
React SPA (Vercel)  ──HTTPS/JSON──▶  Express API (Render)  ──▶  MongoDB Atlas
                                           └──────────────────▶  Cloudinary (images)
```

```
backend/
  app.js            Express app: middleware, routes, error handling (importable for tests)
  server.js         Entry point: env checks, DB connection, listen
  auth.js           Login, JWT middleware (requireAuth / optionalAuth), brute-force lockout
  routes/           Route definitions
  controllers/      Request handlers
  models/           Mongoose schemas
  middleware/       Reusable middleware (ObjectId validation)
  utils/            Shared helpers (safe error responses)
  tests/            Jest + Supertest API tests
frontend/
  src/pages/        Home, Login, Settings
  src/components/   UI components
  src/services/     API client (fetch wrapper with session handling)
```

## Security

- **Authentication:** a single admin password stored as a **bcrypt** hash in MongoDB. It is seeded once from the `SECRET_KEY` env var and can be changed in Settings (12+ characters). Successful login returns a **JWT** (8 h expiry) signed with `JWT_SECRET`.
- **Authorization:** all write endpoints require a valid token. Hidden assemblies are only returned to authenticated admins. This is enforced on the server, not just in the UI.
- **Abuse protection:** per-IP login lockout (5 failures → 15 min), strict login rate limit, and a general API rate limit.
- **Hardening:** `helmet` security headers, CORS allow-list, request size limits, ObjectId validation, escaped regex in search, upload type and size limits, and generic error responses (details are logged server-side only).
- **Auditing:** logins, password changes and catalogue changes are recorded in an audit log that auto-expires after 90 days.
- **Secrets** live only in environment variables; `.env` is git-ignored.

## Getting started

**Prerequisites:** Node.js 18+, a MongoDB database (e.g. a free Atlas cluster) and a Cloudinary account.

```bash
git clone https://github.com/nath-vm/assembly-tracker.git
cd assembly-tracker

# Backend
cd backend
cp .env.example .env          # fill in the values
npm install
npm run dev                   # http://localhost:5000

# Frontend (new terminal)
cd frontend
cp .env.example .env          # REACT_APP_BACKEND_URL=http://localhost:5000
npm install
npm start                     # http://localhost:3000
```

Log in with the value you set as `SECRET_KEY`, then change it under **Settings**.

### Environment variables

**Backend (`backend/.env`)**

| Variable | Description |
|----------|-------------|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Token signing key, 32+ chars (`openssl rand -hex 32`) |
| `SECRET_KEY` | Starter admin password (used only until a password exists in the DB) |
| `ALLOWED_ORIGINS` | Comma-separated frontend origins allowed by CORS |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image storage |
| `PORT`, `NODE_ENV` | Server port and environment |

**Frontend (`frontend/.env`)**

| Variable | Description |
|----------|-------------|
| `REACT_APP_BACKEND_URL` | Base URL of the API (no trailing slash) |

## Testing

```bash
cd backend
npm test
```

The API tests mock the database and cover authentication, authorization of hidden data, input validation and error handling. CI runs them, plus a production frontend build, on every push and pull request.

## API overview

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/assemblies`, `/assemblies/search` | public (hidden items: admin only) | List / search assemblies |
| POST/PUT/DELETE | `/assemblies/...` | admin | Create, update, delete, duplicate, hide, bulk actions |
| GET | `/categories`, `/materials` | public | Read catalogue data |
| POST/PUT/DELETE | `/categories/...`, `/materials/...` | admin | Manage categories and materials |
| POST | `/bom/export` | public | Combined BOM for selected assemblies |
| POST | `/auth/login` | public | Exchange password for JWT |
| GET/POST | `/api/settings/...` | admin | Config, change password, toggle login, audit log |
| GET | `/ping` | public | Health check |

## Deployment

- **Backend (Render):** root directory `backend`, build `npm install`, start `npm start`; set the environment variables above.
- **Frontend (Vercel):** root directory `frontend`; set `REACT_APP_BACKEND_URL`. `vercel.json` rewrites all routes to `index.html`.

## Roadmap

- Migrate the frontend from Create React App to Vite
- Split the largest components (`SelectionCart`, `MaterialManager`) into smaller units and hooks
- Frontend component tests
- Upgrade Cloudinary SDK / storage adapter

## Design decisions and known limitations

- **Single shared admin password** instead of user accounts. This keeps the tool simple for one administrator. Multi-user roles would be the next step if the app needed several editors.
- **Stateless JWT sessions** (8 h, kept in `sessionStorage`). There is no server-side revocation, which is an accepted trade-off at this scale.
- **In-memory login lockout.** It resets when the server restarts. A shared store such as Redis would make it persistent across instances.
- **Free-tier hosting:** the API sleeps when idle, so the first request can take around 30 seconds.
- **Frontend tooling:** the app uses Create React App, which is no longer actively maintained (see the roadmap).

## Author

Built by **Nathaniel Manansala** ([@nath-vm](https://github.com/nath-vm)).

## License

[MIT](LICENSE)
