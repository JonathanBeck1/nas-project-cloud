# NAS Project Cloud Design

Date: 2026-04-30

## Summary

Build a local-first, NAS-backed personal file cloud for a TrueNAS SCALE server. The product should feel like a custom local Google Drive organized around real projects, with fast drag-and-drop upload, a first-class Inbox, categories, tags, smart views, previews, and later device-level features such as desktop sync, tray upload, clipboard sync, and remote access.

The system should not begin as a fork of LocalSend. LocalSend is excellent for direct device-to-device transfer, but this product needs persistent storage, project organization, indexing, and a durable library. The recommended path is to use a mature storage/sync engine such as OpenCloud or Nextcloud on TrueNAS, then build a custom workflow UI and metadata/indexing layer around it.

## Goals

- Store the real file library on the user's TrueNAS SCALE server.
- Support every file format by treating files as arbitrary bytes.
- Provide a polished web UI for drag-and-drop upload, browsing, organizing, searching, previewing, and managing files.
- Organize the app around projects, while also supporting categories, tags, Inbox, and smart views.
- Preserve human-readable folders on the NAS so files remain usable through SMB, Finder, Explorer, OpenCloud, or Nextcloud even if the custom app is offline.
- Support local network workflows first, with a future path to secure remote access.
- Keep the architecture open-source friendly and practical for other self-hosters.

## Non-Goals For V1

- Do not build a complete storage/sync engine from scratch.
- Do not replace OpenCloud or Nextcloud in the first version.
- Do not build desktop tray apps, automatic sync folders, clipboard sync, or remote relay in V1.
- Do not attempt advanced CAD rendering or file comparison in V1.
- Do not make a marketing landing page the primary experience.

## Research Notes

Relevant existing projects:

- OpenCloud: modern self-hosted file management, sharing, collaboration, and sync. Strong candidate for the storage/sync core.
- Nextcloud: mature self-hosted cloud platform with broad clients and ecosystem support. Strong fallback if OpenCloud is not ready enough.
- LocalSend: excellent local point-to-point sending, but not a persistent project library.
- Seafile: strong sync engine, less ideal if transparent NAS folder layout is the priority.
- File Browser and copyparty: useful references or sidecars for fast folder-based upload/browse workflows.
- DecentPaste and Yoop: useful references for future clipboard/device-transfer features, but not the core for the NAS library.

Before implementation locks in the engine, run a short infrastructure spike comparing OpenCloud, Nextcloud, and direct filesystem access from the custom app.

## Recommended Architecture

### TrueNAS SCALE Storage

TrueNAS SCALE is the source of truth. Files live on a ZFS dataset and remain accessible outside the custom app.

Expected high-level storage shape:

```text
NAS/
  Inbox/
    MacBook-Pro/
    Windows-PC/
  Projects/
    Project Name/
      Inbox/
      Source/
      Working/
      Exports/
      Final/
      Archive/
  Library/
    3D-CAD/
    Media/
    Documents/
  Archive/
```

Physical project folders are real. Categories, tags, source device, status, and smart views are metadata.

### Storage/Sync Engine

Use OpenCloud first if the infrastructure spike confirms it is stable enough on TrueNAS SCALE. Use Nextcloud as the fallback if maturity, clients, or operational reliability matter more than modern architecture.

The chosen engine must provide:

- authentication
- web and API file access
- desktop/mobile sync clients
- sharing
- WebDAV or equivalent filesystem APIs
- trash support

Version history is desirable but not required for the first custom UI release.

The custom app should not fork the engine UI at first. It should sit beside the engine and use supported APIs or shared filesystem access.

### Custom Workflow App

The custom app is the primary product experience. It provides:

- project-first web UI
- drag-and-drop uploads
- Inbox and direct-to-project upload
- categories and tags
- smart views
- metadata editing
- previews and thumbnails
- search and filtering
- file detail drawer
- admin settings

### Sidecar Indexer

A sidecar process watches or scans the storage dataset and maintains metadata in a database.

Responsibilities:

- detect new, moved, changed, and deleted files
- record filename, size, type, source device, project, category, tags, upload time, checksum, and storage path
- generate thumbnails/previews for supported images and videos
- later extract CAD/media-specific metadata
- feed search and smart views

## Organization Model

### Inbox

The Inbox is a first-class landing zone for fast capture. Users can drop files into the system without deciding where they belong immediately.

Inbox records should show:

- source device
- upload time
- file type
- file size
- suggested category
- suggested project, if inferable
- quick preview
- fast actions to move into a project or category

### Projects

Projects are the main organizing unit. A project can contain any mix of CAD files, videos, images, documents, exports, notes, archives, and source assets.

Project metadata:

- name
- description
- category
- status
- tags
- created and updated dates
- pinned files

### Categories

The app ships with starter categories, and users can customize them.

Starter categories:

