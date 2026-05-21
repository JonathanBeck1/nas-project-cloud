import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    getSessionByTokenHash: vi.fn()
  }
}));

vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => mocks.db) }));
vi.mock("@/lib/server/metadata", () => ({ createMetadataRepository: vi.fn(() => mocks.repo) }));

const VALID_SESSION = {
  id: "session_1",
  userId: "user_1",
  deviceId: "device_1",
  tokenHash: "abc",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: "2026-04-30T00:00:00.000Z",
  lastSeenAt: "2026-04-30T00:00:00.000Z"
};

describe("requireApiSession with CSRF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repo.getSessionByTokenHash.mockReturnValue(VALID_SESSION);
  });

  it("allows safe methods (GET) without a CSRF token", async () => {
    const { requireApiSession } = await import("@/lib/server/auth/guards");
    const { sessionCookieName, hashSessionToken } = await import("@/lib/server/auth/sessions");

    const request = new Request("http://localhost/api/files", {
      method: "GET",
      headers: { cookie: `${sessionCookieName}=token123` }
    });

    const result = await requireApiSession(request);

    expect(result.ok).toBe(true);
    expect(mocks.repo.getSessionByTokenHash).toHaveBeenCalledWith(hashSessionToken("token123"));
  });

  it("rejects POST without a CSRF cookie+header pair", async () => {
    const { requireApiSession } = await import("@/lib/server/auth/guards");
    const { sessionCookieName } = await import("@/lib/server/auth/sessions");

    const request = new Request("http://localhost/api/files", {
      method: "POST",
      headers: { cookie: `${sessionCookieName}=token123` }
    });

    const result = await requireApiSession(request);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toEqual({ error: "invalid csrf token" });
    }
  });

  it("rejects PATCH when the CSRF header does not match the cookie", async () => {
    const { requireApiSession } = await import("@/lib/server/auth/guards");
    const { sessionCookieName } = await import("@/lib/server/auth/sessions");
    const { csrfCookieName, csrfHeaderName } = await import("@/lib/server/auth/csrf");

    const request = new Request("http://localhost/api/files/file_1", {
      method: "PATCH",
      headers: {
        cookie: `${sessionCookieName}=token123; ${csrfCookieName}=expected`,
        [csrfHeaderName]: "different"
      }
    });

    const result = await requireApiSession(request);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("accepts DELETE with a matching CSRF cookie+header pair", async () => {
    const { requireApiSession } = await import("@/lib/server/auth/guards");
    const { sessionCookieName } = await import("@/lib/server/auth/sessions");
    const { csrfCookieName, csrfHeaderName } = await import("@/lib/server/auth/csrf");

    const request = new Request("http://localhost/api/files/file_1", {
      method: "DELETE",
      headers: {
        cookie: `${sessionCookieName}=token123; ${csrfCookieName}=match`,
        [csrfHeaderName]: "match"
      }
    });

    const result = await requireApiSession(request);

    expect(result.ok).toBe(true);
  });

  it("returns 401 (not 403) when the session cookie is missing entirely", async () => {
    const { requireApiSession } = await import("@/lib/server/auth/guards");
    const { csrfCookieName, csrfHeaderName } = await import("@/lib/server/auth/csrf");

    const request = new Request("http://localhost/api/files/file_1", {
      method: "POST",
      headers: {
        cookie: `${csrfCookieName}=match`,
        [csrfHeaderName]: "match"
      }
    });

    const result = await requireApiSession(request);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });
});
