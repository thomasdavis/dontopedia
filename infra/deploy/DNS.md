# DNS setup for dontopedia.com

All DNS lives at whatever registrar/provider you already use. Dontopedia
ships with Caddy, which grabs Let's Encrypt certs automatically once the
records below resolve to the droplet.

## The only records you need (required)

Assuming the droplet's public IPv4 is `$IP` (IPv6 is `$IP6` if the droplet
has one — optional but recommended).

| Type  | Host                | Value | TTL  | Why                                         |
|-------|---------------------|-------|------|---------------------------------------------|
| A     | `dontopedia.com`    | `$IP` | 300  | Apex → the droplet                          |
| A     | `www.dontopedia.com`| `$IP` | 300  | `www` canonical → same droplet, Caddy redir |
| AAAA  | `dontopedia.com`    | `$IP6`| 300  | (optional) v6 for the apex                  |
| AAAA  | `www.dontopedia.com`| `$IP6`| 300  | (optional) v6 for www                       |

That's it for getting the site up. Once these resolve and you bring up
`docker compose up -d caddy`, Caddy's ACME client requests certs within
~30 seconds.

## Optional subdomain split-out

The compose stack keeps the admin services bound to `127.0.0.1:*` on the
droplet by default (Grafana on `:3001`, Temporal UI on `:8233`, agent-runner
on `:4001`, dontosrv dev port on `:7878`). If you want them reachable
externally under their own names (still authenticated), add A records:

| Type | Host                      | Value | Why                                    |
|------|---------------------------|-------|----------------------------------------|
| A    | `donto.dontopedia.com`    | `$IP` | exposes dontosrv read API publicly     |
| A    | `temporal.dontopedia.com` | `$IP` | exposes Temporal UI publicly           |
| A    | `grafana.dontopedia.com`  | `$IP` | exposes Grafana login publicly         |

Then uncomment the matching blocks at the bottom of
`infra/compose/Caddyfile` and `docker compose up -d caddy` again. Caddy
grabs individual certs per name; no extra config beyond that.

**Security note:** the dontosrv HTTP surface has no auth built in — if you
publish `donto.dontopedia.com`, add a Caddy `basicauth` directive or put
it behind a private VPN. Grafana has its own password (`GRAFANA_PASSWORD`
env); Temporal UI has nothing by default.

## CAA (optional, recommended)

Restricts which CAs can issue for the apex. Let's Encrypt only:

| Type | Host             | Value                        |
|------|------------------|------------------------------|
| CAA  | `dontopedia.com` | `0 issue "letsencrypt.org"`  |
| CAA  | `dontopedia.com` | `0 issuewild "letsencrypt.org"` |

## What you do NOT need

- **MX** — Dontopedia sends and receives no email.
- **SPF / DKIM / DMARC** — same reason.
- **TXT verification records** for Google Search Console, etc. — cosmetic,
  add only if you care about SEO tooling.

## Using DigitalOcean DNS (optional)

If dontopedia.com's nameservers point at DO, use `doctl` to script the
records. Replace `$IP` with the droplet's public IPv4:

```bash
IP=$(doctl compute droplet list --format PublicIPv4 --no-header \
     | grep -v '^$' | head -1)

doctl compute domain create dontopedia.com --ip-address "$IP"
# ^ creates the zone and an apex A record in one shot

doctl compute domain records create dontopedia.com \
     --record-type A   --record-name www   --record-data "$IP" --record-ttl 300

# Optional subdomains:
for h in donto temporal grafana; do
  doctl compute domain records create dontopedia.com \
       --record-type A --record-name "$h" --record-data "$IP" --record-ttl 300
done

# Optional CAA:
doctl compute domain records create dontopedia.com \
     --record-type CAA --record-name @ --record-data '0 issue "letsencrypt.org"'
doctl compute domain records create dontopedia.com \
     --record-type CAA --record-name @ --record-data '0 issuewild "letsencrypt.org"'
```

## Registrar-side checklist

At your registrar (Namecheap / GoDaddy / Cloudflare / DO itself / …):

1. Set the nameservers to whoever is actually serving DNS.
   - DigitalOcean DNS: `ns1.digitalocean.com`, `ns2.digitalocean.com`,
     `ns3.digitalocean.com`.
2. Make sure DNSSEC is either fully configured at both registrar and DNS
   host, or turned off at both. Mismatched DNSSEC will just stop the
   domain resolving.

## Verifying

```bash
# After setting the records:
dig +short A dontopedia.com       # → $IP
dig +short A www.dontopedia.com   # → $IP
curl -I https://dontopedia.com    # once Caddy has the cert, HTTP/2 200
```

If `curl` is still returning 404/502 but DNS resolves, the stack isn't up
yet — `docker compose ps` and `docker compose logs caddy` will tell you.
