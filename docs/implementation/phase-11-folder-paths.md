# Phase 11: Browser Upload Folder Paths

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

## Inbox Folder Picker

- The inbox upload well now exposes separate file and folder controls.
- The folder picker uses browser directory selection attributes and reuses the
  same direct/chunked upload pipeline.
- Keyboard users can focus and activate the visible file and folder controls.

## Deferred UI

- Project workspace upload wells still need the same explicit folder picker.

## Verification

- `npm test -- tests/server/filesApi.test.ts tests/server/storage.test.ts tests/components/DropZone.test.tsx`
- `npm test -- tests/server/db.test.ts tests/server/uploadSessionsApi.test.ts tests/components/uploadSessionsClient.test.tsx tests/server/storage.test.ts`
- `npm test -- tests/components/DropZone.test.tsx tests/components/AppShell.test.tsx`
