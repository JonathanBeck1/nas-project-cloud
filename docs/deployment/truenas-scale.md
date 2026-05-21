# TrueNAS SCALE Deployment

This guide runs NAS Project Cloud as a custom Docker Compose app on TrueNAS SCALE. It is written for the current NAS layout:

```text
OfficeNAS
  nas-project-cloud
    appdata
    files
  SharedMEDIA
```

Inside TrueNAS, those datasets resolve to:

```text
/mnt/OfficeNAS/nas-project-cloud/files
/mnt/OfficeNAS/nas-project-cloud/appdata
```

## Dataset Roles

Use `files` for the actual user file library:

```text
/mnt/OfficeNAS/nas-project-cloud/files
  Inbox/
  Projects/
  Library/
  Archive/
  .previews/
```

Use `appdata` for SQLite metadata and sidecar files:

```text
/mnt/OfficeNAS/nas-project-cloud/appdata
  nas-cloud.sqlite
  nas-cloud.sqlite-wal
  nas-cloud.sqlite-shm
```

The compose file mounts these datasets into the container:

```text
/mnt/OfficeNAS/nas-project-cloud/files   -> /mnt/nas-cloud
/mnt/OfficeNAS/nas-project-cloud/appdata -> /data
```

The app then uses:

```text
NAS_CLOUD_STORAGE_ROOT=/mnt/nas-cloud
NAS_CLOUD_DB_PATH=/data/nas-cloud.sqlite
NAS_CLOUD_PUBLIC_BASE_PATH=/files
NAS_CLOUD_MAX_UPLOAD_BYTES=2147483648
```

## Permissions

The current Docker image runs as an unprivileged user with UID/GID `1001`. The two TrueNAS datasets must be writable by that user, or by a group that the container can use.

If TrueNAS asks whether to set an ACL after creating a child dataset, either path is workable:

- `Return to pool list`: fine for now if the app healthcheck later reports storage and database as healthy.
- `Go to ACL Manager`: use this if the app cannot write to `files` or `appdata`, then grant read/write/execute to the container workload user or a shared apps group.

Avoid mixing SMB edits and app writes in the same active upload folders until the ownership model is clear. SMB is fine for snapshots, inspection, and future import workflows.

## Compose App

Use [docker/docker-compose.truenas.yml](../../docker/docker-compose.truenas.yml) as the starting point for a TrueNAS SCALE custom app.

Key settings:

- Service name: `nas-project-cloud`
- Container port: `3000`
- Host port: `3000`
- File dataset mount: `/mnt/OfficeNAS/nas-project-cloud/files:/mnt/nas-cloud`
- App metadata mount: `/mnt/OfficeNAS/nas-project-cloud/appdata:/data`
- Healthcheck: `GET /api/health`
- Image: `ghcr.io/jonathanbeck1/nas-project-cloud:latest`

Recommended TrueNAS Install via YAML flow:

1. Build and publish the image first, for example to GitHub Container Registry.
2. Confirm the compose file points at `ghcr.io/jonathanbeck1/nas-project-cloud:latest`.
3. Paste the compose YAML into TrueNAS SCALE's custom app YAML flow.
4. Start the app and wait for the healthcheck to turn healthy.
5. Browse to `http://<truenas-hostname-or-ip>:3000`.

## Publishing The Image

This repository includes a GitHub Actions workflow at `.github/workflows/docker-publish.yml`.

The workflow runs:

```text
npm test
npm run typecheck
npm run lint
npm run build
docker build and push
```

When the workflow runs on `main` or through a manual `workflow_dispatch`, it publishes:

```text
ghcr.io/jonathanbeck1/nas-project-cloud:latest
ghcr.io/jonathanbeck1/nas-project-cloud:<commit-sha>
```

TrueNAS pulls the `latest` tag from the compose file. If the package is private in GitHub Container Registry, configure image pull credentials in TrueNAS or make the package public. For the first LAN-only install, a public package is the simplest path.

Local or external Compose mode from a repo checkout:

```yaml
build:
  context: ..
  dockerfile: docker/Dockerfile
```

Only use that build stanza when Compose is run from a checkout where `..` points at the repository root. The pasted TrueNAS YAML flow should use a published image instead.

## Healthcheck

The app exposes an unauthenticated readiness endpoint:

```text
GET /api/health
```

It checks:

- the storage mount can be written to and cleaned up
- SQLite can answer a basic query

The public response intentionally does not reveal host paths. A healthy response looks like:

```json
{
  "ok": true,
  "checks": {
    "storage": { "ok": true },
    "database": { "ok": true }
  }
}
```

