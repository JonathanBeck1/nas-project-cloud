import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkHealth: vi.fn(),
  requireMaintenanceAuth: vi.fn()
}));

vi.mock("@/lib/server/health", () => ({
  checkHealth: mocks.checkHealth
}));
vi.mock("@/lib/server/auth/maintenance", () => ({
  requireMaintenanceAuth: mocks.requireMaintenanceAuth
}));

const request = () => new Request("http://localhost/api/health");
const failingHealth = {
  ok: false,
  checks: {
    storage: { ok: false, path: "/mnt/nas-cloud", error: "EACCES: permission denied, open '/mnt/nas-cloud/.probe'" },
    database: { ok: true, path: "/data/nas-cloud.sqlite" },
    previewTools: {
      ffmpeg: { ok: true, name: "ffmpeg", version: "6.1" },
      poppler: { ok: false, name: "pdftoppm", error: "spawn pdftoppm ENOENT" }
    }
  }
};

describe("health API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireMaintenanceAuth.mockResolvedValue({ ok: true, via: "session", userId: "user_1" });
  });

  it("tells an anonymous caller only whether each check passed", async () => {
    mocks.requireMaintenanceAuth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    mocks.checkHealth.mockResolvedValue(failingHealth);
    const { GET } = await import("@/app/api/health/route");

    const response = await GET(request());

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      ok: false,
      checks: {
        storage: { ok: false },
        database: { ok: true },
        previewTools: { ffmpeg: { ok: true }, poppler: { ok: false } }
      }
    });
    expect(body).not.toContain("/mnt/nas-cloud");
    expect(body).not.toContain("6.1");
  });

  it("keeps the status code an anonymous healthcheck relies on", async () => {
    mocks.requireMaintenanceAuth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    mocks.checkHealth.mockResolvedValue({
      ok: true,
      checks: {
        storage: { ok: true, path: "/mnt/nas-cloud" },
        database: { ok: true, path: "/data/nas-cloud.sqlite" },
        previewTools: { ffmpeg: { ok: true, name: "ffmpeg", version: "6.1" }, poppler: { ok: true, name: "pdftoppm" } }
      }
    });
    const { GET } = await import("@/app/api/health/route");

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
  });

  it("returns 200 with versions to a signed-in or token caller when the app is ready", async () => {
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

    const response = await GET(request());

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

  it("returns 503 with error detail to a signed-in or token caller when a readiness check fails", async () => {
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

    const response = await GET(request());

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
