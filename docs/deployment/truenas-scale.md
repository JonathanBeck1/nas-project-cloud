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

`Projects/`, `Archive/`, or any other folder under `files` can be its own child dataset if you want separate snapshots or quotas. Moves inside one dataset are instant hard links. A move that crosses datasets is copied and then linked into place, so it takes as long as the copy and briefly needs room for a second copy on the destination dataset. A child dataset needs the same UID 1001 ownership as `files`.

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

The current Docker image runs as an unprivileged user with UID/GID `1001`. Both datasets must be writable by that user **before you start the app**. The bind mounts replace the image's own build-time ownership, so an unwritable dataset means the SQLite database and storage probes fail, `/api/health` never turns healthy, and you cannot create the owner account.

Required, before the first start, from a TrueNAS shell (adjust the pool/dataset path if yours differs):

```bash
chown -R 1001:1001 /mnt/OfficeNAS/nas-project-cloud/files /mnt/OfficeNAS/nas-project-cloud/appdata
```

Alternatively, use ACL Manager to grant read/write/execute on both `files` and `appdata` to the container workload user (UID 1001) or a shared apps group.

Symlinks inside `files` are only followed when they resolve to somewhere inside `files`; the app refuses to download, share, export, or preview through one that leaves it. Avoid mixing SMB edits and app writes in the same active upload folders until the ownership model is clear. SMB is fine for snapshots, inspection, and future import workflows.

## Compose App

Use [docker/docker-compose.truenas.yml](../../docker/docker-compose.truenas.yml) as the starting point for a TrueNAS SCALE custom app.

Key settings:

- Service name: `nas-project-cloud`
- Container port: `3000`
- Host port: `3000`
- File dataset mount: `/mnt/OfficeNAS/nas-project-cloud/files:/mnt/nas-cloud`
- App metadata mount: `/mnt/OfficeNAS/nas-project-cloud/appdata:/data`
- Healthcheck: `GET /api/health`
- Image: `ghcr.io/jonathanbeck1/nas-project-cloud:latest` or the pinned release `ghcr.io/jonathanbeck1/nas-project-cloud:0.3.1`

Recommended TrueNAS Install via YAML flow:

1. Build and publish the image first, for example to GitHub Container Registry.
2. Confirm the compose file points at `ghcr.io/jonathanbeck1/nas-project-cloud:latest` or a pinned release tag such as `ghcr.io/jonathanbeck1/nas-project-cloud:0.3.1`.
3. Paste the compose YAML into TrueNAS SCALE's custom app YAML flow.
4. Start the app and wait for the healthcheck to turn healthy.
5. Browse to `http://<truenas-hostname-or-ip>:3000`.

## TrueNAS Custom App Form

If your TrueNAS version shows the custom-app form instead of a YAML editor, use these field values.

### Application Name

```text
nas-project-cloud
```

### Image Configuration

```text
Repository: ghcr.io/jonathanbeck1/nas-project-cloud
Tag: 0.3.1
Pull Policy: Always pull an image even if it is present on the host
```

Pin a release tag such as `0.3.1`. `latest` is rebuilt on every push to `main`, so with the "always pull" policy a restart can silently move you to an unreleased build. Use it only when you want that.

### Container Configuration

```text
Hostname: nas-project-cloud
Entrypoint: leave empty
Command: leave empty
```

### Environment Variables

Add these variables exactly:

```text
NAS_CLOUD_STORAGE_ROOT = /mnt/nas-cloud
NAS_CLOUD_DB_PATH = /data/nas-cloud.sqlite
NAS_CLOUD_PUBLIC_BASE_PATH = /files
NAS_CLOUD_MAX_UPLOAD_BYTES = 2147483648
NAS_CLOUD_PREVIEW_SCHEDULER = on
```

Optional, but recommended if you want cron-driven maintenance:

```text
NAS_CLOUD_MAINTENANCE_TOKEN = <64 hex characters from openssl rand -hex 32>
```

### Network Configuration

Expose the web app on the NAS:

```text
Host Port: 3000
Container Port: 3000
Protocol: TCP
```

Leave host networking off unless you have a specific reason to use it.

### Storage Configuration

Add two host path mounts:

```text
Host Path: /mnt/OfficeNAS/nas-project-cloud/files
Mount Path: /mnt/nas-cloud
Read Only: false
```

```text
Host Path: /mnt/OfficeNAS/nas-project-cloud/appdata
Mount Path: /data
Read Only: false
```

Do not mount the parent `/mnt/OfficeNAS/nas-project-cloud` over `/mnt/nas-cloud`; keep files and appdata separate so database writes do not mix with the user file tree.

### Resource Configuration

Start with modest limits:

```text
CPU: no strict limit, or 2 cores if your TrueNAS UI requires a value
Memory: 2048 MiB minimum, 4096 MiB recommended if generating video/PDF previews
```

Video and PDF previews use `ffmpeg` and `pdftoppm`; they are short-lived but can spike CPU and memory while processing large files.

The compose file sets `mem_limit: 2g`, drops all Linux capabilities, sets `no-new-privileges`, and runs an init process as PID 1. If a preview job gets the container killed for memory, the job is counted: after the app restarts it is retried, and a file that takes the worker down three times is marked `failed` instead of looping. Raise `mem_limit` to `4g` if you store very large source images. Signing in also needs memory: each account password check uses about 128 MiB for a fraction of a second, and at most two run at once.

