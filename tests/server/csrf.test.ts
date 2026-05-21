import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import {
  createCsrfToken,
  csrfCookieName,
  csrfHeaderName,
  isMutatingMethod,
  verifyCsrfToken,
  withCsrfCookie
} from "@/lib/server/auth/csrf";

describe("csrf module", () => {
  it("classifies mutating HTTP methods", () => {
    expect(isMutatingMethod("GET")).toBe(false);
    expect(isMutatingMethod("HEAD")).toBe(false);
    expect(isMutatingMethod("OPTIONS")).toBe(false);
    expect(isMutatingMethod("POST")).toBe(true);
    expect(isMutatingMethod("PATCH")).toBe(true);
    expect(isMutatingMethod("PUT")).toBe(true);
    expect(isMutatingMethod("DELETE")).toBe(true);
    expect(isMutatingMethod("delete")).toBe(true);
  });

  it("issues distinct base64url tokens of useful length", () => {
    const a = createCsrfToken();
    const b = createCsrfToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
  });

  it("sets the CSRF cookie as readable from JS (httpOnly false, SameSite=Lax)", () => {
    const response = withCsrfCookie(NextResponse.json({}), "abc123");
    const cookie = response.cookies.get(csrfCookieName);
    expect(cookie?.value).toBe("abc123");
    expect(cookie?.httpOnly).toBe(false);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
  });

  it("verifies cookie/header pairs with timing-safe comparison", () => {
    const token = createCsrfToken();
    const ok = new Request("http://localhost/api/x", {
      method: "POST",
      headers: { cookie: `${csrfCookieName}=${token}`, [csrfHeaderName]: token }
    });
    expect(verifyCsrfToken(ok)).toBe(true);

    const mismatched = new Request("http://localhost/api/x", {
      method: "POST",
      headers: { cookie: `${csrfCookieName}=${token}`, [csrfHeaderName]: createCsrfToken() }
    });
    expect(verifyCsrfToken(mismatched)).toBe(false);

    const missingHeader = new Request("http://localhost/api/x", {
      method: "POST",
      headers: { cookie: `${csrfCookieName}=${token}` }
    });
    expect(verifyCsrfToken(missingHeader)).toBe(false);

    const missingCookie = new Request("http://localhost/api/x", {
      method: "POST",
      headers: { [csrfHeaderName]: token }
    });
    expect(verifyCsrfToken(missingCookie)).toBe(false);
  });
});
