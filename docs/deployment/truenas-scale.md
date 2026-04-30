# TrueNAS SCALE Deployment

This guide runs NAS Project Cloud as a custom Docker Compose app on TrueNAS SCALE. It assumes a NAS-hosted dataset, LAN-first access over a 2.5Gb network, and SQLite metadata stored separately from user files.

## Dataset Layout

Create a dataset for the app data, for example:

```text
/mnt/tank/nas-project-cloud
```

Recommended layout:

```text
/mnt/tank/nas-project-cloud/
  Inbox/
  Projects/
  Library/
  Archive/
```

The compose file mounts this dataset at `/mnt/nas-cloud` inside the container. The app resolves `NAS_CLOUD_STORAGE_ROOT=/mnt/nas-cloud`, so stored files stay directly visible on the NAS filesystem for backup, snapshots, and future migration.

Current uploads are written to normal folders under that dataset. Device imports use `Inbox/<source-device>/`, and project-scoped imports use `Projects/<project-slug>/Inbox/`.

Keep the SQLite database on the named Docker volume mounted at `/data`. That separates metadata writes from the large storage dataset while keeping both on the NAS host.

## Permissions

The container runs as an unprivileged user with UID/GID `1001`. Before starting the app, make sure the dataset is writable by that user or by a group the container can use. On a private LAN deployment, the simplest path is usually:

1. Create the dataset in TrueNAS SCALE.
2. Set the dataset owner/group to the account or group used for container workloads.
3. Grant read/write/execute permissions on the dataset.
4. Avoid SMB and app writes racing against each other in the same subdirectories unless you have a clear ownership model.

## Deployment Modes

TrueNAS SCALE's **Install via YAML** flow expects Docker Compose YAML entered into the UI, either pasted directly or included from an external Compose file. Repo-relative paths like `build.context: ..` only exist if you separately manage that repository checkout and run Compose from the matching path.

Recommended TrueNAS Install via YAML mode:

1. Build and publish an image first, for example to GitHub Container Registry.
2. Replace `ghcr.io/YOUR_GITHUB_ORG/nas-project-cloud:latest` in `docker/docker-compose.truenas.yml` with your published image.
3. Paste the compose YAML into the TrueNAS UI or include that compose file through the YAML workflow.

Local or external Compose mode from a repo checkout on the NAS:

1. Check out this repository on the NAS or another host that runs Compose.
2. Run Compose from a path where the repository-relative build context exists.
3. Replace the `image:` line with a local build stanza:

```yaml
build:
  context: ..
  dockerfile: docker/Dockerfile
```

The build stanza is only for local or externally managed Compose deployments from a repo checkout. It is not required for the recommended pasted TrueNAS YAML path.

## Custom App

Use `docker/docker-compose.truenas.yml` as the starting point for a TrueNAS SCALE custom app. In the recommended TrueNAS YAML workflow, this file runs a previously published image instead of building from a repo-relative path.

Key settings:

- Service name: `nas-project-cloud`
- Container port: `3000`
- Host port: `3000`
- Storage dataset mount: `/mnt/tank/nas-project-cloud:/mnt/nas-cloud`
- Metadata volume: `nas-project-cloud-data:/data`
- Image: replace `ghcr.io/YOUR_GITHUB_ORG/nas-project-cloud:latest` with your published image

Environment:

```text
NAS_CLOUD_STORAGE_ROOT=/mnt/nas-cloud
NAS_CLOUD_DB_PATH=/data/nas-cloud.sqlite
NAS_CLOUD_PUBLIC_BASE_PATH=/files
NAS_CLOUD_MAX_UPLOAD_BYTES="2147483648"
```

When using local or external Compose from a repo checkout, build the image from the repository root with `docker/Dockerfile`. The Dockerfile uses Node 22 on Alpine and includes native build tooling for `better-sqlite3` during dependency installation.

## LAN Access

For a LAN-only setup, publish port `3000:3000` and browse to:

```text
http://<truenas-hostname-or-ip>:3000
```

On a 2.5Gb LAN, large uploads should be limited more by disk behavior, browser behavior, and reverse proxy buffering than by the app container. Keep the app and storage dataset on the NAS to avoid hairpin transfers through another host.

## Reverse Proxy

If exposing the app through a reverse proxy, prefer a full subdomain such as:

```text
https://cloud.home.example
```

Proxy to the app at:

```text
http://nas-project-cloud:3000
```

or to the NAS host IP and published port if the proxy runs elsewhere:

```text
http://<truenas-ip>:3000
```

Set proxy upload limits and buffering with the 2 GiB application limit in mind. For Nginx, that usually means raising `client_max_body_size` and reviewing request buffering. For Caddy or Traefik, check the equivalent body-size and timeout controls.

Do not put the app behind a path prefix unless the Next.js app has been tested with that prefix. `NAS_CLOUD_PUBLIC_BASE_PATH=/files` is for the app's file-serving API path, not a reverse-proxy base path.

## Backups And Snapshots

Snapshot the storage dataset regularly. Also back up the Docker named volume mounted at `/data`, because the SQLite database is the metadata source for projects, tags, categories, and indexed file records.

The app enables SQLite WAL mode. Do not assume copying only `/data/nas-cloud.sqlite` is enough while the app is running. For backup or upgrade, prefer stopping the container and backing up the entire `/data` volume. If you need file-level backup instead, stop the container or checkpoint SQLite first, then include all database sidecar files:

```text
/data/nas-cloud.sqlite
/data/nas-cloud.sqlite-wal
/data/nas-cloud.sqlite-shm
```

Before a major upgrade, stop the container, back up the `/data` volume or the complete SQLite file set above, and snapshot the storage dataset. Restart after both are captured.

## Storage Engine Follow-Up

The current deployment uses direct filesystem storage plus SQLite metadata. See [Storage Engine Spike](../research/storage-engine-spike.md) for the checklist and decision rule for comparing this approach with OpenCloud and Nextcloud-backed storage.
