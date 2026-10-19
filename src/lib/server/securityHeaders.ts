type PageSecurityOptions = {
  nonce: string;
  secureCookies: boolean;
  development: boolean;
};

// Scripts run only with this request's nonce; 'strict-dynamic' lets those scripts load the app's own chunks.
export function pageSecurityHeaders({ nonce, secureCookies, development }: PageSecurityOptions): Record<string, string> {
  const scriptSrc = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`;
  const headers: Record<string, string> = {
    "Content-Security-Policy": [
      scriptSrc,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'"
    ].join("; ")
  };
  // Only when the owner has said every browser comes over HTTPS: HSTS covers the whole host, any port.
  if (secureCookies) {
    headers["Strict-Transport-Security"] = "max-age=31536000";
  }
  return headers;
}
