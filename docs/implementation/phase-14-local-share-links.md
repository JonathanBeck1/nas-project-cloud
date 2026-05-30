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
- Detail drawer action that creates a share link with owner-selected expiry,
  optional label, optional max-download cap, and a copyable URL.
- Detail drawer management for existing active links, including download count,
  max-download usage, label, expiration display, created/last-used timestamps,
  and revocation.
- Authenticated share-link list and revoke endpoints:
  `GET /api/files/:id/shares` and `DELETE /api/files/:id/shares/:shareId`.

## Current Boundary

- Links are bearer tokens: anyone with the URL can download until it expires or
  hits its max-download cap.
- Links are file-level only. Project and folder sharing remain future work.
- Password prompts, per-download access history, and post-creation edit flows
  remain future work.

## Verification

- `npm test -- tests/server/db.test.ts tests/server/metadata.test.ts tests/server/shareLinksApi.test.ts tests/components/DetailDrawer.test.tsx`
- `npm test -- tests/components/fileActions.test.tsx tests/server/shareLinksApi.test.ts tests/components/DetailDrawer.test.tsx`
- `npm test -- tests/components/fileActions.test.tsx tests/components/DetailDrawer.test.tsx`
- `npm run typecheck`
