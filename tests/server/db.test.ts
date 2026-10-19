import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("createDatabase", () => {
  it("creates core tables and default categories", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-db-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));

    try {
      const tables = db
        .prepare<[], { name: string }>("select name from sqlite_master where type = 'table' order by name")
        .all()
        .map((row: { name: string }) => row.name);

      expect(tables).toContain("categories");
      expect(tables).toContain("projects");
      expect(tables).toContain("files");
      expect(tables).toContain("upload_sessions");
      expect(tables).toContain("file_previews");
      expect(tables).toContain("tags");
      expect(tables).toContain("file_tags");
      expect(tables).toContain("file_share_links");

      const categories = db.prepare("select slug from categories order by sort_order").all();
      expect(categories).toContainEqual({ slug: "3d-cad" });
      expect(categories).toContainEqual({ slug: "inbox" });
    } finally {
      db.close();
    }
  });

  it("adds lifecycle columns to files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-db-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const columns = db.prepare("pragma table_info(files)").all() as Array<{ name: string; dflt_value: string | null }>;

      expect(columns.map((column) => column.name)).toContain("status");
      expect(columns.map((column) => column.name)).toContain("archived_at");
      expect(columns.find((column) => column.name === "status")?.dflt_value).toBe("'active'");
    } finally {
      db.close();
    }
  });

  it("creates upload session columns for resumable uploads", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-db-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const columns = db.prepare("pragma table_info(upload_sessions)").all() as Array<{ name: string }>;

      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "id",
          "filename",
          "relative_path",
          "mime_type",
          "size_bytes",
          "received_bytes",
          "checksum",
          "user_id",
          "device_id",
          "target_kind",
          "source_device",
          "project_id",
          "project_slug",
          "category_id",
          "status",
          "temp_path",
          "storage_path",
          "error",
          "created_at",
          "updated_at",
          "completed_at"
        ])
      );
    } finally {
      db.close();
    }
  });

  it("creates preview metadata columns", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-db-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const columns = db.prepare("pragma table_info(file_previews)").all() as Array<{ name: string }>;

      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "file_id",
          "kind",
          "status",
          "preview_path",
          "width",
          "height",
          "duration_seconds",
          "error",
          "created_at",
          "updated_at"
        ])
      );
    } finally {
      db.close();
    }
  });

  it("creates file share link columns", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-db-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const columns = db.prepare("pragma table_info(file_share_links)").all() as Array<{ name: string }>;

      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "id",
          "file_id",
          "token_hash",
          "label",
          "expires_at",
          "max_downloads",
          "download_count",
          "password_hash",
          "revoked_at",
          "created_by_user_id",
          "created_at",
          "updated_at",
          "last_accessed_at"
        ])
      );
    } finally {
      db.close();
    }
  });

  it("creates file share access event columns", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-db-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const columns = db.prepare("pragma table_info(file_share_access_events)").all() as Array<{ name: string }>;

      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "id",
          "share_id",
          "file_id",
          "accessed_at",
          "user_agent",
          "ip_address"
        ])
      );
    } finally {
      db.close();
    }
  });

  it("creates auth and device trust tables", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-db-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const tables = db
        .prepare<[], { name: string }>("select name from sqlite_master where type = 'table' order by name")
        .all()
        .map((row) => row.name);

      expect(tables).toContain("users");
      expect(tables).toContain("sessions");
      expect(tables).toContain("devices");
      expect(tables).toContain("device_pairing_codes");

      const userColumns = db.prepare("pragma table_info(users)").all() as Array<{ name: string }>;
      expect(userColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["id", "email", "name", "password_hash", "role", "created_at", "updated_at"])
      );

      const sessionColumns = db.prepare("pragma table_info(sessions)").all() as Array<{ name: string }>;
      expect(sessionColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["id", "user_id", "device_id", "token_hash", "expires_at", "created_at", "last_seen_at"])
      );
    } finally {
      db.close();
    }
  });

  it("attributes files stored before accounts existed to the owner", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-db-"));
    createdDirs.push(dir);
    const dbPath = path.join(dir, "test.sqlite");
    const old = new Database(dbPath);
    old.exec(`
      create table users (
        id text primary key, email text not null unique, name text not null, password_hash text not null,
        role text not null, created_at text not null, updated_at text not null
      );
      create table files (
        id text primary key, name text not null, extension text not null, family text not null,
        mime_type text not null, size_bytes integer not null, checksum text not null,
        storage_path text not null unique, project_id text, category_id text, source_device text not null,
        uploaded_at text not null, updated_at text not null
      );
      insert into users values ('user_1', 'owner@example.test', 'Owner', 'x', 'owner', '2026-01-01', '2026-01-01');
      insert into files values ('file_1', 'a.txt', 'txt', 'document', 'text/plain', 1, 'c', 'Inbox/Mac/a.txt',
        null, null, 'Mac', '2026-01-01', '2026-01-01');
    `);
    old.close();

    const db = createDatabase(dbPath);
    try {
      expect(createMetadataRepository(db).getFileById("file_1")?.uploadedBy).toBe("user_1");
      const tables = db.prepare("select name from sqlite_master where type = 'table'").all() as Array<{ name: string }>;
      expect(tables.map((table) => table.name)).toContain("project_members");
    } finally {
      db.close();
    }
  });

  it("upgrades a 0.6 users table with two-factor off, so the owner has to enroll", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-db-"));
    createdDirs.push(dir);
    const dbPath = path.join(dir, "test.sqlite");
    const old = new Database(dbPath);
    old.exec(`
      create table users (
        id text primary key, email text not null unique, name text not null, password_hash text not null,
        role text not null, created_at text not null, updated_at text not null
      );
      insert into users values ('user_1', 'owner@example.test', 'Owner', 'x', 'owner', '2026-01-01', '2026-01-01');
    `);
    old.close();

    const db = createDatabase(dbPath);
    try {
      expect(createMetadataRepository(db).getTwoFactorState("user_1")).toEqual({
        enabled: false,
        secret: null,
        pendingSecret: null,
        lastStep: -1,
        recoveryCodesLeft: 0
      });
    } finally {
      db.close();
    }
  });
});
