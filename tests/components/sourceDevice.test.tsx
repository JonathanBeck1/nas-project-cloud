import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEVICE_LABEL_STORAGE_KEY,
  detectDeviceLabel,
  readStoredDeviceLabel,
  resolveSourceDeviceLabel,
  writeStoredDeviceLabel
} from "@/lib/client/sourceDevice";

const FIXTURES: Array<{ ua: string; expected: string }> = [
  {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    expected: "iPhone"
  },
  {
    ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    expected: "iPad"
  },
  {
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
    expected: "Android"
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    expected: "Windows PC"
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15",
    expected: "Mac"
  },
  {
    ua: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36",
    expected: "Chromebook"
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    expected: "Linux"
  },
  {
    ua: "",
    expected: "Browser"
  }
];

describe("source device detection", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("maps known user agents to friendly device labels", () => {
    for (const fixture of FIXTURES) {
      expect(detectDeviceLabel(fixture.ua)).toBe(fixture.expected);
    }
  });

  it("persists and reads a custom device label from localStorage", () => {
    expect(readStoredDeviceLabel()).toBeNull();
    writeStoredDeviceLabel("Studio Mac");
    expect(window.localStorage.getItem(DEVICE_LABEL_STORAGE_KEY)).toBe("Studio Mac");
    expect(readStoredDeviceLabel()).toBe("Studio Mac");
  });

  it("clears a custom label when an empty value is written", () => {
    writeStoredDeviceLabel("Override");
    writeStoredDeviceLabel("   ");
    expect(readStoredDeviceLabel()).toBeNull();
  });

  it("prefers a stored label over the auto-detected one", () => {
    writeStoredDeviceLabel("Field Laptop");
    expect(resolveSourceDeviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)")).toBe("Field Laptop");
    window.localStorage.clear();
    expect(resolveSourceDeviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)")).toBe("Mac");
  });
});
