# Phase 14: Local Share Links

Date: 2026-05-30

This phase adds a controlled way to hand a single file to another device on the
LAN without signing that device into the owner account.

## Shipped

- `file_share_links` metadata table for per-file bearer links.
- `file_share_access_events` metadata table for per-download access history.
- Random 32-byte share tokens stored only as SHA-256 hashes.
- Optional share passwords stored with the same scrypt hashing used for owner
  passwords.
- Authenticated `POST /api/files/:id/shares` route for active files.
- Unauthenticated `GET /api/shares/:token/download` route that streams the file
  with the same safe download headers as owner downloads.
- Unauthenticated `POST /api/shares/:token/download` route that verifies a
  password before streaming protected links.
- Public `/shares/:token` recipient page with a password-capable download form.
- Expiration, revoke, and max-download fields in the repository model, with
  download count and last-access tracking.
- Detail drawer action that creates a share link with owner-selected expiry,
  optional label, optional max-download cap, optional password, and a copyable
  URL.
- Detail drawer management for existing active links, including download count,
  max-download usage, label, expiration display, created/last-used timestamps,
  recent access events, and revocation.
- Detail drawer edit controls for existing active links, including label,
  expiration reset, max-download cap changes, password replacement, and
  password removal.
- Authenticated share-link list and revoke endpoints:
  `GET /api/files/:id/shares` and `DELETE /api/files/:id/shares/:shareId`.
- Authenticated share-link update endpoint:
  `PATCH /api/files/:id/shares/:shareId`.
- Authenticated share-link access-history endpoint:
  `GET /api/files/:id/shares/:shareId/events`.
- CSV access-history export from the same endpoint with `?format=csv`.

## Current Boundary

- Links without passwords are bearer tokens: anyone with the URL can download
  until it expires or hits its max-download cap.
- Links are file-level only. Project and folder sharing remain future work.

## Verification

- `npm test -- tests/server/db.test.ts tests/server/metadata.test.ts tests/server/shareLinksApi.test.ts tests/components/DetailDrawer.test.tsx`
- `npm test -- tests/components/fileActions.test.tsx tests/server/shareLinksApi.test.ts tests/components/DetailDrawer.test.tsx`
- `npm test -- tests/components/fileActions.test.tsx tests/components/DetailDrawer.test.tsx`
- `npm test -- tests/components/fileActions.test.tsx tests/components/DetailDrawer.test.tsx tests/server/db.test.ts tests/server/metadata.test.ts tests/server/shareLinksApi.test.ts`
- `npm test -- tests/server/shareLinksApi.test.ts tests/components/ShareDownloadPage.test.tsx tests/components/fileActions.test.tsx tests/components/DetailDrawer.test.tsx`
- `npm test -- tests/server/shareLinksApi.test.ts tests/components/fileActions.test.tsx tests/components/DetailDrawer.test.tsx`
- `npm test -- tests/server/shareLinksApi.test.ts tests/components/fileActions.test.tsx tests/components/DetailDrawer.test.tsx tests/components/AppShell.test.tsx tests/components/ProjectWorkspace.test.tsx`
- `npm run typecheck`
