import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/lib/server/db";

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
      expect(tables).toContain("tags");
      expect(tables).toContain("file_tags");

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
});
