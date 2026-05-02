# Dream Product Master Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current TrueNAS-backed project cloud MVP into a polished private LAN file hub with secure access, device pairing, richer project organization, large-file reliability, previews, deployment hardening, and a path toward desktop clipboard/sync helpers.

**Architecture:** Keep direct filesystem storage as the primary engine because it fits the TrueNAS recovery model and keeps files visible to normal NAS tooling. Add production features in layered phases: identity and device trust first, then project workflows, upload reliability, previews/search, operations/deployment, and finally desktop helpers. Each phase must leave the app shippable, verified, and recoverable on the NAS.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind, SQLite via `better-sqlite3`, direct Node filesystem operations, Vitest, Testing Library, Playwright, Docker Compose for TrueNAS SCALE, optional future Tauri/Swift/Windows helper apps.

---

## Current Baseline

The branch already has:

- Filesystem-backed NAS storage under `NAS_CLOUD_STORAGE_ROOT`.
- SQLite metadata for files, projects, categories, tags, lifecycle state, and upload sessions.
- Upload, download, archive, restore/move foundations, project assignment, and archive-aware reindexing.
- Chunked upload sessions for files over 64 MiB with 8 MiB chunks.
- Workspace UI with inbox, grid, search, detail drawer, project dialog, dropzone, and command bar upload.
- TrueNAS Dockerfile, Compose example, deployment docs, and storage-engine research.
- Verification gate: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e`.

Latest known completed commit before this plan:

```bash
git log --oneline -1
```

Expected:

```text
3ed9e92 feat: add chunked upload sessions
```

---

## Product North Star

The dream product should feel like a private local Google Drive built around real projects, not a generic file pile.

Core promises:

- **Fast LAN file movement:** videos, CAD, 3MF, STL, WebM, TIFF, PNG, documents, archives, and arbitrary binary files move reliably over the 2.5Gb NAS network.
- **Project-first organization:** files belong to projects, categories, tags, smart views, and workflows.
- **Device-friendly:** Windows PCs, Macs, and Wi-Fi devices can upload/download quickly through the browser first, then through desktop helpers later.
- **Private and secure:** only trusted users/devices can access the app.
- **NAS-native recovery:** files stay visible and recoverable through TrueNAS snapshots/backups.
- **Open-source shape:** clear docs, predictable setup, stable APIs, and a clean architecture that other people can run.

---

## Phase Map

### Phase 4: Identity, Sessions, And Device Trust

Purpose: make the app safe enough to run on the LAN without every route being open.

Deliverables:

- Local owner account bootstrap.
- Password login/logout.
- HTTP-only session cookie.
- Route guards for app pages and APIs.
- Device registry for trusted browsers/devices.
- Pairing code flow for adding a device.
- Basic device labels such as `Windows PC`, `MacBook`, `Mac Studio`, `iPhone`, or custom name.

Exit criteria:

- Unauthenticated users cannot browse, upload, download, archive, or view metadata.
- Owner can create first account from a local bootstrap screen.
- Owner can pair a browser/device using a short-lived code.
- Tests cover auth state, session cookies, API protection, and device pairing.

### Phase 5: Project Workspace 2.0

Purpose: make organization feel like the product, not an afterthought.

Deliverables:

- Project dashboard route.
- Project detail route.
- Category and tag assignment UI.
- File move/assign flows from inbox into projects.
- Saved smart views.
- Bulk selection and bulk operations.
- Empty states and dense file scanning views.

Exit criteria:

- User can create a project, upload files, assign files, tag files, and browse project-specific files without opening raw filesystem paths.
- Bulk operations work for project assignment, category assignment, archive, and tag edits.
- Tests cover core flows and accessibility roles.

### Phase 6: Upload Reliability 2.0

Purpose: make very large uploads feel trustworthy.

Deliverables:

- Resume open upload sessions after browser refresh.
- Show percent progress, speed estimate, and remaining time.
- Pause/resume/cancel controls.
- Stale temp upload cleanup job.
- Optional client-side checksum calculation for files below a safe threshold.
- Better failure recovery messages.

Exit criteria:

- A large upload can resume after refresh if the server still has the session.
- Aborted/stale sessions do not leave unbounded temp files.
- Tests cover resume metadata, cleanup, abort, and failed chunk retry.

### Phase 7: File Previews And Metadata Enrichment

Purpose: make the UI useful for inspection, not only storage.

Deliverables:

- Image thumbnails.
- Video metadata and poster frame support.
- Document/file-type icons.
- CAD/3D file metadata placeholders and safe preview strategy.
- Sidecar metadata table.
- Background preview job queue.

Exit criteria:

- Common images show thumbnails.
- Videos show at least metadata and a poster when tooling is available.
- CAD files receive recognizable type badges and future preview hooks.
- Preview failures never block file access.

### Phase 8: Search, Activity, And Audit Trail

Purpose: make it easy to find files and understand what changed.

Deliverables:

- Full-text search index for names, paths, tags, projects, categories, and notes.
- File notes/descriptions.
- Activity feed for upload, archive, restore, assignment, tag, preview, and auth events.
- Audit table with actor/device.
- Recent activity UI.

Exit criteria:

- Search can find files by project, tag, path, extension, category, source device, and note text.
- Activity feed tells the story of the library.
- Security-sensitive actions include actor/device metadata.

### Phase 9: TrueNAS Production Deployment

Purpose: make the system boring to run on the actual server.

Deliverables:

- TrueNAS install checklist.
- Environment validation endpoint.
- Storage path permission self-check.
- Database backup guidance and command.
- Health endpoint.
- Docker image publishing workflow.
- Upgrade checklist.
- LAN performance measurement script.

Exit criteria:

- App can be installed on TrueNAS SCALE using Compose/YAML with documented env vars.
- Health checks verify storage/database writability.
- Backup/restore process is documented and tested locally.

### Phase 10: Desktop Helper Foundations

Purpose: start the path toward “copy on one device, access from another” without overbuilding first.

Deliverables:

- Stable internal API token model for desktop helpers.
- Device-scoped upload/download tokens.
- Minimal CLI helper prototype for upload/download.
- Clipboard text handoff API.
- Clipboard inbox UI view.
- macOS/Windows helper research and packaging decision.

Exit criteria:

- A command-line helper can upload a file with a device token.
- Clipboard text can be sent from one paired device and viewed/copied from another.
- Desktop app choice is documented with a concrete recommendation.

### Phase 11: Sharing And Collaboration Controls

Purpose: support private sharing later without compromising LAN-first safety.

Deliverables:

- Optional share links with expiration.
- Project-level collaborator model for future multi-user use.
- Read-only download tokens.
- Admin revocation UI.

Exit criteria:

- Owner can create and revoke an expiring link.
- Sharing can be disabled globally.
- Expired/revoked links cannot access files.

---

## Proposed Immediate Build Order

Recommended next order:

1. **Phase 4 Identity, Sessions, And Device Trust**
2. **Phase 5 Project Workspace 2.0**
3. **Phase 6 Upload Reliability 2.0**
4. **Phase 9 TrueNAS Production Deployment**
5. **Phase 7 Previews**
6. **Phase 8 Search/Activity**
7. **Phase 10 Desktop Helper Foundations**
8. **Phase 11 Sharing**

Reasoning:

- Security has to come before real deployment.
- Project UX has to come before previews/search because it defines the metadata people search and preview inside.
- Upload reliability should mature before 1 GB/5 GB real LAN testing.
- Desktop helpers should wait until auth/device tokens are solid.

---

# Phase 4 Detailed Plan: Identity, Sessions, And Device Trust

## Phase 4 File Structure

- Create: `src/lib/server/auth/passwords.ts`
  - Hash and verify passwords with Node `crypto.scrypt`.
- Create: `src/lib/server/auth/sessions.ts`
  - Create, read, rotate, and destroy login sessions.
- Create: `src/lib/server/auth/guards.ts`
  - Shared helpers for requiring authenticated API/page access.
- Create: `src/lib/server/auth/pairing.ts`
  - Generate, validate, and consume short-lived device pairing codes.
- Modify: `src/lib/server/db.ts`
  - Add `users`, `sessions`, `devices`, and `device_pairing_codes` tables.
- Modify: `src/lib/server/metadata.ts`
  - Add repository methods for users, sessions, devices, pairing codes.
- Modify: `src/lib/shared/types.ts`
  - Add shared `User`, `Session`, `Device`, and pairing response types.
- Create: `src/app/login/page.tsx`
  - Login screen.
- Create: `src/app/setup/page.tsx`
  - First-owner bootstrap page.
- Create: `src/app/api/auth/setup/route.ts`
  - Create first owner.
- Create: `src/app/api/auth/login/route.ts`
  - Login and set session cookie.
- Create: `src/app/api/auth/logout/route.ts`
  - Destroy session cookie.
- Create: `src/app/api/devices/route.ts`
  - List trusted devices and create pairing code.
- Create: `src/app/api/devices/pair/route.ts`
  - Consume pairing code and register current device.
- Modify: protected routes under `src/app/api/**`
  - Require authenticated session except setup/login endpoints.
- Modify: `src/app/page.tsx`
  - Redirect unauthenticated users to login/setup.
- Modify: `src/components/workspace/Sidebar.tsx`
  - Add current user/device affordance and logout action.
- Test: `tests/server/auth.test.ts`
- Test: `tests/server/authApi.test.ts`
- Test: `tests/server/db.test.ts`
- Test: `tests/server/metadata.test.ts`
- Test: `tests/e2e/auth.spec.ts`

### Task 4.1: Auth Database Schema

**Files:**
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/shared/types.ts`
- Test: `tests/server/db.test.ts`

- [ ] **Step 1: Write failing schema test**

Add to `tests/server/db.test.ts`:

```ts
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
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm test -- tests/server/db.test.ts
```

Expected: FAIL with missing `users`, `sessions`, `devices`, and `device_pairing_codes` tables.

- [ ] **Step 3: Add shared auth types**

Add to `src/lib/shared/types.ts`:

```ts
export type UserRole = "owner";

export type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

export type TrustedDevice = {
  id: string;
  userId: string;
  name: string;
  kind: "browser" | "desktop" | "mobile" | "cli";
  createdAt: string;
  lastSeenAt: string | null;
};
```

- [ ] **Step 4: Add schema to migration**

Add tables in `src/lib/server/db.ts` inside `migrate(db)`:

```sql
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

create index if not exists sessions_token_hash_idx on sessions(token_hash);
create index if not exists sessions_user_id_idx on sessions(user_id);
create index if not exists devices_user_id_idx on devices(user_id);
create index if not exists device_pairing_codes_code_hash_idx on device_pairing_codes(code_hash);
```

- [ ] **Step 5: Run schema test**

Run:

```bash
npm test -- tests/server/db.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/db.ts src/lib/shared/types.ts tests/server/db.test.ts
git commit -m "feat: add auth database schema"
```

### Task 4.2: Password Hashing

**Files:**
- Create: `src/lib/server/auth/passwords.ts`
- Test: `tests/server/auth.test.ts`

- [ ] **Step 1: Write failing password tests**

Create `tests/server/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/server/auth/passwords";

describe("password hashing", () => {
  it("hashes and verifies a password without storing the plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).not.toContain("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("rejects malformed password hashes", async () => {
    await expect(verifyPassword("anything", "not-a-real-hash")).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm test -- tests/server/auth.test.ts
```

Expected: FAIL because `src/lib/server/auth/passwords.ts` does not exist.

- [ ] **Step 3: Implement password helpers**

Create `src/lib/server/auth/passwords.ts`:

```ts
import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, hash] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}
```

- [ ] **Step 4: Run password test**

Run:

```bash
npm test -- tests/server/auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/auth/passwords.ts tests/server/auth.test.ts
git commit -m "feat: add password hashing"
```

### Task 4.3: Auth Repository Methods

**Files:**
- Modify: `src/lib/server/metadata.ts`
- Test: `tests/server/metadata.test.ts`

- [ ] **Step 1: Write failing repository tests**

Add to `tests/server/metadata.test.ts`:

```ts
it("creates users, devices, sessions, and pairing codes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
  createdDirs.push(dir);
  const db = createDatabase(path.join(dir, "test.sqlite"));
  try {
    const repo = createMetadataRepository(db);
    const user = repo.createUser({
      email: "owner@example.local",
      name: "Owner",
      passwordHash: "scrypt:salt:hash",
      role: "owner"
    });

    const device = repo.createDevice({
      userId: user.id,
      name: "Mac Studio",
      kind: "browser"
    });

    const session = repo.createSession({
      userId: user.id,
      deviceId: device.id,
      tokenHash: "token-hash",
      expiresAt: "2026-06-01T00:00:00.000Z"
    });

    const pairing = repo.createDevicePairingCode({
      userId: user.id,
      codeHash: "pairing-hash",
      deviceName: "Windows PC",
      deviceKind: "browser",
      expiresAt: "2026-05-02T12:00:00.000Z"
    });

    expect(repo.getUserByEmail("owner@example.local")?.id).toBe(user.id);
    expect(repo.getSessionByTokenHash("token-hash")?.id).toBe(session.id);
    expect(repo.listDevices(user.id).map((entry) => entry.id)).toEqual([device.id]);
    expect(repo.getDevicePairingCodeByHash("pairing-hash")?.id).toBe(pairing.id);
  } finally {
    db.close();
  }
});
```

- [ ] **Step 2: Run failing repository test**

Run:

```bash
npm test -- tests/server/metadata.test.ts
```

Expected: FAIL because auth repository methods do not exist.

- [ ] **Step 3: Implement repository methods**

Add row types and methods to `src/lib/server/metadata.ts` following existing row mapping style:

```ts
createUser(input: CreateUserInput): User
getUserByEmail(email: string): UserWithPasswordHash | null
createDevice(input: CreateDeviceInput): TrustedDevice
listDevices(userId: string): TrustedDevice[]
createSession(input: CreateSessionInput): AuthSession
getSessionByTokenHash(tokenHash: string): AuthSession | null
deleteSession(id: string): void
createDevicePairingCode(input: CreateDevicePairingCodeInput): DevicePairingCode
getDevicePairingCodeByHash(codeHash: string): DevicePairingCode | null
consumeDevicePairingCode(id: string): DevicePairingCode | null
```

Use `nanoid(12)` IDs with prefixes:

```ts
user_
device_
session_
pair_
```

- [ ] **Step 4: Run repository tests**

Run:

```bash
npm test -- tests/server/metadata.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/metadata.ts tests/server/metadata.test.ts
git commit -m "feat: add auth metadata repository"
```

### Task 4.4: Session Cookie Helpers

**Files:**
- Create: `src/lib/server/auth/sessions.ts`
- Test: `tests/server/auth.test.ts`

- [ ] **Step 1: Write failing session helper tests**

Append to `tests/server/auth.test.ts`:

```ts
import { createSessionToken, hashSessionToken, sessionCookieName } from "@/lib/server/auth/sessions";

describe("session tokens", () => {
  it("creates random tokens and stable token hashes", () => {
    const token = createSessionToken();
    const secondToken = createSessionToken();

    expect(token).not.toBe(secondToken);
    expect(token.length).toBeGreaterThan(40);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(hashSessionToken(secondToken));
    expect(sessionCookieName).toBe("nas_cloud_session");
  });
});
```

- [ ] **Step 2: Run failing session helper test**

Run:

```bash
npm test -- tests/server/auth.test.ts
```

Expected: FAIL because `src/lib/server/auth/sessions.ts` does not exist.

- [ ] **Step 3: Implement token helpers**

Create `src/lib/server/auth/sessions.ts`:

```ts
import crypto from "node:crypto";

export const sessionCookieName = "nas_cloud_session";

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function sessionExpiresAt(now = new Date()): string {
  const expires = new Date(now);
  expires.setUTCDate(expires.getUTCDate() + 30);
  return expires.toISOString();
}
```

- [ ] **Step 4: Run session helper tests**

Run:

```bash
npm test -- tests/server/auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/auth/sessions.ts tests/server/auth.test.ts
git commit -m "feat: add session token helpers"
```

### Task 4.5: Setup, Login, Logout APIs

**Files:**
- Create: `src/app/api/auth/setup/route.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/lib/server/auth/http.ts`
- Test: `tests/server/authApi.test.ts`

- [ ] **Step 1: Write failing API tests**

Create `tests/server/authApi.test.ts` with mocked repository/password helpers:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    countUsers: vi.fn(),
    createUser: vi.fn(),
    getUserByEmail: vi.fn(),
    createDevice: vi.fn(),
    createSession: vi.fn(),
    getSessionByTokenHash: vi.fn(),
    deleteSession: vi.fn()
  },
  hashPassword: vi.fn(),
  verifyPassword: vi.fn()
}));

vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => mocks.db) }));
vi.mock("@/lib/server/metadata", () => ({ createMetadataRepository: vi.fn(() => mocks.repo) }));
vi.mock("@/lib/server/auth/passwords", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword
}));

describe("auth API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repo.countUsers.mockReturnValue(0);
    mocks.hashPassword.mockResolvedValue("password-hash");
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.repo.createUser.mockReturnValue({ id: "user_1", email: "owner@example.local", name: "Owner", role: "owner" });
    mocks.repo.createDevice.mockReturnValue({ id: "device_1" });
    mocks.repo.createSession.mockReturnValue({ id: "session_1" });
  });

  it("bootstraps the first owner and sets a session cookie", async () => {
    const { POST } = await import("@/app/api/auth/setup/route");
    const response = await POST(jsonRequest("http://localhost/api/auth/setup", {
      email: "owner@example.local",
      name: "Owner",
      password: "long-enough-password",
      deviceName: "Mac Studio"
    }));

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("nas_cloud_session=");
    await expect(response.json()).resolves.toEqual({
      user: expect.objectContaining({ id: "user_1" })
    });
  });

  it("refuses setup after an owner exists", async () => {
    const { POST } = await import("@/app/api/auth/setup/route");
    mocks.repo.countUsers.mockReturnValue(1);
    const response = await POST(jsonRequest("http://localhost/api/auth/setup", {
      email: "owner@example.local",
      name: "Owner",
      password: "long-enough-password"
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "owner already exists" });
  });

  it("logs in with a valid password and sets a session cookie", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    mocks.repo.getUserByEmail.mockReturnValue({
      id: "user_1",
      email: "owner@example.local",
      name: "Owner",
      role: "owner",
      passwordHash: "password-hash"
    });

    const response = await POST(jsonRequest("http://localhost/api/auth/login", {
      email: "owner@example.local",
      password: "long-enough-password",
      deviceName: "Mac Studio"
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("nas_cloud_session=");
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}
```

- [ ] **Step 2: Run failing API tests**

Run:

```bash
npm test -- tests/server/authApi.test.ts
```

Expected: FAIL because auth routes do not exist.

- [ ] **Step 3: Implement HTTP helpers**

Create `src/lib/server/auth/http.ts`:

```ts
import { NextResponse } from "next/server";
import { sessionCookieName } from "./sessions";

export function withSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return response;
}
```

- [ ] **Step 4: Implement setup/login/logout routes**

Implement routes using:

```ts
hashPassword(password)
verifyPassword(password, user.passwordHash)
createSessionToken()
hashSessionToken(token)
sessionExpiresAt()
repo.createUser()
repo.createDevice()
repo.createSession()
withSessionCookie()
clearSessionCookie()
```

Return `400` for invalid input, `401` for invalid login, `409` when setup already exists.

- [ ] **Step 5: Run auth API tests**

Run:

```bash
npm test -- tests/server/authApi.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth src/lib/server/auth tests/server/authApi.test.ts
git commit -m "feat: add setup and login APIs"
```

### Task 4.6: Protect Server APIs

**Files:**
- Create: `src/lib/server/auth/guards.ts`
- Modify: `src/app/api/files/route.ts`
- Modify: `src/app/api/files/[id]/route.ts`
- Modify: `src/app/api/files/[id]/download/route.ts`
- Modify: `src/app/api/files/[id]/archive/route.ts`
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/app/api/categories/route.ts`
- Modify: `src/app/api/tags/route.ts`
- Modify: `src/app/api/smart-views/[view]/route.ts`
- Modify: `src/app/api/upload-sessions/**/route.ts`
- Test: `tests/server/authGuard.test.ts`
- Test: update existing API tests with authenticated helper.

- [ ] **Step 1: Write failing guard tests**

Create `tests/server/authGuard.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { requireApiSession } from "@/lib/server/auth/guards";

