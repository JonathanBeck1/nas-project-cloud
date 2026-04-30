import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DEFAULT_CATEGORIES } from "@/lib/shared/defaults";
import { appConfig } from "./config";

export type AppDatabase = Database.Database;

let defaultDatabase: AppDatabase | undefined;

export function createDatabase(dbPath = appConfig.dbPath): AppDatabase {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedDefaults(db);
  return db;
}

export function getDatabase(): AppDatabase {
  if (!defaultDatabase?.open) {
    defaultDatabase = createDatabase();
  }

  return defaultDatabase;
}

function migrate(db: AppDatabase) {
  db.exec(`
    create table if not exists categories (
      id text primary key,
      name text not null,
      slug text not null unique,
      color text not null,
      is_system integer not null,
      sort_order integer not null
    );

    create table if not exists projects (
      id text primary key,
      name text not null,
      slug text not null unique,
      description text not null default '',
      category_id text references categories(id) on delete set null,
      status text not null default 'active',
      created_at text not null,
      updated_at text not null
    );

    create table if not exists files (
      id text primary key,
      name text not null,
      extension text not null,
      family text not null,
      mime_type text not null,
      size_bytes integer not null,
      checksum text not null,
      storage_path text not null unique,
      project_id text references projects(id) on delete set null,
      category_id text references categories(id) on delete set null,
      source_device text not null,
      uploaded_at text not null,
      updated_at text not null
    );

    create table if not exists tags (
      id text primary key,
      name text not null,
      slug text not null unique
    );

    create table if not exists file_tags (
      file_id text not null references files(id) on delete cascade,
      tag_id text not null references tags(id) on delete cascade,
      primary key (file_id, tag_id)
    );

    create index if not exists files_project_id_idx on files(project_id);
    create index if not exists files_category_id_idx on files(category_id);
    create index if not exists files_family_idx on files(family);
    create index if not exists files_uploaded_at_idx on files(uploaded_at);
  `);
}

function seedDefaults(db: AppDatabase) {
  const statement = db.prepare(`
    insert into categories (id, name, slug, color, is_system, sort_order)
    values (@id, @name, @slug, @color, @isSystem, @sortOrder)
    on conflict(slug) do update set
      name = excluded.name,
      color = excluded.color,
      is_system = excluded.is_system,
      sort_order = excluded.sort_order
  `);

  const insertMany = db.transaction(() => {
    for (const category of DEFAULT_CATEGORIES) {
      statement.run({
        ...category,
        isSystem: category.isSystem ? 1 : 0
      });
    }
  });

  insertMany();
}
