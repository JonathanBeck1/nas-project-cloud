import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkHealth: vi.fn()
}));

vi.mock("@/lib/server/health", () => ({
  checkHealth: mocks.checkHealth
}));

describe("health API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 200 with sanitized check names when the app is ready", async () => {
    mocks.checkHealth.mockResolvedValue({
      ok: true,
      checks: {
        storage: { ok: true, path: "/mnt/nas-cloud" },
        database: { ok: true, path: "/data/nas-cloud.sqlite" },
        previewTools: {
          ffmpeg: { ok: true, name: "ffmpeg", version: "6.1" },
          poppler: { ok: true, name: "pdftoppm", version: "24.02.0" }
        }
      }
    });
    const { GET } = await import("@/app/api/health/route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checks: {
        storage: { ok: true },
        database: { ok: true },
        previewTools: {
          ffmpeg: { ok: true, version: "6.1" },
          poppler: { ok: true, version: "24.02.0" }
        }
      }
    });
  });

  it("returns 503 with sanitized errors when a readiness check fails", async () => {
    mocks.checkHealth.mockResolvedValue({
      ok: false,
      checks: {
        storage: { ok: false, path: "/mnt/nas-cloud", error: "EACCES: permission denied" },
        database: { ok: true, path: "/data/nas-cloud.sqlite" },
        previewTools: {
          ffmpeg: { ok: true, name: "ffmpeg", version: "6.1" },
          poppler: { ok: false, name: "pdftoppm", error: "spawn pdftoppm ENOENT" }
        }
      }
    });
    const { GET } = await import("@/app/api/health/route");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      checks: {
        storage: { ok: false, error: "EACCES: permission denied" },
        database: { ok: true },
        previewTools: {
          ffmpeg: { ok: true, version: "6.1" },
          poppler: { ok: false, error: "spawn pdftoppm ENOENT" }
        }
      }
    });
  });
});
