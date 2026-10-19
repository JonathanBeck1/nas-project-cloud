import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { resetAppConfigForTesting } from "@/lib/server/config";

afterEach(() => {
  delete process.env.NAS_CLOUD_SECURE_COOKIES;
  resetAppConfigForTesting();
});

async function run(path = "/login") {
  const { middleware } = await import("@/middleware");
  return middleware(new NextRequest(`http://localhost${path}`));
}

describe("page middleware", () => {
  it("puts a fresh nonce in the page CSP and hands it to the renderer", async () => {
    const response = await run();
    const csp = response.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];

    expect(nonce).toBeTruthy();
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    // Next.js reads the nonce for its own scripts from the request's CSP header.
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });

  it("never reuses a nonce", async () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      nonces.add((await run()).headers.get("x-middleware-request-x-nonce") ?? "");
    }

    expect(nonces.size).toBe(20);
  });

  it("adds HSTS when NAS_CLOUD_SECURE_COOKIES is on, and not otherwise", async () => {
    expect((await run()).headers.get("strict-transport-security")).toBeNull();

    process.env.NAS_CLOUD_SECURE_COOKIES = "true";
    resetAppConfigForTesting();

    expect((await run()).headers.get("strict-transport-security")).toBe("max-age=31536000");
  });

  it("runs on pages, not on API routes or static assets", async () => {
    const { config } = await import("@/middleware");
    const pattern = new RegExp(`^${config.matcher[0].source}$`);

    expect(pattern.test("/")).toBe(true);
    expect(pattern.test("/projects/abc")).toBe(true);
    expect(pattern.test("/shares/token")).toBe(true);
    expect(pattern.test("/api/files")).toBe(false);
    expect(pattern.test("/_next/static/chunks/main.js")).toBe(false);
    expect(config.runtime).toBe("nodejs");
  });
});
