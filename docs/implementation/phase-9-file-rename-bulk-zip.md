# Phase 9: File Rename and Bulk ZIP

Date: 2026-05-28

This phase adds two workspace operations needed before using the app as a
daily NAS file manager.

## File Rename

- `PATCH /api/files/:id` accepts `name`.
- The route trims and validates the requested name, renames the stored file
  through the root-confined storage service, updates the metadata `name`,
  `extension`, `family`, and `storage_path`, and rolls the file move back if
  the metadata update fails.
- The detail drawer exposes a compact file-name input and `Rename` action.

## Bulk ZIP Download

- `GET /api/files/bulk/download?fileIds=...` streams a ZIP of selected active
  files.
- The endpoint verifies every requested file is active and present on disk
  before starting the response stream.
- ZIP entry names are basename-sanitized and de-duplicated.
- The workspace bulk action bar shows `Download ZIP` whenever files are
  selected.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm audit --omit=dev`
