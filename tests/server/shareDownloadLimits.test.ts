import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { resetAppConfigForTesting } from "@/lib/server/config";
import { createMetadataRepository } from "@/lib/server/metadata";
import { hashShareToken } from "@/lib/server/shareLinks";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@/lib/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/db")>()),
  getDatabase: () => state.db
}));

vi.mock("@/lib/server/auth/passwords", () => ({
  hashPassword: vi.fn(async () => "scrypt:salt:hash"),
  verifyPassword: vi.fn(async (password: string) => password === "correct horse")
}));

let dir: string;
let db: AppDatabase;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-share-limits-"));
  fs.mkdirSync(path.join(dir, "storage", "Inbox", "Browser"), { recursive: true });
  fs.writeFileSync(path.join(dir, "storage", "Inbox", "Browser", "manual.pdf"), "manual");
  process.env.NAS_CLOUD_STORAGE_ROOT = path.join(dir, "storage");
  resetAppConfigForTesting();
  db = createDatabase(path.join(dir, "test.sqlite"));
  state.db = db;
});

afterEach(() => {
  db.close();
  delete process.env.NAS_CLOUD_STORAGE_ROOT;
  resetAppConfigForTesting();
  fs.rmSync(dir, { recursive: true, force: true });
});

function shareFor(options: { maxDownloads?: number | null; passwordHash?: string | null }) {
  const repo = createMetadataRepository(db);
  const user = repo.createUser({ email: "owner@example.test", name: "Owner", passwordHash: "x", role: "owner" });
  const file = repo.createFile({
    name: "manual.pdf",
    extension: "pdf",
    family: "document",
    mimeType: "application/pdf",
    sizeBytes: 6,
    checksum: "abc",
    storagePath: "Inbox/Browser/manual.pdf",
    sourceDevice: "Browser"
  });
  return repo.createFileShareLink({
    fileId: file.id,
    tokenHash: hashShareToken("share-token"),
    createdByUserId: user.id,
    maxDownloads: options.maxDownloads ?? null,
    passwordHash: options.passwordHash ?? null
  });
}

const context = { params: Promise.resolve({ token: "share-token" }) };

describe("share download limits", () => {
  it("lets exactly one of two simultaneous requests use the last download", async () => {
    const { GET } = await import("@/app/api/shares/[token]/download/route");
    const share = shareFor({ maxDownloads: 1 });
    const request = () => GET(new Request("http://localhost/api/shares/share-token/download"), context);

    const responses = await Promise.all([request(), request()]);
    await Promise.all(responses.map((response) => response.text()));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 404]);
    const row = db.prepare("select download_count as count from file_share_links where id = ?").get(share.id);
    expect(row).toEqual({ count: 1 });
  });

  it("does not count downloads on a revoked link", () => {
    const repo = createMetadataRepository(db);
    const share = shareFor({});
    db.prepare("update file_share_links set revoked_at = ? where id = ?").run(new Date().toISOString(), share.id);

    expect(repo.recordFileShareDownload(share.id)).toBeNull();
    expect(db.prepare("select download_count as count from file_share_links where id = ?").get(share.id)).toEqual({
      count: 0
    });
  });

  it("locks a share after ten password attempts in fifteen minutes", async () => {
    const { POST } = await import("@/app/api/shares/[token]/download/route");
    shareFor({ passwordHash: "scrypt:salt:hash" });
    const attempt = (password: string) =>
      POST(
        new Request("http://localhost/api/shares/share-token/download", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password })
        }),
        context
      );

    for (let index = 0; index < 10; index += 1) {
      expect((await attempt("wrong")).status).toBe(401);
    }
    const locked = await attempt("correct horse");

    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("does not spend password attempts on requests that carry no password", async () => {
    const { GET, POST } = await import("@/app/api/shares/[token]/download/route");
    shareFor({ passwordHash: "scrypt:salt:hash" });

    for (let index = 0; index < 12; index += 1) {
      expect((await GET(new Request("http://localhost/api/shares/share-token/download"), context)).status).toBe(401);
    }
    const response = await POST(
      new Request("http://localhost/api/shares/share-token/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "correct horse" })
      }),
      context
    );

    expect(response.status).toBe(200);
    await response.text();
  });

  describe("request bodies", () => {
    function hugeBody() {
      const chunk = new Uint8Array(1024 * 1024);
      let pulls = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          if (pulls > 256) {
            controller.close();
            return;
          }
          controller.enqueue(chunk);
        }
      });
      return { stream, pulls: () => pulls };
    }
    const postShare = (token: string, body: BodyInit, contentType: string) =>
      new Request(`http://localhost/api/shares/${token}/download`, {
        method: "POST",
        headers: { "content-type": contentType },
        body,
        duplex: "half"
      } as RequestInit);

    it("does not read the body at all for an unknown token", async () => {
      const { POST } = await import("@/app/api/shares/[token]/download/route");
      const body = hugeBody();

      const response = await POST(postShare("no-such-token", body.stream, "multipart/form-data; boundary=x"), {
        params: Promise.resolve({ token: "no-such-token" })
      });

      expect(response.status).toBe(404);
      expect(body.pulls()).toBeLessThan(2);
    });

    it("caps the password body on a protected share", async () => {
      const { POST } = await import("@/app/api/shares/[token]/download/route");
      shareFor({ passwordHash: "scrypt:salt:hash" });
      const body = hugeBody();

      const response = await POST(postShare("share-token", body.stream, "application/x-www-form-urlencoded"), context);

      expect(response.status).toBe(413);
      expect(body.pulls()).toBeLessThan(3);
    });

    it("accepts the password from the share page's urlencoded form", async () => {
      const { POST } = await import("@/app/api/shares/[token]/download/route");
      shareFor({ passwordHash: "scrypt:salt:hash" });

      const response = await POST(
        postShare("share-token", "password=correct+horse", "application/x-www-form-urlencoded"),
        context
      );

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe("manual");
    });

    it("no longer parses multipart bodies", async () => {
      const { POST } = await import("@/app/api/shares/[token]/download/route");
      shareFor({ passwordHash: "scrypt:salt:hash" });
      const multipart = '--x\r\nContent-Disposition: form-data; name="password"\r\n\r\ncorrect horse\r\n--x--\r\n';

      const response = await POST(postShare("share-token", multipart, "multipart/form-data; boundary=x"), context);

      expect(response.status).toBe(401);
    });
  });
});
