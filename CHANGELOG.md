# Changelog

All notable changes to NAS Project Cloud are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed

- **`npm run index:storage` and `npm run previews:generate` run again.** Both
  crashed on startup with a top-level `await` error. A test now executes them.
- **Re-indexing no longer ingests the app's own files.** Root dot-entries
  (`.uploads/`, `.previews/`, the health probe) are skipped, and files under
  `Projects/<slug>/` are attached to that project, which is created if needed.

- **Libraries past 32,766 files load again.** Listing files bound one SQL
  variable per row, so the workspace, projects page, `GET /api/files`, and
  project ZIP export all failed with "too many SQL variables" beyond
  SQLite's limit. Tags and previews are now fetched with a single parameter.

### Changed

- **Recovery docs are explicit.** README and the TrueNAS guide state what a
  re-index restores, what only an `appdata` backup restores, and that the
  script is not in the Docker image.

## [0.3.1] - 2026-09-19

Security patch release. It closes a rate-limit bypass that left device
pairing open to brute force and moves the production dependencies past
their open advisories. Anyone pinned to `0.3.0` should move to `0.3.1`.

### Changed

- **Dependency security refresh.** Next.js `15.5.25`, sharp `0.35.4`, and
  nanoid `5.1.16` pick up fixes for open advisories, including the libvips
  and libheif issues behind image previews. The PostCSS override moves from
  `8.5.12` to `8.5.28`, which also lifts its nested nanoid to `3.3.19`.
- **File grid click targets.** A file card's button no longer grows past its
  card for long names, which let a neighbouring card take the click and
  open the wrong file. Long names now truncate inside the card.

### Security

- **Rate limits no longer trust `X-Forwarded-For` by default.** Login and
  pairing limits were keyed on a client-supplied header, so rotating it
  bypassed them and left the 6-digit pairing code open to brute force.
  The header is now ignored unless `NAS_CLOUD_TRUST_PROXY=true`, and then
  only its last entry is used.
- **Global pairing cap.** Pairing attempts are also capped at 20 per 10
  minutes across all clients.
- **Share access history** no longer records a spoofable client address.

### Migration notes

- Reverse-proxied deployments should set `NAS_CLOUD_TRUST_PROXY=true` to
  keep per-client rate limits and share-history addresses. Direct LAN
  deployments need no change.

## [0.3.0] - 2026-06-24

The preview pipeline release. v0.2.0 made the app safer and more usable
on a home network; v0.3.0 makes visual file browsing more credible and
surfaces more of the upload pipeline state in the UI.

These notes were first drafted on 2026-05-28. The `v0.3.0` tag and image
were cut on 2026-06-24 and also contain the file operations, upload, and
share link work listed below, which earlier revisions of this file showed
under Unreleased.

### Added

- **In-process preview scheduler.** Set `NAS_CLOUD_PREVIEW_SCHEDULER=on`
  to let the app process preview jobs automatically. The worker runs
  every 60 seconds while work is pending and backs off to 5 minutes when
  the queue is empty. The existing token-protected maintenance endpoint
  remains available for TrueNAS cron-based deployments.
- **Preview pipeline status card in Settings.** Owners can see pending,
  ready, failed, skipped, and unsupported preview counts, plus `ffmpeg`
  and `poppler` availability. Failed jobs can be requeued from the UI.
- **Video poster frames.** Video files now generate 384 px webp poster
  previews through `ffmpeg`. If `ffmpeg` is missing, the preview records
  `unsupported` instead of crashing the worker.
- **PDF first-page previews.** PDF documents now generate a first-page
  preview through `pdftoppm` from `poppler-utils`. Missing poppler
  support is also recorded as `unsupported`.
- **Upload Center history.** The Upload Center now has Active, Failed,
  and Aborted tabs, a per-device filter, and error-copy affordances for
  failed sessions.
- **Failed upload cleanup.** The upload cleanup job now removes orphaned
  `.uploads/*.part` files for failed sessions older than 24 hours, in
  addition to stale open sessions.
