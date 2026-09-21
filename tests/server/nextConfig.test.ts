import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

async function headersFor(source: string) {
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((candidate) => candidate.source === source);
  return Object.fromEntries((rule?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value]));
}

describe("next.config security headers", () => {
  it("sends framing, sniffing, referrer and permissions headers on every route", async () => {
    const headers = await headersFor("/:path*");

    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["content-security-policy"]).toBeUndefined();
  });

  it("sets the page CSP without replacing the sandboxed policy on API downloads", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const cspRule = rules.find((rule) => rule.headers.some(({ key }) => key === "Content-Security-Policy"));
    const matches = (pathname: string) => new RegExp(`^${cspRule?.source}$`).test(pathname);

    expect((await headersFor(cspRule?.source ?? ""))["content-security-policy"]).toBe(
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'"
    );
    expect(matches("/")).toBe(true);
    expect(matches("/shares/some-token")).toBe(true);
    expect(matches("/api/files/file_1/download")).toBe(false);
    expect(matches("/api/shares/some-token/download")).toBe(false);
  });
});
