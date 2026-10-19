# Running It With Sensitive Data

The app is built to keep outsiders away from your files on a network you trust. Business or client data needs more than that, and some of it has to come from how you set up the NAS rather than from the app. This page covers those parts, in the order they matter, and is plain about what the app doesn't do yet.

## Encrypt the datasets

Files are stored as ordinary files, and the database (`nas-cloud.sqlite`), its daily copies in `appdata/backups/`, and the preview thumbnails in `files/.previews/` are stored unencrypted too. A PDF's thumbnail is a picture of its first page. Anyone holding the drives can read all of it.

ZFS native encryption fixes that. Encrypt the parent `nas-project-cloud` dataset, and its `files` and `appdata` children inherit it. Choose the unlock method by what you're protecting against:

| | Unlocks at boot | Protects against |
| --- | --- | --- |
| **Key** | Automatically. TrueNAS keeps the key in its configuration on the boot drive. | Drives pulled out, sent for repair, or resold. Not a thief who takes the whole NAS, boot drive included. |
| **Passphrase** | No. The datasets stay locked until you unlock them in the TrueNAS UI, and the app can't start until then. | The above, plus a stolen NAS. |

A passphrase can't be used on the pool that holds TrueNAS's own Apps or system dataset. Encrypting only the `nas-project-cloud` dataset avoids that, since the app's data lives there and the app itself doesn't.

**Existing data can't be encrypted in place.** Create a new encrypted dataset and move the data into it:

1. Create the new parent dataset with encryption on (for example `tank/nas-project-cloud-enc`), and inside it `files` and `appdata`.
2. Stop the app, then copy everything across from a TrueNAS shell:

   ```bash
   rsync -aH --numeric-ids /mnt/tank/nas-project-cloud/files/ /mnt/tank/nas-project-cloud-enc/files/
   rsync -aH --numeric-ids /mnt/tank/nas-project-cloud/appdata/ /mnt/tank/nas-project-cloud-enc/appdata/
   ```

3. Give the new datasets the same ownership as before: owner and group `nascloud` (UID/GID 1001), set on the new parent with **Apply recursively**, as in [Permissions](./truenas-scale.md#permissions).
4. Point the app's two volumes at the new paths and start it. Check `/api/health`, sign in, open a few files, and confirm Settings > Storage sync lists nothing missing.
5. Only then snapshot and delete the old unencrypted datasets. Their snapshots hold the same data unencrypted, so delete those too.

**Export the key or keep the passphrase somewhere safe**, such as a password manager or a printed copy off site. Without it the data can't be recovered, from the NAS or from any backup.

## Use HTTPS only

Over plain HTTP, passwords, session cookies and every file cross the network readable. Put the app behind HTTPS, set `NAS_CLOUD_SECURE_COOKIES=true`, and stop using `http://<nas-ip>:3000` directly. [reverse-proxy.md](./reverse-proxy.md) has tested configs. Tailscale Serve is the simplest for reaching the app from your own devices, because nothing is opened to the internet.

## Keep port 3000 off the open network

Even with HTTPS in front, the app's own port answers anyone who can reach it. Limit it with a firewall rule or VLAN so only the proxy, or only trusted devices, can connect. Never forward it from your router. If you set `NAS_CLOUD_TRUST_PROXY=true`, port 3000 must be reachable only from the proxy, as the [TrueNAS guide](./truenas-scale.md#reverse-proxy) explains.

## Decide who gets SMB

**SMB access to the files dataset bypasses everything the app enforces.** It skips sign-in, never shows up in the app's records, and ignores any future per-project permissions. Anyone with the share can read, change and delete every file. Give SMB access only to the owner, and have everyone else use the web app. If someone needs SMB for one folder, make that folder its own dataset and share only it.

## Back up without leaking

- **Snapshots:** keep a recursive periodic snapshot task on the parent dataset, as the [TrueNAS guide](./truenas-scale.md#backups-and-snapshots) describes. Snapshots of an encrypted dataset stay encrypted.
- **Offsite:** a TrueNAS replication task can send encrypted datasets *raw*, so the backup NAS stores data it can't read without your key. After the first run, check that the copy shows as locked on the destination.
- **Cloud:** if you use a Cloud Sync task instead, turn on its remote encryption so the provider only sees encrypted files.

## Accounts and share links

- Use a long, unique password for the owner account, stored in a password manager, and don't share it.
- Sign out on shared computers. The Devices page lists every signed-in device, and removing one ends its session.
- Share links always expire, after 30 days at most. For anything sensitive, set a short expiry, a password and a download limit, and revoke the link when it's no longer needed. A link works for anyone who has it, so send the password separately.

## What the app doesn't do yet

- **One account.** There are no separate user accounts or per-project permissions yet; anyone signed in sees everything.
- **No two-factor login.** A password alone signs in.
- **No audit trail** of who viewed, downloaded, moved or deleted files inside the app. Share-link downloads are the only access that's recorded.
- **No single sign-on (SAML/OIDC)** and **no malware scanning** of uploads.
- **No certification.** It has one maintainer and hasn't had an outside penetration test or compliance audit (SOC 2, HIPAA and the like).

Two-factor login, team accounts with per-project permissions, and an audit log are being added, and this page will change as they land. For regulated data, such as health, financial or legal records, get a professional security review before relying on the app, and check what your obligations require.
