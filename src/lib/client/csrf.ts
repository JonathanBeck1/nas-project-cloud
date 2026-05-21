export const CSRF_COOKIE_NAME = "nas_cloud_csrf";
export const CSRF_HEADER_NAME = "x-nas-csrf";

export function readCsrfToken(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const raw = document.cookie ?? "";
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const name = trimmed.slice(0, equals);
    if (name === CSRF_COOKIE_NAME) {
      const value = decodeURIComponent(trimmed.slice(equals + 1));
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

export function csrfHeaders(): Record<string, string> {
  const token = readCsrfToken();
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}
