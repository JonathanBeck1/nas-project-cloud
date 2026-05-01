# Large File Upload Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a resumable chunked upload path so multi-gigabyte files can be sent to the TrueNAS-backed filesystem without relying on one giant browser request.

**Architecture:** Keep the direct filesystem model. The server creates an upload session in SQLite, accepts ordered binary chunks into a temporary `.uploads/<session-id>.part` file under the configured storage root, and completes the session by atomically moving the assembled file into the normal Inbox or Project folder before creating the existing `files` metadata row.

**Tech Stack:** Next.js App Router route handlers, `better-sqlite3`, Node filesystem streams/promises, Vitest, Testing Library, Playwright.

---

### Task 1: Upload Session Metadata

**Files:**
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/server/metadata.ts`
- Modify: `src/lib/shared/types.ts`
- Test: `tests/server/db.test.ts`
- Test: `tests/server/metadata.test.ts`

- [ ] **Step 1: Write failing migration/repository tests**

Add tests that expect an `upload_sessions` table and repository methods for creating, reading, advancing, completing, and failing sessions.

Run: `npm test -- tests/server/db.test.ts tests/server/metadata.test.ts`
Expected: FAIL because the table and repository methods do not exist.

- [ ] **Step 2: Implement upload session table and repository**

Create columns for session id, filename, mime type, size bytes, received bytes, checksum, target kind, source device, project id, project slug, category id, status, temp path, storage path, error, created/updated/completed timestamps.

Run: `npm test -- tests/server/db.test.ts tests/server/metadata.test.ts`
Expected: PASS.

### Task 2: Chunk Filesystem Operations

**Files:**
- Modify: `src/lib/server/storage.ts`
- Test: `tests/server/storage.test.ts`

- [ ] **Step 1: Write failing storage tests**

Add tests for creating temp upload paths, appending chunks at expected offsets, rejecting offset mismatches, completing temp files into Inbox/Project target directories, and aborting temp files without escaping the storage root.

Run: `npm test -- tests/server/storage.test.ts`
Expected: FAIL because chunk helpers do not exist.

- [ ] **Step 2: Implement chunk helpers**

Add `createUploadTempPath`, `appendUploadChunk`, `completeUploadSession`, and `abortUploadSession` to the storage service. Completion should reuse existing safe filename allocation and return the same `StoredFile` shape as normal uploads.

Run: `npm test -- tests/server/storage.test.ts`
Expected: PASS.

### Task 3: Upload Session API

**Files:**
- Create: `src/app/api/upload-sessions/route.ts`
- Create: `src/app/api/upload-sessions/[id]/chunk/route.ts`
- Create: `src/app/api/upload-sessions/[id]/complete/route.ts`
- Create: `src/app/api/upload-sessions/[id]/abort/route.ts`
- Test: `tests/server/uploadSessionsApi.test.ts`

- [ ] **Step 1: Write failing API tests**

Test session creation validation, chunk offset validation, successful completion into file metadata, cleanup on metadata failure, and explicit abort.

Run: `npm test -- tests/server/uploadSessionsApi.test.ts`
Expected: FAIL because routes do not exist.

- [ ] **Step 2: Implement API routes**

Routes should use JSON for session creation/completion and raw request bytes for chunks. They should validate project/category targets the same way `POST /api/files` does, never trust a client-provided project slug over the database, and return clear JSON errors.

Run: `npm test -- tests/server/uploadSessionsApi.test.ts`
Expected: PASS.

### Task 4: Browser Upload Client

**Files:**
- Modify: `src/components/workspace/DropZone.tsx`
- Test: `tests/components/DropZone.test.tsx`

- [ ] **Step 1: Write failing component tests**

Add a large-file test that expects `DropZone` to create an upload session, send chunks with offset headers, complete the session, and report the completed file through `onUploaded`.

Run: `npm test -- tests/components/DropZone.test.tsx`
Expected: FAIL because `DropZone` only uses `POST /api/files`.

- [ ] **Step 2: Implement chunked client path**

Keep the existing single-request path for small files. For files above a conservative client threshold, create a session, send chunks sequentially, complete the session, and display upload progress in the status text.

Run: `npm test -- tests/components/DropZone.test.tsx`
Expected: PASS.

### Task 5: Verification And Commit

**Files:**
- Modify: `docs/implementation/phase-3-large-file-uploads.md`

- [ ] **Step 1: Document the feature**

Document the new session API, client threshold, temp upload cleanup behavior, and remaining future work for true pause/resume UI.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add docs src tests package.json eslint.config.mjs
git commit -m "feat: add chunked upload sessions"
```
