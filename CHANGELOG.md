# Changelog

All notable changes to NAS Project Cloud are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- **`POST /api/maintenance/reindex`.** Rebuilds the file index from the storage
  tree on a deployed instance, authenticated by session or
  `NAS_CLOUD_MAINTENANCE_TOKEN` like the other maintenance routes. Until now the
  only way to reindex was `npm run index:storage` from a source checkout with
  both datasets mounted -- the published image ships neither `scripts/` nor
  `src/` and prunes `tsx`, so a running container had no recovery path at all.
  Concurrent callers join the scan already in progress instead of starting a
  second walk over the same tree.
- **Resumable downloads.** File and share-link downloads support single
  HTTP `Range` requests (`bytes=a-b`, `bytes=a-`, `bytes=-n`) with `206`,
  answer `416` with `Content-Range: bytes */size` when unsatisfiable, and
  send `Accept-Ranges`, `ETag`, and `Last-Modified`. `If-Range` is
  honored; multi-range requests get the whole file. The `ETag` combines the
  stored SHA-256 with size and mtime, so a file edited in place over SMB
  does not validate a resume. A share link counts a download only when the
  response includes the first byte, so resuming does not use up
  `maxDownloads`; a link that has reached its cap still refuses resumes.

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
- **Moves work across filesystems.** Move, rename, archive, restore, and
  upload completion all hard-link the file into place, which fails with
  `EXDEV` when `Projects/` or `Archive/` is a child ZFS dataset. They now
  fall back to a copy staged in the destination folder and linked into
  place, so an existing file is still never overwritten and the source is
  removed only after the destination is complete.
- **A chunk that arrives twice no longer corrupts the upload.** Chunks were
  appended, so a replayed or concurrent duplicate grew the temp file even
  though its request was rejected; the session then wedged with a 500, or a
  duplicated final chunk completed a corrupt file. Chunks are now written
  at their offset, requests for one session are handled one at a time, a
  storage offset mismatch answers `409` with `receivedBytes`, and
  `complete` fails the session if the temp file is not the declared size.
- **The browser retries a failed chunk.** Network errors and 5xx responses
  are retried with backoff, and a `409` resumes from the server's offset.

- **Project ZIP export keeps folders.** Entries were named by basename, so
  the folder structure that uploads preserve was flattened and duplicates
  got `-2` suffixes. Entries are now named by their path under
  `Projects/<slug>/Inbox/`, with leading slashes and `..` segments removed.
- **One missing file no longer fails a ZIP export.** A file renamed or
  deleted over SMB made the whole project or bulk export return `404`.
  Missing files are skipped and listed in a `_MISSING.txt` entry.
- **Large ZIP exports no longer exhaust file descriptors.** Every source
  file was opened before streaming began; files are now opened one at a
  time, and the archive is aborted when the client disconnects.
- **Expired auth state is purged.** Expired sessions, used or expired
  pairing codes, and rate-limit rows were never deleted; an attacker-chosen
  login email became a permanent row. They are now purged at boot, hourly by
  the in-process scheduler, and by `POST /api/maintenance/upload-cleanup`
  (which adds a `purged` object to its response).
- **Pairing codes cannot run out.** `code_hash` is unique across only a
  million codes and dead rows were kept, so a new code would eventually
  collide with one and return a `500`. Dead codes are deleted before each
  insert, and a collision with a live code draws a new one.
- **Uploads are synced to disk before they are recorded.** SQLite commits
  were fsynced but uploaded bytes were not, so a power loss inside a ZFS
  transaction-group window could leave a committed row pointing at a
  missing or short file. Each completed upload now fsyncs the file and its
  destination directory once; chunks are not synced individually.
- **Removing a file from a project moves it.** `PATCH /api/files/<id>` with
  `projectId: null` cleared the project in the database but left the file
  under `Projects/<slug>/`. It now moves to `Inbox/<sourceDevice>/`, and is
  moved back if the metadata update fails.
