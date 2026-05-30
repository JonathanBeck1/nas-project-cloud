# Phase 12: Browser Upload Resume

Date: 2026-05-30

This phase adds a practical browser resume flow for open chunked upload
sessions. Browsers cannot keep a `File` handle after refresh, so the user
selects the same local file again from Upload Center.

## Resume Flow

- Upload Center renders a `Resume` control for open sessions.
- The hidden file input is labelled per session, so assistive tech can identify
  which file is being resumed.
- The selected file must match the stored session filename and total size.
- `resumeUploadSession` starts chunking from the server-stored `receivedBytes`
  offset, then calls the existing complete endpoint.
- Completed resumes are removed from Upload Center and surfaced to the inbox
  grid through the same `onUploaded` path as normal uploads.

## Current Boundary

- This resumes open sessions only.
- Failed-session retry still needs a separate server flow because failed
  sessions are intentionally closed to further chunk writes.
- A future desktop helper can remove the manual file-selection step by holding
  source file handles locally.

## Verification

- `npm test -- tests/components/uploadSessionsClient.test.tsx tests/components/UploadCenter.test.tsx tests/components/AppShell.test.tsx`
