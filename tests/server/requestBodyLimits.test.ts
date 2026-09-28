import { describe, expect, it } from "vitest";

const LIMIT = 64 * 1024;

// A body that would be far too big to buffer, counting how much of it the route actually pulled.
function hugeBody(mebibytes = 256) {
  const chunk = new Uint8Array(1024 * 1024).fill(0x61);
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls > mebibytes) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    }
  });
  return { stream, pulls: () => pulls };
}

function post(url: string, body: BodyInit, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    duplex: "half"
  } as RequestInit);
}

const routes = [
  ["login", "@/app/api/auth/login/route", "http://localhost/api/auth/login"],
  ["setup", "@/app/api/auth/setup/route", "http://localhost/api/auth/setup"],
  ["pair", "@/app/api/devices/pair/route", "http://localhost/api/devices/pair"]
] as const;

describe("public JSON routes cap the request body", () => {
  it.each(routes)("%s refuses a streamed body past the cap without reading the rest", async (_name, modulePath, url) => {
    const { POST } = await import(modulePath);
    const body = hugeBody();

    const response = await POST(post(url, body.stream));

    expect(response.status).toBe(413);
    expect(body.pulls()).toBeLessThan(3);
  });

  it.each(routes)("%s refuses a declared content-length past the cap before reading", async (_name, modulePath, url) => {
    const { POST } = await import(modulePath);
    const request = post(url, "{}", { "content-length": String(LIMIT + 1) });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it.each(routes)("%s still answers a malformed small body with 400", async (_name, modulePath, url) => {
    const { POST } = await import(modulePath);

    const response = await POST(post(url, "{not json"));

    expect(response.status).toBe(400);
  });
});

describe("parseJsonObject", () => {
  it("accepts a body that starts with a UTF-8 byte order mark, as request.json() did", async () => {
    const { parseJsonObject } = await import("@/lib/server/requestBody");
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"email":"a@example.com"}')]);

    expect(parseJsonObject(withBom)).toEqual({ email: "a@example.com" });
  });

  it("rejects arrays and other non-object JSON", async () => {
    const { parseJsonObject } = await import("@/lib/server/requestBody");

    for (const text of ["[]", "null", "42", '"x"']) {
      expect(parseJsonObject(Buffer.from(text))).toBeNull();
    }
  });
});