- **Filenames that break the filesystem or SMB are made safe.** A name over
  255 bytes failed the upload with `ENAMETOOLONG`; names are now shortened
  to 240 bytes on a character boundary with the extension kept. Windows
  reserved names (`CON`, `NUL`, `COM1`, ...) get a leading underscore, and
  trailing dots and spaces are removed, since Windows cannot open either
  over SMB. The name shown in the app is unchanged.
- **`%` and `_` in a search are literal.** They were passed to `LIKE` as
  wildcards, so searching `100%` matched every file.
- **A malformed cookie is no longer a 500.** Bad percent-encoding in the
  session or CSRF cookie threw while decoding. The request is now treated
  as unauthenticated (`401`) or as failing the CSRF check (`403`).
- **Names starting with two dots are accepted.** `..notes.txt` was rejected
  as escaping the storage root because the check was `startsWith("..")`.
- **PDF previews are capped at 1024 px.** `pdftoppm` rendered at a fixed
  150 dpi, so a large-format page (an A0 plot is 4967 x 7021 px) or a
  hostile one could exhaust memory. Pages are now scaled to 1024 px.
- **A preview that crashes the app no longer loops.** Jobs are claimed
  (`processing`) and counted before work starts. Jobs interrupted by a
  restart are requeued at boot, and a file that takes the worker down
  three times is marked `failed`. "Retry failed" resets the count.
- **Abandoned uploads are cleaned up by default.** The in-process
  scheduler now runs the stale-upload cleanup hourly; it was only
  reachable through the maintenance endpoint.

### Changed

- **`GET /api/files` is paginated (breaking).** It returns
  `{ files, nextCursor }` with at most `limit` files (default 100, maximum
  500) and takes the previous response's `nextCursor` as `cursor`. It used
  to return every matching file. A cursor that cannot be decoded is a `400`.
  Listings are ordered by `uploaded_at desc, name, id`, so files that tie on
  time and name now have a stable order. The web UI does not call this
  endpoint; third-party clients need to follow `nextCursor`.
- **Signing in reuses your device.** Every login added a row to Trusted
  devices. A login now reuses the browser device with the same name for the
  same user and updates its last-seen time. Two browsers that share a name
  therefore share one device, and revoking it signs both out; give them
  different names at sign-in to keep them apart. Paired devices are not
  affected.
- **The workspace loads files a page at a time.** The home page renders
  the newest 100 files and a "Load more" button fetches the next page. It
  used to serialize every active file into the page (about 80 MB of HTML at
  40,000 files; now about 200 KB).
- **Pages no longer load the whole file table.** The projects index counts
  files per project with one `group by` query instead of loading every
  file, the archive page queries archived rows only, and smart views show
  the newest 200 files with a banner (`GET /api/smart-views/<view>` adds
  `truncated`).
- **Preview backlog drains faster.** A full batch of 25 schedules the next
  tick after one second instead of 60, lifting a ceiling of about 1,500
  previews per hour. The scheduler and the maintenance endpoint share one
  run, so two batches never decode at once.
- **Compose hardening.** `docker-compose.truenas.yml` sets `mem_limit: 2g`,
  `cap_drop: [ALL]`, `no-new-privileges`, and `init: true`. The deploy
  guide recommends pinning a release tag over `:latest`.
- **Chunks are capped at 32 MiB.** A larger chunk is rejected with `413`
  before it is buffered; previously one "chunk" could hold the whole upload
  in memory. The web client sends 8 MiB chunks and is unaffected.
- **README no longer claims the publish workflow runs the full gate.** It
  repeats the unit, type, lint, and build checks; the Playwright suite runs
  in `ci.yml` only.
- **Recovery docs are explicit.** README and the TrueNAS guide state what a
  re-index restores, what only an `appdata` backup restores, and that the
  script is not in the Docker image.

### Security

- **Supply chain.** Every GitHub Action is pinned to a commit SHA, published
  images carry build provenance and an SBOM, and Dependabot watches npm and
  the pinned actions weekly.