describe("auth guards", () => {
  it("rejects requests without a session cookie", async () => {
    const result = await requireApiSession(new Request("http://localhost/api/files"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({ error: "authentication required" });
    }
  });
});
```

- [ ] **Step 2: Run failing guard tests**

Run:

```bash
npm test -- tests/server/authGuard.test.ts
```

Expected: FAIL because guard file does not exist.

- [ ] **Step 3: Implement guard helper**

Create `src/lib/server/auth/guards.ts` returning a discriminated union:

```ts
type ApiSessionResult =
  | { ok: true; userId: string; sessionId: string; deviceId: string | null }
  | { ok: false; response: NextResponse };
```

Rules:

- Missing cookie returns `401`.
- Unknown token returns `401`.
- Expired session returns `401`.
- Valid session returns user/session/device IDs.

- [ ] **Step 4: Add guards to routes**

At the start of every protected route:

```ts
const auth = await requireApiSession(request);
if (!auth.ok) {
  return auth.response;
}
```

For route handlers currently using `_` as the request parameter, rename it to `request`.

- [ ] **Step 5: Update API tests**

Existing API tests should mock `requireApiSession` where route-level auth is not the behavior under test:

```ts
vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: vi.fn(async () => ({ ok: true, userId: "user_1", sessionId: "session_1", deviceId: "device_1" }))
}));
```

- [ ] **Step 6: Run all server API tests**

Run:

```bash
npm test -- tests/server/filesApi.test.ts tests/server/workspaceApi.test.ts tests/server/uploadSessionsApi.test.ts tests/server/authGuard.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api src/lib/server/auth/guards.ts tests/server
git commit -m "feat: protect API routes"
```

### Task 4.7: Setup And Login Pages

**Files:**
- Create: `src/app/setup/page.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/components/auth/AuthForm.tsx`
- Modify: `src/app/page.tsx`
- Test: `tests/components/AuthForm.test.tsx`
- Test: `tests/e2e/auth.spec.ts`

- [ ] **Step 1: Write failing component test**

Create `tests/components/AuthForm.test.tsx`:

```tsx
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/auth/AuthForm";

