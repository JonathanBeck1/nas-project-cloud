# Production File Operations Design

Date: 2026-04-30

## Summary

Phase 2 turns the NAS Project Cloud MVP from an intake/catalog app into an operational local file cloud. The chosen architecture is direct filesystem storage on TrueNAS, with the custom app owning project workflow, metadata, safety rails, and user-facing actions.

Files remain normal files on the mounted dataset. The database records metadata and workflow state. The app must make common file actions work from the browser without hiding the underlying ZFS-friendly layout.

## Decision

Use direct filesystem storage as the production core for this phase.

OpenCloud and Nextcloud remain future integration candidates, but they should not sit in the critical path for the next build. The product value right now is fast LAN ingestion, project organization, clear filesystem ownership, and safe operations on arbitrary large files. Direct filesystem storage best matches that.

## Goals

- Download any stored file through a safe app route.
- Expose selected file details and actions in the workspace UI.
- Move files from Inbox into projects while keeping human-readable NAS paths.
- Archive files safely instead of deleting them.
- Keep metadata and filesystem paths in sync after moves and archive operations.
- Prevent path traversal and storage-root escapes at every file operation boundary.
- Keep the UI honest: after an operation succeeds, the visible workspace state updates.
- Preserve future compatibility with TrueNAS snapshots, SMB access, and a later desktop helper.

## Non-Goals

- No permanent delete in this phase.
- No resumable/chunked upload in this phase.
- No desktop tray app or automatic sync folder in this phase.
- No OpenCloud or Nextcloud integration in this phase.
- No advanced CAD/video preview generation in this phase.
- No multi-user permission model in this phase.

## Storage Model

The dataset continues to use normal folders:

```text
Inbox/
  Browser/
  MacBook-Pro/
  Windows-PC/
Projects/
  project-slug/
    Inbox/
Library/
Archive/
  2026/
    04/
```

Upload paths already use:

- `Inbox/<source-device>/<filename>`
- `Projects/<project-slug>/Inbox/<filename>`

Phase 2 adds:

- archive paths under `Archive/<year>/<month>/<filename>`
- project assignment moves from Inbox or another project into `Projects/<project-slug>/Inbox/<filename>`
- metadata updates after each move

When filename collisions happen, the storage service should preserve the original basename and append a numeric suffix, matching the current upload behavior.

## Metadata Model

Files need lifecycle state:

- `active`: visible in normal workspace views
- `archived`: hidden from active file lists unless requested

The `files` table should add:

- `status text not null default 'active'`
- `archived_at text null`

Existing rows should behave as active files after migration.

The shared `CloudFile` type should include:

- `status: "active" | "archived"`
- `archivedAt: string | null`

List queries should exclude archived files by default. Archive-specific views can opt in later.

## Server API

Phase 2 adds or extends these routes:

- `GET /api/files/[id]`: return a full file record or 404.
- `PATCH /api/files/[id]`: update metadata and assignment. Supported fields: `projectId`, `categoryId`.
- `GET /api/files/[id]/download`: stream file bytes from the dataset with safe headers.
- `POST /api/files/[id]/archive`: move file to Archive and mark metadata archived.

Download must:

- look up the file by ID
- resolve its `storagePath` through the storage service
- reject missing files with 404
- never accept raw filesystem paths from the client
- stream from disk instead of reading whole files into memory
- set `Content-Type`, `Content-Length`, and `Content-Disposition`

Project assignment must:

- validate the project exists
- use the project slug from metadata
- move the physical file into `Projects/<slug>/Inbox/`
- update `storagePath`, `projectId`, `categoryId` when provided, and `updatedAt`

Archive must:

- move the physical file into `Archive/<year>/<month>/`
- update `storagePath`, `status`, `archivedAt`, and `updatedAt`
- remove the file from active UI state after success

## UI Model

The workspace should become selectable and action-oriented.

### File Grid

File cards become buttons. Selecting a file highlights it and opens details in the right drawer.

Required behavior:

- card has accessible name based on file name
- selected card has `aria-pressed`
- active selection survives unrelated operations when the file still exists
- empty state remains unchanged

### Detail Drawer

When a file is selected, the drawer shows:

- filename
- size
- source device
- storage path
- project/category identifiers for now
- updated date
- Download action
- Archive action
- Project assignment control
- Copy path action

The drawer should not pretend to reveal Finder/Explorer on the server. In a browser app, "copy path" is the honest first step. Native reveal can come from a later desktop helper.

### App State

`AppShell` should own:

- visible files
- selected file ID
- projects/categories from `initialData`
- file action status messages

After an operation:

- download opens the download endpoint in the browser
- archive removes the file from visible active files and clears selection
- project assignment replaces the file in local state with the server response
- failed operations show an accessible error/status message

### Command Bar Search

Search should filter the current client-side file list by filename, storage path, source device, extension, and family. This is enough for Phase 2 because server-side list search already exists and the initial workspace is server-loaded.

## Error Handling

- Server routes return `{ error: string }` with 400 for invalid input, 404 for missing or archived files, and 500 for unexpected storage failures.
- Client action failures keep the selected file visible.
- Archive and move operations are not retried automatically.
- If the file is missing on disk but present in metadata, download/archive/project assignment should return a clear 404-style error rather than corrupting metadata.

## Testing

Server tests should cover:

- migration adds lifecycle columns and preserves existing files
- repository `getFileById`
- repository active vs archived list filtering
- storage download path resolution
- stream-safe download route
- archive moves file and updates metadata
- project assignment moves file and updates metadata
- path escape attempts are rejected by storage service

Component tests should cover:

- selecting a file shows it in the detail drawer
- download action uses the download endpoint
- archive action removes the file from the grid after a successful response
- project assignment calls the API and updates the file card/path
- search filters visible files

E2E should cover:

- workspace renders
- upload a small file
- uploaded file appears
- selecting it shows actions
- download route responds

## Open Questions Deferred

- Whether Archive should preserve the original folder path under `Archive/`.
- Whether project folders should later include `Source/`, `Working/`, `Exports/`, and `Final/`.
- Whether file serving should support HTTP range requests for very large videos.
- Whether future desktop helpers should add "reveal in Finder/Explorer" actions.