- **`/api/health` no longer leaks detail to anonymous callers.** It
  returned raw error messages, which can contain absolute paths, and the
  `ffmpeg` and `poppler` versions to anyone. Anonymous callers now get only
  a boolean per check and the same `200`/`503` status, so container
  healthchecks are unaffected. A signed-in session or the maintenance token
  still gets the full detail.
- **Security headers on every response.** `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, a `Permissions-Policy`, and
  `Referrer-Policy: no-referrer` (share tokens live in the URL path) are
  sent everywhere. Pages also get `Content-Security-Policy: frame-ancestors
  'none'; base-uri 'self'; object-src 'none'; form-action 'self'`. API
  routes are left out of that policy so downloads keep their stricter
  `default-src 'none'; sandbox`.
- **Stronger password hashing.** Account passwords move from Node's scrypt
  defaults (N=2^14) to N=2^17, r=8, p=1, OWASP's current minimum, and the
  parameters are now stored in the hash (`scrypt:N:r:p:salt:hash`) so they
  can be raised again. Existing hashes keep working and are upgraded on the
  next successful login. Share-link passwords use N=2^15. At most two
  derivations run at once, since each account derivation needs about
  128 MiB.
- **Login no longer reveals which emails exist.** An unknown email skipped
  the password derivation and answered measurably faster. It now spends the
  same derivation.
- **Reads cannot follow a symlink out of the storage root.** Path
  containment was lexical, so a symlink placed over SMB could point a
  download, share link, ZIP export, or preview at anything the container can
  read, including the app database. Every read path now resolves the real
  path and re-checks containment; a symlink that stays inside the root still
  works. The indexer already ignored symlinks and now has a test for it.
- **Only one owner can be created.** Setup checked for an existing user,
  then hashed the password, then inserted, so two simultaneous requests
  could both become owner. The insert now only succeeds into an empty users
  table and the loser gets `409`.
- **Share-link passwords are rate limited.** Password attempts were
  unlimited and each one costs a scrypt. A share now allows 10 attempts per
  15 minutes and then answers `429` with `Retry-After`. Requests without a
  password do not count.
- **`maxDownloads` cannot be overrun.** The cap was checked, then the file
  was prepared, then the counter was incremented unconditionally, so
  simultaneous requests could all take the last download. The increment is
  now a single conditional statement and the file is only streamed when it
  succeeds.
- **Preview tools are restricted to local files.** `ffmpeg` and `ffprobe`
  run with `-protocol_whitelist file` (and `ffmpeg` with `-nostdin`), so a
  playlist posing as a video cannot pull in network or concat sources.
  `sharp` is limited to one libvips thread to keep peak memory predictable.

### Migration notes

- **Upgrading a v0.3.1 database needs no manual step.** On first start the
  app adds `file_previews.attempts` and the index `files_listing_idx`.
  Nothing is dropped or renamed. Take the usual stopped-app snapshot of
  `appdata` first, because an older image will not know the `processing`
  preview status if you roll back while jobs are in flight (they are
  requeued by the newer image at boot, and ignored by the older one).
- **Passwords keep working.** v0.3.1 hashes verify as before and are
  upgraded on each account's next successful sign-in. That sign-in and
  every later one needs about 128 MiB for a fraction of a second.
- **`GET /api/files` is paginated.** Third-party clients must follow
  `nextCursor`; without it they now see only the first 100 files.
- **Chunks over 32 MiB are rejected.** The web client sends 8 MiB.
- **`/api/health` detail needs credentials.** Monitoring that parsed error
  text or tool versions anonymously must send the maintenance token. The
  status code is unchanged.
- **Compose changes are opt-in.** `mem_limit`, `cap_drop`,
  `no-new-privileges`, and `init` only apply if you re-paste
  `docker-compose.truenas.yml`. They were not run under Docker during
  development; if the app fails to start, remove `cap_drop` first.
- **Expect one-time effects on first boot:** expired sessions, dead pairing
  codes, and rate-limit rows older than 24 hours are deleted, and files
  removed from a project from now on move to `Inbox/<device>/`. Files
  detached before the upgrade stay where they are.

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
