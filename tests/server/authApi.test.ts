import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    countUsers: vi.fn(),
    createUser: vi.fn(),
    getUserByEmail: vi.fn(),
    createDevice: vi.fn(),
    createSession: vi.fn(),
    getSessionByTokenHash: vi.fn(),
    deleteSession: vi.fn()
  },
  hashPassword: vi.fn(),
  verifyPassword: vi.fn()
}));

vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => mocks.db) }));
vi.mock("@/lib/server/metadata", () => ({ createMetadataRepository: vi.fn(() => mocks.repo) }));
vi.mock("@/lib/server/auth/passwords", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword
}));

describe("auth API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repo.countUsers.mockReturnValue(0);
    mocks.hashPassword.mockResolvedValue("password-hash");
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.repo.createUser.mockReturnValue({ id: "user_1", email: "owner@example.local", name: "Owner", role: "owner" });
    mocks.repo.createDevice.mockReturnValue({ id: "device_1" });
    mocks.repo.createSession.mockReturnValue({ id: "session_1" });
  });

  it("bootstraps the first owner and sets a session cookie", async () => {
    const { POST } = await import("@/app/api/auth/setup/route");
    const response = await POST(
      jsonRequest("http://localhost/api/auth/setup", {
        email: "owner@example.local",
        name: "Owner",
        password: "long-enough-password",
        deviceName: "Mac Studio"
      })
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("nas_cloud_session=");
    await expect(response.json()).resolves.toEqual({
      user: expect.objectContaining({ id: "user_1" })
    });
    expect(mocks.hashPassword).toHaveBeenCalledWith("long-enough-password");
    expect(mocks.repo.createDevice).toHaveBeenCalledWith({
      userId: "user_1",
      name: "Mac Studio",
      kind: "browser"
    });
  });

  it("refuses setup after an owner exists", async () => {
    const { POST } = await import("@/app/api/auth/setup/route");
    mocks.repo.countUsers.mockReturnValue(1);
    const response = await POST(
      jsonRequest("http://localhost/api/auth/setup", {
        email: "owner@example.local",
        name: "Owner",
        password: "long-enough-password"
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "owner already exists" });
  });

  it("logs in with a valid password and sets a session cookie", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    mocks.repo.getUserByEmail.mockReturnValue({
      id: "user_1",
      email: "owner@example.local",
      name: "Owner",
      role: "owner",
      passwordHash: "password-hash"
    });

    const response = await POST(
      jsonRequest("http://localhost/api/auth/login", {
        email: "owner@example.local",
        password: "long-enough-password",
        deviceName: "Mac Studio"
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("nas_cloud_session=");
    await expect(response.json()).resolves.toEqual({
      user: expect.objectContaining({ id: "user_1" })
    });
  });

  it("rejects invalid login credentials", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    mocks.repo.getUserByEmail.mockReturnValue({
      id: "user_1",
      email: "owner@example.local",
      name: "Owner",
      role: "owner",
      passwordHash: "password-hash"
    });
    mocks.verifyPassword.mockResolvedValue(false);

    const response = await POST(
      jsonRequest("http://localhost/api/auth/login", {
        email: "owner@example.local",
        password: "wrong-password"
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid credentials" });
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}
