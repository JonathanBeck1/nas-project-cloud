import { NextResponse, type NextRequest } from "next/server";
import { getAppConfig } from "@/lib/server/config";
import { pageSecurityHeaders } from "@/lib/server/securityHeaders";

// A fresh nonce per page request. Next.js reads it from the request's CSP header for its own scripts, and the
// layout reads x-nonce for the inline theme script.
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const headers = pageSecurityHeaders({
    nonce,
    secureCookies: getAppConfig().secureCookies,
    development: process.env.NODE_ENV === "development"
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", headers["Content-Security-Policy"]);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  // Node, so NAS_CLOUD_SECURE_COOKIES is read when the container runs rather than fixed at build time.
  runtime: "nodejs",
  matcher: [
    {
      // API routes set their own headers; downloads send a stricter sandboxed policy.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};
