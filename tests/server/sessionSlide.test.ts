import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_LIFETIME_DAYS,
  SESSION_TOUCH_THROTTLE_MS,
  shouldTouchSession,
  sessionExpiresAt
} from "@/lib/server/auth/sessions";

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

describe("session sliding helpers", () => {
  it("uses a 14-day window", () => {
    expect(SESSION_LIFETIME_DAYS).toBe(14);
  });

  it("computes expiresAt 14 days into the future", () => {
    const now = new Date("2026-05-20T00:00:00.000Z");
    const expires = new Date(sessionExpiresAt(now));
    const diffDays = (expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    expect(diffDays).toBe(SESSION_LIFETIME_DAYS);
  });

  it("only touches the session once per minute", () => {
    const fixedNow = new Date("2026-05-20T12:00:00.000Z");
    const justNow = new Date(fixedNow.getTime() - 5_000).toISOString();
    const aMinuteAgo = new Date(fixedNow.getTime() - SESSION_TOUCH_THROTTLE_MS - 1).toISOString();

    expect(shouldTouchSession(justNow, fixedNow)).toBe(false);
    expect(shouldTouchSession(aMinuteAgo, fixedNow)).toBe(true);
  });

  it("treats unparseable last_seen_at as touch-required", () => {
    expect(shouldTouchSession("not-a-date")).toBe(true);
  });
});

describe("requireApiSession sliding behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extends the session and stamps the device when last_seen_at is older than the throttle", async () => {
    mocks.repo.getSessionByTokenHash.mockReturnValue({
      id: "session_1",
      userId: "user_1",
      deviceId: "device_1",
      tokenHash: "hash",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: "2026-04-30T00:00:00.000Z",
      lastSeenAt: "2026-04-30T00:00:00.000Z"
    });

    const { requireApiSession } = await import("@/lib/server/auth/guards");
    const { sessionCookieName } = await import("@/lib/server/auth/sessions");

    const request = new Request("http://localhost/api/files", {
      method: "GET",
      headers: { cookie: `${sessionCookieName}=token` }
    });

    const result = await requireApiSession(request);

    expect(result.ok).toBe(true);
    expect(mocks.repo.touchSession).toHaveBeenCalledTimes(1);
    expect(mocks.repo.touchDevice).toHaveBeenCalledWith("device_1", expect.any(String));
  });

  it("skips touching when last_seen_at is within the throttle window", async () => {
    mocks.repo.getSessionByTokenHash.mockReturnValue({
      id: "session_1",
      userId: "user_1",
      deviceId: "device_1",
      tokenHash: "hash",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date(Date.now() - 5_000).toISOString(),
      lastSeenAt: new Date(Date.now() - 5_000).toISOString()
    });

    const { requireApiSession } = await import("@/lib/server/auth/guards");
    const { sessionCookieName } = await import("@/lib/server/auth/sessions");

    const request = new Request("http://localhost/api/files", {
      method: "GET",
      headers: { cookie: `${sessionCookieName}=token` }
    });

    const result = await requireApiSession(request);

    expect(result.ok).toBe(true);
    expect(mocks.repo.touchSession).not.toHaveBeenCalled();
    expect(mocks.repo.touchDevice).not.toHaveBeenCalled();
  });
});
