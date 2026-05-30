# Phase 11: Direct Upload Folder Paths

Date: 2026-05-30

This phase starts folder upload support by preserving browser-provided relative
paths through both direct and chunked upload paths.

## Direct Upload Path Preservation

- `POST /api/files` accepts `relativePath`.
- `DropZone` forwards `File.webkitRelativePath` when the browser provides it.
- `storage.streamUpload` places the file under sanitized relative directories
  below the normal inbox or project target directory.
- Directory segments are sanitized and traversal markers like `..` are ignored,
  so relative paths cannot escape the configured storage root.

## Chunked Upload Path Preservation

- Upload sessions now persist `relative_path`.
- `uploadFileInChunks` forwards `File.webkitRelativePath` when available.
- Upload completion passes the stored relative path into
  `storage.completeUploadSession`, so large files use the same sanitized
  folder placement as direct uploads.

## Deferred UI

- Full directory-picker UI can layer on top once both direct and chunked paths
  understand relative directories.

## Verification

- `npm test -- tests/server/filesApi.test.ts tests/server/storage.test.ts tests/components/DropZone.test.tsx`
- `npm test -- tests/server/db.test.ts tests/server/uploadSessionsApi.test.ts tests/components/uploadSessionsClient.test.tsx tests/server/storage.test.ts`
