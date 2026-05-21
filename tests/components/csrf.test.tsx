import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, csrfHeaders, readCsrfToken } from "@/lib/client/csrf";

function clearCookies() {
  for (const part of document.cookie.split(";")) {
    const equals = part.indexOf("=");
    if (equals === -1) continue;
    const name = part.slice(0, equals).trim();
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

describe("client csrf helper", () => {
  beforeEach(() => {
    clearCookies();
  });

  afterEach(() => {
    clearCookies();
  });

  it("returns null when the CSRF cookie is missing", () => {
    expect(readCsrfToken()).toBeNull();
    expect(csrfHeaders()).toEqual({});
  });

  it("reads the CSRF cookie and projects it as a header object", () => {
    document.cookie = `${CSRF_COOKIE_NAME}=abc-123; path=/`;

    expect(readCsrfToken()).toBe("abc-123");
    expect(csrfHeaders()).toEqual({ [CSRF_HEADER_NAME]: "abc-123" });
  });

  it("decodes URL-encoded cookie values", () => {
    document.cookie = `${CSRF_COOKIE_NAME}=${encodeURIComponent("a/b+c=")}; path=/`;
    expect(readCsrfToken()).toBe("a/b+c=");
  });
});