- **File rename flow.** Active files can now be renamed from the detail
  drawer. The API keeps the metadata row, derived extension/family, and
  on-disk filename in sync with rollback protection if metadata writes fail.
- **Bulk ZIP download.** Selected files can be downloaded as a streaming
  ZIP archive from the workspace bulk action bar.
- **Project ZIP export.** Project workspaces now expose a direct project
  ZIP download, and selected files in a project can be exported without
  returning to the main inbox.
- **TrueNAS deployment diagnostics.** Settings now shows storage, database,
  `ffmpeg`, and `pdftoppm` readiness from `/api/health`.
- **Safer project deletion.** Deleting a project can now move active files
  back into the device inbox before removing the project record.
- **Folder path preservation.** Direct and chunked browser uploads now carry
  folder-relative paths through the API, upload-session metadata, and storage
  layer.
- **Inbox folder picker.** The main workspace upload well now exposes separate
  file and folder controls, so folder-relative paths can be selected directly
  instead of relying only on drag/drop metadata.
- **Project upload picker.** Project workspaces now expose file and folder
  controls that upload directly into that project, including chunked large-file
  sessions.
- **Browser upload resume.** Open chunked upload sessions can now be resumed
  from Upload Center by selecting the same local file again. The client
  continues from the server-stored byte offset and completes the session.
- **Failed upload retry.** Failed chunked sessions can now be retried from
  Upload Center by selecting the same file, starting a clean replacement
  session with the stored folder/project/category target.
- **Project detail drawer.** Project workspaces now expose the selected-file
  drawer with download, archive, rename, project reassignment, and tag actions
  without leaving the project page.
- **Local share links.** Owners can create short-lived bearer-token download
  links from the file detail drawer, and recipients can download the file
  without an owner session. Existing links can be listed and revoked from the
  same drawer, with configurable expiry windows, labels, and optional download
  caps when creating new links. The drawer also surfaces each active link's
  label, download usage, expiry, creation time, last-used time, and recent
  access events with CSV export. New share links can be password protected,
  existing links can be edited after creation, and recipients get a local
  download page instead of a raw API URL.

### Changed

- **Docker runtime includes preview binaries.** The production image now
  installs `ffmpeg` and `poppler-utils` so video and PDF previews work
  out of the box on TrueNAS.
- **TrueNAS compose defaults to the scheduler.** The example compose file
  sets `NAS_CLOUD_PREVIEW_SCHEDULER=on` for single-container home NAS
  installs.
- **Preview status vocabulary is richer.** Preview rows can now be
  `unsupported`, separate from `skipped`, so unsupported runtime tooling
  is distinguishable from intentionally unsupported file families.
- **Dependency security refresh.** Next.js is resolved to `15.5.18`, and
  PostCSS is overridden to `8.5.12` so production dependency audit passes.
- **Health check coverage.** `/api/health` now verifies preview binaries in
  addition to storage and SQLite.

### Migration notes

- Existing deployments can opt into automatic preview processing by
  adding `NAS_CLOUD_PREVIEW_SCHEDULER=on` and recreating the container.
- If you prefer cron, leave the scheduler off and keep calling
  `POST /api/maintenance/previews` with `NAS_CLOUD_MAINTENANCE_TOKEN`.
- The Docker image is larger than v0.2.0 because it now includes
  `ffmpeg` and `poppler-utils`.

## [0.2.0] - 2026-05-20

The "Real Product Sprint" pass. v0.1.0 was technically demo-ready;
v0.2.0 makes the day-to-day flows fast, the UI usable on real screens,
and the auth surface defensible enough to expose on a home network.

### Added

- **CSRF protection.** Every authenticated mutation now requires a
  `x-nas-csrf` header that mirrors the new `nas_cloud_csrf` cookie via
  a timing-safe double-submit comparison. Setup, login, and pairing
  remain open by design (no session yet to authorize against).
