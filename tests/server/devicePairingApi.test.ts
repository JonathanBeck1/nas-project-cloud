import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    listDevices: vi.fn(),
    createDevicePairingCode: vi.fn(),
    getDevicePairingCodeByHash: vi.fn(),
    consumeDevicePairingCode: vi.fn(),
    createDevice: vi.fn(),
    revokeDevice: vi.fn()
  },
  requireApiSession: vi.fn()
}));

vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => mocks.db) }));
vi.mock("@/lib/server/metadata", () => ({ createMetadataRepository: vi.fn(() => mocks.repo) }));
vi.mock("@/lib/server/auth/guards", () => ({ requireApiSession: mocks.requireApiSession }));

describe("device pairing API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      userId: "user_1",
      sessionId: "session_1",
      deviceId: "device_1"
    });
    mocks.repo.listDevices.mockReturnValue([{ id: "device_1", name: "Mac Studio" }]);
    mocks.repo.createDevicePairingCode.mockReturnValue({
      id: "pair_1",
      expiresAt: "2026-05-02T12:00:00.000Z"
    });
    mocks.repo.revokeDevice.mockReturnValue(false);
  });

  it("lists devices and creates pairing codes for the owner", async () => {
    const { GET, POST } = await import("@/app/api/devices/route");
    const listResponse = await GET(new Request("http://localhost/api/devices"));
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({ devices: [{ id: "device_1", name: "Mac Studio" }] });

    const createResponse = await POST(
      jsonRequest("http://localhost/api/devices", {
        deviceName: "Windows PC",
        deviceKind: "browser"
      })
    );
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual({
      pairingCode: expect.any(String),
      expiresAt: expect.any(String)
    });
    expect(mocks.repo.createDevicePairingCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        deviceName: "Windows PC",
        deviceKind: "browser",
        expiresAt: expect.any(String)
      })
    );
  });

  it("draws a new code when the first one collides with a live pairing code", async () => {
    const { POST } = await import("@/app/api/devices/route");
    mocks.repo.createDevicePairingCode
      .mockImplementationOnce(() => {
        throw Object.assign(new Error("UNIQUE constraint failed: device_pairing_codes.code_hash"), {
          code: "SQLITE_CONSTRAINT_UNIQUE"
        });
      })
      .mockReturnValue({ id: "pair_2", expiresAt: "2026-05-02T12:00:00.000Z" });

    const response = await POST(
      jsonRequest("http://localhost/api/devices", { deviceName: "Windows PC", deviceKind: "desktop" })
    );

    expect(response.status).toBe(201);
    expect(mocks.repo.createDevicePairingCode).toHaveBeenCalledTimes(2);
    const [first, second] = mocks.repo.createDevicePairingCode.mock.calls.map(([input]) => input.codeHash);
    expect(second).not.toBe(first);
  });

  it("revokes another trusted device for the owner", async () => {
    const { DELETE } = await import("@/app/api/devices/[id]/route");
    mocks.repo.revokeDevice.mockReturnValue(true);

    const response = await DELETE(new Request("http://localhost/api/devices/device_2"), {
      params: Promise.resolve({ id: "device_2" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.repo.revokeDevice).toHaveBeenCalledWith("user_1", "device_2");
  });

  it("refuses to revoke the current device session", async () => {
    const { DELETE } = await import("@/app/api/devices/[id]/route");

    const response = await DELETE(new Request("http://localhost/api/devices/device_1"), {
      params: Promise.resolve({ id: "device_1" })
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "cannot revoke current device" });
    expect(mocks.repo.revokeDevice).not.toHaveBeenCalled();
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}
