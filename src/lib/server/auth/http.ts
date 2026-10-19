import { NextResponse } from "next/server";
import { appConfig } from "../config";
import { LOGIN_CHALLENGE_MS, SESSION_LIFETIME_DAYS, loginChallengeCookieName, sessionCookieName } from "./sessions";
import { clearCsrfCookie, createCsrfToken, withCsrfCookie } from "./csrf";

export function withSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: appConfig.secureCookies,
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_LIFETIME_DAYS
  });
  return withCsrfCookie(response, createCsrfToken());
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: appConfig.secureCookies,
    path: "/",
    maxAge: 0
  });
  return clearCsrfCookie(response);
}

// Scoped to the verify route and strict same-site: it is worth nothing without a code, but it is never needed anywhere else.
export function withLoginChallengeCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(loginChallengeCookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: appConfig.secureCookies,
    path: "/api/auth/login",
    maxAge: LOGIN_CHALLENGE_MS / 1000
  });
  return response;
}

export function clearLoginChallengeCookie(response: NextResponse): NextResponse {
  response.cookies.set(loginChallengeCookieName, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: appConfig.secureCookies,
    path: "/api/auth/login",
    maxAge: 0
  });
  return response;
}