## First-Run Verification

After install, open:

```text
http://192.168.68.64:3000/api/health
```

Expected response:

```json
{
  "ok": true,
  "checks": {
    "storage": { "ok": true },
    "database": { "ok": true }
  }
}
```

Then open:

```text
http://192.168.68.64:3000
```

The first page should redirect to `/setup`. Create the owner account, then upload a small image file and confirm that:

- it appears in the workspace,
- it downloads successfully,
- Settings shows the preview pipeline card,
- `/mnt/OfficeNAS/nas-project-cloud/files` contains the uploaded file.

## Troubleshooting

### Image Pull Fails

Check these first:

- Repository is `ghcr.io/jonathanbeck1/nas-project-cloud`.
- Tag is `0.3.1` or `latest`.
- The GitHub Container Registry package is public, or TrueNAS has pull credentials configured.
- TrueNAS has outbound internet access and working DNS.

If the repo remains private, create a GitHub personal access token with package read access and configure it as an image pull secret in TrueNAS.

### App Starts But `/api/health` Is Unhealthy

Most health failures are dataset permissions. The container runs as UID/GID `1001`, so both datasets must be writable:

```text
/mnt/OfficeNAS/nas-project-cloud/files
/mnt/OfficeNAS/nas-project-cloud/appdata
```

Use TrueNAS ACL Manager to grant read/write/execute to the container workload user or a group the container can use. Retest `/api/health` after restarting the app.

### Browser Cannot Open Port 3000

Check:

- TrueNAS app is running.
- Host port `3000` maps to container port `3000`.
- No other TrueNAS app is already using port `3000`.
- You are using the NAS IPv4 address, for example `http://192.168.68.64:3000`.
- You did not configure a router port forward. This app should stay LAN-only unless you intentionally add a reverse proxy and public auth posture.

### Preview Jobs Stay Pending

Check Settings → Preview pipeline. For the default custom-app setup:

```text
NAS_CLOUD_PREVIEW_SCHEDULER = on
```

If `ffmpeg` or `poppler` shows unavailable while using the official Docker image, confirm the app is pulling `0.3.0` or newer. Older images only generated image thumbnails.

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

When a semver tag is pushed, for example `v0.3.1`, it also publishes:

```text
ghcr.io/jonathanbeck1/nas-project-cloud:0.3.1
ghcr.io/jonathanbeck1/nas-project-cloud:0.3
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
POST /api/maintenance/upload-cleanup  # delete abandoned uploads older than 24h; purge expired sessions, pairing codes, rate-limit rows
```

> **Tip:** if you'd rather skip the cron entirely, set `NAS_CLOUD_PREVIEW_SCHEDULER=on` in the container env. The app then runs an in-process loop that ticks every 60 seconds while there is pending preview work, goes again after one second when a batch of 25 came back full, and idles to every 5 minutes when the queue is empty. The same loop runs the stale-upload cleanup and the purge of expired sessions, pairing codes, and rate-limit rows once an hour. The cron approach below still works either way and is the safe choice if you run multiple replicas; with the scheduler off, cron is the only thing that cleans up abandoned uploads.

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

`appdata` is not disposable. Re-indexing the `files` dataset (`npm run index:storage`, from a source checkout with both datasets mounted; the script is not in the Docker image) brings back file records, project membership inferred from `Projects/<slug>/`, and default categories. Tags, custom categories, share links, users, paired devices, and upload sessions exist only in SQLite and are lost without an `appdata` backup.

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

When the app is served over HTTPS (TLS terminated at the proxy), set `NAS_CLOUD_SECURE_COOKIES=true` so session and CSRF cookies are marked `Secure`. Leave it unset (the default) for direct LAN access over plain `http://<nas-ip>:3000` — browsers drop `Secure` cookies over HTTP, which silently blocks login.

Set `NAS_CLOUD_TRUST_PROXY=true` only when every request reaches the app through the proxy. The app then rate-limits login and pairing per client, using the last `X-Forwarded-For` entry, and records that address in share access history. Three conditions have to hold:

- Port 3000 is not reachable except through the proxy. If it is, a client can connect directly and send its own `X-Forwarded-For`.
- The proxy sets or appends `X-Forwarded-For`. Nginx (`$proxy_add_x_forwarded_for`), Nginx Proxy Manager, Caddy, Traefik, and Cloudflare Tunnel do. A bare `proxy_pass` with no header config forwards the client's value untouched.
- With two proxies in a row, the app sees the inner proxy's address for every client. Restore the real address at the inner proxy rather than in the app.

Left unset (the default), the header is ignored and all clients share one rate-limit bucket.

Do not put the app behind a path prefix unless the Next.js app has been tested with that prefix. `NAS_CLOUD_PUBLIC_BASE_PATH=/files` is for the app's file-serving API path, not a reverse-proxy base path.

## Storage Engine Follow-Up

The current deployment uses direct filesystem storage plus SQLite metadata. See [Storage Engine Spike](../research/storage-engine-spike.md) for the checklist and decision rule for comparing this approach with OpenCloud and Nextcloud-backed storage.
