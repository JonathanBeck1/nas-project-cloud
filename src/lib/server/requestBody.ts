import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";

// Route handlers have no body limit of their own, so a route that buffers a body must cap it.
export const SMALL_BODY_MAX_BYTES = 64 * 1024;

/** The whole body, or null once it passes maxBytes, whether declared by content-length or actually sent. */
export async function readLimitedBody(request: Request, maxBytes: number): Promise<Buffer | null> {
  if (Number(request.headers.get("content-length")) > maxBytes) {
    return null;
  }
  if (!request.body) {
    return Buffer.alloc(0);
  }

  const parts: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return Buffer.concat(parts, total);
    }
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
}

export function parseJsonObject(raw: Buffer): Record<string, unknown> | null {
  try {
    // TextDecoder drops a leading byte order mark, as request.json() does; Buffer#toString keeps it.
    const value: unknown = JSON.parse(new TextDecoder().decode(raw));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function bodyTooLarge(maxBytes: number) {
  return NextResponse.json({ error: `request body exceeds ${maxBytes} bytes` }, { status: 413 });
}
