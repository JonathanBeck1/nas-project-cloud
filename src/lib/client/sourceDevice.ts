export const DEVICE_LABEL_STORAGE_KEY = "nas-cloud:deviceLabel";

const FALLBACK_LABEL = "Browser";

export function detectDeviceLabel(userAgent?: string | null): string {
  const ua = (userAgent ?? "").trim();
  if (!ua) {
    return FALLBACK_LABEL;
  }

  if (/iPhone/i.test(ua) || (/iPad/i.test(ua) && /Mobile/i.test(ua))) {
    return "iPhone";
  }
  if (/iPad/i.test(ua)) {
    return "iPad";
  }
  if (/Android/i.test(ua)) {
    return "Android";
  }
  if (/Windows/i.test(ua)) {
    return "Windows PC";
  }
  if (/Macintosh/i.test(ua) || /Mac OS X/i.test(ua)) {
    return "Mac";
  }
  if (/CrOS/i.test(ua)) {
    return "Chromebook";
  }
  if (/Linux/i.test(ua)) {
    return "Linux";
  }

  return FALLBACK_LABEL;
}

export function readStoredDeviceLabel(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(DEVICE_LABEL_STORAGE_KEY);
    const trimmed = raw?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function writeStoredDeviceLabel(value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      window.localStorage.removeItem(DEVICE_LABEL_STORAGE_KEY);
    } else {
      window.localStorage.setItem(DEVICE_LABEL_STORAGE_KEY, trimmed);
    }
  } catch {
    // ignore quota / unavailable
  }
}

export function resolveSourceDeviceLabel(userAgent?: string | null): string {
  return readStoredDeviceLabel() ?? detectDeviceLabel(userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : null));
}
