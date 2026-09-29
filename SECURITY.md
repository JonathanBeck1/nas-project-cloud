# Security policy

## Supported versions

Security fixes land in the newest release line and ship as a patch release. Please check that the problem still exists on the latest image tag before reporting.

| Version | Supported |
| --- | --- |
| Latest release line (currently 0.3.x) | Yes |
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
