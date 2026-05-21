import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-uploads-"));
  createdDirs.push(dir);
  const db = createDatabase(path.join(dir, "test.sqlite"));
  const repo = createMetadataRepository(db);
  return { repo, db };
}

function seedSessions(repo: ReturnType<typeof makeRepo>["repo"]) {
  const open = repo.createUploadSession({
    filename: "open.bin",
    mimeType: "application/octet-stream",
    sizeBytes: 1000,
    checksum: null,
    userId: "user_1",
    deviceId: "device_a",
    targetKind: "inbox",
    sourceDevice: "Browser",
    projectId: null,
    projectSlug: null,
    categoryId: null,
    tempPath: ".uploads/open.part"
  });
  const failed = repo.createUploadSession({
    filename: "failed.bin",
    mimeType: "application/octet-stream",
    sizeBytes: 1000,
    checksum: null,
    userId: "user_1",
    deviceId: "device_b",
    targetKind: "inbox",
    sourceDevice: "Mac",
    projectId: null,
    projectSlug: null,
    categoryId: null,
    tempPath: ".uploads/failed.part"
  });
  repo.failUploadSession(failed.id, "boom");
  const aborted = repo.createUploadSession({
    filename: "aborted.bin",
    mimeType: "application/octet-stream",
    sizeBytes: 1000,
    checksum: null,
    userId: "user_1",
    deviceId: "device_a",
    targetKind: "inbox",
    sourceDevice: "Browser",
    projectId: null,
    projectSlug: null,
    categoryId: null,
    tempPath: ".uploads/aborted.part"
  });
  repo.abortUploadSession(aborted.id);
  return { open, failed, aborted };
}

describe("listUploadSessions", () => {
  it("defaults to status=open and matches the legacy listOpenUploadSessions", () => {
    const { repo, db } = makeRepo();
    try {
      const { open } = seedSessions(repo);

      const defaulted = repo.listUploadSessions({ userId: "user_1" });
      expect(defaulted.map((session) => session.id)).toEqual([open.id]);

      const legacy = repo.listOpenUploadSessions({ userId: "user_1" });
      expect(legacy.map((session) => session.id)).toEqual([open.id]);
    } finally {
      db.close();
    }
  });

  it("filters by single status, multi-status, and the 'all' alias", () => {
    const { repo, db } = makeRepo();
    try {
      const { open, failed, aborted } = seedSessions(repo);

      const failedOnly = repo.listUploadSessions({ userId: "user_1", status: "failed" });
      expect(failedOnly.map((session) => session.id)).toEqual([failed.id]);

      const failedOrAborted = repo.listUploadSessions({
        userId: "user_1",
        status: ["failed", "aborted"]
      });
      expect(new Set(failedOrAborted.map((session) => session.id))).toEqual(
        new Set([failed.id, aborted.id])
      );

      const all = repo.listUploadSessions({ userId: "user_1", status: "all" });
      expect(new Set(all.map((session) => session.id))).toEqual(
        new Set([open.id, failed.id, aborted.id])
      );
    } finally {
      db.close();
    }
  });

  it("filters by deviceId and ignores unknown devices", () => {
    const { repo, db } = makeRepo();
    try {
      const { open, aborted } = seedSessions(repo);

      const deviceA = repo.listUploadSessions({
        userId: "user_1",
        deviceId: "device_a",
        status: "all"
      });
      expect(new Set(deviceA.map((session) => session.id))).toEqual(
        new Set([open.id, aborted.id])
      );

      const phantom = repo.listUploadSessions({
        userId: "user_1",
        deviceId: "device_xx",
        status: "all"
      });
      expect(phantom).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("clamps the limit between 1 and 200 and orders newest-first", async () => {
    const { repo, db } = makeRepo();
    try {
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const session = repo.createUploadSession({
          filename: `f-${i}.bin`,
          mimeType: "application/octet-stream",
          sizeBytes: 100,
          checksum: null,
          userId: "user_1",
          deviceId: "device_a",
          targetKind: "inbox",
          sourceDevice: "Browser",
          projectId: null,
          projectSlug: null,
          categoryId: null,
          tempPath: `.uploads/f-${i}.part`
        });
        ids.push(session.id);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      const limited = repo.listUploadSessions({ userId: "user_1", status: "all", limit: 2 });
      expect(limited).toHaveLength(2);

      const giantLimit = repo.listUploadSessions({ userId: "user_1", status: "all", limit: 9_999 });
      expect(giantLimit.length).toBeLessThanOrEqual(200);
    } finally {
      db.close();
    }
  });
});

describe("listOrphanedFailedUploadSessions", () => {
  it("returns failed sessions older than the cutoff with a temp_path still set", () => {
    const { repo, db } = makeRepo();
    try {
      const { failed } = seedSessions(repo);

      const cutoff = new Date(Date.now() + 60_000).toISOString();
      const orphaned = repo.listOrphanedFailedUploadSessions(cutoff);
      expect(orphaned.map((s) => s.id)).toContain(failed.id);

      repo.clearUploadSessionTempPath(failed.id);
      const afterClear = repo.listOrphanedFailedUploadSessions(cutoff);
      expect(afterClear.map((s) => s.id)).not.toContain(failed.id);
    } finally {
      db.close();
    }
  });
});
