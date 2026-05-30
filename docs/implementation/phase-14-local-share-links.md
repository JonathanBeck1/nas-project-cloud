# Phase 14: Local Share Links

Date: 2026-05-30

This phase adds a controlled way to hand a single file to another device on the
LAN without signing that device into the owner account.

## Shipped

- `file_share_links` metadata table for per-file bearer links.
- Random 32-byte share tokens stored only as SHA-256 hashes.
- Authenticated `POST /api/files/:id/shares` route for active files.
- Unauthenticated `GET /api/shares/:token/download` route that streams the file
  with the same safe download headers as owner downloads.
- Expiration, revoke, and max-download fields in the repository model, with
  download count and last-access tracking.
- Detail drawer action that creates a 24-hour share link and displays a
  copyable URL.

## Current Boundary

- Links are bearer tokens: anyone with the URL can download until it expires or
  hits its max-download cap.
- The backend supports revocation metadata, but the UI for listing and revoking
  active links is not built yet.
- Links are file-level only. Project and folder sharing remain future work.

## Verification

- `npm test -- tests/server/db.test.ts tests/server/metadata.test.ts tests/server/shareLinksApi.test.ts tests/components/DetailDrawer.test.tsx`
- `npm test -- tests/components/fileActions.test.tsx tests/server/shareLinksApi.test.ts tests/components/DetailDrawer.test.tsx`
- `npm run typecheck`