- **Rate limiting on auth endpoints.** Login is bounded to 60 attempts
  per 15 minutes per IP and 10 per email; pairing is bounded to 50/day
  and 5/10min per IP. Failures return `429 Retry-After`. Successful
  auth resets the relevant buckets so legitimate users are never
  punished by their own past failures.
- **Sliding session lifetime.** Sessions now extend on activity (14
  days from `last_seen_at`, throttled to one touch per minute) and
  stamp the originating device, so the trusted-devices view shows
  meaningful "last seen" timestamps. Inactive sessions auto-expire.
- **Token-protected maintenance endpoints.** `/api/maintenance/previews`
  and `/api/maintenance/upload-cleanup` now accept either a session
  cookie or `Authorization: Bearer <NAS_CLOUD_MAINTENANCE_TOKEN>` for
  headless TrueNAS cron use. The TrueNAS SCALE deployment doc has a
  copy-pasteable cron example.
- **Server-side search.** New `/api/search` route with debounced UI
  wiring in `AppShell`/`CommandBar`. Results cap at 200 with a
  truncation banner, and queries hit a real DB filter instead of being
  filtered client-side.
- **List view in the workspace** with persisted preference in
  `localStorage`.
- **Mobile sidebar drawer** via Radix `Dialog`, replacing the desktop
  sidebar on small screens.
- **Dark mode toggle** with a system/light/dark selector, pre-paint
  script in `layout.tsx` to prevent FOUC, and CSS-variable theming.
- **Source-device detection** from the User-Agent, with a custom
  override in Settings so labels read "Mac Studio" instead of
  "Browser".
- **Tag management UI** for create/rename/delete plus per-file tag
  assignment in the detail drawer.
- **Custom categories** with create/rename/recolor/delete and a usage
  count next to each category.
- **Project lifecycle UI** for editing description, status, and
  category, plus archive and confirm-typed-name delete.
- **Defense-in-depth headers** on download and preview routes:
  `X-Content-Type-Options: nosniff`,
  `Cross-Origin-Resource-Policy: same-origin`, and
  (download only) `Content-Security-Policy: default-src 'none'; sandbox`.
- **CONTRIBUTING.md, issue and PR templates,** plus a PR-time CI
  workflow that runs tests, typecheck, lint, build, and Playwright on
  every PR.
- **Workspace screenshots** captured by a reproducible Node script and
  embedded in the README.

### Changed

- **Direct uploads now stream.** `POST /api/files` switched from
  buffering up to 2 GiB into RAM via `FormData` to streaming the
  request body straight to a temp file via the new
  `storage.streamUpload`. Metadata moves into the query string; the
  body is the raw file. The chunked upload path is unchanged.
- **`appConfig` is now a lazy proxy.** Env validation happens on first
  property access via `getAppConfig()` instead of at module import,
  so a malformed env var fails the first request that needs it
  rather than crashing the whole process at boot.
- **Sidebar smart views re-enabled.** "From Windows" / "From Mac"
  groups are back now that `sourceDevice` is populated reliably.
- **Docker image tagging fixed.** `docker-publish.yml` now uses
  `docker/metadata-action@v5` so semver tags (`v0.2.0`, `0.2`, `0`)
  ship alongside `latest` and the commit SHA.

### Security

- Replaced the hard 30-day session cap with a 14-day sliding window.
- Sessions and devices both persist `last_seen_at`, so inactive
  sessions are detectable from the UI.
- Pairing endpoint is no longer trivially brute-forceable.

### Migration notes

- **`NAS_CLOUD_MAINTENANCE_TOKEN`** is optional. If unset, only
  authenticated owner sessions can hit `/api/maintenance/*`. To run
  maintenance from a TrueNAS cron job, generate one with
  `openssl rand -hex 32` and add it to the Compose env.
- All existing user sessions are still valid; the 14-day clock simply
  starts at the next authenticated request.

## [0.1.0] - 2026-05-19

First tagged release. Drop-in TrueNAS SCALE deployment with project +
inbox file management, owner setup, device pairing, image previews,
chunked uploads, archive flow, and a working healthcheck. Suitable for
LAN-only personal use.