describe("AuthForm", () => {
  afterEach(() => vi.restoreAllMocks());

  it("submits setup credentials", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ user: { id: "user_1" } }), { status: 201 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthForm mode="setup" endpoint="/api/auth/setup" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Email"), "owner@example.local");
    await user.type(screen.getByLabelText("Name"), "Owner");
    await user.type(screen.getByLabelText("Password"), "long-enough-password");
    await user.type(screen.getByLabelText("Device name"), "Mac Studio");
    await user.click(screen.getByRole("button", { name: "Create owner" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/setup", expect.objectContaining({ method: "POST" }));
  });
});
```

- [ ] **Step 2: Run failing component test**

Run:

```bash
npm test -- tests/components/AuthForm.test.tsx
```

Expected: FAIL because `AuthForm` does not exist.

- [ ] **Step 3: Implement `AuthForm`**

Create a client component with fields:

- Email
- Name only in setup mode
- Password
- Device name

Use restrained dashboard styling consistent with existing workspace components. Submit JSON to the provided endpoint and call `onSuccess` after a `2xx` response.

- [ ] **Step 4: Create pages**

Create:

- `src/app/setup/page.tsx` using `<AuthForm mode="setup" endpoint="/api/auth/setup" />`
- `src/app/login/page.tsx` using `<AuthForm mode="login" endpoint="/api/auth/login" />`

Redirect to `/` after success with `window.location.href = "/"`.

- [ ] **Step 5: Write e2e auth smoke**

Create `tests/e2e/auth.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("setup page renders owner bootstrap form", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Create Owner" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});
```

- [ ] **Step 6: Run auth UI tests**

Run:

```bash
npm test -- tests/components/AuthForm.test.tsx
npm run test:e2e -- tests/e2e/auth.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/setup src/app/login src/components/auth tests/components/AuthForm.test.tsx tests/e2e/auth.spec.ts
git commit -m "feat: add setup and login screens"
```

### Task 4.8: Device Pairing

**Files:**
- Create: `src/lib/server/auth/pairing.ts`
- Create: `src/app/api/devices/route.ts`
- Create: `src/app/api/devices/pair/route.ts`
- Modify: `src/components/workspace/Sidebar.tsx`
- Test: `tests/server/devicePairingApi.test.ts`

- [ ] **Step 1: Write failing pairing tests**

Create `tests/server/devicePairingApi.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    listDevices: vi.fn(),
    createDevicePairingCode: vi.fn(),
    getDevicePairingCodeByHash: vi.fn(),
    consumeDevicePairingCode: vi.fn(),
    createDevice: vi.fn()
  },
  requireApiSession: vi.fn()
}));

vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => mocks.db) }));
vi.mock("@/lib/server/metadata", () => ({ createMetadataRepository: vi.fn(() => mocks.repo) }));
vi.mock("@/lib/server/auth/guards", () => ({ requireApiSession: mocks.requireApiSession }));

describe("device pairing API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({ ok: true, userId: "user_1", sessionId: "session_1", deviceId: "device_1" });
    mocks.repo.listDevices.mockReturnValue([{ id: "device_1", name: "Mac Studio" }]);
    mocks.repo.createDevicePairingCode.mockReturnValue({ id: "pair_1" });
  });

  it("lists devices and creates pairing codes for the owner", async () => {
    const { GET, POST } = await import("@/app/api/devices/route");
    const listResponse = await GET(new Request("http://localhost/api/devices"));
    expect(listResponse.status).toBe(200);

    const createResponse = await POST(jsonRequest("http://localhost/api/devices", {
      deviceName: "Windows PC",
      deviceKind: "browser"
    }));
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual({
      pairingCode: expect.any(String),
      expiresAt: expect.any(String)
    });
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}
```

- [ ] **Step 2: Run failing pairing tests**

Run:

```bash
npm test -- tests/server/devicePairingApi.test.ts
```

Expected: FAIL because device routes do not exist.

- [ ] **Step 3: Implement pairing helpers and routes**

Implement:

- `createPairingCode()` returns a human-enterable code like `123-456`.
- `hashPairingCode(code)` hashes normalized code with SHA-256.
- `POST /api/devices` creates a code for current authenticated user.
- `POST /api/devices/pair` consumes code and creates a device.
- Codes expire after 10 minutes.

- [ ] **Step 4: Run pairing tests**

Run:

```bash
npm test -- tests/server/devicePairingApi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/auth/pairing.ts src/app/api/devices tests/server/devicePairingApi.test.ts
git commit -m "feat: add device pairing API"
```

### Task 4.9: Phase 4 Verification

**Files:**
- Create: `docs/implementation/phase-4-auth-device-trust.md`

- [ ] **Step 1: Document Phase 4**

Create `docs/implementation/phase-4-auth-device-trust.md`:

```md
# Phase 4 Auth And Device Trust

## Built

- Owner setup flow.
- Password login/logout.
- HTTP-only session cookies.
- Protected app/API routes.
- Trusted device registry.
- Pairing code flow for new devices.

## Security Model

- Local owner account controls the private LAN app.
- Session cookies are HTTP-only and same-site.
- Device pairing codes are short-lived and single-use.
- File APIs require a valid session.

## Verified

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Expected: all commands pass.

- [ ] **Step 3: Commit**

```bash
git add docs/implementation/phase-4-auth-device-trust.md
git commit -m "docs: summarize auth and device trust phase"
```

---

# Phase 5 Detailed Plan: Project Workspace 2.0

## Phase 5 File Structure

- Create: `src/app/projects/[id]/page.tsx`
  - Server-rendered project detail page.
- Create: `src/components/workspace/ProjectWorkspace.tsx`
  - Client view for project files, filters, and actions.
- Create: `src/components/workspace/BulkActionBar.tsx`
  - Multi-select operations.
- Create: `src/components/workspace/MetadataEditor.tsx`
  - Category/tag/project assignment controls.
- Modify: `src/components/workspace/FileGrid.tsx`
  - Support multi-select mode.
- Modify: `src/components/workspace/DetailDrawer.tsx`
  - Add category/tag edit controls and clearer project assignment.
- Modify: `src/lib/client/fileActions.ts`
  - Add bulk action client helpers.
- Modify: `src/app/api/files/[id]/route.ts`
  - Support category/tag updates.
- Create: `src/app/api/files/bulk/route.ts`
  - Bulk project/category/tag/archive operations.
- Modify: `src/lib/server/metadata.ts`
  - Add tag assignment and bulk file update helpers.
- Test: `tests/components/ProjectWorkspace.test.tsx`
- Test: `tests/components/BulkActionBar.test.tsx`
- Test: `tests/server/filesApi.test.ts`
- Test: `tests/e2e/project-workspace.spec.ts`

### Task 5.1: Tag Assignment Repository

**Files:**
- Modify: `src/lib/server/metadata.ts`
- Test: `tests/server/metadata.test.ts`

- [ ] **Step 1: Write failing tag assignment test**

Add to `tests/server/metadata.test.ts`:

```ts
it("creates tags and assigns them to files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
  createdDirs.push(dir);
  const db = createDatabase(path.join(dir, "test.sqlite"));
  try {
    const repo = createMetadataRepository(db);
    const file = repo.createFile({
      name: "bracket.stl",
      extension: "stl",
      family: "cad",
      mimeType: "model/stl",
      sizeBytes: 10,
      checksum: "abc",
      storagePath: "Inbox/Browser/bracket.stl",
      sourceDevice: "Browser"
    });

    const tag = repo.createTag({ name: "Printer" });
    const updated = repo.setFileTags(file.id, [tag.id]);

    expect(updated?.tags).toEqual([tag]);
    expect(repo.listTags()).toEqual([tag]);
  } finally {
    db.close();
  }
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm test -- tests/server/metadata.test.ts
```

Expected: FAIL because `createTag` and `setFileTags` do not exist.

- [ ] **Step 3: Implement tag helpers**

Add methods:

```ts
createTag(input: { name: string }): Tag
setFileTags(fileId: string, tagIds: string[]): CloudFile | null
```

`createTag` must use `uniqueSlug(db, "tags", slugify(input.name))`.

- [ ] **Step 4: Run metadata tests**

Run:

```bash
npm test -- tests/server/metadata.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/metadata.ts tests/server/metadata.test.ts
git commit -m "feat: add file tag assignment"
```

### Task 5.2: File Metadata Update API

**Files:**
- Modify: `src/app/api/files/[id]/route.ts`
- Test: `tests/server/filesApi.test.ts`

- [ ] **Step 1: Write failing API test**

Add to `tests/server/filesApi.test.ts`:

```ts
it("updates file category and tags", async () => {
  const { PATCH } = await import("@/app/api/files/[id]/route");
  const updated = {
    id: "file_123",
    categoryId: "cat_cad",
    tags: [{ id: "tag_1", name: "Printer", slug: "printer" }]
  };
  mocks.repo.getFileById.mockReturnValue({ id: "file_123", status: "active" });
  mocks.repo.listCategories.mockReturnValue([{ id: "cat_cad", name: "CAD", slug: "cad" }]);
  mocks.repo.updateFile.mockReturnValue({ id: "file_123", categoryId: "cat_cad" });
  mocks.repo.setFileTags.mockReturnValue(updated);

  const response = await PATCH(
    new Request("http://localhost/api/files/file_123", {
      method: "PATCH",
      body: JSON.stringify({ categoryId: "cat_cad", tagIds: ["tag_1"] })
    }),
    { params: Promise.resolve({ id: "file_123" }) }
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ file: updated });
});
```

- [ ] **Step 2: Run failing API test**

Run:

```bash
npm test -- tests/server/filesApi.test.ts
```

Expected: FAIL because `setFileTags` is not wired.

- [ ] **Step 3: Implement metadata patch behavior**

Rules:

- Validate file exists.
- Validate category exists when `categoryId` is not null.
- Apply project/category updates through existing `updateFile`.
- Apply tags through `setFileTags`.
- Return the freshest `CloudFile`.

- [ ] **Step 4: Run API test**

Run:

```bash
npm test -- tests/server/filesApi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/files/[id]/route.ts tests/server/filesApi.test.ts
git commit -m "feat: update file categories and tags"
```

### Task 5.3: Bulk File API

**Files:**
- Create: `src/app/api/files/bulk/route.ts`
- Modify: `src/lib/server/metadata.ts`
- Test: `tests/server/filesApi.test.ts`

- [ ] **Step 1: Write failing bulk API test**

Add to `tests/server/filesApi.test.ts`:

```ts
it("bulk assigns files to a project and category", async () => {
  const { POST } = await import("@/app/api/files/bulk/route");
  mocks.repo.getProjectById.mockReturnValue({ id: "proj_1", slug: "garage-build", name: "Garage Build" });
  mocks.repo.listCategories.mockReturnValue([{ id: "cat_cad", name: "CAD", slug: "cad" }]);
  mocks.repo.bulkUpdateFiles.mockReturnValue([
    { id: "file_1", projectId: "proj_1", categoryId: "cat_cad" },
    { id: "file_2", projectId: "proj_1", categoryId: "cat_cad" }
  ]);

  const response = await POST(
    new Request("http://localhost/api/files/bulk", {
      method: "POST",
      body: JSON.stringify({
        fileIds: ["file_1", "file_2"],
        projectId: "proj_1",
        categoryId: "cat_cad"
      })
    })
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    files: [
      { id: "file_1", projectId: "proj_1", categoryId: "cat_cad" },
      { id: "file_2", projectId: "proj_1", categoryId: "cat_cad" }
    ]
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm test -- tests/server/filesApi.test.ts
```

Expected: FAIL because bulk route does not exist.

- [ ] **Step 3: Implement `bulkUpdateFiles` repository method**

Add:

```ts
bulkUpdateFiles(input: {
  fileIds: string[];
  projectId?: string | null;
  categoryId?: string | null;
}): CloudFile[]
```

Use a SQLite transaction. Return updated rows via `getFileById`.

- [ ] **Step 4: Implement bulk route**

Route rules:

- Require at least one file ID.
- Cap `fileIds` at 500 per request.
- Validate project/category IDs before mutation.
- Return `{ files }`.

- [ ] **Step 5: Run bulk API tests**

Run:

```bash
npm test -- tests/server/filesApi.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/files/bulk/route.ts src/lib/server/metadata.ts tests/server/filesApi.test.ts
git commit -m "feat: add bulk file metadata API"
```

### Task 5.4: Multi-Select File Grid

**Files:**
- Modify: `src/components/workspace/FileGrid.tsx`
- Create: `src/components/workspace/BulkActionBar.tsx`
- Test: `tests/components/FileGrid.test.tsx`
- Test: `tests/components/BulkActionBar.test.tsx`

- [ ] **Step 1: Write failing component tests**

Add to `tests/components/FileGrid.test.tsx`:

```tsx
it("supports selecting multiple files", async () => {
  const user = userEvent.setup();
  const onToggleSelected = vi.fn();
  render(
    <FileGrid
      files={[fileA, fileB]}
      selectedFileId={null}
      selectedFileIds={["file_a"]}
      onSelectFile={vi.fn()}
      onToggleSelected={onToggleSelected}
      selectionMode="multiple"
    />
  );

  await user.click(screen.getByRole("checkbox", { name: "Select notes.txt" }));

  expect(onToggleSelected).toHaveBeenCalledWith("file_b");
});
```

Create `tests/components/BulkActionBar.test.tsx`:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "@/components/workspace/BulkActionBar";

describe("BulkActionBar", () => {
  it("shows selected count and core bulk actions", () => {
    render(
      <BulkActionBar
        selectedCount={3}
        onArchive={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    expect(screen.getByText("3 selected")).toBeVisible();
    expect(screen.getByRole("button", { name: "Archive" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run failing component tests**

Run:

```bash
npm test -- tests/components/FileGrid.test.tsx tests/components/BulkActionBar.test.tsx
```

Expected: FAIL because multi-select props and bulk bar do not exist.

- [ ] **Step 3: Implement multi-select UI**

Rules:

- File card gets a checkbox in multiple-selection mode.
- Checkbox label is `Select ${file.name}`.
- Do not break existing single-click file selection.
- Bulk action bar uses compact toolbar styling, not a large card.

- [ ] **Step 4: Run component tests**

Run:

```bash
npm test -- tests/components/FileGrid.test.tsx tests/components/BulkActionBar.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/FileGrid.tsx src/components/workspace/BulkActionBar.tsx tests/components
git commit -m "feat: add file multi-select UI"
```

### Task 5.5: Project Detail Page

**Files:**
- Create: `src/app/projects/[id]/page.tsx`
- Create: `src/components/workspace/ProjectWorkspace.tsx`
- Modify: `src/lib/server/workspaceData.ts`
- Test: `tests/components/ProjectWorkspace.test.tsx`
- Test: `tests/e2e/project-workspace.spec.ts`

- [ ] **Step 1: Write failing project workspace test**

Create `tests/components/ProjectWorkspace.test.tsx`:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectWorkspace } from "@/components/workspace/ProjectWorkspace";

describe("ProjectWorkspace", () => {
  it("renders project files and project metadata", () => {
    render(
      <ProjectWorkspace
        project={{ id: "proj_1", name: "Garage Build", slug: "garage-build", description: "Parts", categoryId: null, status: "active", createdAt: "2026-05-02T00:00:00.000Z", updatedAt: "2026-05-02T00:00:00.000Z" }}
        files={[{ ...fileFixture, id: "file_1", name: "bracket.stl", projectId: "proj_1" }]}
        categories={[]}
        tags={[]}
      />
    );

    expect(screen.getByRole("heading", { name: "Garage Build" })).toBeVisible();
    expect(screen.getByText("bracket.stl")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run failing project workspace test**

Run:

```bash
npm test -- tests/components/ProjectWorkspace.test.tsx
```

Expected: FAIL because `ProjectWorkspace` does not exist.

- [ ] **Step 3: Implement `ProjectWorkspace`**

Use:

- Project heading.
- Compact project metadata row.
- Search field scoped to project files.
- File grid.
- Bulk action bar when files are selected.

- [ ] **Step 4: Implement route**

`src/app/projects/[id]/page.tsx` should:

- Load project by ID.
- Load project files with `repo.listFiles({ projectId: id })`.
- Return `notFound()` for missing project.
- Render `ProjectWorkspace`.

- [ ] **Step 5: Add e2e smoke**

Create `tests/e2e/project-workspace.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("project workspace route renders", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Project" }).click();
  await page.getByLabel("Project name").fill("Garage Build");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Garage Build")).toBeVisible();
});
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- tests/components/ProjectWorkspace.test.tsx
npm run test:e2e -- tests/e2e/project-workspace.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/projects src/components/workspace/ProjectWorkspace.tsx src/lib/server/workspaceData.ts tests
git commit -m "feat: add project workspace page"
```

### Task 5.6: Phase 5 Verification

**Files:**
- Create: `docs/implementation/phase-5-project-workspace.md`

- [ ] **Step 1: Document Phase 5**

Create `docs/implementation/phase-5-project-workspace.md` with:

```md
# Phase 5 Project Workspace

## Built

- Project detail workspace.
- File multi-select.
- Bulk metadata operations.
- Tag assignment.
- Category assignment.
- Project-scoped browsing and search.

## Verified

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
```

- [ ] **Step 2: Full verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Expected: all commands pass.

- [ ] **Step 3: Commit docs**

```bash
git add docs/implementation/phase-5-project-workspace.md
git commit -m "docs: summarize project workspace phase"
```

---

# Phase 6 Detailed Plan: Upload Reliability 2.0

## Phase 6 File Structure

- Modify: `src/components/workspace/DropZone.tsx`
  - Progress, pause/resume/cancel, session persistence.
- Create: `src/lib/client/uploadSessions.ts`
  - Client upload session orchestration.
- Create: `src/lib/server/uploadCleanup.ts`
  - Server cleanup for stale upload sessions.
- Create: `src/app/api/upload-sessions/open/route.ts`
  - List open sessions for current user/device.
- Create: `src/app/api/maintenance/upload-cleanup/route.ts`
  - Local admin-triggered cleanup endpoint.
- Modify: `src/app/api/upload-sessions/[id]/chunk/route.ts`
  - Idempotent same-offset retry behavior where safe.
- Modify: `src/lib/server/metadata.ts`
  - Query open/stale upload sessions.
- Test: `tests/server/uploadCleanup.test.ts`
- Test: `tests/server/uploadSessionsApi.test.ts`
- Test: `tests/components/DropZone.test.tsx`

### Task 6.1: Client Upload Session Module

**Files:**
- Create: `src/lib/client/uploadSessions.ts`
- Test: `tests/components/uploadSessionsClient.test.ts`

- [ ] **Step 1: Write failing client module tests**

Create `tests/components/uploadSessionsClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { uploadFileInChunks } from "@/lib/client/uploadSessions";

describe("uploadFileInChunks", () => {
  it("reports progress while uploading chunks", async () => {
    const progress = vi.fn();
    const file = new File(["hello"], "manual.pdf", { type: "application/pdf" });
    const fetchMock = vi.fn<typeof fetch>((url) => {
      if (url === "/api/upload-sessions") {
        return Promise.resolve(new Response(JSON.stringify({ session: { id: "upload_1" } }), { status: 201 }));
      }
      if (url === "/api/upload-sessions/upload_1/chunk") {
        return Promise.resolve(new Response(JSON.stringify({ session: { receivedBytes: 5 } }), { status: 200 }));
      }
      if (url === "/api/upload-sessions/upload_1/complete") {
        return Promise.resolve(new Response(JSON.stringify({ file: { id: "file_1", name: "manual.pdf" } }), { status: 201 }));
      }
      return Promise.resolve(new Response("bad", { status: 500 }));
    });

    const fileRecord = await uploadFileInChunks({
      file,
      sourceDevice: "Browser",
      chunkSizeBytes: 5,
      fetchImpl: fetchMock,
      onProgress: progress
    });

    expect(fileRecord).toEqual({ id: "file_1", name: "manual.pdf" });
    expect(progress).toHaveBeenCalledWith({ loadedBytes: 5, totalBytes: 5 });
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm test -- tests/components/uploadSessionsClient.test.ts
```

Expected: FAIL because client module does not exist.

- [ ] **Step 3: Move chunk logic from DropZone to module**

Implement `uploadFileInChunks` with injected `fetchImpl` for tests and browser `fetch` by default.

- [ ] **Step 4: Run client tests**

Run:

```bash
npm test -- tests/components/uploadSessionsClient.test.ts tests/components/DropZone.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/uploadSessions.ts src/components/workspace/DropZone.tsx tests/components
git commit -m "refactor: extract chunked upload client"
```

### Task 6.2: Resume Open Upload Sessions

**Files:**
- Create: `src/app/api/upload-sessions/open/route.ts`
- Modify: `src/lib/server/metadata.ts`
- Modify: `src/lib/client/uploadSessions.ts`
- Test: `tests/server/uploadSessionsApi.test.ts`
- Test: `tests/components/uploadSessionsClient.test.ts`

- [ ] **Step 1: Write failing open-session API test**

Add to `tests/server/uploadSessionsApi.test.ts`:

```ts
it("lists open upload sessions for resume", async () => {
  const { GET } = await import("@/app/api/upload-sessions/open/route");
  mocks.repo.listOpenUploadSessions.mockReturnValue([
    { id: "upload_1", filename: "movie.webm", receivedBytes: 8388608, sizeBytes: 100000000 }
  ]);

  const response = await GET(new Request("http://localhost/api/upload-sessions/open"));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    sessions: [{ id: "upload_1", filename: "movie.webm", receivedBytes: 8388608, sizeBytes: 100000000 }]
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm test -- tests/server/uploadSessionsApi.test.ts
```

Expected: FAIL because open route/method does not exist.

- [ ] **Step 3: Implement open-session list**

Add repository method:

```ts
listOpenUploadSessions(filters?: { userId?: string; deviceId?: string | null }): UploadSession[]
```

For Phase 6, return open sessions ordered by `updated_at desc`.

- [ ] **Step 4: Implement open route**

`GET /api/upload-sessions/open` returns `{ sessions }`.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/server/uploadSessionsApi.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/upload-sessions/open/route.ts src/lib/server/metadata.ts tests/server/uploadSessionsApi.test.ts
git commit -m "feat: list resumable upload sessions"
```

### Task 6.3: Stale Upload Cleanup

**Files:**
- Create: `src/lib/server/uploadCleanup.ts`
- Create: `src/app/api/maintenance/upload-cleanup/route.ts`
- Modify: `src/lib/server/metadata.ts`
- Test: `tests/server/uploadCleanup.test.ts`

- [ ] **Step 1: Write failing cleanup test**

Create `tests/server/uploadCleanup.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { cleanupStaleUploads } from "@/lib/server/uploadCleanup";

describe("cleanupStaleUploads", () => {
  it("aborts stale open sessions and removes temp files", async () => {
    const repo = {
      listStaleUploadSessions: vi.fn(() => [{ id: "upload_1", tempPath: ".uploads/upload_1.part" }]),
      failUploadSession: vi.fn()
    };
    const storage = {
      abortUploadSession: vi.fn(async () => undefined)
    };

    const result = await cleanupStaleUploads({ repo, storage, olderThan: new Date("2026-05-02T00:00:00.000Z") });

    expect(result).toEqual({ scanned: 1, cleaned: 1, failed: 0 });
    expect(storage.abortUploadSession).toHaveBeenCalledWith(".uploads/upload_1.part");
    expect(repo.failUploadSession).toHaveBeenCalledWith("upload_1", "stale upload cleaned up");
  });
});
```

- [ ] **Step 2: Run failing cleanup test**

Run:

```bash
npm test -- tests/server/uploadCleanup.test.ts
```

Expected: FAIL because cleanup module does not exist.

- [ ] **Step 3: Implement cleanup module**

Implement `cleanupStaleUploads` with injected repo/storage for tests. Count scanned, cleaned, and failed.

- [ ] **Step 4: Implement repository stale query**

Add:

```ts
listStaleUploadSessions(olderThanIso: string): UploadSession[]
```

where `status = 'open' and updated_at < @olderThanIso`.

- [ ] **Step 5: Add maintenance route**

`POST /api/maintenance/upload-cleanup` should:

- Require authentication.
- Use 24-hour cutoff by default.
- Return cleanup counts.

- [ ] **Step 6: Run cleanup tests**

Run:

```bash
npm test -- tests/server/uploadCleanup.test.ts tests/server/uploadSessionsApi.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/uploadCleanup.ts src/app/api/maintenance/upload-cleanup/route.ts src/lib/server/metadata.ts tests/server
git commit -m "feat: clean up stale upload sessions"
```

### Task 6.4: Pause, Resume, Cancel UI

**Files:**
- Modify: `src/components/workspace/DropZone.tsx`
- Modify: `src/lib/client/uploadSessions.ts`
- Test: `tests/components/DropZone.test.tsx`

- [ ] **Step 1: Write failing UI test**

Add to `tests/components/DropZone.test.tsx`:

```tsx
it("shows progress and lets the user cancel a chunked upload", async () => {
  const user = userEvent.setup();
  let chunkStarted = false;
  const fetchMock = vi.fn<typeof fetch>((url) => {
    if (url === "/api/upload-sessions") {
      return Promise.resolve(new Response(JSON.stringify({ session: { id: "upload_1" } }), { status: 201 }));
    }
    if (url === "/api/upload-sessions/upload_1/chunk") {
      chunkStarted = true;
      return new Promise<Response>(() => undefined);
    }
    if (url === "/api/upload-sessions/upload_1/abort") {
      return Promise.resolve(new Response(JSON.stringify({ session: { status: "aborted" } }), { status: 200 }));
    }
    return Promise.resolve(new Response("bad", { status: 500 }));
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <DropZone chunkedUploadThresholdBytes={4} chunkSizeBytes={3}>
      <div data-testid="drop-target">Drop target</div>
    </DropZone>
  );

  fireEvent.drop(screen.getByTestId("drop-target"), {
    dataTransfer: { files: [new File(["hello"], "manual.pdf", { type: "application/pdf" })] }
  });

  await waitFor(() => expect(chunkStarted).toBe(true));
  await user.click(screen.getByRole("button", { name: "Cancel upload" }));

  expect(fetchMock).toHaveBeenCalledWith("/api/upload-sessions/upload_1/abort", expect.objectContaining({ method: "POST" }));
});
```

- [ ] **Step 2: Run failing UI test**

Run:

```bash
npm test -- tests/components/DropZone.test.tsx
```

Expected: FAIL because cancel control does not exist.

- [ ] **Step 3: Implement cancel control**

Use `AbortController` for in-flight chunk request. After cancel, call session abort endpoint when session id exists.

Status text examples:

- `Uploading movie.webm 42%`
- `Upload paused`
- `Upload canceled`

- [ ] **Step 4: Run UI tests**

Run:

```bash
npm test -- tests/components/DropZone.test.tsx tests/components/uploadSessionsClient.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/DropZone.tsx src/lib/client/uploadSessions.ts tests/components
git commit -m "feat: add upload progress and cancel controls"
```

### Task 6.5: Phase 6 Verification

**Files:**
- Create: `docs/implementation/phase-6-upload-reliability.md`

- [ ] **Step 1: Document Phase 6**

Create `docs/implementation/phase-6-upload-reliability.md` with:

```md
# Phase 6 Upload Reliability

## Built

- Chunked upload client module.
- Upload progress reporting.
- Cancel flow with server abort.
- Open session listing for resume.
- Stale upload cleanup.

## Remaining Measurement

- Run 1 GB and 5 GB uploads on the actual 2.5Gb LAN.
- Tune chunk size after real NAS testing.

## Verified

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
```

- [ ] **Step 2: Full verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Expected: all commands pass.

- [ ] **Step 3: Commit**

```bash
git add docs/implementation/phase-6-upload-reliability.md
git commit -m "docs: summarize upload reliability phase"
```

---

# Phase 7 Plan: Preview And Metadata Enrichment

## Phase 7 Scope

Phase 7 should focus on safe, cheap previews first:

- Image thumbnails with Node/browser-safe image tooling selected after a spike.
- Video metadata and poster frames only if local tooling is available in the container.
- File-type badges for CAD and unknown binary formats.
- Sidecar metadata records that do not block file access.

## Phase 7 Tasks

### Task 7.1: Preview Metadata Schema

**Files:**
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/shared/types.ts`
- Modify: `src/lib/server/metadata.ts`
- Test: `tests/server/db.test.ts`
- Test: `tests/server/metadata.test.ts`

- [ ] Add `file_previews` table with `file_id`, `kind`, `status`, `preview_path`, `width`, `height`, `duration_seconds`, `error`, `created_at`, `updated_at`.
- [ ] Add repository methods `upsertFilePreview`, `getFilePreview`, `listPendingPreviewJobs`.
- [ ] Write tests first and watch them fail.
- [ ] Implement schema and repository.
- [ ] Commit with `feat: add preview metadata`.

### Task 7.2: Preview Worker Skeleton

**Files:**
- Create: `src/lib/server/previews/worker.ts`
- Create: `scripts/generate-previews.ts`
- Test: `tests/server/previews.test.ts`

- [ ] Add test that a missing file marks preview status `failed`.
- [ ] Add test that unsupported file family marks status `skipped`.
- [ ] Implement worker skeleton.
- [ ] Add CLI script.
- [ ] Commit with `feat: add preview worker skeleton`.

### Task 7.3: Image Thumbnail Generation

**Files:**
- Modify: `src/lib/server/previews/worker.ts`
- Modify: `docker/Dockerfile` if native image tooling is chosen.
- Test: `tests/server/previews.test.ts`

- [ ] Choose image library after checking current dependency constraints.
- [ ] Add tests for PNG/JPEG thumbnail output path.
- [ ] Generate thumbnails under `.previews/images/`.
- [ ] Store preview metadata.
- [ ] Commit with `feat: generate image thumbnails`.

### Task 7.4: Preview UI

**Files:**
- Modify: `src/components/workspace/FileGrid.tsx`
- Modify: `src/components/workspace/DetailDrawer.tsx`
- Test: `tests/components/FileGrid.test.tsx`
- Test: `tests/components/DetailDrawer.test.tsx`

- [ ] Add tests for thumbnail rendering when preview exists.
- [ ] Add fallback icon tests for no preview.
- [ ] Implement UI.
- [ ] Commit with `feat: show file previews`.

---

# Phase 8 Plan: Search, Notes, Activity, And Audit

## Phase 8 Scope

Search and activity should make the system feel organized and trustworthy.

### Task 8.1: Notes And Search Schema

**Files:**
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/server/metadata.ts`
- Test: `tests/server/metadata.test.ts`

- [ ] Add `description` or `notes` column to files.
- [ ] Add SQLite FTS table for searchable file content metadata.
- [ ] Write failing tests for searching by note text, tag, project, extension, and source device.
- [ ] Implement indexed search updates on file create/update.
- [ ] Commit with `feat: add searchable file notes`.

### Task 8.2: Activity Log

**Files:**
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/server/metadata.ts`
- Create: `src/lib/server/activity.ts`
- Test: `tests/server/activity.test.ts`

- [ ] Add `activity_events` table.
- [ ] Add `recordActivity` helper.
- [ ] Emit events for upload, archive, restore, project assignment, tag assignment, login, pairing.
- [ ] Commit with `feat: add activity log`.

### Task 8.3: Activity UI

**Files:**
- Create: `src/components/workspace/ActivityFeed.tsx`
- Modify: `src/components/workspace/AppShell.tsx`
- Test: `tests/components/ActivityFeed.test.tsx`

- [ ] Add test rendering upload/archive/project assignment events.
- [ ] Add compact feed to side panel.
- [ ] Commit with `feat: show activity feed`.

---

# Phase 9 Plan: TrueNAS Production Deployment

## Phase 9 Scope

This phase makes the app deployable and maintainable on the actual TrueNAS SCALE server.

### Task 9.1: Health And Environment Checks

**Files:**
- Create: `src/app/api/health/route.ts`
- Create: `src/lib/server/health.ts`
- Test: `tests/server/health.test.ts`

- [ ] Test writable storage root.
- [ ] Test writable database directory.
- [ ] Test required folders can be created.
- [ ] Return JSON status with `ok`, `storage`, `database`, and `version`.
- [ ] Commit with `feat: add health checks`.

### Task 9.2: Backup And Restore Commands

**Files:**
- Create: `scripts/backup-metadata.ts`
- Create: `scripts/restore-metadata.ts`
- Modify: `package.json`
- Test: `tests/server/backupScripts.test.ts`

- [ ] Add tests using temp SQLite database.
- [ ] Implement safe backup that includes WAL/SHM handling guidance.
- [ ] Add package scripts `backup:metadata` and `restore:metadata`.
- [ ] Commit with `feat: add metadata backup scripts`.

### Task 9.3: Docker Image Publishing

**Files:**
- Create: `.github/workflows/docker.yml`
- Modify: `docs/deployment/truenas-scale.md`

- [ ] Add workflow for GHCR image build.
- [ ] Document required repository secrets/permissions.
- [ ] Document how to replace image in TrueNAS YAML.
- [ ] Commit with `ci: publish docker image`.

### Task 9.4: LAN Performance Measurements

**Files:**
- Create: `scripts/measure-upload.ts`
- Create: `docs/implementation/lan-performance.md`

- [ ] Create script that uploads generated files of configured size through chunked API.
- [ ] Record output fields: file size, duration, MB/s, chunk size, status.
- [ ] Document 1 GB and 5 GB test procedure.
- [ ] Commit with `feat: add LAN upload measurement tool`.

---

# Phase 10 Plan: Desktop Helper And Clipboard Bridge

## Phase 10 Scope

Desktop helper work should start with APIs and a CLI before native apps.

### Task 10.1: Device API Tokens

**Files:**
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/server/metadata.ts`
- Create: `src/lib/server/auth/apiTokens.ts`
- Test: `tests/server/apiTokens.test.ts`

- [ ] Add `device_api_tokens` table.
- [ ] Add token create/revoke/list methods.
- [ ] Add auth guard that accepts bearer tokens for helper endpoints.
- [ ] Commit with `feat: add device API tokens`.

### Task 10.2: Helper Upload Endpoint

**Files:**
- Create: `src/app/api/helper/upload/route.ts`
- Test: `tests/server/helperApi.test.ts`

- [ ] Accept bearer token.
- [ ] Accept multipart file upload.
- [ ] Store file using existing storage/metadata path.
- [ ] Record source device from token.
- [ ] Commit with `feat: add helper upload endpoint`.

### Task 10.3: Clipboard Text Handoff

**Files:**
- Modify: `src/lib/server/db.ts`
- Create: `src/app/api/clipboard/route.ts`
- Create: `src/components/workspace/ClipboardInbox.tsx`
- Test: `tests/server/clipboardApi.test.ts`
- Test: `tests/components/ClipboardInbox.test.tsx`

- [ ] Add `clipboard_items` table with text content, source device, created_at, expires_at.
- [ ] Add API for create/list/delete clipboard items.
- [ ] Add UI for copy-to-clipboard in browser.
- [ ] Commit with `feat: add clipboard handoff`.

### Task 10.4: CLI Helper Prototype

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/src/index.ts`
- Create: `docs/implementation/helper-cli.md`

- [ ] CLI command: `nas-cloud upload <path>`.
- [ ] CLI command: `nas-cloud clip <text>`.
- [ ] CLI reads server URL and token from env vars.
- [ ] Commit with `feat: add helper CLI prototype`.

### Task 10.5: Native Helper Decision

**Files:**
- Create: `docs/research/desktop-helper-options.md`

- [ ] Compare Tauri, Electron, Swift macOS app plus Windows .NET app, and CLI-only.
- [ ] Evaluate tray menu, clipboard monitor, auto-update, signing, and build complexity.
- [ ] Recommend one path for v1.
- [ ] Commit with `docs: choose desktop helper approach`.

---

# Phase 11 Plan: Sharing Controls

## Phase 11 Scope

Sharing must be optional and disabled by default for private LAN deployments.

### Task 11.1: Share Link Schema

**Files:**
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/server/metadata.ts`
- Test: `tests/server/shareLinks.test.ts`

- [ ] Add `share_links` table.
- [ ] Add create/revoke/get methods.
- [ ] Store token hashes, never raw share tokens.
- [ ] Commit with `feat: add share link metadata`.

### Task 11.2: Share Download Route

**Files:**
- Create: `src/app/share/[token]/route.ts`
- Test: `tests/server/shareLinks.test.ts`

- [ ] Validate token hash.
- [ ] Enforce expiration and revoked state.
- [ ] Stream file with existing storage path safety.
- [ ] Commit with `feat: add expiring share downloads`.

### Task 11.3: Share UI

**Files:**
- Modify: `src/components/workspace/DetailDrawer.tsx`
- Create: `src/components/workspace/ShareDialog.tsx`
- Test: `tests/components/ShareDialog.test.tsx`

- [ ] Add disabled-by-default setting check.
- [ ] Add create/revoke share actions.
- [ ] Commit with `feat: add share link UI`.

---

# Cross-Cutting Standards For Every Phase

## Required Verification

Every phase must end with:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
git status --short --branch
```

Expected:

- All commands pass.
- `git status --short --branch` shows only the current branch and no uncommitted changes after commit.

## Required Safety Checks

Every server route touching files must satisfy:

- No client-provided raw filesystem paths.
- Metadata ID lookup before storage operation.
- `storage.absolutePathFor` or storage service methods for all storage paths.
- Cleanup or repair-required response if filesystem and metadata diverge.
- Tests for missing records and mismatched state.

## Required UI Checks

Every new UI surface must satisfy:

- Accessible labels for inputs/buttons.
- Keyboard-operable controls.
- No text overlap at desktop and mobile widths.
- No nested card layouts.
- Existing dashboard visual language unless intentionally revised by a design pass.

## Required Docs

Every phase gets:

- `docs/implementation/phase-N-name.md`
- Summary of built behavior.
- Safety model.
- Verification commands.
- Remaining follow-up, if any.

## Open-Source Readiness Checklist

Before public release:

- Add `README.md` with project goals, screenshots, install, config, and warnings.
- Add `LICENSE`.
- Add `.env.example`.
- Add contribution guide.
- Add architecture overview.
- Add security policy explaining private LAN assumptions.
- Replace placeholder GHCR image path in deployment docs.
- Confirm no personal machine paths are required for default setup.

---

# Self-Review

## Spec Coverage

This plan covers:

- Secure private access through owner auth and device trust.
- Project-first organization.
- Large-file reliability beyond the current chunked MVP.
- Preview/search/activity features.
- TrueNAS production hardening.
- Desktop helper and clipboard bridge path.
- Optional sharing controls.
- Open-source release prep.

## Placeholder Scan

This plan avoids unresolved placeholders and vague implementation-only instructions. Later phases are intentionally less code-specific than Phases 4-6, but each still names files, tests, expected behavior, commands, and commit boundaries.

## Type Consistency

The plan consistently uses:

- `User`
- `TrustedDevice`
- `UploadSession`
- `CloudFile`
- `Tag`
- `Project`
- `requireApiSession`
- `createMetadataRepository`

These names match the existing code style and planned additions.
