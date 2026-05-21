import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    getSessionByTokenHash: vi.fn(),
    touchSession: vi.fn(),
    touchDevice: vi.fn()
  }
}));

vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => mocks.db) }));
vi.mock("@/lib/server/metadata", () => ({ createMetadataRepository: vi.fn(() => mocks.repo) }));

const ORIGINAL_ENV = { ...process.env };

describe("requireMaintenanceAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NAS_CLOUD_MAINTENANCE_TOKEN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("accepts a Bearer token that matches the env var (timing-safe)", async () => {
    process.env.NAS_CLOUD_MAINTENANCE_TOKEN = "supersecrettoken";
    const { requireMaintenanceAuth } = await import("@/lib/server/auth/maintenance");

    const request = new Request("http://localhost/api/maintenance/previews", {
      method: "POST",
      headers: { authorization: "Bearer supersecrettoken" }
    });

    const result = await requireMaintenanceAuth(request);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.via).toBe("token");
    }
    expect(mocks.repo.getSessionByTokenHash).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the Bearer token is wrong", async () => {
    process.env.NAS_CLOUD_MAINTENANCE_TOKEN = "supersecrettoken";
    const { requireMaintenanceAuth } = await import("@/lib/server/auth/maintenance");

    const request = new Request("http://localhost/api/maintenance/previews", {
      method: "POST",
      headers: { authorization: "Bearer wrongtoken12345" }
    });

    const result = await requireMaintenanceAuth(request);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({ error: "invalid maintenance token" });
    }
  });

  it("falls back to the session check when no Bearer header is present", async () => {
    process.env.NAS_CLOUD_MAINTENANCE_TOKEN = "supersecrettoken";
    mocks.repo.getSessionByTokenHash.mockReturnValue({
      id: "session_1",
      userId: "user_1",
      deviceId: "device_1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: "2026-04-30T00:00:00.000Z",
      lastSeenAt: new Date().toISOString()
    });

    const { requireMaintenanceAuth } = await import("@/lib/server/auth/maintenance");
    const { sessionCookieName } = await import("@/lib/server/auth/sessions");
    const { csrfCookieName, csrfHeaderName } = await import("@/lib/server/auth/csrf");

    const request = new Request("http://localhost/api/maintenance/previews", {
      method: "POST",
      headers: {
        cookie: `${sessionCookieName}=token; ${csrfCookieName}=match`,
        [csrfHeaderName]: "match"
      }
    });

    const result = await requireMaintenanceAuth(request);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.via).toBe("session");
    }
  });

  it("does not authorize via missing token even when the env var is unset (session still works)", async () => {
    delete process.env.NAS_CLOUD_MAINTENANCE_TOKEN;
    mocks.repo.getSessionByTokenHash.mockReturnValue(null);

    const { requireMaintenanceAuth } = await import("@/lib/server/auth/maintenance");
    const result = await requireMaintenanceAuth(new Request("http://localhost/api/maintenance/previews"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });
});
