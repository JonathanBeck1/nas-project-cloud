# Storage Engine Spike

The MVP stores files directly on a NAS dataset and tracks metadata in SQLite. This spike evaluates whether to keep that model or integrate a larger storage engine such as OpenCloud or Nextcloud.

## Goals

- Preserve fast LAN access to large files on a TrueNAS SCALE host.
- Keep files recoverable from normal NAS snapshots and backup tooling.
- Avoid committing to a storage abstraction before the app's metadata and workflow needs are clear.
- Identify when another storage engine would reduce maintenance enough to justify the extra moving parts.

## Options

### Direct Filesystem

The app writes files under `NAS_CLOUD_STORAGE_ROOT` and stores metadata in SQLite.

Checklist:

- TrueNAS SCALE install path: Deploy the app as a custom Docker Compose app and mount the dataset directly into the container.
- Dataset mount behavior: `NAS_CLOUD_STORAGE_ROOT` points at the mounted dataset, with app-created folders such as `Inbox/`, `Projects/`, `Library/`, and `Archive/` visible on the host.
- WebDAV or API behavior: No storage service API is required; the app owns upload, download, rename, delete, and reindex behavior.
- Desktop sync client behavior on macOS: No bundled sync client; use SMB, Finder, or a future app-specific workflow for out-of-band file access.
- Desktop sync client behavior on Windows: No bundled sync client; use SMB, Explorer, or a future app-specific workflow for out-of-band file access.
- Upload behavior for large files: Measure 1 GB and 5 GB browser uploads over the 2.5Gb LAN against direct writes to the dataset.
- SMB compatibility with the same dataset: Supported if permissions and ownership are planned carefully; confirm safe behavior when files are moved or edited outside the app.
- Trash support: App-level trash is not guaranteed by the filesystem model; decide whether archive/delete semantics are enough.
- Version history support: Use TrueNAS snapshots for dataset-level recovery unless app-level file versions are added later.
- User/auth integration: App-local authentication and authorization must guard metadata and file-serving routes.
- Operational complexity: Lowest moving-parts option; backup and restore must cover both the storage dataset and SQLite database.
- Blockers: Any requirement for mature desktop sync, built-in sharing, cross-device version history, or service-managed trash may exceed the direct filesystem model.

Best fit when the app needs simple, fast, local storage with full TrueNAS visibility.

### OpenCloud

OpenCloud may provide a more complete file platform while staying lighter than a traditional groupware stack.

Checklist:

- TrueNAS SCALE install path: Confirm Docker or custom app support and the required services, volumes, and upgrade steps on TrueNAS SCALE.
- Dataset mount behavior: Verify whether OpenCloud stores files plainly on the mounted dataset or behind an application-managed layout.
- WebDAV or API behavior: Verify WebDAV and API coverage for upload, download, metadata, sharing, thumbnails, search, and auth.
- Desktop sync client behavior on macOS: Test available macOS sync clients against the TrueNAS-hosted deployment, including conflict handling and large-file resume behavior.
- Desktop sync client behavior on Windows: Test available Windows sync clients against the TrueNAS-hosted deployment, including conflict handling and large-file resume behavior.
- Upload behavior for large files: Measure 1 GB and 5 GB uploads through browser, WebDAV, API, and desktop clients where supported.
- SMB compatibility with the same dataset: Confirm whether SMB access to the same files is supported, unsupported, or only safe as read-only recovery access.
- Trash support: Verify server-side trash behavior, retention controls, and restore workflow.
- Version history support: Verify whether version history is available, where versions are stored, and how it interacts with TrueNAS snapshots.
- User/auth integration: Review users, groups, tokens, service accounts, and any external identity-provider requirements for a private LAN deployment.
- Operational complexity: Document required services, databases, background workers, upgrades, monitoring, backup, and recovery steps.
- Blockers: Dataset opacity, unsupported SMB co-access, missing desktop sync, weak large-file handling, or auth complexity that outweighs the app benefits.

Best fit if the app needs a file-platform API but should avoid the weight of Nextcloud.

### Nextcloud

Nextcloud is mature and feature-rich, but it brings a large application surface.

Checklist:

- TrueNAS SCALE install path: Confirm supported TrueNAS SCALE app, custom Docker Compose, or VM path and the maintenance expectations for each.
- Dataset mount behavior: Verify where primary files, app metadata, previews, trash, and versions live on the dataset.
- WebDAV or API behavior: Confirm whether WebDAV, app APIs, previews, sharing, search, and metadata endpoints cover the required workflows.
- Desktop sync client behavior on macOS: Test the official macOS desktop client for large-file sync, conflicts, selective sync, and offline behavior.
- Desktop sync client behavior on Windows: Test the official Windows desktop client for large-file sync, conflicts, selective sync, and offline behavior.
- Upload behavior for large files: Measure browser, WebDAV, API, and desktop-client uploads with 1 GB and 5 GB files, including reverse-proxy limits.
- SMB compatibility with the same dataset: Confirm whether direct SMB access to the same data is supported for normal use or only acceptable through Nextcloud external storage patterns.
- Trash support: Verify trash retention policy, restore workflow, storage growth, and admin controls.
- Version history support: Verify version retention policy, restore workflow, storage growth, and interaction with snapshots.
- User/auth integration: Review local users, groups, app passwords, external auth options, and mapping to the app's project permissions.
- Operational complexity: Evaluate database, cache, background job, preview generation, cron, upgrade, backup, and recovery requirements.
- Blockers: Operational burden, metadata-model conflicts, proxy/upload tuning, unsupported SMB co-access, or features that duplicate rather than simplify the app.

Best fit if calendars, contacts, external clients, sharing workflows, and mature mobile sync matter more than a small focused app.

## Evaluation Runs

For each option, run the same test set:

1. Upload 1 GB, 5 GB, and many-small-file batches over the LAN.
2. Browse, filter, and download files immediately after upload.
3. Restart the container and confirm metadata and files recover cleanly.
4. Snapshot and restore the dataset and metadata store.
5. Reindex files after out-of-band filesystem changes.
6. Document operational steps for install, upgrade, backup, and recovery.

## Decision Rule

Keep direct filesystem storage unless OpenCloud or Nextcloud clearly wins on at least two of these dimensions without failing the recovery requirement:

- It reduces custom code for sync, sharing, previews, or permissions that the product definitely needs.
- It preserves practical dataset-level backup and restore on TrueNAS SCALE.
- It handles large LAN uploads as well as or better than direct storage.
- It keeps deployment understandable for a NAS owner maintaining the system at home.

If the main need is file ingestion, browsing, lightweight organization, and NAS-native recovery, direct filesystem storage remains the default.
