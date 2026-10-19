// Calls App Router handlers in-process with a cookie jar, so tests go through the real guards and CSRF check.
export class Jar {
  cookies = new Map<string, string>();

  absorb(response: Response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      const value = pair.slice(index + 1);
      if (/max-age=0/i.test(raw) || value === "") {
        this.cookies.delete(pair.slice(0, index));
      } else {
        this.cookies.set(pair.slice(0, index), value);
      }
    }
    return response;
  }

  has(name: string) {
    return this.cookies.has(name);
  }

  headers(extra: Record<string, string> = {}) {
    const csrf = this.cookies.get("nas_cloud_csrf");
    return {
      cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      ...(csrf ? { "x-nas-csrf": decodeURIComponent(csrf) } : {}),
      ...extra
    };
  }
}

type CallOptions = {
  body?: unknown;
  raw?: BodyInit;
  headers?: Record<string, string>;
  params?: Record<string, string>;
};

export async function call(
  jar: Jar,
  method: "GET" | "POST" | "PATCH" | "DELETE" | "HEAD",
  modulePath: string,
  url: string,
  { body, raw, headers = {}, params }: CallOptions = {}
): Promise<Response> {
  const handlers = (await import(modulePath)) as Record<string, (...args: unknown[]) => Promise<Response>>;
  const request = new Request(`http://localhost${url}`, {
    method,
    headers: jar.headers({ ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }),
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body))
  });
  const response = params ? await handlers[method](request, { params: Promise.resolve(params) }) : await handlers[method](request);
  return jar.absorb(response);
}
