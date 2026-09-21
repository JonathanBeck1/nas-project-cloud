import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    getUserByEmail: vi.fn(),
    createDevice: vi.fn(),
    createSession: vi.fn()
  },
  verifyPassword: vi.fn(),
  consume: vi.fn(),
  reset: vi.fn(),
  createRateLimiter: vi.fn(),
  clientIpFromRequest: vi.fn()
}));

vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => mocks.db) }));
vi.mock("@/lib/server/metadata", () => ({ createMetadataRepository: vi.fn(() => mocks.repo) }));
vi.mock("@/lib/server/auth/passwords", () => ({
  verifyPassword: mocks.verifyPassword,
  hashPassword: vi.fn(),
  needsRehash: () => false,
  DUMMY_PASSWORD_HASH: "scrypt:dummy"
}));
vi.mock("@/lib/server/rateLimit", () => ({
  createRateLimiter: () => ({ consume: mocks.consume, reset: mocks.reset }),
  clientIpFromRequest: (...args: unknown[]) => mocks.clientIpFromRequest(...args)
}));

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.5" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/auth/login rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientIpFromRequest.mockReturnValue("203.0.113.5");
  });

  it("returns 429 with Retry-After when the per-IP limit is exceeded", async () => {
    mocks.consume.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(jsonRequest({ email: "owner@example.com", password: "hunter2-password" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(mocks.repo.getUserByEmail).not.toHaveBeenCalled();
  });

  it("returns 429 when the per-email limit is exceeded after the IP check passes", async () => {
    mocks.consume
      .mockReturnValueOnce({ allowed: true, remaining: 59 })
      .mockReturnValueOnce({ allowed: false, retryAfterSeconds: 17 });

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(jsonRequest({ email: "owner@example.com", password: "hunter2-password" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    expect(mocks.repo.getUserByEmail).not.toHaveBeenCalled();
  });

  it("clears both throttling buckets on a successful login", async () => {
    mocks.consume
      .mockReturnValueOnce({ allowed: true, remaining: 59 })
      .mockReturnValueOnce({ allowed: true, remaining: 9 });
    mocks.repo.getUserByEmail.mockReturnValue({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
      passwordHash: "hash",
      role: "owner",
      createdAt: "now",
      updatedAt: "now"
    });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.repo.createDevice.mockReturnValue({ id: "device_1" });
    mocks.repo.createSession.mockReturnValue({ id: "session_1" });

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(jsonRequest({ email: "owner@example.com", password: "hunter2-password" }));

    expect(response.status).toBe(200);
    expect(mocks.reset).toHaveBeenCalledWith("login_email", "owner@example.com");
    expect(mocks.reset).toHaveBeenCalledWith("login_ip", "203.0.113.5");
  });
});
