# File List Pagination Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. Commits land in order on `fix/external-audit-2026-09`; each one ends with the verification gate green.

**Goal:** Stop loading the whole `files` table into every render. Today `listFiles()` has no `LIMIT`: the home workspace serializes every active file to the browser, the projects index loads every file to count per project, and the archive page loads active and archived files to show the archived ones. After the json_each fix this no longer throws past 32,766 rows, but it still blocks the event loop (about 200 ms at 32k rows, synchronous) and ships the whole table as page props.

**Architecture:** Keyset pagination in the repository, exposed through `GET /api/files`. Pages render the first page on the server and load more on demand. Counts come from `count(*)` queries, never from array lengths. No new tables, no new dependencies.

**Out of scope:** search (already capped at 200 with a banner), FTS, virtualized rendering, infinite scroll.

**Verification gate (every commit):**

```bash
npm test && npm run typecheck && npm run lint && npm run build
```

`npm run test:e2e` runs in CI.

---

## Design

**Sort order and cursor.** The listing order stays `uploaded_at desc, name asc`, with `id asc` added as the final tie-break so the order is total. The cursor is the last row's `(uploaded_at, name, id)`, base64url-encoded JSON, opaque to clients. Directions are mixed, so the predicate is written out rather than as a row value:

```sql
where status = 'active'
  and (uploaded_at < @u
       or (uploaded_at = @u and (name > @n or (name = @n and id > @i))))
order by uploaded_at desc, name, id
limit @limit + 1
```

Fetching `limit + 1` rows tells us whether there is a next page without a second query (the same trick `searchFiles` uses). Filters (`projectId`, `categoryId`, `query`) come from the query string on every request; the cursor only encodes a position, so it is not signed. A cursor that fails to decode is a `400`.

`uploaded_at` is always written with `toISOString()`, so text comparison is chronological.

**Index.** `create index if not exists files_listing_idx on files(status, uploaded_at desc, name, id)`. Idempotent and safe on an existing v0.3.1 database; building it on 100k rows takes milliseconds. Project-scoped lists keep using `files_project_id_idx` and sort the (much smaller) result. I will check both with `EXPLAIN QUERY PLAN` at 40k rows before deciding whether a second `(project_id, …)` index earns its write cost.

**API.** `GET /api/files?limit=&cursor=` returns `{ files, nextCursor }`. Default `limit` 100, clamped to 1–500. `nextCursor` is `null` on the last page.

**Counts.** `countActiveFilesByProject(): Map<string, number>` (`select project_id, count(*) … group by project_id`) for the projects index, and `countFiles(filters)` for the project workspace's "Files" stat, which today is `files.length`. The sidebar shows no counts today, so it needs nothing.

**UI.** `loadWorkspaceData` returns `{ files: firstPage, nextCursor }`. `AppShell` keeps `files` and `nextCursor` in state and renders a "Load more" button under `FileGrid`/`FileList` while `nextCursor` is set. A button rather than an IntersectionObserver: it is testable in jsdom, accessible, and cannot run away. Local mutations keep working as they do now (upload prepends, archive and delete remove, bulk update maps). Bulk selection only ever covers loaded files, which is already true of what is on screen.

## Decisions I need from you

1. **Breaking API default.** With no `limit`, `GET /api/files` would return 100 files where it used to return all of them. The web UI is the only client I know of. I recommend applying the default always and calling it out in the CHANGELOG, which settles the version question at `0.4.0`. The alternative is "no `limit` means everything", which keeps the unbounded path alive.
2. **Project workspace.** It filters client-side over the whole project (`matchesQuery`), so paginating it means moving that filter to the server with a debounce, as `AppShell` search does. Project lists are scoped by `project_id` and never hit the home page. I recommend leaving it whole-project for now and doing it as its own change; say if you want it in this round.
3. **Smart views.** `listSmartViewFiles` is also unbounded. I recommend capping it at 200 with the same banner as search, in commit 2.

---

## Commit 1 — repository, index, API

**Files:**
- Modify: `src/lib/server/db.ts` — `files_listing_idx`.
- Modify: `src/lib/server/metadata.ts` — `listFilesPage(filters, { limit, cursor })`, cursor encode/decode. `listFiles()` stays for callers that need a whole project (ZIP export, project delete).
- Modify: `src/app/api/files/route.ts` — `limit`, `cursor`, `nextCursor`.
- Test: `tests/server/metadata.listFilesPage.test.ts`, `tests/server/filesApi.test.ts`.

- [ ] Walking every page returns each row exactly once, in the same order as `listFiles()`, including rows that tie on `uploaded_at` and on `uploaded_at` + `name`.
- [ ] Filters and cursor compose (`projectId`, `categoryId`, `query`, archived excluded).
- [ ] `limit` clamps to 1–500; a garbage cursor is a `400`; the last page has `nextCursor: null`.
- [ ] `EXPLAIN QUERY PLAN` for the unfiltered page uses `files_listing_idx` with no temp b-tree sort.
- [ ] 40,000 seeded rows: first page returns 100 rows.

## Commit 2 — counts and the other full-table loads

**Files:**
- Modify: `src/lib/server/metadata.ts` — `countActiveFilesByProject`, `countFiles`, `status` filter on `listFiles`.
- Modify: `src/app/projects/page.tsx` — counts from the group-by, no `listFiles()`.
- Modify: `src/app/archive/page.tsx` — query archived rows instead of loading everything and filtering in JS.
- Modify: `src/lib/server/smartViews.ts` — cap (decision 3).
- Test: `tests/server/metadata.test.ts`, page tests where they exist.

- [ ] Projects index renders the right count per project, including zero.
- [ ] Archive page never reads active rows.

## Commit 3 — first-page SSR and "Load more"

**Files:**
- Modify: `src/lib/server/workspaceData.ts` — first page plus `nextCursor`.
- Modify: `src/components/workspace/AppShell.tsx`, `FileGrid.tsx`, `FileList.tsx` — load-more state and button.
- Test: `tests/server/workspaceData.test.ts`, `tests/components/AppShell.test.tsx`; extend `tests/e2e/workspace.spec.ts` only if the default page size changes what it sees (it uploads fewer than 100 files, so it should not).

- [ ] "Load more" appends the next page, keeps selection, and disappears when `nextCursor` is `null`.
- [ ] A failed page load shows an inline error and leaves the button in place.
- [ ] Uploading while more pages remain prepends the new file and does not duplicate it on the next page.
- [ ] Verified in a browser against a seeded database of 40,000 files.

## Docs

- `README.md` — API note for `GET /api/files`, and the Known limitations line about result caps.
- `CHANGELOG.md` — Changed: paginated file listing (breaking if decision 1 goes as recommended).
