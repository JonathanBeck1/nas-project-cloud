# Phase 8 v0.3 Preview Pipeline

## Built

- Opt-in in-process preview scheduler controlled by `NAS_CLOUD_PREVIEW_SCHEDULER`.
- Preview pipeline status card in Settings with pending, ready, failed, skipped, and unsupported counts.
- Reprocess-failed preview action from Settings.
- Video poster-frame previews through `ffmpeg`.
- PDF first-page previews through `pdftoppm` from `poppler-utils`.
- Runtime probes for `ffmpeg` and `poppler` availability.
- `unsupported` preview status for missing runtime tooling.
- Upload Center tabs for Active, Failed, and Aborted sessions.
- Per-device upload session filtering.
- Orphaned chunk cleanup for failed sessions older than 24 hours.
- Docker runtime support for `ffmpeg` and `poppler-utils`.

## Verified

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`

## Remaining Work

- Upload resume for stale or failed sessions.
- CAD preview strategy for STL, STEP, and 3MF files.
- Bulk download as zip stream.
- File rename in UI and API.
- Project delete storage cleanup.
