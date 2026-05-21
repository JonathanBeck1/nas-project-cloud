import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    getDevicePairingCodeByHash: vi.fn(),
    consumeDevicePairingCode: vi.fn(),
    createDevice: vi.fn(),
    createSession: vi.fn()
  },
  consume: vi.fn(),
  reset: vi.fn(),
  clientIpFromRequest: vi.fn()
}));

vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => mocks.db) }));
vi.mock("@/lib/server/metadata", () => ({ createMetadataRepository: vi.fn(() => mocks.repo) }));
vi.mock("@/lib/server/rateLimit", () => ({
  createRateLimiter: () => ({ consume: mocks.consume, reset: mocks.reset }),
  clientIpFromRequest: (...args: unknown[]) => mocks.clientIpFromRequest(...args)
}));

function pairRequest(body: unknown) {
  return new Request("http://localhost/api/devices/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.99" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/devices/pair rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientIpFromRequest.mockReturnValue("203.0.113.99");
  });

  it("returns 429 when the long (24h) window is exceeded before the short window is checked", async () => {
    mocks.consume.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 3600 });

    const { POST } = await import("@/app/api/devices/pair/route");
    const response = await POST(pairRequest({ pairingCode: "ABCDEF" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3600");
    expect(mocks.consume).toHaveBeenCalledTimes(1);
    expect(mocks.repo.getDevicePairingCodeByHash).not.toHaveBeenCalled();
  });

  it("returns 429 when the short (10min) window blocks after the long window allows", async () => {
    mocks.consume
      .mockReturnValueOnce({ allowed: true, remaining: 49 })
      .mockReturnValueOnce({ allowed: false, retryAfterSeconds: 120 });

    const { POST } = await import("@/app/api/devices/pair/route");
    const response = await POST(pairRequest({ pairingCode: "ABCDEF" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(mocks.repo.getDevicePairingCodeByHash).not.toHaveBeenCalled();
  });

  it("clears the short window throttle on a successful pair", async () => {
    mocks.consume
      .mockReturnValueOnce({ allowed: true, remaining: 49 })
      .mockReturnValueOnce({ allowed: true, remaining: 4 });
    mocks.repo.getDevicePairingCodeByHash.mockReturnValue({
      id: "pair_1",
      userId: "user_1",
      deviceName: "Windows PC",
      deviceKind: "browser",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      consumedAt: null
    });
    mocks.repo.consumeDevicePairingCode.mockReturnValue(true);
    mocks.repo.createDevice.mockReturnValue({ id: "device_2" });
    mocks.repo.createSession.mockReturnValue({ id: "session_1" });

    const { POST } = await import("@/app/api/devices/pair/route");
    const response = await POST(pairRequest({ pairingCode: "ABCDEF" }));

    expect(response.status).toBe(200);
    expect(mocks.reset).toHaveBeenCalledWith("pair_ip_short", "203.0.113.99");
  });
});
