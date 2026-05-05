# Product Completion Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current working NAS cloud MVP into a coherent daily-use local cloud product with real navigation, organization workflows, reliable previews/uploads, and TrueNAS-ready operations.

**Architecture:** Keep the Next.js app as the web control plane, SQLite as metadata, and NAS filesystem storage as the source of truth for bytes. Build product surfaces as authenticated server routes with focused client components only where interaction is needed.

**Tech Stack:** Next.js App Router, React 19, TypeScript, SQLite via better-sqlite3, Tailwind, Vitest, Playwright, sharp.

---

### Task 1: Real Workspace Routes

**Files:**
- Create: `src/lib/server/pageSession.ts`
- Create: `src/components/workspace/WorkspaceFrame.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/projects/[id]/page.tsx`
- Modify: `src/components/workspace/Sidebar.tsx`
- Create routes: `src/app/projects/page.tsx`, `src/app/categories/page.tsx`, `src/app/archive/page.tsx`, `src/app/devices/page.tsx`, `src/app/settings/page.tsx`, `src/app/smart-views/[view]/page.tsx`
- Test: `tests/components/Sidebar.test.tsx`

- [ ] Write failing tests that assert the sidebar has no `#` links and exposes real links for every destination.
- [ ] Extract shared owner/session redirect logic into `requirePageSession()`.
- [ ] Build `WorkspaceFrame` so new pages share the same sidebar and responsive content shell.
- [ ] Replace placeholder sidebar items with real route hrefs.
- [ ] Add server pages for each route with real data from metadata repositories.
- [ ] Run `npm test -- tests/components/Sidebar.test.tsx`.

### Task 2: Project And Category Organization

**Files:**
- Modify: `src/components/workspace/AppShell.tsx`
- Modify: `src/components/workspace/ProjectWorkspace.tsx`
- Create: `src/components/workspace/BulkOrganizePanel.tsx`
- Modify: `src/lib/client/fileActions.ts`
- Test: `tests/components/BulkOrganizePanel.test.tsx`, `tests/components/AppShell.test.tsx`

- [ ] Add bulk project/category assignment controls.
- [ ] Keep selection stable after bulk metadata updates.
- [ ] Show category/tag/project context in file lists without crowding.
- [ ] Run focused component tests.

### Task 3: Archive And Recovery

**Files:**
- Create: `src/app/api/files/[id]/restore/route.ts`
- Create: `src/app/api/files/[id]/delete/route.ts`
- Create: `src/components/workspace/ArchiveWorkspace.tsx`
- Test: `tests/server/filesApi.test.ts`, `tests/components/ArchiveWorkspace.test.tsx`

- [ ] Add restore route using existing storage restore behavior.
- [ ] Add permanent delete route with storage deletion and metadata update/removal.
- [ ] Build archive page with restore and delete actions.
- [ ] Verify archive workflows with tests.

### Task 4: Device Management

**Files:**
- Modify: `src/app/api/devices/route.ts`
- Create: `src/app/api/devices/[id]/route.ts`
- Create: `src/components/workspace/DevicesWorkspace.tsx`
- Test: `tests/server/devicePairingApi.test.ts`, `tests/components/DevicesWorkspace.test.tsx`

- [ ] Display trusted devices with kind and last seen.
- [ ] Add revoke-device API.
- [ ] Add pairing-code UI surface.
- [ ] Verify device listing and revocation.

### Task 5: Automatic Preview Processing

**Files:**
- Modify: `src/lib/server/previews/enqueue.ts`
- Modify: `src/lib/server/previews/worker.ts`
- Create: `src/app/api/maintenance/previews/route.ts`
- Modify: `docker/docker-compose.truenas.yml`
- Test: `tests/server/previews.test.ts`, `tests/server/filesApi.test.ts`

- [ ] Enqueue preview metadata for supported file families.
- [ ] Add authenticated maintenance route to process pending previews.
- [ ] Document cron/container scheduling for TrueNAS.
- [ ] Surface preview status in file UI.

### Task 6: Upload Center

**Files:**
- Create: `src/components/workspace/UploadCenter.tsx`
- Modify: `src/components/workspace/DropZone.tsx`
- Modify: `src/lib/client/uploadSessions.ts`
- Test: `tests/components/UploadCenter.test.tsx`, `tests/components/DropZone.test.tsx`

- [ ] Show active, failed, aborted, and resumable uploads.
- [ ] Add retry/reopen flow where safe.
- [ ] Add per-device upload visibility.

### Task 7: Search And Smart Views

**Files:**
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/server/metadata.ts`
- Modify: `src/lib/server/smartViews.ts`
- Create: `src/components/workspace/SearchResultsWorkspace.tsx`
- Test: `tests/server/metadata.test.ts`, `tests/server/smartViews.test.ts`

- [ ] Add DB-backed search beyond current client filtering.
- [ ] Add smart-view pages that query server-side data.
- [ ] Prepare SQLite FTS migration if basic search is too weak.

### Task 8: TrueNAS Readiness

**Files:**
- Create: `src/app/api/health/route.ts`
- Modify: `docs/deployment/truenas-scale.md`
- Modify: `docker/docker-compose.truenas.yml`
- Test: `tests/server/healthApi.test.ts`

- [ ] Add healthcheck route checking DB and storage root.
- [ ] Add storage path validation docs.
- [ ] Add 1GB and 5GB benchmark checklist for 2.5Gb LAN.
- [ ] Verify Docker volume paths match app env names.

### Task 9: Final Polish And Review

**Files:**
- Modify: `src/app/globals.css`
- Modify workspace components as needed
- Test: full suite

- [ ] Remove placeholder language from runtime UI.
- [ ] Check mobile and desktop layout.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `npm run test:e2e`.
