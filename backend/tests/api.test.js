const request = require("supertest");
const jwt     = require("jsonwebtoken");
const bcrypt  = require("bcryptjs");

// Models are mocked so the tests run without a database.
jest.mock("../models/Assembly");
jest.mock("../models/AppConfig");
jest.mock("../models/AuditLog");

const Assembly  = require("../models/Assembly");
const AppConfig = require("../models/AppConfig");
const AuditLog  = require("../models/AuditLog");
const app       = require("../app");

const adminToken = () => jwt.sign({ access: true }, process.env.JWT_SECRET, { expiresIn: "1h" });
const sortable   = (rows = []) => ({ sort: jest.fn().mockResolvedValue(rows) });

beforeEach(() => {
  jest.clearAllMocks();
  AuditLog.create.mockResolvedValue({});
  AppConfig.findOne.mockResolvedValue(null);
});

describe("health & routing", () => {
  test("GET /ping returns ok", async () => {
    const res = await request(app).get("/ping");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  test("unknown route returns 404 JSON", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });

  test("sets security headers (helmet)", async () => {
    const res = await request(app).get("/ping");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("authentication", () => {
  test("login without a password returns 400", async () => {
    const res = await request(app).post("/auth/login").send({});
    expect(res.status).toBe(400);
  });

  test("login with the wrong password returns 401", async () => {
    AppConfig.findOne.mockResolvedValue({ passwordHash: await bcrypt.hash("right-password-123", 4), loginEnabled: true });
    const res = await request(app).post("/auth/login").send({ password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test("login with the correct password returns a JWT", async () => {
    AppConfig.findOne.mockResolvedValue({ passwordHash: await bcrypt.hash("right-password-123", 4), loginEnabled: true });
    const res = await request(app).post("/auth/login").send({ password: "right-password-123" });
    expect(res.status).toBe(200);
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET).access).toBe(true);
  });

  test("login is refused when the admin has disabled it", async () => {
    AppConfig.findOne.mockResolvedValue({ passwordHash: "x", loginEnabled: false });
    const res = await request(app).post("/auth/login").send({ password: "anything" });
    expect(res.status).toBe(403);
  });

  test("protected routes reject requests without a token", async () => {
    const res = await request(app).delete("/assemblies/507f1f77bcf86cd799439011");
    expect(res.status).toBe(401);
  });

  test("protected routes reject a forged token", async () => {
    const forged = jwt.sign({ access: true }, "some-other-secret");
    const res = await request(app).delete("/assemblies/507f1f77bcf86cd799439011").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(403);
  });
});

describe("hidden assemblies are admin-only", () => {
  test("public visitors never receive hidden assemblies, even with ?showHidden=1", async () => {
    Assembly.find.mockReturnValue(sortable());
    await request(app).get("/assemblies?showHidden=1");
    expect(Assembly.find).toHaveBeenCalledWith({ hidden: { $ne: true } });
  });

  test("an admin token can include hidden assemblies", async () => {
    Assembly.find.mockReturnValue(sortable());
    await request(app).get("/assemblies?showHidden=1").set("Authorization", `Bearer ${adminToken()}`);
    expect(Assembly.find).toHaveBeenCalledWith({});
  });

  test("an invalid token on a public route is treated as a normal visitor, not an error", async () => {
    Assembly.find.mockReturnValue(sortable());
    const res = await request(app).get("/assemblies?showHidden=1").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(200);
    expect(Assembly.find).toHaveBeenCalledWith({ hidden: { $ne: true } });
  });

  test("BOM export excludes hidden assemblies for public callers", async () => {
    Assembly.find.mockResolvedValue([]);
    await request(app).post("/bom/export").send({ assemblies: [{ id: "507f1f77bcf86cd799439011", quantity: 1 }] });
    expect(Assembly.find).toHaveBeenCalledWith(expect.objectContaining({ hidden: { $ne: true } }));
  });
});

describe("input validation", () => {
  test("malformed ids return 400 instead of a 500", async () => {
    const res = await request(app).put("/assemblies/not-an-id/toggle-hidden").set("Authorization", `Bearer ${adminToken()}`).send({ hidden: true });
    expect(res.status).toBe(400);
  });

  test("BOM export rejects invalid ids", async () => {
    const res = await request(app).post("/bom/export").send({ assemblies: [{ id: "x", quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  test("search requires a query", async () => {
    const res = await request(app).get("/assemblies/search");
    expect(res.status).toBe(400);
  });
});

describe("error handling", () => {
  test("database errors never leak internal details to the client", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    Assembly.find.mockImplementation(() => { throw new Error("secret connection string failure"); });
    const res = await request(app).get("/assemblies");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret connection/);
    spy.mockRestore();
  });
});