If this fails after deploying to TrueNAS, check dataset permissions first. The two most likely causes are:

- `/mnt/OfficeNAS/nas-project-cloud/files` is not writable by the container user
- `/mnt/OfficeNAS/nas-project-cloud/appdata` is not writable by the container user

## Maintenance Endpoints

The app exposes two maintenance routes that can be driven from a TrueNAS cron job (or any scheduler that can issue HTTP):

```text
POST /api/maintenance/previews        # process pending preview jobs
POST /api/maintenance/upload-cleanup  # delete abandoned upload sessions older than 24h
```

Both routes accept either:

- a logged-in owner session cookie (so you can hit them from a browser tab while testing), **or**
- a `Authorization: Bearer <token>` header that matches the `NAS_CLOUD_MAINTENANCE_TOKEN` environment variable. When set, this token is the only credential the route trusts for headless callers; comparison is constant-time.

Generate a strong token once and add it to the Compose env:

```bash
openssl rand -hex 32
```

```yaml
environment:
  NAS_CLOUD_MAINTENANCE_TOKEN: "<paste 64 hex chars here>"
```

Restart the container so the new env is picked up. Without `NAS_CLOUD_MAINTENANCE_TOKEN`, headless callers cannot authenticate at all — the routes still work from a logged-in browser session.

### TrueNAS Cron Job

In TrueNAS SCALE, **System > Advanced > Cron Jobs > Add**:

- Description: `nas-project-cloud previews`
- Schedule: every 5 minutes (`*/5 * * * *`) is a reasonable default
- Run as: `root` (or any user that can run `curl`)
- Command:

```bash
curl --silent --show-error --fail \
  --max-time 60 \
  -H "Authorization: Bearer ${NAS_CLOUD_MAINTENANCE_TOKEN}" \
  -X POST http://127.0.0.1:3000/api/maintenance/previews
```

Add a second cron job for upload cleanup, e.g. once per hour (`5 * * * *`):

```bash
curl --silent --show-error --fail \
  --max-time 60 \
  -H "Authorization: Bearer ${NAS_CLOUD_MAINTENANCE_TOKEN}" \
  -X POST http://127.0.0.1:3000/api/maintenance/upload-cleanup
```

Tips:

- Use `127.0.0.1:3000` (the loopback interface) so the request never leaves the NAS.
- Export `NAS_CLOUD_MAINTENANCE_TOKEN` in the TrueNAS cron environment, or hard-code the bearer value into the cron command itself if you prefer not to expose it in the parent shell.
- Every successful run returns JSON. A non-2xx response indicates the token did not match (`401`) or the worker hit an unexpected error.

## Backups And Snapshots

Snapshot both datasets:

```text
/mnt/OfficeNAS/nas-project-cloud/files
/mnt/OfficeNAS/nas-project-cloud/appdata
```

The app enables SQLite WAL mode. Do not back up only `nas-cloud.sqlite` while the container is running. For the cleanest backup:

1. Stop the app.
2. Snapshot or copy `files`.
3. Snapshot or copy the full `appdata` dataset.
4. Start the app again.

If doing file-level backups, include the full SQLite file set:

```text
/mnt/OfficeNAS/nas-project-cloud/appdata/nas-cloud.sqlite
/mnt/OfficeNAS/nas-project-cloud/appdata/nas-cloud.sqlite-wal
/mnt/OfficeNAS/nas-project-cloud/appdata/nas-cloud.sqlite-shm
```

## LAN Access

For a LAN-only setup, publish port `3000:3000` and browse to:

```text
http://<truenas-hostname-or-ip>:3000
```

On the 2.5Gb wired path, large uploads should be limited more by disks, browser behavior, and reverse proxy buffering than by the app container. Keeping the app and storage on the NAS avoids routing large files through another machine first.

## Reverse Proxy

If exposing the app through a reverse proxy, prefer a full subdomain such as:

```text
https://cloud.home.example
```

Proxy to the app at:

```text
http://<truenas-ip>:3000
```

Set proxy upload limits and buffering with the 2 GiB application limit in mind. For Nginx, raise `client_max_body_size` and review request buffering. For Caddy or Traefik, check the equivalent body-size and timeout settings.

Do not put the app behind a path prefix unless the Next.js app has been tested with that prefix. `NAS_CLOUD_PUBLIC_BASE_PATH=/files` is for the app's file-serving API path, not a reverse-proxy base path.

## Storage Engine Follow-Up

The current deployment uses direct filesystem storage plus SQLite metadata. See [Storage Engine Spike](../research/storage-engine-spike.md) for the checklist and decision rule for comparing this approach with OpenCloud and Nextcloud-backed storage.
