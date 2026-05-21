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

    create table if not exists file_previews (
      file_id text not null references files(id) on delete cascade,
      kind text not null,
      status text not null,
      preview_path text,
      width integer,
      height integer,
      duration_seconds real,
      error text,
      created_at text not null,
      updated_at text not null,
      primary key (file_id, kind)
    );

    create table if not exists users (
      id text primary key,
      email text not null unique,
      name text not null,
      password_hash text not null,
      role text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists devices (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      name text not null,
      kind text not null,
      created_at text not null,
      last_seen_at text
    );

    create table if not exists sessions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      device_id text references devices(id) on delete set null,
      token_hash text not null unique,
      expires_at text not null,
      created_at text not null,
      last_seen_at text not null
    );

    create table if not exists device_pairing_codes (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      code_hash text not null unique,
      device_name text not null,
      device_kind text not null,
      expires_at text not null,
      consumed_at text,
      created_at text not null
    );

    create table if not exists rate_limit_events (
      id integer primary key autoincrement,
      bucket text not null,
      key text not null,
      occurred_at text not null
    );

    create table if not exists upload_sessions (
      id text primary key,
      filename text not null,
      mime_type text not null,
      size_bytes integer not null,
      received_bytes integer not null default 0,
      checksum text,
      user_id text not null default '',
      device_id text,
      target_kind text not null,
      source_device text not null,
      project_id text references projects(id) on delete set null,
      project_slug text,
      category_id text references categories(id) on delete set null,
      status text not null default 'open',
      temp_path text not null unique,
      storage_path text,
      error text,
      created_at text not null,
      updated_at text not null,
      completed_at text
    );

    create index if not exists files_project_id_idx on files(project_id);
    create index if not exists files_category_id_idx on files(category_id);
    create index if not exists files_family_idx on files(family);
    create index if not exists files_uploaded_at_idx on files(uploaded_at);
    create index if not exists file_previews_status_idx on file_previews(status, updated_at);
    create index if not exists sessions_token_hash_idx on sessions(token_hash);
    create index if not exists sessions_user_id_idx on sessions(user_id);
    create index if not exists devices_user_id_idx on devices(user_id);
    create index if not exists device_pairing_codes_code_hash_idx on device_pairing_codes(code_hash);
    create index if not exists upload_sessions_status_idx on upload_sessions(status);
    create index if not exists rate_limit_events_bucket_key_idx
      on rate_limit_events(bucket, key, occurred_at);
  `);

  addColumnIfMissing(db, "files", "status", "text not null default 'active'");
  addColumnIfMissing(db, "files", "archived_at", "text");
  addColumnIfMissing(db, "upload_sessions", "user_id", "text not null default ''");
  addColumnIfMissing(db, "upload_sessions", "device_id", "text");
}

function addColumnIfMissing(db: AppDatabase, table: string, column: string, definition: string) {
  const columns = db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((existing) => existing.name === column)) {
    db.exec(`alter table ${table} add column ${column} ${definition}`);
  }
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
