# Security policy

## Supported versions

Security fixes land in the newest release line and ship as a patch release. Please check that the problem still exists on the latest image tag before reporting.

| Version | Supported |
| --- | --- |
| Latest release line (currently 0.5.x) | Yes |
| Anything older | No |

## Reporting a vulnerability

Report it privately through GitHub: **[Report a vulnerability](https://github.com/JonathanBeck1/nas-project-cloud/security/advisories/new)**. Please don't open a public issue, discussion, or pull request for it.

A useful report includes:

- the version or commit you tested
- how it's deployed (TrueNAS SCALE, plain Docker, source checkout, behind a reverse proxy or not)
- steps to reproduce, ideally the smallest request or file that triggers it
- what an attacker gains

## What to expect

NAS Project Cloud has one maintainer. The aim is to acknowledge a report within 7 days, agree on a fix and a disclosure date with you, then publish a patch release together with a GitHub Security Advisory. Reporters are credited in the advisory unless they'd rather not be.

## Threat model

The app is built for a single owner on a trusted home or office network, optionally behind a reverse proxy with TLS. Reports are especially welcome for:

- getting past sign-in, pairing, or the CSRF checks
- reading, writing, or deleting anything outside the configured storage root, including through a symlink placed in the files dataset
- abusing share links: bypassing a password, an expiry, or a download limit
- exposing or corrupting the SQLite database
- an unauthenticated request that can take the app down

These are known trade-offs rather than vulnerabilities:

- Without `NAS_CLOUD_TRUST_PROXY=true`, every client shares one rate-limit bucket, because the app can't see real client addresses. See the configuration table in the README.
- The default deployment is plain HTTP on the LAN. Protecting traffic on that network is the job of a TLS reverse proxy.
- Someone with write access to the storage datasets can already change the files there. A report should show the app itself doing something it shouldn't as a result.

## What the app can access

This is what the published image gets when you run it with [`docker/docker-compose.truenas.yml`](docker/docker-compose.truenas.yml). You can check each point in that file or in [`docker/Dockerfile`](docker/Dockerfile).

- **It runs as an ordinary user.** Inside the container it's UID/GID 1001 (`USER nextjs`), with every Linux capability dropped (`cap_drop: ALL`) and `no-new-privileges`, so it can't become root there.
- **It sees two folders on the NAS:** the `files` dataset, mounted at `/mnt/nas-cloud`, and the `appdata` dataset, mounted at `/data`. There's no Docker socket, no host networking, no privileged mode, and no TrueNAS API key or password, so it can't reach other datasets, other apps or TrueNAS itself.
- **It's capped at 2 GB of memory** (`mem_limit: 2g`). A hostile image, video or PDF gets the container restarted, not the NAS.
- **It makes no outbound requests of its own.** There's no telemetry (`NEXT_TELEMETRY_DISABLED=1` is set in the image), no update check and no outside service. ffmpeg and ffprobe run with `-protocol_whitelist file`, so a media file crafted to point at a URL can't make them fetch it. The container isn't network-isolated, though: a compromised image could reach your LAN and the internet.

The worst case, a compromised release or a flaw someone exploits, is that everything in those two datasets can be read, changed or deleted, and sent elsewhere. To limit that:

- Pin a release tag, as the compose file does, and read the release notes before changing it. Don't let an auto-updater follow `:latest` or `:edge`.
- Take recursive ZFS snapshots of the parent `nas-project-cloud` dataset. The container can't touch snapshots, so they survive anything the app does.
- Keep port 3000 off the internet. From outside your network, reach the app through a TLS reverse proxy or a VPN such as Tailscale.

Every published image carries an SPDX software bill of materials and a SLSA provenance record, attached by the GitHub Actions build. The provenance names the Actions run that built the image and the digest of the base image. With Docker installed:

```bash
docker buildx imagetools inspect ghcr.io/jonathanbeck1/nas-project-cloud:0.4.0 --format '{{ json .Provenance.SLSA }}'
```

These records aren't signed, so they document the build rather than prove it. The workflow that builds and publishes every image is [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml).
