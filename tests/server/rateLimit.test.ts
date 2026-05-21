import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clientIpFromRequest, createRateLimiter } from "@/lib/server/rateLimit";

function createTestDb() {
  const db = new Database(":memory:");
  db.exec(`
    create table rate_limit_events (
      id integer primary key autoincrement,
      bucket text not null,
      key text not null,
      occurred_at text not null
    );
    create index rate_limit_events_bucket_key_idx
      on rate_limit_events(bucket, key, occurred_at);
  `);
  return db;
}

describe("rateLimit", () => {
  let db: Database.Database;
  let now: Date;

  beforeEach(() => {
    db = createTestDb();
    now = new Date("2026-05-20T12:00:00.000Z");
  });

  afterEach(() => {
    db.close();
  });

  it("allows requests below the limit and reports a remaining count", () => {
    const limiter = createRateLimiter(db, () => now);
    const result = limiter.consume({ bucket: "login_email", key: "a@b", max: 3, windowMs: 60_000 });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.remaining).toBe(2);
    }
  });

  it("blocks the (max+1)th request and returns Retry-After seconds for the window edge", () => {
    const limiter = createRateLimiter(db, () => now);
    const opts = { bucket: "login_email", key: "a@b", max: 2, windowMs: 60_000 };

    expect(limiter.consume(opts).allowed).toBe(true);
    expect(limiter.consume(opts).allowed).toBe(true);

    const blocked = limiter.consume(opts);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("clears events older than the window so the bucket recovers", () => {
    let clock = new Date("2026-05-20T12:00:00.000Z").getTime();
    const limiter = createRateLimiter(db, () => new Date(clock));
    const opts = { bucket: "pair_ip_short", key: "1.2.3.4", max: 1, windowMs: 60_000 };

    expect(limiter.consume(opts).allowed).toBe(true);
    expect(limiter.consume(opts).allowed).toBe(false);

    clock += 61_000;
    expect(limiter.consume(opts).allowed).toBe(true);
  });

  it("isolates buckets and keys", () => {
    const limiter = createRateLimiter(db, () => now);
    const opts = { max: 1, windowMs: 60_000 };

    expect(limiter.consume({ ...opts, bucket: "login_ip", key: "1.1.1.1" }).allowed).toBe(true);
    expect(limiter.consume({ ...opts, bucket: "login_ip", key: "1.1.1.1" }).allowed).toBe(false);
    expect(limiter.consume({ ...opts, bucket: "login_ip", key: "2.2.2.2" }).allowed).toBe(true);
    expect(limiter.consume({ ...opts, bucket: "login_email", key: "1.1.1.1" }).allowed).toBe(true);
  });

  it("reset removes all events for a (bucket, key) pair", () => {
    const limiter = createRateLimiter(db, () => now);
    const opts = { bucket: "login_email", key: "a@b", max: 1, windowMs: 60_000 };

    expect(limiter.consume(opts).allowed).toBe(true);
    expect(limiter.consume(opts).allowed).toBe(false);

    limiter.reset(opts.bucket, opts.key);
    expect(limiter.consume(opts).allowed).toBe(true);
  });
});

describe("clientIpFromRequest", () => {
  it("prefers the first entry of x-forwarded-for", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" }
    });
    expect(clientIpFromRequest(request)).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const request = new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.42" } });
    expect(clientIpFromRequest(request)).toBe("198.51.100.42");
  });

  it("returns 'unknown' when no proxy headers are present", () => {
    expect(clientIpFromRequest(new Request("http://localhost"))).toBe("unknown");
  });
});
