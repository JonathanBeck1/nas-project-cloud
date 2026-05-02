# Phase 4 Auth And Device Trust

## Built

- Owner setup flow.
- Password login/logout.
- HTTP-only session cookies.
- Protected app/API routes.
- Trusted device registry.
- Pairing code flow for new devices.
- Workspace logout action.

## Security Model

- Local owner account controls the private LAN app.
- Session cookies are HTTP-only and same-site.
- Device pairing codes are short-lived and single-use.
- File APIs require a valid session.
- Workspace access redirects unauthenticated users to setup or login.

## Verified

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
