# NAS Project Cloud MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first filesystem-backed MVP for a TrueNAS-hosted, project-first personal file cloud with Inbox, Projects, categories, tags, uploads, metadata, smart views, and a serious workspace UI.

**Architecture:** Start with a single Next.js app that owns the custom workflow UI and local API routes. Store real files in a human-readable filesystem tree, store metadata in SQLite during local development, and keep the service interfaces clean so TrueNAS/Postgres/OpenCloud integration can follow without rewriting the UI.

**Tech Stack:** Next.js App Router, TypeScript, React, Tailwind CSS, Node filesystem APIs, SQLite via `better-sqlite3`, Vitest, React Testing Library, Playwright, Docker Compose.

---

## Scope

This plan implements the first useful local-core MVP. It does not integrate OpenCloud or Nextcloud directly. It creates the custom app, proves the filesystem-backed storage model, and includes a documented storage-engine spike so the next plan can choose OpenCloud or Nextcloud with evidence. Preview generation, a richer visual Settings screen, and desktop device agents are separate plans because they can be built and verified independently after the local-core app is running.

## File Structure

- Create `package.json`: project scripts and dependencies.
- Create `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `tailwind.config.ts`, `vitest.config.ts`: app and test configuration.
- Create `src/app/layout.tsx`: global app layout.
- Create `src/app/page.tsx`: workspace screen.
- Create `src/app/globals.css`: design tokens and base styles.
- Create `src/app/api/files/route.ts`: list/search files and upload files.
- Create `src/app/api/files/[id]/route.ts`: update file metadata and return detail data.
- Create `src/app/api/projects/route.ts`: list and create projects.
- Create `src/app/api/categories/route.ts`: list and update categories.
- Create `src/app/api/tags/route.ts`: list and create tags.
- Create `src/app/api/smart-views/[view]/route.ts`: return smart-view file lists.
- Create `src/components/workspace/AppShell.tsx`: primary workspace layout.
- Create `src/components/workspace/CommandBar.tsx`: search, upload, new project, and view controls.
- Create `src/components/workspace/Sidebar.tsx`: Projects, Inbox, categories, smart views, devices, settings.
- Create `src/components/workspace/FileGrid.tsx`: grid/list file display.
- Create `src/components/workspace/DetailDrawer.tsx`: selected file/project detail panel.
- Create `src/components/workspace/DropZone.tsx`: drag-and-drop upload behavior.
- Create `src/components/workspace/ProjectDialog.tsx`: project creation dialog.
- Create `src/lib/server/config.ts`: environment-backed paths and limits.
- Create `src/lib/server/db.ts`: SQLite connection and schema bootstrap.
- Create `src/lib/server/storage.ts`: filesystem path and file-writing service.
- Create `src/lib/server/metadata.ts`: metadata repository.
- Create `src/lib/server/smartViews.ts`: smart-view query rules.
- Create `src/lib/server/indexer.ts`: scanner that syncs filesystem state into metadata.
- Create `src/lib/shared/types.ts`: shared app types.
- Create `src/lib/shared/fileTypes.ts`: MIME/extension helpers.
- Create `src/lib/shared/defaults.ts`: category and smart-view presets.
- Create `scripts/index-storage.ts`: one-shot indexer command.
- Create `docs/research/storage-engine-spike.md`: OpenCloud/Nextcloud/direct-filesystem evaluation checklist and findings template.
- Create `docker/Dockerfile`: production app image.
- Create `docker/docker-compose.truenas.yml`: TrueNAS-style deployment with dataset and database mounts.
- Create `tests/server/*.test.ts`: unit tests for storage, metadata, smart views, and indexing.
- Create `tests/components/*.test.tsx`: UI component tests.
- Create `tests/e2e/workspace.spec.ts`: smoke test for the browser workflow.
- Create `.env.example`: local environment template.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `vitest.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `.env.example`

- [ ] **Step 1: Create package manifest**

Create `package.json`:

```json
{
  "name": "nas-project-cloud",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "index:storage": "tsx scripts/index-storage.ts"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-scroll-area": "^1.2.3",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-slot": "^1.1.2",
    "better-sqlite3": "^11.8.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "nanoid": "^5.0.9",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.1",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.17.0",
    "eslint-config-next": "^15.1.0",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and npm exits with code 0.

- [ ] **Step 3: Create app configuration**

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2gb"
    }
  }
};

export default nextConfig;
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `postcss.config.mjs`:

```js
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};

export default config;
```

Create `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#f7f8f3",
        ink: "#171916",
        muted: "#626b5f",
        line: "#d8ded2",
        panel: "#ffffff",
        accent: "#256d5a",
        signal: "#b25f2c",
        steel: "#3b5f73"
      },
      boxShadow: {
        panel: "0 1px 2px rgba(23, 25, 22, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
```

Create `vitest.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
```

- [ ] **Step 4: Create base app files**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NAS Project Cloud",
  description: "Project-first local file cloud for TrueNAS"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
  background: #f7f8f3;
  color: #171916;
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
  margin: 0;
}

body {
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  background: #f7f8f3;
  color: #171916;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}
```

Create `.env.example`:

```bash
NAS_CLOUD_STORAGE_ROOT=.data/storage
NAS_CLOUD_DB_PATH=.data/nas-cloud.sqlite
NAS_CLOUD_PUBLIC_BASE_PATH=/files
NAS_CLOUD_MAX_UPLOAD_BYTES=2147483648
```

- [ ] **Step 5: Run baseline verification**

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

Run: `npm test`

Expected: PASS with no tests found or PASS after setup exists in Task 2.

- [ ] **Step 6: Commit scaffold**

```bash
git add package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs tailwind.config.ts vitest.config.ts src/app/layout.tsx src/app/globals.css .env.example
git commit -m "chore: scaffold NAS project cloud app"
```

## Task 2: Shared Types And Defaults

**Files:**
- Create: `src/lib/shared/types.ts`
- Create: `src/lib/shared/defaults.ts`
- Create: `src/lib/shared/fileTypes.ts`
- Create: `tests/setup.ts`
- Create: `tests/server/fileTypes.test.ts`

- [ ] **Step 1: Create test setup**

Create `tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Write failing file type tests**

Create `tests/server/fileTypes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyFile } from "@/lib/shared/fileTypes";

describe("classifyFile", () => {
  it("classifies CAD and 3D print files", () => {
    expect(classifyFile("bracket.stl")).toEqual({
      extension: "stl",
      family: "cad",
      label: "STL Model"
    });
    expect(classifyFile("fixture.3mf")).toEqual({
      extension: "3mf",
      family: "cad",
      label: "3MF Project"
    });
  });

  it("classifies media files", () => {
    expect(classifyFile("render.webm").family).toBe("video");
    expect(classifyFile("scan.tiff").family).toBe("image");
    expect(classifyFile("thumbnail.png").family).toBe("image");
  });

  it("falls back to generic binary files", () => {
    expect(classifyFile("machine.jlb")).toEqual({
      extension: "jlb",
      family: "other",
      label: "JLB File"
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/server/fileTypes.test.ts`

Expected: FAIL with an import error for `@/lib/shared/fileTypes`.

- [ ] **Step 4: Create shared types**

Create `src/lib/shared/types.ts`:

```ts
export type FileFamily = "cad" | "image" | "video" | "document" | "archive" | "software" | "other";

export type ProjectStatus = "active" | "paused" | "complete" | "archived";

export type Category = {
  id: string;
  name: string;
  slug: string;
  color: string;
  isSystem: boolean;
  sortOrder: number;
};

export type Tag = {
  id: string;
  name: string;
  slug: string;
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type CloudFile = {
  id: string;
  name: string;
  extension: string;
  family: FileFamily;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storagePath: string;
  projectId: string | null;
  categoryId: string | null;
  sourceDevice: string;
  uploadedAt: string;
  updatedAt: string;
  tags: Tag[];
};

export type SmartViewKey =
  | "inbox"
  | "recent"
  | "unsorted"
  | "large-files"
  | "cad"
  | "media"
  | "images"
  | "videos"
  | "from-windows"
  | "from-mac";

export type FileClassification = {
  extension: string;
  family: FileFamily;
  label: string;
};
```

- [ ] **Step 5: Create default presets**

Create `src/lib/shared/defaults.ts`:

```ts
import type { Category, SmartViewKey } from "./types";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat_cad", name: "3D / CAD", slug: "3d-cad", color: "#3b5f73", isSystem: true, sortOrder: 10 },
  { id: "cat_media", name: "Media", slug: "media", color: "#b25f2c", isSystem: true, sortOrder: 20 },
  { id: "cat_documents", name: "Documents", slug: "documents", color: "#256d5a", isSystem: true, sortOrder: 30 },
  { id: "cat_software", name: "Software", slug: "software", color: "#6650a4", isSystem: true, sortOrder: 40 },
  { id: "cat_personal", name: "Personal", slug: "personal", color: "#735f32", isSystem: true, sortOrder: 50 },
  { id: "cat_archive", name: "Archive", slug: "archive", color: "#626b5f", isSystem: true, sortOrder: 60 },
  { id: "cat_inbox", name: "Inbox", slug: "inbox", color: "#9a6b25", isSystem: true, sortOrder: 70 }
];

export const SMART_VIEWS: Array<{ key: SmartViewKey; name: string; description: string }> = [
  { key: "inbox", name: "Inbox", description: "Files waiting to be sorted" },
  { key: "recent", name: "Recent Uploads", description: "Newest files first" },
  { key: "unsorted", name: "Unsorted", description: "Files without a project" },
  { key: "large-files", name: "Large Files", description: "Files larger than 1 GB" },
  { key: "cad", name: "CAD Files", description: "STL, 3MF, STEP, OBJ, and related files" },
  { key: "media", name: "Media", description: "Images and videos" },
  { key: "images", name: "Images", description: "Image files" },
  { key: "videos", name: "Videos", description: "Video files" },
  { key: "from-windows", name: "From Windows PC", description: "Files uploaded from Windows devices" },
  { key: "from-mac", name: "From Mac", description: "Files uploaded from macOS devices" }
];
```

- [ ] **Step 6: Implement file classification**

Create `src/lib/shared/fileTypes.ts`:

```ts
import type { FileClassification, FileFamily } from "./types";

const LABELS: Record<string, string> = {
  "3mf": "3MF Project",
  stl: "STL Model",
  step: "STEP Model",
  stp: "STEP Model",
  obj: "OBJ Model",
  f3d: "Fusion 360 Design",
  webm: "WebM Video",
  mp4: "MP4 Video",
  mov: "QuickTime Video",
  png: "PNG Image",
  jpg: "JPEG Image",
  jpeg: "JPEG Image",
  tiff: "TIFF Image",
  tif: "TIFF Image",
  pdf: "PDF Document",
  zip: "ZIP Archive",
  "7z": "7Z Archive",
  dmg: "macOS Disk Image",
  exe: "Windows Executable"
};

const FAMILIES: Record<FileFamily, Set<string>> = {
  cad: new Set(["3mf", "stl", "step", "stp", "obj", "f3d", "blend", "gcode"]),
  image: new Set(["png", "jpg", "jpeg", "tiff", "tif", "gif", "webp", "heic", "svg"]),
  video: new Set(["webm", "mp4", "mov", "mkv", "avi", "m4v"]),
  document: new Set(["pdf", "doc", "docx", "xls", "xlsx", "txt", "md", "csv"]),
  archive: new Set(["zip", "7z", "rar", "tar", "gz"]),
  software: new Set(["dmg", "exe", "msi", "pkg", "appimage"]),
  other: new Set()
};

export function classifyFile(filename: string): FileClassification {
  const extension = extensionFromName(filename);
  const family = familyForExtension(extension);
  const label = LABELS[extension] ?? `${extension.toUpperCase()} File`;

  return { extension, family, label };
}

export function extensionFromName(filename: string): string {
  const lastSegment = filename.split(/[\\/]/).pop() ?? filename;
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === lastSegment.length - 1) {
    return "file";
  }

  return lastSegment.slice(dotIndex + 1).toLowerCase();
}

function familyForExtension(extension: string): FileFamily {
  for (const [family, extensions] of Object.entries(FAMILIES) as Array<[FileFamily, Set<string>]>) {
    if (extensions.has(extension)) {
      return family;
    }
  }

  return "other";
}
```

- [ ] **Step 7: Run tests**

Run: `npm test -- tests/server/fileTypes.test.ts`

Expected: PASS for all three tests.

- [ ] **Step 8: Commit shared types**

```bash
git add src/lib/shared tests/setup.ts tests/server/fileTypes.test.ts
git commit -m "feat: add file classification presets"
```

## Task 3: Configuration And Storage Paths

**Files:**
- Create: `src/lib/server/config.ts`
- Create: `tests/server/config.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `tests/server/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveAppConfig } from "@/lib/server/config";

describe("resolveAppConfig", () => {
  it("uses safe local defaults", () => {
    const config = resolveAppConfig({});
    expect(config.storageRoot.endsWith(".data/storage")).toBe(true);
    expect(config.dbPath.endsWith(".data/nas-cloud.sqlite")).toBe(true);
    expect(config.maxUploadBytes).toBe(2_147_483_648);
  });

  it("honors explicit environment values", () => {
    const config = resolveAppConfig({
      NAS_CLOUD_STORAGE_ROOT: "/mnt/nas-cloud",
      NAS_CLOUD_DB_PATH: "/data/cloud.sqlite",
      NAS_CLOUD_MAX_UPLOAD_BYTES: "1024"
    });

    expect(config.storageRoot).toBe("/mnt/nas-cloud");
    expect(config.dbPath).toBe("/data/cloud.sqlite");
    expect(config.maxUploadBytes).toBe(1024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/config.test.ts`

Expected: FAIL with an import error for `@/lib/server/config`.

- [ ] **Step 3: Implement config resolver**

Create `src/lib/server/config.ts`:

```ts
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  NAS_CLOUD_STORAGE_ROOT: z.string().min(1).default(".data/storage"),
  NAS_CLOUD_DB_PATH: z.string().min(1).default(".data/nas-cloud.sqlite"),
  NAS_CLOUD_PUBLIC_BASE_PATH: z.string().min(1).default("/files"),
  NAS_CLOUD_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(2_147_483_648)
});

export type AppConfig = {
  storageRoot: string;
  dbPath: string;
  publicBasePath: string;
  maxUploadBytes: number;
};

export function resolveAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);

  return {
    storageRoot: path.resolve(parsed.NAS_CLOUD_STORAGE_ROOT),
    dbPath: path.resolve(parsed.NAS_CLOUD_DB_PATH),
    publicBasePath: parsed.NAS_CLOUD_PUBLIC_BASE_PATH,
    maxUploadBytes: parsed.NAS_CLOUD_MAX_UPLOAD_BYTES
  };
}

export const appConfig = resolveAppConfig();
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/server/config.test.ts`

Expected: PASS for both tests.

- [ ] **Step 5: Commit config**

```bash
git add src/lib/server/config.ts tests/server/config.test.ts
git commit -m "feat: add app configuration"
```

## Task 4: SQLite Schema And Bootstrap

**Files:**
- Create: `src/lib/server/db.ts`
- Create: `tests/server/db.test.ts`

- [ ] **Step 1: Write failing database bootstrap tests**

Create `tests/server/db.test.ts`:

```ts
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

    const tables = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
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
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/db.test.ts`

Expected: FAIL with an import error for `@/lib/server/db`.

- [ ] **Step 3: Implement database bootstrap**

Create `src/lib/server/db.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DEFAULT_CATEGORIES } from "@/lib/shared/defaults";
import { appConfig } from "./config";

export type AppDatabase = Database.Database;

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
  return createDatabase();
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
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/server/db.test.ts`

Expected: PASS for the bootstrap test.

- [ ] **Step 5: Commit database bootstrap**

```bash
git add src/lib/server/db.ts tests/server/db.test.ts
git commit -m "feat: bootstrap metadata database"
```

## Task 5: Filesystem Storage Service

**Files:**
- Create: `src/lib/server/storage.ts`
- Create: `tests/server/storage.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `tests/server/storage.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStorageService } from "@/lib/server/storage";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("storage service", () => {
  it("writes inbox files under the source device", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(root);
    const storage = createStorageService(root);

    const result = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "Windows-PC" },
      filename: "part.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("solid data")
    });

    expect(result.relativePath).toBe("Inbox/Windows-PC/part.stl");
    expect(fs.existsSync(result.absolutePath)).toBe(true);
    expect(result.sizeBytes).toBe(10);
  });

  it("deduplicates filenames without overwriting existing files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(root);
    const storage = createStorageService(root);

    await storage.writeUpload({
      target: { kind: "project", projectSlug: "print-parts" },
      filename: "plate.png",
      mimeType: "image/png",
      bytes: Buffer.from("first")
    });

    const second = await storage.writeUpload({
      target: { kind: "project", projectSlug: "print-parts" },
      filename: "plate.png",
      mimeType: "image/png",
      bytes: Buffer.from("second")
    });

    expect(second.relativePath).toBe("Projects/print-parts/Inbox/plate-2.png");
    expect(fs.readFileSync(second.absolutePath, "utf8")).toBe("second");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/storage.test.ts`

Expected: FAIL with an import error for `@/lib/server/storage`.

- [ ] **Step 3: Implement filesystem storage service**

Create `src/lib/server/storage.ts`:

```ts
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { appConfig } from "./config";

export type UploadTarget =
  | { kind: "inbox"; sourceDevice: string }
  | { kind: "project"; projectSlug: string };

export type WriteUploadInput = {
  target: UploadTarget;
  filename: string;
  mimeType: string;
  bytes: Buffer;
};

export type StoredFile = {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
  checksum: string;
  mimeType: string;
};

export function createStorageService(root = appConfig.storageRoot) {
  const storageRoot = path.resolve(root);

  return {
    async writeUpload(input: WriteUploadInput): Promise<StoredFile> {
      const safeName = sanitizeFilename(input.filename);
      const relativeDirectory = targetDirectory(input.target);
      const absoluteDirectory = path.join(storageRoot, relativeDirectory);
      await fs.mkdir(absoluteDirectory, { recursive: true });

      const absolutePath = await nextAvailablePath(absoluteDirectory, safeName);
      await fs.writeFile(absolutePath, input.bytes, { flag: "wx" });

      const relativePath = path.relative(storageRoot, absolutePath).split(path.sep).join("/");
      return {
        absolutePath,
        relativePath,
        sizeBytes: input.bytes.length,
        checksum: sha256(input.bytes),
        mimeType: input.mimeType || "application/octet-stream"
      };
    },

    absolutePathFor(relativePath: string) {
      const absolutePath = path.resolve(storageRoot, relativePath);
      if (!absolutePath.startsWith(storageRoot)) {
        throw new Error("Storage path escapes configured root");
      }
      return absolutePath;
    }
  };
}

function targetDirectory(target: UploadTarget): string {
  if (target.kind === "inbox") {
    return path.join("Inbox", sanitizePathSegment(target.sourceDevice));
  }

  return path.join("Projects", sanitizePathSegment(target.projectSlug), "Inbox");
}

function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim();
  return base.length > 0 ? base : "upload.bin";
}

function sanitizePathSegment(segment: string): string {
  return segment.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim() || "unknown-device";
}

async function nextAvailablePath(directory: string, filename: string): Promise<string> {
  const parsed = path.parse(filename);
  for (let index = 1; index < 10_000; index += 1) {
    const candidateName = index === 1 ? filename : `${parsed.name}-${index}${parsed.ext}`;
    const candidatePath = path.join(directory, candidateName);
    try {
      await fs.access(candidatePath);
    } catch {
      return candidatePath;
    }
  }

  throw new Error(`Could not allocate filename for ${filename}`);
}

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/server/storage.test.ts`

Expected: PASS for both storage tests.

- [ ] **Step 5: Commit storage service**

```bash
git add src/lib/server/storage.ts tests/server/storage.test.ts
git commit -m "feat: add filesystem storage service"
```

## Task 6: Metadata Repository And Smart Views

**Files:**
- Create: `src/lib/server/metadata.ts`
- Create: `src/lib/server/smartViews.ts`
- Create: `tests/server/metadata.test.ts`
- Create: `tests/server/smartViews.test.ts`

- [ ] **Step 1: Write failing metadata tests**

Create `tests/server/metadata.test.ts`:

```ts
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

describe("metadata repository", () => {
  it("creates projects and records uploaded files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-meta-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    const repo = createMetadataRepository(db);

    const project = repo.createProject({ name: "Print Parts", description: "Printer upgrades", categoryId: "cat_cad" });
    const file = repo.createFile({
      name: "bracket.stl",
      extension: "stl",
      family: "cad",
      mimeType: "model/stl",
      sizeBytes: 123,
      checksum: "abc",
      storagePath: "Projects/print-parts/Inbox/bracket.stl",
      projectId: project.id,
      categoryId: "cat_cad",
      sourceDevice: "Windows-PC"
    });

    expect(repo.listProjects()).toHaveLength(1);
    expect(repo.listFiles({ query: "bracket" })).toEqual([file]);
  });
});
```

- [ ] **Step 2: Write failing smart view tests**

Create `tests/server/smartViews.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { listSmartViewFiles } from "@/lib/server/smartViews";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("listSmartViewFiles", () => {
  it("returns CAD, media, unsorted, and large file views", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-views-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    const repo = createMetadataRepository(db);

    repo.createFile({
      name: "fixture.3mf",
      extension: "3mf",
      family: "cad",
      mimeType: "model/3mf",
      sizeBytes: 500,
      checksum: "a",
      storagePath: "Inbox/Windows-PC/fixture.3mf",
      projectId: null,
      categoryId: "cat_cad",
      sourceDevice: "Windows-PC"
    });

    repo.createFile({
      name: "tour.webm",
      extension: "webm",
      family: "video",
      mimeType: "video/webm",
      sizeBytes: 2_000_000_000,
      checksum: "b",
      storagePath: "Inbox/MacBook-Pro/tour.webm",
      projectId: null,
      categoryId: "cat_media",
      sourceDevice: "MacBook-Pro"
    });

    expect(listSmartViewFiles(db, "cad")).toHaveLength(1);
    expect(listSmartViewFiles(db, "media")).toHaveLength(1);
    expect(listSmartViewFiles(db, "unsorted")).toHaveLength(2);
    expect(listSmartViewFiles(db, "large-files")).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/server/metadata.test.ts tests/server/smartViews.test.ts`

Expected: FAIL with import errors for `metadata` and `smartViews`.

- [ ] **Step 4: Implement metadata repository**

Create `src/lib/server/metadata.ts`:

```ts
import { nanoid } from "nanoid";
import type { Category, CloudFile, FileFamily, Project, ProjectStatus, Tag } from "@/lib/shared/types";
import type { AppDatabase } from "./db";

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category_id: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
};

type FileRow = {
  id: string;
  name: string;
  extension: string;
  family: FileFamily;
  mime_type: string;
  size_bytes: number;
  checksum: string;
  storage_path: string;
  project_id: string | null;
  category_id: string | null;
  source_device: string;
  uploaded_at: string;
  updated_at: string;
};

export type CreateProjectInput = {
  name: string;
  description: string;
  categoryId: string | null;
};

export type CreateFileInput = {
  name: string;
  extension: string;
  family: FileFamily;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storagePath: string;
  projectId: string | null;
  categoryId: string | null;
  sourceDevice: string;
};

export function createMetadataRepository(db: AppDatabase) {
  return {
    listCategories(): Category[] {
      return db
        .prepare("select * from categories order by sort_order asc")
        .all()
        .map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          color: row.color,
          isSystem: row.is_system === 1,
          sortOrder: row.sort_order
        }));
    },

    listProjects(): Project[] {
      return db.prepare("select * from projects order by updated_at desc").all().map(projectFromRow);
    },

    createProject(input: CreateProjectInput): Project {
      const now = new Date().toISOString();
      const project: Project = {
        id: `proj_${nanoid(12)}`,
        name: input.name.trim(),
        slug: slugify(input.name),
        description: input.description.trim(),
        categoryId: input.categoryId,
        status: "active",
        createdAt: now,
        updatedAt: now
      };

      db.prepare(`
        insert into projects (id, name, slug, description, category_id, status, created_at, updated_at)
        values (@id, @name, @slug, @description, @categoryId, @status, @createdAt, @updatedAt)
      `).run(project);

      return project;
    },

    createFile(input: CreateFileInput): CloudFile {
      const now = new Date().toISOString();
      const file: CloudFile = {
        id: `file_${nanoid(12)}`,
        name: input.name,
        extension: input.extension,
        family: input.family,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum,
        storagePath: input.storagePath,
        projectId: input.projectId,
        categoryId: input.categoryId,
        sourceDevice: input.sourceDevice,
        uploadedAt: now,
        updatedAt: now,
        tags: []
      };

      db.prepare(`
        insert into files (
          id, name, extension, family, mime_type, size_bytes, checksum, storage_path,
          project_id, category_id, source_device, uploaded_at, updated_at
        )
        values (
          @id, @name, @extension, @family, @mimeType, @sizeBytes, @checksum, @storagePath,
          @projectId, @categoryId, @sourceDevice, @uploadedAt, @updatedAt
        )
      `).run(file);

      return file;
    },

    listFiles(filters: { query?: string; projectId?: string | null; categoryId?: string | null } = {}): CloudFile[] {
      const clauses: string[] = [];
      const params: Record<string, unknown> = {};

      if (filters.query) {
        clauses.push("lower(name) like @query");
        params.query = `%${filters.query.toLowerCase()}%`;
      }

      if (filters.projectId !== undefined) {
        if (filters.projectId === null) {
          clauses.push("project_id is null");
        } else {
          clauses.push("project_id = @projectId");
          params.projectId = filters.projectId;
        }
      }

      if (filters.categoryId !== undefined) {
        if (filters.categoryId === null) {
          clauses.push("category_id is null");
        } else {
          clauses.push("category_id = @categoryId");
          params.categoryId = filters.categoryId;
        }
      }

      const where = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
      return db.prepare(`select * from files ${where} order by uploaded_at desc`).all(params).map(fileFromRow);
    },

    listTags(): Tag[] {
      return db.prepare("select * from tags order by name asc").all() as Tag[];
    }
  };
}

function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    categoryId: row.category_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function fileFromRow(row: FileRow): CloudFile {
  return {
    id: row.id,
    name: row.name,
    extension: row.extension,
    family: row.family,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    checksum: row.checksum,
    storagePath: row.storage_path,
    projectId: row.project_id,
    categoryId: row.category_id,
    sourceDevice: row.source_device,
    uploadedAt: row.uploaded_at,
    updatedAt: row.updated_at,
    tags: []
  };
}

export function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `project-${nanoid(6)}`
  );
}
```

- [ ] **Step 5: Implement smart views**

Create `src/lib/server/smartViews.ts`:

```ts
import type { SmartViewKey } from "@/lib/shared/types";
import type { AppDatabase } from "./db";
import { fileFromRow } from "./metadata";

const LARGE_FILE_BYTES = 1_073_741_824;

export function listSmartViewFiles(db: AppDatabase, view: SmartViewKey) {
  const { where, params } = smartViewQuery(view);
  return db.prepare(`select * from files ${where} order by uploaded_at desc`).all(params).map(fileFromRow);
}

function smartViewQuery(view: SmartViewKey): { where: string; params: Record<string, unknown> } {
  switch (view) {
    case "inbox":
    case "unsorted":
      return { where: "where project_id is null", params: {} };
    case "recent":
      return { where: "", params: {} };
    case "large-files":
      return { where: "where size_bytes >= @largeFileBytes", params: { largeFileBytes: LARGE_FILE_BYTES } };
    case "cad":
      return { where: "where family = 'cad'", params: {} };
    case "media":
      return { where: "where family in ('image', 'video')", params: {} };
    case "images":
      return { where: "where family = 'image'", params: {} };
    case "videos":
      return { where: "where family = 'video'", params: {} };
    case "from-windows":
      return { where: "where lower(source_device) like '%windows%'", params: {} };
    case "from-mac":
      return { where: "where lower(source_device) like '%mac%'", params: {} };
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/server/metadata.test.ts tests/server/smartViews.test.ts`

Expected: PASS for both test files.

- [ ] **Step 7: Commit repository and smart views**

```bash
git add src/lib/server/metadata.ts src/lib/server/smartViews.ts tests/server/metadata.test.ts tests/server/smartViews.test.ts
git commit -m "feat: add metadata repository and smart views"
```

## Task 7: Upload And Metadata API

**Files:**
- Create: `src/app/api/files/route.ts`
- Create: `src/app/api/files/[id]/route.ts`
- Create: `tests/server/filesApi.test.ts`

- [ ] **Step 1: Write failing route handler tests**

Create `tests/server/filesApi.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/db", () => ({
  getDatabase: vi.fn(() => ({}))
}));

describe("files API module", () => {
  it("exports GET and POST handlers", async () => {
    const route = await import("@/app/api/files/route");
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/filesApi.test.ts`

Expected: FAIL with an import error for `@/app/api/files/route`.

- [ ] **Step 3: Implement files API route**

Create `src/app/api/files/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { classifyFile } from "@/lib/shared/fileTypes";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";
import { appConfig } from "@/lib/server/config";

export async function GET(request: NextRequest) {
  const db = getDatabase();
  const repo = createMetadataRepository(db);
  const { searchParams } = new URL(request.url);

  const files = repo.listFiles({
    query: searchParams.get("query") ?? undefined,
    projectId: searchParams.has("projectId") ? searchParams.get("projectId") : undefined,
    categoryId: searchParams.has("categoryId") ? searchParams.get("categoryId") : undefined
  });

  return NextResponse.json({ files });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const upload = formData.get("file");
  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "Missing upload file" }, { status: 400 });
  }

  if (upload.size > appConfig.maxUploadBytes) {
    return NextResponse.json({ error: "Upload exceeds configured maximum size" }, { status: 413 });
  }

  const sourceDevice = String(formData.get("sourceDevice") ?? "Unknown Device");
  const projectId = formData.get("projectId");
  const projectSlug = formData.get("projectSlug");
  const categoryId = formData.get("categoryId");
  const bytes = Buffer.from(await upload.arrayBuffer());
  const storage = createStorageService();
  const target =
    typeof projectSlug === "string" && projectSlug.length > 0
      ? { kind: "project" as const, projectSlug }
      : { kind: "inbox" as const, sourceDevice };

  const stored = await storage.writeUpload({
    target,
    filename: upload.name,
    mimeType: upload.type,
    bytes
  });

  const classification = classifyFile(upload.name);
  const repo = createMetadataRepository(getDatabase());
  const file = repo.createFile({
    name: upload.name,
    extension: classification.extension,
    family: classification.family,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    checksum: stored.checksum,
    storagePath: stored.relativePath,
    projectId: typeof projectId === "string" && projectId.length > 0 ? projectId : null,
    categoryId: typeof categoryId === "string" && categoryId.length > 0 ? categoryId : null,
    sourceDevice
  });

  return NextResponse.json({ file }, { status: 201 });
}
```

- [ ] **Step 4: Implement file detail route**

Create `src/app/api/files/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ id });
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- tests/server/filesApi.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit files API**

```bash
git add src/app/api/files tests/server/filesApi.test.ts
git commit -m "feat: add upload and files API"
```

## Task 8: Projects, Categories, Tags, And Smart View APIs

**Files:**
- Create: `src/app/api/projects/route.ts`
- Create: `src/app/api/categories/route.ts`
- Create: `src/app/api/tags/route.ts`
- Create: `src/app/api/smart-views/[view]/route.ts`
- Create: `tests/server/workspaceApi.test.ts`

- [ ] **Step 1: Write failing API export tests**

Create `tests/server/workspaceApi.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/db", () => ({
  getDatabase: vi.fn(() => ({}))
}));

describe("workspace API modules", () => {
  it("exports project handlers", async () => {
    const route = await import("@/app/api/projects/route");
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
  });

  it("exports category and tag handlers", async () => {
    const categories = await import("@/app/api/categories/route");
    const tags = await import("@/app/api/tags/route");
    expect(typeof categories.GET).toBe("function");
    expect(typeof tags.GET).toBe("function");
  });

  it("exports smart view handler", async () => {
    const route = await import("@/app/api/smart-views/[view]/route");
    expect(typeof route.GET).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/workspaceApi.test.ts`

Expected: FAIL with import errors for missing API modules.

- [ ] **Step 3: Implement project API**

Create `src/app/api/projects/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  categoryId: z.string().nullable().default(null)
});

export async function GET() {
  const repo = createMetadataRepository(getDatabase());
  return NextResponse.json({ projects: repo.listProjects() });
}

export async function POST(request: Request) {
  const input = createProjectSchema.parse(await request.json());
  const repo = createMetadataRepository(getDatabase());
  const project = repo.createProject(input);
  return NextResponse.json({ project }, { status: 201 });
}
```

- [ ] **Step 4: Implement category and tag APIs**

Create `src/app/api/categories/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function GET() {
  const repo = createMetadataRepository(getDatabase());
  return NextResponse.json({ categories: repo.listCategories() });
}
```

Create `src/app/api/tags/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function GET() {
  const repo = createMetadataRepository(getDatabase());
  return NextResponse.json({ tags: repo.listTags() });
}
```

- [ ] **Step 5: Implement smart views API**

Create `src/app/api/smart-views/[view]/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { SmartViewKey } from "@/lib/shared/types";
import { SMART_VIEWS } from "@/lib/shared/defaults";
import { getDatabase } from "@/lib/server/db";
import { listSmartViewFiles } from "@/lib/server/smartViews";

export async function GET(_: Request, { params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const key = view as SmartViewKey;
  if (!SMART_VIEWS.some((item) => item.key === key)) {
    return NextResponse.json({ error: "Unknown smart view" }, { status: 404 });
  }

  return NextResponse.json({ files: listSmartViewFiles(getDatabase(), key) });
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- tests/server/workspaceApi.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit workspace APIs**

```bash
git add src/app/api/projects src/app/api/categories src/app/api/tags src/app/api/smart-views tests/server/workspaceApi.test.ts
git commit -m "feat: add workspace metadata APIs"
```

## Task 9: Indexer Command

**Files:**
- Create: `src/lib/server/indexer.ts`
- Create: `scripts/index-storage.ts`
- Create: `tests/server/indexer.test.ts`

- [ ] **Step 1: Write failing indexer test**

Create `tests/server/indexer.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { scanStorageRoot } from "@/lib/server/indexer";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("scanStorageRoot", () => {
  it("indexes existing files from the storage tree", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-index-"));
    createdDirs.push(dir);
    const storageRoot = path.join(dir, "storage");
    fs.mkdirSync(path.join(storageRoot, "Inbox", "Windows-PC"), { recursive: true });
    fs.writeFileSync(path.join(storageRoot, "Inbox", "Windows-PC", "fixture.3mf"), "model");

    const db = createDatabase(path.join(dir, "test.sqlite"));
    const result = await scanStorageRoot({ db, storageRoot });
    const files = createMetadataRepository(db).listFiles();

    expect(result.indexed).toBe(1);
    expect(files[0].name).toBe("fixture.3mf");
    expect(files[0].sourceDevice).toBe("Windows-PC");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/indexer.test.ts`

Expected: FAIL with an import error for `@/lib/server/indexer`.

- [ ] **Step 3: Implement one-shot indexer**

Create `src/lib/server/indexer.ts`:

```ts
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { classifyFile } from "@/lib/shared/fileTypes";
import type { AppDatabase } from "./db";
import { createMetadataRepository } from "./metadata";

export type ScanStorageInput = {
  db: AppDatabase;
  storageRoot: string;
};

export type ScanStorageResult = {
  scanned: number;
  indexed: number;
};

export async function scanStorageRoot(input: ScanStorageInput): Promise<ScanStorageResult> {
  const repo = createMetadataRepository(input.db);
  let scanned = 0;
  let indexed = 0;

  for await (const absolutePath of walk(input.storageRoot)) {
    scanned += 1;
    const relativePath = path.relative(input.storageRoot, absolutePath).split(path.sep).join("/");
    const existing = repo.listFiles().find((file) => file.storagePath === relativePath);
    if (existing) {
      continue;
    }

    const stat = await fs.stat(absolutePath);
    const bytes = await fs.readFile(absolutePath);
    const name = path.basename(absolutePath);
    const classification = classifyFile(name);
    repo.createFile({
      name,
      extension: classification.extension,
      family: classification.family,
      mimeType: "application/octet-stream",
      sizeBytes: stat.size,
      checksum: crypto.createHash("sha256").update(bytes).digest("hex"),
      storagePath: relativePath,
      projectId: null,
      categoryId: defaultCategoryId(classification.family),
      sourceDevice: inferSourceDevice(relativePath)
    });
    indexed += 1;
  }

  return { scanned, indexed };
}

async function* walk(root: string): AsyncGenerator<string> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(absolutePath);
    } else if (entry.isFile()) {
      yield absolutePath;
    }
  }
}

function inferSourceDevice(relativePath: string): string {
  const parts = relativePath.split("/");
  if (parts[0] === "Inbox" && parts[1]) {
    return parts[1];
  }
  return "NAS";
}

function defaultCategoryId(family: string): string | null {
  if (family === "cad") return "cat_cad";
  if (family === "image" || family === "video") return "cat_media";
  if (family === "document") return "cat_documents";
  if (family === "software") return "cat_software";
  if (family === "archive") return "cat_archive";
  return null;
}
```

- [ ] **Step 4: Create indexer script**

Create `scripts/index-storage.ts`:

```ts
import { appConfig } from "@/lib/server/config";
import { getDatabase } from "@/lib/server/db";
import { scanStorageRoot } from "@/lib/server/indexer";

const result = await scanStorageRoot({
  db: getDatabase(),
  storageRoot: appConfig.storageRoot
});

console.log(`Scanned ${result.scanned} files, indexed ${result.indexed} new files.`);
```

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/server/indexer.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit indexer**

```bash
git add src/lib/server/indexer.ts scripts/index-storage.ts tests/server/indexer.test.ts
git commit -m "feat: add storage indexer"
```

## Task 10: Workspace UI Shell

**Files:**
- Create: `src/app/page.tsx`
- Create: `src/components/workspace/AppShell.tsx`
- Create: `src/components/workspace/Sidebar.tsx`
- Create: `src/components/workspace/CommandBar.tsx`
- Create: `tests/components/AppShell.test.tsx`

- [ ] **Step 1: Write failing shell test**

Create `tests/components/AppShell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/workspace/AppShell";

describe("AppShell", () => {
  it("renders the primary workspace regions", () => {
    render(<AppShell />);

    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search files" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/AppShell.test.tsx`

Expected: FAIL with an import error for `AppShell`.

- [ ] **Step 3: Implement workspace shell**

Create `src/components/workspace/AppShell.tsx`:

```tsx
import { CommandBar } from "./CommandBar";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  return (
    <div className="grid min-h-screen grid-cols-[280px_1fr] bg-surface text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <CommandBar />
        <main className="min-h-0 flex-1 p-6">
          <section className="rounded-lg border border-line bg-panel p-6 shadow-panel">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-medium text-muted">Local Library</p>
                <h1 className="mt-1 text-2xl font-semibold">Inbox</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted">
                  Drop files here to move them onto the NAS now and organize them into projects when ready.
                </p>
              </div>
              <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">
                New Project
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
```

Create `src/components/workspace/Sidebar.tsx`:

```tsx
import { Archive, Boxes, FolderKanban, HardDrive, Inbox, Settings, Sparkles } from "lucide-react";
import { SMART_VIEWS } from "@/lib/shared/defaults";

export function Sidebar() {
  return (
    <aside className="border-r border-line bg-[#eef2e9] p-4" aria-label="Workspace">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">NAS Project Cloud</div>
        <div className="mt-1 text-lg font-semibold">Project Library</div>
      </div>

      <nav className="space-y-5" aria-label="Workspace">
        <Section title="Library">
          <NavItem icon={<Inbox size={18} />} label="Inbox" active />
          <NavItem icon={<FolderKanban size={18} />} label="Projects" />
          <NavItem icon={<Boxes size={18} />} label="Categories" />
        </Section>

        <Section title="Smart Views">
          {SMART_VIEWS.slice(1, 6).map((view) => (
            <NavItem key={view.key} icon={<Sparkles size={18} />} label={view.name} />
          ))}
        </Section>

        <Section title="System">
          <NavItem icon={<HardDrive size={18} />} label="Devices" />
          <NavItem icon={<Archive size={18} />} label="Archive" />
          <NavItem icon={<Settings size={18} />} label="Settings" />
        </Section>
      </nav>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      className={[
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
        active ? "bg-panel font-medium text-ink shadow-panel" : "text-muted hover:bg-panel"
      ].join(" ")}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
```

Create `src/components/workspace/CommandBar.tsx`:

```tsx
import { Grid2X2, List, Search, Upload } from "lucide-react";

export function CommandBar() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-line bg-panel px-5">
      <label className="flex min-w-[320px] items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted">
        <Search size={18} />
        <input
          aria-label="Search files"
          className="w-full bg-transparent text-ink outline-none placeholder:text-muted"
          placeholder="Search files, projects, tags"
          type="search"
        />
      </label>
      <div className="flex items-center gap-2">
        <button className="rounded-md border border-line bg-panel p-2 text-muted" type="button" aria-label="Grid view">
          <Grid2X2 size={18} />
        </button>
        <button className="rounded-md border border-line bg-panel p-2 text-muted" type="button" aria-label="List view">
          <List size={18} />
        </button>
        <button className="flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white" type="button">
          <Upload size={18} />
          Upload
        </button>
      </div>
    </header>
  );
}
```

Create `src/app/page.tsx`:

```tsx
import { AppShell } from "@/components/workspace/AppShell";

export default function Home() {
  return <AppShell />;
}
```

- [ ] **Step 4: Run shell tests**

Run: `npm test -- tests/components/AppShell.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit workspace shell**

```bash
git add src/app/page.tsx src/components/workspace tests/components/AppShell.test.tsx
git commit -m "feat: add workspace shell"
```

## Task 11: File Grid, Detail Drawer, And Drop Zone

**Files:**
- Create: `src/components/workspace/FileGrid.tsx`
- Create: `src/components/workspace/DetailDrawer.tsx`
- Create: `src/components/workspace/DropZone.tsx`
- Modify: `src/components/workspace/AppShell.tsx`
- Create: `tests/components/FileGrid.test.tsx`

- [ ] **Step 1: Write failing file grid test**

Create `tests/components/FileGrid.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileGrid } from "@/components/workspace/FileGrid";

describe("FileGrid", () => {
  it("renders file cards with readable metadata", () => {
    render(
      <FileGrid
        files={[
          {
            id: "file_1",
            name: "bracket.stl",
            extension: "stl",
            family: "cad",
            mimeType: "model/stl",
            sizeBytes: 2048,
            checksum: "abc",
            storagePath: "Inbox/Windows-PC/bracket.stl",
            projectId: null,
            categoryId: "cat_cad",
            sourceDevice: "Windows-PC",
            uploadedAt: "2026-04-30T00:00:00.000Z",
            updatedAt: "2026-04-30T00:00:00.000Z",
            tags: []
          }
        ]}
      />
    );

    expect(screen.getByText("bracket.stl")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();
    expect(screen.getByText("Windows-PC")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/FileGrid.test.tsx`

Expected: FAIL with an import error for `FileGrid`.

- [ ] **Step 3: Implement FileGrid**

Create `src/components/workspace/FileGrid.tsx`:

```tsx
import { Box, File, FileImage, FileVideo } from "lucide-react";
import type { CloudFile, FileFamily } from "@/lib/shared/types";

export function FileGrid({ files }: { files: CloudFile[] }) {
  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-panel p-10 text-center">
        <p className="text-sm font-medium">No files here yet</p>
        <p className="mt-1 text-sm text-muted">Drop files into the workspace to start building the library.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {files.map((file) => (
        <article key={file.id} className="rounded-lg border border-line bg-panel p-4 shadow-panel">
          <div className="mb-4 flex h-28 items-center justify-center rounded-md bg-surface text-steel">
            <FamilyIcon family={file.family} />
          </div>
          <h3 className="truncate text-sm font-semibold" title={file.name}>
            {file.name}
          </h3>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>{formatBytes(file.sizeBytes)}</span>
            <span>{file.sourceDevice}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function FamilyIcon({ family }: { family: FileFamily }) {
  if (family === "image") return <FileImage size={34} />;
  if (family === "video") return <FileVideo size={34} />;
  if (family === "cad") return <Box size={34} />;
  return <File size={34} />;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
```

- [ ] **Step 4: Implement detail drawer and drop zone**

Create `src/components/workspace/DetailDrawer.tsx`:

```tsx
import type { CloudFile } from "@/lib/shared/types";
import { formatBytes } from "./FileGrid";

export function DetailDrawer({ file }: { file: CloudFile | null }) {
  return (
    <aside className="w-80 border-l border-line bg-panel p-5">
      {file ? (
        <div>
          <p className="text-xs font-semibold uppercase text-muted">Selected File</p>
          <h2 className="mt-2 break-words text-lg font-semibold">{file.name}</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <Row label="Size" value={formatBytes(file.sizeBytes)} />
            <Row label="Type" value={file.family} />
            <Row label="Source" value={file.sourceDevice} />
            <Row label="Path" value={file.storagePath} />
          </dl>
        </div>
      ) : (
        <div>
          <p className="text-xs font-semibold uppercase text-muted">Details</p>
          <p className="mt-2 text-sm text-muted">Select a file to see metadata, preview, tags, and NAS path.</p>
        </div>
      )}
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-muted">{label}</dt>
      <dd className="mt-1 break-words text-ink">{value}</dd>
    </div>
  );
}
```

Create `src/components/workspace/DropZone.tsx`:

```tsx
"use client";

import { UploadCloud } from "lucide-react";
import { useCallback, useState } from "react";

export function DropZone({ children }: { children: React.ReactNode }) {
  const [dragging, setDragging] = useState(false);

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
  }, []);

  return (
    <div
      className="relative min-h-full"
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      {children}
      {dragging && (
        <div className="absolute inset-4 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-white/90">
          <div className="flex items-center gap-3 rounded-md bg-panel px-5 py-4 shadow-panel">
            <UploadCloud size={24} />
            <span className="text-sm font-medium">Drop files into the NAS Inbox</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire components into AppShell**

Modify `src/components/workspace/AppShell.tsx`:

```tsx
import { DetailDrawer } from "./DetailDrawer";
import { DropZone } from "./DropZone";
import { FileGrid } from "./FileGrid";
import { CommandBar } from "./CommandBar";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  return (
    <div className="grid min-h-screen grid-cols-[280px_1fr] bg-surface text-ink">
      <Sidebar />
      <div className="grid min-w-0 grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col">
          <CommandBar />
          <DropZone>
            <main className="min-h-0 flex-1 p-6">
              <section className="mb-6 rounded-lg border border-line bg-panel p-6 shadow-panel">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium text-muted">Local Library</p>
                    <h1 className="mt-1 text-2xl font-semibold">Inbox</h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted">
                      Drop files here to move them onto the NAS now and organize them into projects when ready.
                    </p>
                  </div>
                  <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">
                    New Project
                  </button>
                </div>
              </section>
              <FileGrid files={[]} />
            </main>
          </DropZone>
        </div>
        <DetailDrawer file={null} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run component tests**

Run: `npm test -- tests/components/AppShell.test.tsx tests/components/FileGrid.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit file UI**

```bash
git add src/components/workspace tests/components/FileGrid.test.tsx tests/components/AppShell.test.tsx
git commit -m "feat: add file workspace panels"
```

## Task 12: Project Creation Dialog

**Files:**
- Create: `src/components/workspace/ProjectDialog.tsx`
- Modify: `src/components/workspace/AppShell.tsx`
- Create: `tests/components/ProjectDialog.test.tsx`

- [ ] **Step 1: Write failing dialog test**

Create `tests/components/ProjectDialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectDialog } from "@/components/workspace/ProjectDialog";

describe("ProjectDialog", () => {
  it("submits project fields", async () => {
    const onCreate = vi.fn();
    render(<ProjectDialog onCreate={onCreate} />);

    await userEvent.click(screen.getByRole("button", { name: "New Project" }));
    await userEvent.type(screen.getByLabelText("Project name"), "Print Parts");
    await userEvent.type(screen.getByLabelText("Description"), "Printer upgrades");
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(onCreate).toHaveBeenCalledWith({
      name: "Print Parts",
      description: "Printer upgrades"
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/ProjectDialog.test.tsx`

Expected: FAIL with an import error for `ProjectDialog`.

- [ ] **Step 3: Implement dialog**

Create `src/components/workspace/ProjectDialog.tsx`:

```tsx
"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Plus } from "lucide-react";
import { useState } from "react";

export type ProjectDialogInput = {
  name: string;
  description: string;
};

export function ProjectDialog({ onCreate }: { onCreate: (input: ProjectDialogInput) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">
          <Plus size={18} />
          New Project
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-panel p-5 shadow-panel">
          <Dialog.Title className="text-lg font-semibold">Create project</Dialog.Title>
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              onCreate({ name, description });
              setOpen(false);
              setName("");
              setDescription("");
            }}
          >
            <label className="block text-sm font-medium">
              Project name
              <input
                className="mt-1 w-full rounded-md border border-line px-3 py-2"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Description
              <textarea
                className="mt-1 min-h-24 w-full rounded-md border border-line px-3 py-2"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="rounded-md border border-line px-4 py-2 text-sm" type="button">
                  Cancel
                </button>
              </Dialog.Close>
              <button className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white" type="submit">
                Create project
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 4: Use dialog in AppShell**

Modify `src/components/workspace/AppShell.tsx` to import `ProjectDialog` and replace the plain New Project button:

```tsx
import { ProjectDialog } from "./ProjectDialog";
```

Replace:

```tsx
<button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">
  New Project
</button>
```

With:

```tsx
<ProjectDialog onCreate={() => undefined} />
```

- [ ] **Step 5: Run component tests**

Run: `npm test -- tests/components/ProjectDialog.test.tsx tests/components/AppShell.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit project dialog**

```bash
git add src/components/workspace/ProjectDialog.tsx src/components/workspace/AppShell.tsx tests/components/ProjectDialog.test.tsx
git commit -m "feat: add project creation dialog"
```

## Task 13: Workspace Data Loading

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/workspace/AppShell.tsx`
- Create: `src/lib/server/workspaceData.ts`
- Create: `tests/server/workspaceData.test.ts`

- [ ] **Step 1: Write failing workspace data test**

Create `tests/server/workspaceData.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { loadWorkspaceData } from "@/lib/server/workspaceData";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadWorkspaceData", () => {
  it("returns files, projects, categories, and tags", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-workspace-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    createMetadataRepository(db).createProject({ name: "Print Parts", description: "", categoryId: "cat_cad" });

    const data = loadWorkspaceData(db);

    expect(data.projects).toHaveLength(1);
    expect(data.categories.length).toBeGreaterThan(1);
    expect(data.files).toEqual([]);
    expect(data.tags).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/workspaceData.test.ts`

Expected: FAIL with an import error for `workspaceData`.

- [ ] **Step 3: Implement workspace data loader**

Create `src/lib/server/workspaceData.ts`:

```ts
import type { AppDatabase } from "./db";
import { getDatabase } from "./db";
import { createMetadataRepository } from "./metadata";

export function loadWorkspaceData(db: AppDatabase = getDatabase()) {
  const repo = createMetadataRepository(db);
  return {
    files: repo.listFiles(),
    projects: repo.listProjects(),
    categories: repo.listCategories(),
    tags: repo.listTags()
  };
}
```

- [ ] **Step 4: Pass data into AppShell**

Modify `src/app/page.tsx`:

```tsx
import { AppShell } from "@/components/workspace/AppShell";
import { loadWorkspaceData } from "@/lib/server/workspaceData";

export default function Home() {
  return <AppShell initialData={loadWorkspaceData()} />;
}
```

Modify the start of `src/components/workspace/AppShell.tsx`:

```tsx
import type { Category, CloudFile, Project, Tag } from "@/lib/shared/types";
import { DetailDrawer } from "./DetailDrawer";
import { DropZone } from "./DropZone";
import { FileGrid } from "./FileGrid";
import { CommandBar } from "./CommandBar";
import { ProjectDialog } from "./ProjectDialog";
import { Sidebar } from "./Sidebar";

type WorkspaceData = {
  files: CloudFile[];
  projects: Project[];
  categories: Category[];
  tags: Tag[];
};

export function AppShell({ initialData = { files: [], projects: [], categories: [], tags: [] } }: { initialData?: WorkspaceData }) {
```

Replace:

```tsx
<FileGrid files={[]} />
```

With:

```tsx
<FileGrid files={initialData.files} />
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- tests/server/workspaceData.test.ts tests/components/AppShell.test.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit workspace data loading**

```bash
git add src/app/page.tsx src/components/workspace/AppShell.tsx src/lib/server/workspaceData.ts tests/server/workspaceData.test.ts
git commit -m "feat: load workspace data"
```

## Task 14: TrueNAS Deployment Artifacts

**Files:**
- Create: `docker/Dockerfile`
- Create: `docker/docker-compose.truenas.yml`
- Create: `.dockerignore`
- Create: `docs/deployment/truenas-scale.md`
- Create: `docs/research/storage-engine-spike.md`

- [ ] **Step 1: Create Dockerfile**

Create `docker/Dockerfile`:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "start"]
```

- [ ] **Step 2: Create Docker ignore file**

Create `.dockerignore`:

```text
.data
.git
.next
node_modules
npm-debug.log
docs/superpowers
tests
```

- [ ] **Step 3: Create TrueNAS Compose example**

Create `docker/docker-compose.truenas.yml`:

```yaml
services:
  nas-project-cloud:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    container_name: nas-project-cloud
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NAS_CLOUD_STORAGE_ROOT: /mnt/nas-cloud
      NAS_CLOUD_DB_PATH: /data/nas-cloud.sqlite
      NAS_CLOUD_PUBLIC_BASE_PATH: /files
      NAS_CLOUD_MAX_UPLOAD_BYTES: "2147483648"
    volumes:
      - /mnt/tank/nas-project-cloud:/mnt/nas-cloud
      - nas-project-cloud-data:/data

volumes:
  nas-project-cloud-data:
```

- [ ] **Step 4: Create deployment docs**

Create `docs/deployment/truenas-scale.md`:

```markdown
# TrueNAS SCALE Deployment

## Dataset Layout

Create a dataset for the file library, for example:

```text
/mnt/tank/nas-project-cloud
```

The app writes normal folders below that dataset:

```text
Inbox/
Projects/
Library/
Archive/
```

## Compose App

Use `docker/docker-compose.truenas.yml` as the starting point for a TrueNAS SCALE custom app. Update the host volume path so `/mnt/tank/nas-project-cloud` matches the real dataset.

## Local Network Access

Expose port `3000` on the LAN. Put a reverse proxy in front of it before enabling remote access.

## Storage Engine Spike

Before connecting OpenCloud or Nextcloud, complete `docs/research/storage-engine-spike.md` and record the winner.
```

Create `docs/research/storage-engine-spike.md`:

```markdown
# Storage Engine Spike

## Goal

Choose the first storage/sync companion for the custom NAS Project Cloud UI.

## Candidates

- OpenCloud
- Nextcloud
- Direct filesystem only

## Evaluation Checklist

For each candidate, record:

- TrueNAS SCALE install path
- dataset mount behavior
- WebDAV or API behavior
- desktop sync client behavior on macOS
- desktop sync client behavior on Windows
- upload behavior for large files
- SMB compatibility with the same dataset
- trash support
- version history support
- user/auth integration
- operational complexity
- blockers

## Decision Rule

Use OpenCloud first if it works cleanly with TrueNAS SCALE, desktop sync, and the shared dataset. Use Nextcloud if OpenCloud blocks any core local workflow. Use direct filesystem only for the MVP while the storage engine is unresolved.
```

- [ ] **Step 5: Run build**

Run: `npm run build`

Expected: PASS and `.next` production output is generated.

- [ ] **Step 6: Commit deployment artifacts**

```bash
git add docker .dockerignore docs/deployment docs/research
git commit -m "docs: add TrueNAS deployment plan"
```

## Task 15: End-To-End Smoke Test

**Files:**
- Create: `tests/e2e/workspace.spec.ts`
- Create: `playwright.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Create Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
```

- [ ] **Step 2: Create smoke test**

Create `tests/e2e/workspace.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("workspace renders the local library shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search files" })).toBeVisible();
  await expect(page.getByText("Inbox")).toBeVisible();
  await expect(page.getByText("New Project")).toBeVisible();
});
```

- [ ] **Step 3: Add Playwright install note**

Modify `package.json` scripts to keep the existing `test:e2e` command. Install browser binaries with:

Run: `npx playwright install chromium`

Expected: Chromium browser installation completes.

- [ ] **Step 4: Run end-to-end test**

Run: `npm run test:e2e`

Expected: PASS for `workspace renders the local library shell`.

- [ ] **Step 5: Commit smoke test**

```bash
git add playwright.config.ts tests/e2e/workspace.spec.ts package.json package-lock.json
git commit -m "test: add workspace smoke test"
```

## Task 16: Final Verification

**Files:**
- Modify only files required by failures found during verification.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`

Expected: PASS for all unit and component tests.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Run browser smoke test**

Run: `npm run test:e2e`

Expected: PASS.

- [ ] **Step 5: Inspect git status**

Run: `git status --short --branch`

Expected: current branch has no unstaged or uncommitted files.

- [ ] **Step 6: Record implementation summary**

Create `docs/implementation/mvp-summary.md`:

```markdown
# MVP Implementation Summary

## Built

- Next.js filesystem-backed NAS Project Cloud MVP
- SQLite metadata database
- human-readable storage tree
- Inbox and project upload APIs
- category, tag, project, and smart-view APIs
- workspace UI shell
- file grid, detail drawer, and drop zone
- indexer command
- TrueNAS Docker Compose example

## Verified

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e`

## Following Plan

Run the storage engine spike and choose OpenCloud or Nextcloud integration.
```

- [ ] **Step 7: Commit summary**

```bash
git add docs/implementation/mvp-summary.md
git commit -m "docs: summarize MVP implementation"
```

## Self-Review

Spec coverage:

- TrueNAS-hosted path: covered by Task 14.
- Local development mode: covered by Tasks 1, 3, 4, and 5.
- Drag-and-drop upload foundation: covered by Tasks 7 and 11.
- Projects: covered by Tasks 6, 8, 10, 12, and 13.
- Categories and tags: covered by Tasks 2, 4, 6, 8, and 13.
- File browser and detail drawer: covered by Tasks 10 and 11.
- Smart views: covered by Tasks 2, 6, and 8.
- Search by filename: covered by Task 6 and exposed by Task 7.
- Human-readable folder layout: covered by Task 5.
- Admin settings: covered for this local-core plan through environment config and deployment docs; the richer visual Settings screen is a separate settings plan.
- OpenCloud/Nextcloud validation: covered by Task 14 documentation and decision checklist.

Subsequent plans:

- Rich thumbnail generation and file preview processing.
- Desktop tray app, desktop sync folder, clipboard sync, remote access, CAD previews, and version comparison.
