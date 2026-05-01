# Phase 3 Large File Uploads

## Built

- SQLite-backed upload session records.
- Root-confined temporary upload files under `.uploads/`.
- Chunk append endpoint with exact offset validation.
- Completion endpoint that moves assembled bytes into the normal Inbox or Project storage tree.
- Metadata creation through the existing `files` table after successful assembly.
- Cleanup on abort, checksum mismatch, or metadata creation failure.
- Browser dropzone path that keeps simple uploads for small files and switches to chunked sessions for larger files.
- Deterministic ESLint command remains part of the verification gate.

## API Shape

- `POST /api/upload-sessions`
  - JSON body: `filename`, `mimeType`, `sizeBytes`, `sourceDevice`, optional `checksum`, optional project/category fields.
  - Returns `{ session }`.
- `POST /api/upload-sessions/:id/chunk`
  - Raw request body.
  - Required `upload-offset` header.
  - Returns updated `{ session }`.
- `POST /api/upload-sessions/:id/complete`
  - Assembles the completed upload into normal file metadata.
  - Returns `{ file, session }`.
- `POST /api/upload-sessions/:id/abort`
  - Removes the temp upload file and marks the session aborted.

## Client Behavior

The dropzone uses the existing `POST /api/files` form upload for files up to 64 MiB. Larger files use upload sessions with 8 MiB chunks. This keeps the MVP path simple for normal documents/images while giving videos, CAD exports, and other large files a safer upload path.

## Remaining Follow-Up

- Add true pause/resume UI that can rediscover open sessions after a browser refresh.
- Add background cleanup for stale `.uploads/` temp files and open sessions.
- Measure 1 GB and 5 GB transfers on the actual 2.5Gb LAN and tune chunk size if needed.
- Add optional client-side SHA-256 calculation when the browser can compute it without hurting UX.
