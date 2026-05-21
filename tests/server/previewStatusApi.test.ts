import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  countFilePreviewsByStatus: vi.fn(),
  lastSuccessfulPreviewAt: vi.fn(),
  getDatabase: vi.fn().mockReturnValue({}),
  createMetadataRepository: vi.fn(),
  probeFfmpeg: vi.fn(),
  probePoppler: vi.fn()
}));

vi.mock("@/lib/server/auth/guards", () => ({ requireApiSession: mocks.requireApiSession }));
vi.mock("@/lib/server/db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/lib/server/metadata", () => ({
  createMetadataRepository: mocks.createMetadataRepository
}));
vi.mock("@/lib/server/previews/ffmpeg", () => ({ probeFfmpeg: mocks.probeFfmpeg }));
vi.mock("@/lib/server/previews/poppler", () => ({ probePoppler: mocks.probePoppler }));

describe("preview status API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      userId: "user_1",
      sessionId: "session_1",
      deviceId: "device_1"
    });
    mocks.countFilePreviewsByStatus.mockReturnValue({
      pending: 4,
      ready: 12,
      failed: 1,
      skipped: 7,
      unsupported: 0
    });
    mocks.lastSuccessfulPreviewAt.mockReturnValue("2026-05-20T12:34:56.000Z");
    mocks.createMetadataRepository.mockReturnValue({
      countFilePreviewsByStatus: mocks.countFilePreviewsByStatus,
      lastSuccessfulPreviewAt: mocks.lastSuccessfulPreviewAt
    });
    mocks.probeFfmpeg.mockResolvedValue({ available: true, version: "6.0" });
    mocks.probePoppler.mockResolvedValue({ available: true, version: "23.04.0" });
  });

  it("returns counts, last ready timestamp, and binary availability for an authenticated session", async () => {
    const { GET } = await import("@/app/api/maintenance/previews/status/route");

    const response = await GET(new Request("http://localhost/api/maintenance/previews/status"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      counts: { pending: 4, ready: 12, failed: 1, skipped: 7, unsupported: 0 },
      lastReadyAt: "2026-05-20T12:34:56.000Z",
      ffmpeg: { available: true, version: "6.0" },
      poppler: { available: true, version: "23.04.0" }
    });
  });

  it("reports ffmpeg.available=false and poppler.available=false when the probes fail", async () => {
    mocks.probeFfmpeg.mockResolvedValue({ available: false, error: "ENOENT" });
    mocks.probePoppler.mockResolvedValue({ available: false, error: "ENOENT" });
    const { GET } = await import("@/app/api/maintenance/previews/status/route");

    const response = await GET(new Request("http://localhost/api/maintenance/previews/status"));
    const body = (await response.json()) as {
      ffmpeg: { available: boolean; version: string | null };
      poppler: { available: boolean; version: string | null };
    };

    expect(body.ffmpeg).toEqual({ available: false, version: null });
    expect(body.poppler).toEqual({ available: false, version: null });
  });

  it("requires an authenticated session", async () => {
    const authResponse = Response.json({ error: "authentication required" }, { status: 401 });
    mocks.requireApiSession.mockResolvedValue({ ok: false, response: authResponse });
    const { GET } = await import("@/app/api/maintenance/previews/status/route");

    const response = await GET(new Request("http://localhost/api/maintenance/previews/status"));

    expect(response.status).toBe(401);
    expect(mocks.countFilePreviewsByStatus).not.toHaveBeenCalled();
  });
});
