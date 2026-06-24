import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { appConfig } from "../config";

export const csrfCookieName = "nas_cloud_csrf";
export const csrfHeaderName = "x-nas-csrf";

const UNSAFE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function isMutatingMethod(method: string): boolean {
  return UNSAFE_METHODS.has(method.toUpperCase());
}

export function createCsrfToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function withCsrfCookie(response: NextResponse, token: string): NextResponse {
  // SameSite=Lax + httpOnly=false: the client JS must read this cookie to
  // mirror it back via the x-nas-csrf header (double-submit pattern).
  response.cookies.set(csrfCookieName, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: appConfig.secureCookies,
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}

export function clearCsrfCookie(response: NextResponse): NextResponse {
  response.cookies.set(csrfCookieName, "", {
    httpOnly: false,
    sameSite: "lax",
    secure: appConfig.secureCookies,
    path: "/",
    maxAge: 0
  });
  return response;
}

export function csrfTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const name = trimmed.slice(0, equals);
    if (name === csrfCookieName) {
      return decodeURIComponent(trimmed.slice(equals + 1));
    }
  }
  return null;
}

export function csrfHeaderFromRequest(request: Request): string | null {
  const value = request.headers.get(csrfHeaderName);
  return value && value.length > 0 ? value : null;
}

export function verifyCsrfToken(request: Request): boolean {
  const cookieToken = csrfTokenFromRequest(request);
  const headerToken = csrfHeaderFromRequest(request);
  if (!cookieToken || !headerToken) {
    return false;
  }
  if (cookieToken.length !== headerToken.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
  } catch {
    return false;
  }
}
