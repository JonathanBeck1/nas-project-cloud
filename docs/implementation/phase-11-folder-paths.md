# Phase 11: Direct Upload Folder Paths

Date: 2026-05-30

This phase starts folder upload support by preserving browser-provided relative
paths through the direct upload path.

## Direct Upload Path Preservation

- `POST /api/files` accepts `relativePath`.
- `DropZone` forwards `File.webkitRelativePath` when the browser provides it.
- `storage.streamUpload` places the file under sanitized relative directories
  below the normal inbox or project target directory.
- Directory segments are sanitized and traversal markers like `..` are ignored,
  so relative paths cannot escape the configured storage root.

## Deferred

- Chunked upload sessions still store only `filename`; preserving relative
  paths for large folder uploads needs an upload-session schema migration.
- Full directory-picker UI can layer on top once both direct and chunked paths
  understand relative directories.

## Verification

- `npm test -- tests/server/filesApi.test.ts tests/server/storage.test.ts tests/components/DropZone.test.tsx`
