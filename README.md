# NAS Project Cloud

A self-hosted, project-first file cloud for [TrueNAS SCALE](https://www.truenas.com/truenas-scale/). It feels like a private Google Drive built around real projects, but the bytes live on a ZFS dataset that you can still see from SMB, Finder, or Explorer when the app is offline.

> **Status:** pre-1.0 (`v0.3.x`). The app is usable on a private LAN and has a TrueNAS-ready Docker deployment, but it is still moving quickly. See [Roadmap](#roadmap) for what's next and [Known limitations](#known-limitations) for what to expect today.

[![CI](https://github.com/JonathanBeck1/nas-project-cloud/actions/workflows/ci.yml/badge.svg)](https://github.com/JonathanBeck1/nas-project-cloud/actions/workflows/ci.yml)
[![Publish Docker image](https://github.com/JonathanBeck1/nas-project-cloud/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/JonathanBeck1/nas-project-cloud/actions/workflows/docker-publish.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

![Workspace screenshot](./docs/screenshots/workspace.png)

## Why this exists

Tools like Nextcloud and OpenCloud are general-purpose. Tools like LocalSend are device-to-device. Neither is built around the workflow most makers actually run: a single NAS where every project lives in its own folder of CAD, prints, source files, exports, photos, and reference media. NAS Project Cloud keeps the NAS folder layout human-readable on disk while adding a workflow UI, metadata index, previews, large-file uploads, and trusted-device auth on top.

## Features

- **Project-first workspace** — Inbox, projects (with rename, status, delete, selected-file actions, and full-project ZIP export), custom categories with color, taggable files, per-file rename, selected-file ZIP downloads, local share links, folder-aware uploads, server-side search with composable filters, grid + list views, mobile sidebar drawer, dark mode, smart views, archive, and a 6-digit-code device pairing flow.
- **Resumable downloads** — file and share-link downloads honor HTTP `Range`, so an interrupted transfer of a multi-gigabyte file picks up where it stopped.
- **Direct filesystem storage** — files live as real files under `Inbox/`, `Projects/<slug>/Inbox/`, `Library/`, and `Archive/<year>/<month>/`. SMB and Finder still work.
- **SQLite metadata** — fast, single-file, journal-mode WAL. Indexed on project, category, family, and uploaded_at.
- **Resumable large uploads** — chunked sessions with 8 MiB chunks (the server accepts up to 32 MiB per chunk), offset checking, automatic retry of a failed chunk, abort, and stale-session cleanup. Default upload cap 2 GiB.
- **Preview pipeline** — automatic 384 px webp previews for images, video poster frames via `ffmpeg`, and first-page PDF previews via `poppler-utils`, streamed from authenticated routes.
- **Trusted-device auth** — owner bootstrap on first run, scrypt password hashing, HTTP-only session cookie, route guards on every API and page, and pairing-code device trust.
- **TrueNAS-ready** — Dockerfile, `docker-compose.truenas.yml`, deployment guide, and `/api/health` readiness check that exercises the storage mount, database, and preview binaries.
- **CI/CD** — GitHub Actions builds and publishes `ghcr.io/jonathanbeck1/nas-project-cloud:latest` on every push to `main`, after running unit, type, lint, and build checks.

## Screenshots

| | |
| --- | --- |
| ![Projects list](./docs/screenshots/projects.png) | ![Project workspace](./docs/screenshots/project.png) |
| Projects index — count of files per workspace. | Project workspace — Garden Shed Build files, search, and stats. |
| ![Archive](./docs/screenshots/archive.png) | ![Devices](./docs/screenshots/devices.png) |
| Archive — soft-deleted files with restore + permanent delete. | Trusted devices — pair new devices with a 6-digit code. |

Captured with `npm run screenshots` (boots an isolated dev server, seeds sample data, drives Chromium via Playwright, and writes PNGs into `docs/screenshots/`).

## Tech stack

Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, [Radix UI](https://www.radix-ui.com/) primitives, [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), [`sharp`](https://sharp.pixelplumbing.com/), [`zod`](https://zod.dev/), [`nanoid`](https://github.com/ai/nanoid), Vitest + Testing Library, Playwright, and Docker on Node 22.

## Architecture

```text
                      ┌────────────────────────────────────────┐
                      │  Next.js App Router (server + client)  │
                      │  ┌──────────────┐  ┌────────────────┐  │
   browser / pairing  │  │ Page guards  │  │  API routes    │  │
   ─────────────────▶ │  │ requirePage  │  │  /api/files    │  │
                      │  │ Session()    │  │  /api/upload-  │  │
                      │  └──────┬───────┘  │  sessions/...  │  │
                      │         │          └───────┬────────┘  │
                      │         ▼                  ▼           │
                      │   src/lib/server: config · db · auth · │
                      │   metadata · storage · previews · ...  │
                      └────────┬───────────────────┬───────────┘
                               │                   │
                  ┌────────────▼─────┐   ┌─────────▼──────────┐
                  │ SQLite (WAL)     │   │ Filesystem storage │
                  │ /data/nas-cloud  │   │ /mnt/nas-cloud/    │
                  │ .sqlite          │   │   Inbox/           │
                  │                  │   │   Projects/<slug>/ │
                  │ users · sessions │   │   Library/         │
                  │ devices · files  │   │   Archive/YYYY/MM/ │
                  │ projects · tags  │   │   .uploads/*.part  │
                  │ upload_sessions  │   │   .previews/...    │
                  │ file_previews    │   │                    │
                  └──────────────────┘   └────────────────────┘
```

Files are the source of truth for file contents, but SQLite holds more than an index. `npm run index:storage` rebuilds file records from the storage tree: each file, its project (inferred from `Projects/<slug>/`), and a default category. It cannot restore tags, custom categories, share links, users, devices, or upload sessions, so back up `appdata` alongside `files`. The script runs from a source checkout; the published Docker image does not include it.

## Quick start (development)

```bash
git clone https://github.com/JonathanBeck1/nas-project-cloud.git
cd nas-project-cloud
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:3000>. The first page redirects to `/setup` so you can create the owner account (12+ character password). After that, sign in at `/login` and you're in the workspace.

To wipe local state and start over:

```bash
rm -rf .data
```

## Quick start (TrueNAS SCALE)

The full guide lives at [`docs/deployment/truenas-scale.md`](./docs/deployment/truenas-scale.md). Short version:

1. Create two ZFS datasets:

   ```text
   /mnt/<pool>/nas-project-cloud/files
   /mnt/<pool>/nas-project-cloud/appdata
   ```

2. Make them writable by UID/GID `1001` (the container's `nextjs` user) or by an apps group it can join.

3. Paste [`docker/docker-compose.truenas.yml`](./docker/docker-compose.truenas.yml) into TrueNAS SCALE's custom-app YAML flow. Update the host volume paths to match your pool. The compose file pulls `ghcr.io/jonathanbeck1/nas-project-cloud:latest`; pin `ghcr.io/jonathanbeck1/nas-project-cloud:0.3.1` if you want a stable release tag.

4. Wait for `/api/health` to turn green. Browse to `http://<truenas>:3000`, finish owner setup, and you're done.

For a reverse-proxied deployment, raise the proxy's body-size limit to at least 2 GiB and disable buffering on the upload paths.

## Configuration

All runtime configuration is environment variables. Defaults are sane for local dev.

| Variable                       | Default                          | Description                                       |
| ------------------------------ | -------------------------------- | ------------------------------------------------- |
| `NAS_CLOUD_STORAGE_ROOT`       | `.data/storage`                  | Filesystem path that contains `Inbox/`, `Projects/`, `Library/`, `Archive/`, `.uploads/`, `.previews/`. |
| `NAS_CLOUD_DB_PATH`            | `.data/nas-cloud.sqlite`         | SQLite file. WAL companions are written next to it. |
| `NAS_CLOUD_PUBLIC_BASE_PATH`   | `/files`                         | Reserved for future public file-serving routes.   |
| `NAS_CLOUD_MAX_UPLOAD_BYTES`   | `2147483648` (2 GiB)             | Hard upload cap. Enforced at upload start, on every chunk, and on direct uploads. |
| `NAS_CLOUD_TRUST_PROXY`        | `false`                          | Set `true` only when every request arrives through a reverse proxy that sets `X-Forwarded-For`. When `false` the header is ignored and all clients share one rate-limit bucket. |

See [`.env.example`](./.env.example) and [`.env.truenas.example`](./.env.truenas.example).

## Development

```bash
npm run dev           # Next.js dev server on :3000
npm test              # Vitest unit + component tests
npm run typecheck     # tsc --noEmit
npm run lint          # eslint .
npm run build         # production build
npm run test:e2e      # Playwright (boots its own dev server on :3100)
npm run index:storage # re-add files and inferred projects from disk (source checkout only)
npm run previews:generate # process pending preview jobs
npm run screenshots   # regenerate docs/screenshots/*.png
```

The verification gate before any commit to `main` is:

```bash
npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e
```

The same gate runs on every pull request via [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) and again in [`.github/workflows/docker-publish.yml`](./.github/workflows/docker-publish.yml) before the image is published.

## Project layout

```text
src/
  app/                      Next.js App Router (pages + API routes)
  components/
    auth/                   Owner auth and logout UI
    workspace/              AppShell, Sidebar, FileGrid, DropZone, etc.
  lib/
    client/                 fetch helpers (upload sessions, file actions)
    server/
      auth/                 password hashing, sessions, pairing, http guards
      previews/             scheduler, probes, image/video/PDF preview workers
      config.ts             env parsing
      db.ts                 schema + migrations + seeding
      metadata.ts           repository over SQLite
      storage.ts            sandboxed filesystem service
      indexer.ts            disk-to-DB walker
      smartViews.ts         server-side query builders
      health.ts             readiness probes
      pageSession.ts        page-level auth guard
      workspaceData.ts      compose data for the workspace shell
    shared/                 types, defaults, file-type classifier
docker/                     Dockerfile + TrueNAS compose example
docs/
  deployment/               TrueNAS SCALE deployment guide
  implementation/           per-phase build summaries
  research/                 storage-engine spike notes
  superpowers/              internal design specs and plans
scripts/                    index-storage, generate-previews, e2e prep, screenshot capture
tests/
  components/               Testing Library + Vitest component tests
  server/                   API + repository + storage + auth tests
  e2e/                      Playwright smoke tests
```

## Known limitations

NAS Project Cloud is intentionally LAN-first and pre-1.0. Things that are stubbed, partial, or deliberately deferred:

- **Search uses `LIKE`, not FTS.** Good for the typical NAS corpus; an SQLite FTS5 index lands once the test corpus exposes a hot path. Result lists are capped at 200 rows with a banner.
- **Previews: image, video, and single-page PDF today.** Video poster frames need `ffmpeg`; PDF first-page previews need `poppler-utils` (`pdftoppm`). Both are baked into the default Docker image; missing binaries are recorded as `unsupported` instead of crashing the worker. Other document families (docx, xlsx) and CAD families stay `skipped`. The Settings → Preview pipeline card shows live counts and `ffmpeg ready / unavailable` + `poppler ready / unavailable` badges.
- **Preview worker is opt-in.** Set `NAS_CLOUD_PREVIEW_SCHEDULER=on` to run the in-process scheduler, which also cleans up abandoned uploads hourly, or hit `POST /api/maintenance/previews` and `POST /api/maintenance/upload-cleanup` from cron. Defaults to off so dev environments don't fight the test runner.
- **Upload Center has tabs for Active / Failed / Aborted sessions** with a per-device filter. Active chunked uploads can be resumed by selecting the same local file again, and failed uploads can be retried as clean replacement sessions. The cleanup job tidies orphaned chunks for failed sessions older than 24 hours.
- **Folder path preservation is workspace-ready.** Direct and chunked browser uploads preserve folder-relative paths when the browser provides them. Inbox and project workspaces both expose explicit file and folder pickers.
- **Project delete is explicit about file handling.** You can detach metadata only or move active files back to `Inbox/<device>/` before deleting the project. Archived files are left in the archive tree.
- **Changes made over SMB are not reconciled.** The app only tracks files it wrote itself. Renaming, moving, or deleting a file over SMB leaves its record pointing at the old path, and `npm run index:storage` adds new paths without clearing stale ones. Until a reconcile pass exists, treat SMB as read access and recovery. ZIP exports skip files that are missing on disk and list them in a `_MISSING.txt` entry rather than failing.
- **Share links are file-level links.** Owners can create, list, edit, and revoke short-lived file download links from the detail drawer, including labels, expiry windows, optional download caps, optional passwords, recent access metadata, and CSV access-history export. Recipients use a local download page. Project/folder share pages are still future work.

A more complete catalogue lives in [Roadmap](#roadmap) and in [`docs/superpowers/plans/2026-05-03-product-completion-sprint.md`](./docs/superpowers/plans/2026-05-03-product-completion-sprint.md).

## Roadmap

`v0.2.0` shipped the security hardening pass (CSRF double-submit cookies, rate-limited login/pairing, sliding sessions, token-protected maintenance endpoints, streaming direct uploads, defense-in-depth headers). `v0.3.0` shipped the preview pipeline and Upload Center reliability pass. `v0.3.1` is a security patch on top of it: rate limits stop trusting a client-supplied `X-Forwarded-For`, and the production dependencies move past their open advisories. Near-term, in priority order:

1. **CAD preview strategy** for STL, STEP, 3MF, and renderer-choice decisions.
2. **Project and folder share pages** after file-level share-link behavior settles.
3. **SQLite FTS5 migration** once the corpus exposes a hot path on the `LIKE`-backed search.
4. **Benchmark checklist** for 1 GiB and 5 GiB transfers over 2.5 Gb LAN, recorded in the deployment guide.
5. **Desktop helpers** (Tauri tray + clipboard sync + watch-folder ingest) once the web product is solid.

## Project history

This is a working project, not a polished release. The internal design specs and per-phase plans are kept in the repo so anyone reading the code can see why things are shaped the way they are:

- [`docs/superpowers/specs/2026-04-30-nas-project-cloud-design.md`](./docs/superpowers/specs/2026-04-30-nas-project-cloud-design.md) — the original design spec.
- [`docs/superpowers/plans/`](./docs/superpowers/plans/) — five plans, MVP through completion sprint.
- [`docs/implementation/`](./docs/implementation/) — what actually shipped in each phase.
- [`docs/research/storage-engine-spike.md`](./docs/research/storage-engine-spike.md) — why direct filesystem storage beat OpenCloud and Nextcloud as the V1 engine.

## Contributing

Issues and PRs are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the verification gate, branch conventions, and schema-change rules. Bug and feature templates live under [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE/). Security issues should be reported privately via [GitHub Security Advisories](https://github.com/JonathanBeck1/nas-project-cloud/security/advisories/new).

## License

[MIT](./LICENSE) © 2026 Jonathan Beck.
