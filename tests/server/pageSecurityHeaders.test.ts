import { describe, expect, it } from "vitest";
import { pageSecurityHeaders } from "@/lib/server/securityHeaders";

describe("page security headers", () => {
  it("only lets scripts run that carry this request's nonce", () => {
    const csp = pageSecurityHeaders({ nonce: "abc123", secureCookies: false, development: false })["Content-Security-Policy"];

    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("keeps the framing, base, object and form rules", () => {
    const csp = pageSecurityHeaders({ nonce: "n", secureCookies: false, development: false })["Content-Security-Policy"];

    for (const rule of ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"]) {
      expect(csp).toContain(rule);
    }
  });

  it("allows eval in development only, where React needs it for error overlays", () => {
    expect(pageSecurityHeaders({ nonce: "n", secureCookies: false, development: true })["Content-Security-Policy"]).toContain(
      "'unsafe-eval'"
    );
  });

  it("sends HSTS only when the app is configured as HTTPS-only", () => {
    expect(pageSecurityHeaders({ nonce: "n", secureCookies: true, development: false })["Strict-Transport-Security"]).toBe(
      "max-age=31536000"
    );
    expect(pageSecurityHeaders({ nonce: "n", secureCookies: false, development: false })).not.toHaveProperty(
      "Strict-Transport-Security"
    );
  });
});
