import { appConfig } from "@/lib/server/config";
import { type AppDatabase, getDatabase } from "@/lib/server/db";

export type RateLimitOptions = {
  bucket: string;
  key: string;
  max: number;
  windowMs: number;
};

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = {
  consume(options: RateLimitOptions): RateLimitResult;
  reset(bucket: string, key: string): void;
};

export function createRateLimiter(db: AppDatabase = getDatabase(), now: () => Date = () => new Date()): RateLimiter {
  const insertEvent = db.prepare(
    `insert into rate_limit_events (bucket, key, occurred_at) values (?, ?, ?)`
  );
  const purgeOld = db.prepare(
    `delete from rate_limit_events where bucket = ? and key = ? and occurred_at < ?`
  );
  const countRecent = db.prepare(
    `select count(*) as count from rate_limit_events where bucket = ? and key = ? and occurred_at >= ?`
  );
  const oldestRecent = db.prepare(
    `select occurred_at as occurredAt
       from rate_limit_events
       where bucket = ? and key = ? and occurred_at >= ?
       order by occurred_at asc limit 1`
  );
  const resetStmt = db.prepare(
    `delete from rate_limit_events where bucket = ? and key = ?`
  );

  return {
    consume({ bucket, key, max, windowMs }: RateLimitOptions): RateLimitResult {
      const nowDate = now();
      const cutoff = new Date(nowDate.getTime() - windowMs).toISOString();

      purgeOld.run(bucket, key, cutoff);

      const { count } = countRecent.get(bucket, key, cutoff) as { count: number };
      if (count >= max) {
        const row = oldestRecent.get(bucket, key, cutoff) as { occurredAt: string } | undefined;
        const oldest = row ? Date.parse(row.occurredAt) : nowDate.getTime();
        const retryAfterMs = Math.max(0, oldest + windowMs - nowDate.getTime());
        return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
      }

      insertEvent.run(bucket, key, nowDate.toISOString());
      return { allowed: true, remaining: Math.max(0, max - count - 1) };
    },
    reset(bucket: string, key: string) {
      resetStmt.run(bucket, key);
    }
  };
}

// The last x-forwarded-for entry is the hop our proxy appended; earlier entries are client-supplied.
export function trustedClientIp(request: Request, trustProxy = appConfig.trustProxy): string | null {
  if (!trustProxy) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",").at(-1)?.trim() || null;
}

export function clientIpFromRequest(request: Request): string {
  return trustedClientIp(request) ?? "unknown";
}
