import { NextResponse } from "next/server";
import { SESSION_LIFETIME_DAYS, sessionCookieName } from "./sessions";
import { clearCsrfCookie, createCsrfToken, withCsrfCookie } from "./csrf";

export function withSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_LIFETIME_DAYS
  });
  return withCsrfCookie(response, createCsrfToken());
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return clearCsrfCookie(response);
}
