# HTTPS And Reverse Proxies

Out of the box the app serves plain HTTP on port 3000. On a trusted home network that's a reasonable trade-off, but your password, session cookie and every file cross the network unencrypted. Put a TLS reverse proxy in front before using the app from anywhere else, and never forward port 3000 from your router to the internet.

Pick one:

| Option | Best for | Tested here |
| --- | --- | --- |
| [Tailscale Serve](#tailscale-serve) | Reaching the app from your own devices anywhere, with no open ports | No, based on Tailscale's docs |
| [Caddy](#caddy) | A proxy you run yourself, with automatic certificates | Yes, Caddy 2.11 |
| [Nginx](#nginx) or [Nginx Proxy Manager](#nginx-proxy-manager) | An nginx you already run, or the NPM app from the TrueNAS catalog | Nginx 1.31 yes, NPM no |
| [Traefik](#traefik) | A Traefik you already run | No, based on Traefik's docs |
| [Cloudflare Tunnel](#cloudflare-tunnel) | Public access without opening ports | No, based on Cloudflare's docs |

## What every setup needs

- **A whole hostname**, such as `https://cloud.home.example`, proxied to `http://<nas-ip>:3000`. The app doesn't support running under a path prefix like `/cloud`.
- **A request body limit of at least 64 MiB.** Browsers send files up to 64 MiB in one request and larger files in 8 MiB chunks, and the app refuses any chunk over 32 MiB, so no single request is bigger than that. A 100 MB limit is comfortable. The 2 GiB `NAS_CLOUD_MAX_UPLOAD_BYTES` limit applies to the whole file, not to any one request.
- **A read timeout of a few minutes.** A 64 MiB request from a phone on a slow uplink can take longer than a minute to arrive, and finishing a large upload hashes the whole file before the app replies.
- **No response buffering**, so large downloads stream to the browser instead of spooling on the proxy first.

Then set two environment variables on the app, and restart it:

- `NAS_CLOUD_SECURE_COOKIES=true` once every browser reaches the app over HTTPS. Browsers drop `Secure` cookies over plain HTTP, so leave it off if you still also use `http://<nas-ip>:3000` on the LAN, or login there stops working.
- `NAS_CLOUD_TRUST_PROXY=true` only when port 3000 can't be reached except through the proxy. The app then rate-limits login per client and records real client addresses in share access history. If port 3000 is still open on the LAN, leave it off: any device could send its own `X-Forwarded-For` header. The [TrueNAS guide](./truenas-scale.md#reverse-proxy) has the full conditions.

## Tailscale Serve

Tailscale gives each device a private address on your tailnet, and Serve puts an HTTPS certificate in front of a local port. Nothing is opened to the internet, and only devices signed in to your tailnet can connect.

1. In the Tailscale admin console, enable MagicDNS and HTTPS certificates.
2. Run Tailscale on the NAS itself. Serve can only proxy to `127.0.0.1`, so it has to be on the same host as the app's published port 3000. On TrueNAS, that means the Tailscale app from the catalog with host networking on.
3. From a shell inside that Tailscale app, run:

   ```bash
   tailscale serve --bg 3000
   ```

The app is then at `https://<nas-name>.<your-tailnet>.ts.net`. Keep `NAS_CLOUD_TRUST_PROXY` off, since port 3000 stays reachable on the LAN.

## Caddy

Caddy gets and renews certificates by itself and has no request body limit or request buffering by default, so the whole config is:

```caddy
cloud.home.example {
	reverse_proxy <nas-ip>:3000
}
```

For a public domain, Caddy uses Let's Encrypt and needs ports 80 and 443 to reach it. For a name that only exists on your LAN, add `tls internal` inside the block. Caddy then signs its own certificate, and each device has to trust Caddy's root certificate once (`caddy trust` on the machine running Caddy, then install that root on your other devices).

## Nginx

```nginx
server {
    listen 443 ssl;
    server_name cloud.home.example;

    ssl_certificate     /etc/ssl/cloud.home.example/fullchain.pem;
    ssl_certificate_key /etc/ssl/cloud.home.example/privkey.pem;

    client_max_body_size 100m;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    location / {
        proxy_pass http://<nas-ip>:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Stock nginx allows 1 MiB request bodies, so without `client_max_body_size` every upload over 1 MiB, including each 8 MiB chunk, fails with `413 Request Entity Too Large`.

## Nginx Proxy Manager

Nginx Proxy Manager is in the TrueNAS app catalog. Add a proxy host:

- **Details:** your domain name, scheme `http`, forward hostname or IP `<nas-ip>`, forward port `3000`.
- **SSL:** request a Let's Encrypt certificate and turn on Force SSL.
- **Advanced:** paste

  ```nginx
  client_max_body_size 100m;
  proxy_request_buffering off;
  proxy_buffering off;
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
  ```

## Traefik

Since Traefik v2.11.2 an entry point's `readTimeout` defaults to 60 seconds, and it covers reading the whole request body, so a slow upload gets cut off. Raise it on the HTTPS entry point:

```yaml
# traefik static configuration
entryPoints:
  websecure:
    address: ":443"
    transport:
      respondingTimeouts:
        readTimeout: 600s
```

With Docker labels on the app's container:

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.nas-cloud.rule=Host(`cloud.home.example`)
  - traefik.http.routers.nas-cloud.entrypoints=websecure
  - traefik.http.routers.nas-cloud.tls.certresolver=<your-resolver>
  - traefik.http.services.nas-cloud.loadbalancer.server.port=3000
```

Traefik has no request body limit unless you add the buffering middleware; don't add it for this app.

## Cloudflare Tunnel

A tunnel publishes the app on your Cloudflare domain without opening ports. Point a public hostname at `http://<nas-ip>:3000`. Two limits to know:

- Cloudflare's Free and Pro plans refuse request bodies over 100 MB. The app never sends more than 64 MiB in one request, so uploads of any size work.
- Cloudflare ends a request that gets no response within about 100 seconds. That's only a concern when finishing a very large upload on slow disks.

Cloudflare terminates TLS on its own servers, so it can see your files in transit. If that matters to you, use Tailscale or your own proxy instead.

## Check it

1. Open `https://<your-hostname>/api/health`. It should return `"ok": true`.
2. Sign in, then upload one file smaller than 64 MiB and one larger. The large one is sent in chunks, which exercises the body limit and timeouts.
3. Download the large file back.

A `413` in the browser's network panel means the proxy's body limit is too low. An upload that fails after about a minute means a read timeout.
