# DNS setup for dontopedia.com

The live domain is currently delegated to **Cloudflare** nameservers:

```bash
dig NS dontopedia.com +short
# edna.ns.cloudflare.com.
# jim.ns.cloudflare.com.
```

That means the DigitalOcean DNS zone in this repo is currently **non-authoritative**
from the public internet. `infra/deploy/do-dns.sh` can still seed or mirror records
in DO, but those records do nothing until the registrar is repointed to
`ns1.digitalocean.com/ns2.digitalocean.com/ns3.digitalocean.com`.

Today, production works with:

- Cloudflare proxying `dontopedia.com` / `www.dontopedia.com`
- Cloudflare SSL mode compatible with the `infra/compose/Caddyfile` origin
- Caddy speaking plain HTTP on port 80 to the Cloudflare edge

If you want the older DO-only / Caddy auto-TLS setup instead, you must do both:

1. Repoint the registrar nameservers to DigitalOcean.
2. Revert `infra/compose/Caddyfile` back to named hosts with automatic HTTPS.

## Current authoritative DNS

Update these records in **Cloudflare DNS**, not DigitalOcean DNS:

| Type | Host | Value |
|------|------|-------|
| A | `@` | `64.227.103.33` |
| A | `www` | `64.227.103.33` |

The matching DO zone can be kept in sync as a standby copy, but it is not live
until the registrar delegation changes.

## If you switch back to DigitalOcean DNS

At whichever registrar owns dontopedia.com (Namecheap / Porkbun / DO itself
/ …), set the nameservers to:

```
ns1.digitalocean.com
ns2.digitalocean.com
ns3.digitalocean.com
```

Propagation is 5–30 minutes. Until this is done, DNS changes made via
`doctl` won't resolve from the outside world.

## Records that actually get created

Run by `infra/deploy/do-dns.sh` against the zone on DO's side:

| Type | Host                | Value       | Created by                          |
|------|---------------------|-------------|-------------------------------------|
| A    | `dontopedia.com`    | droplet IP  | `doctl compute domain create` (apex) |
| A    | `www.dontopedia.com`| droplet IP  | `doctl compute domain records create` |
| A    | `<sub>.dontopedia.com` | droplet IP | one per `EXTRA_SUBS` entry          |
| CAA  | `dontopedia.com`    | `0 issue "letsencrypt.org"` | CA lock-in for Caddy |
| CAA  | `dontopedia.com`    | `0 issuewild "letsencrypt.org"` | ditto for wildcards |

Those records are sufficient only if the registrar is actually pointed at
DigitalOcean and Caddy is running the auto-HTTPS config.

## What you do NOT need

- **MX / SPF / DKIM / DMARC** — Dontopedia sends and receives no email.
- **AAAA** — fine to add if the droplet has IPv6; not required.

## Optional subdomain split-out

The compose stack keeps the admin services bound to `127.0.0.1:*` on the
droplet by default (Grafana :3001, Temporal UI :8233, agent-runner :4001,
dontosrv dev port :7878). If you want any of them externally reachable,
set `EXTRA_SUBS`:

```bash
EXTRA_SUBS="grafana" bash infra/deploy/do-dns.sh
```

Then uncomment the matching block at the bottom of `infra/compose/Caddyfile`
and `docker compose up -d caddy`. Caddy grabs a cert for the new name.

**Security note:** dontosrv has no auth built in — if you publish
`donto.dontopedia.com`, wrap it in Caddy basicauth or a VPN. Grafana has
its own password (`GRAFANA_PASSWORD` env); Temporal UI has no auth.

## Verifying

```bash
# public delegation:
dig NS dontopedia.com +short

# public site:
curl -I https://dontopedia.com    # HTTP/2 200

# origin bypassing Cloudflare:
curl -I http://64.227.103.33 -H 'Host: dontopedia.com'  # HTTP/1.1 200
```

## Caddy reloads

If you change `infra/compose/Caddyfile`, recreate only the `caddy` service:

```bash
cd /srv/dontopedia/infra/compose
docker compose --env-file ../../.env up -d --no-deps --force-recreate caddy
```

This repo mounts the whole compose directory into `/etc/caddy` so git-driven
file replacements stay visible to new containers.
