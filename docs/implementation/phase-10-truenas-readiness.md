# Phase 10: TrueNAS Readiness and Project Delete Safety

Date: 2026-05-30

This phase tightens the app for real NAS deployment and removes a project
deletion footgun.

## Deployment Diagnostics

- `/api/health` now verifies four deployment requirements: writable storage,
  SQLite readiness, `ffmpeg`, and `pdftoppm`.
- The public response still hides host paths, but includes sanitized error
  messages and preview binary versions.
- Settings includes a TrueNAS readiness card so permission or missing-binary
  problems are visible without opening logs.

## Project Delete File Handling

- `DELETE /api/projects/:id` accepts `fileAction`.
- `detach` keeps existing behavior and only removes the project record.
- `moveToInbox` moves active files from `Projects/<slug>/Inbox/` back to
  `Inbox/<source-device>/` before deleting the project.
- The project settings UI exposes the choice before the typed-name delete
  confirmation.

## Verification

- `npm test -- tests/server/health.test.ts tests/server/healthApi.test.ts tests/components/DeploymentStatusCard.test.tsx`
- `npm test -- tests/server/projectsApi.test.ts tests/components/ProjectSettingsCard.test.tsx`
- `npm run typecheck`
- `npm run lint`