- 3D / CAD
- Media
- Documents
- Software
- Personal
- Archive
- Inbox

Users can rename, hide, add, delete, and reorder categories.

### Tags

Tags are flexible labels across projects and files.

Example tags:

- ready-to-print
- needs-review
- final
- raw
- from-windows
- from-mac
- client
- large-file

### Smart Views

Smart views are automatic filtered views driven by metadata.

V1 smart views:

- Inbox
- Recent Uploads
- Unsorted
- Large Files
- CAD Files
- Media
- Images
- Videos
- From Windows PC
- From Mac

## V1 Product Scope

V1 should include:

- TrueNAS-hosted web app
- local development mode using filesystem-backed storage
- drag-and-drop upload to Inbox or a selected project
- project creation and project browser
- category and tag management
- file browser with grid and list modes
- file detail drawer with preview, metadata, path, source device, upload time, and actions
- smart views for Inbox, Recent, Unsorted, Large Files, CAD Files, and Media
- search by filename, type, project, category, and tag
- thumbnail/preview generation for common images
- video thumbnail support through ffmpeg when the deployment includes ffmpeg
- human-readable folder layout on the NAS
- admin settings for storage paths, category presets, devices, and indexing status

Push after V1:

- desktop tray app
- automatic desktop sync folder
- clipboard sync
- remote access outside the local network
- richer multi-user permissions
- advanced CAD previews
- version comparison
- direct device-to-device transfer lane

## UX Shape

The first screen is the actual workspace, not a landing page.

Main layout:

- left sidebar: Projects, Inbox, Categories, Smart Views, Devices, Settings
- top command bar: search, upload, new project, quick filter, view mode
- main area: project grid/list, file browser, or smart view results
- right detail drawer: selected file/project details, preview, tags, category, path, source device, and actions
- persistent drag-and-drop target across the app

The UI should feel dense, fast, and organized, closer to Finder, Google Drive, and Lightroom than a marketing dashboard.

First workflows:

- drop files into Inbox quickly
- sort Inbox into Projects
- browse Projects
- filter by category, type, tag, and source device
- find recent CAD and media files quickly
- open file location on NAS, copy path, download, and preview

## Data Flow

1. A device uploads through the custom UI into Inbox or a selected Project.
2. The server writes the file to the TrueNAS dataset in a normal folder path.
3. The indexer records metadata in the database.
4. The preview worker generates thumbnails/previews when supported.
5. The UI queries the metadata database for fast search, filtering, and smart views.
6. Files remain available through SMB, Finder, Explorer, OpenCloud, or Nextcloud even if the custom UI is offline.

Reliability expectations:

- support large files
- support resumable/chunked uploads eventually
- verify checksums for completed uploads
- expose clear failed-upload recovery
- avoid duplicate storage unless explicitly requested

## Build Strategy

### Phase 0: Infrastructure Spike

Install and compare OpenCloud, Nextcloud, and direct filesystem access on or against TrueNAS SCALE.

Confirm:

- Docker/Compose deployment path
- dataset mount strategy
- upload limits
- WebDAV/API behavior
- SMB compatibility
- desktop sync client behavior
- file ownership and permissions
- realistic performance on the 2.5GbE network

### Phase 1: Custom Web App MVP

Build locally against filesystem-backed storage:

- Inbox
- Projects
- upload
- browse
- categories
- tags
- smart views
- basic search

### Phase 2: TrueNAS Deployment

Package as Docker Compose for TrueNAS SCALE and mount the real dataset.

### Phase 3: Metadata And Indexing

Add watcher/scanner, thumbnails, source device tracking, checksums, and richer search.

### Phase 4: Storage Engine Integration

Decide whether OpenCloud or Nextcloud owns auth/file APIs directly, or whether the custom app reads/writes the shared dataset while the storage engine remains the sync/share companion.

### Phase 5: Device Enhancements

Add desktop tray app, sync folder, clipboard sync, quick upload shortcuts, and later remote access.

## Defaults To Validate During Planning

- Engine default: try OpenCloud first; switch to Nextcloud if OpenCloud is unstable on TrueNAS SCALE or blocks desktop sync.
- Auth default: use the storage engine for real user authentication when integration is straightforward; use a simple single-admin password only for early local development.
- Database default: use SQLite for local MVP development; use Postgres in the TrueNAS Docker Compose deployment.
- Preview default: support common image thumbnails first, then video thumbnails through ffmpeg, then CAD previews after V1.
- SMB integration default: expose copyable NAS paths and "open location" guidance in V1; native OS folder-opening belongs in the later desktop tray app.

## Approved Direction

The approved direction is:

- NAS-backed, local-first personal cloud
- project-first organization
- physical folders for project storage
- metadata-driven categories, tags, and smart views
- Inbox and direct-to-project upload
- OpenCloud-first research path, with Nextcloud fallback
- custom workflow UI instead of a generic cloud-drive UI
