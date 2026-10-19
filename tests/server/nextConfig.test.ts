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

  it("leaves the page CSP to the middleware, so no static rule can replace its nonce or the download sandbox", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];

    expect(rules.flatMap((rule) => rule.headers).some(({ key }) => key.toLowerCase() === "content-security-policy")).toBe(false);
  });
});
