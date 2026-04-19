# DNS setup for dontopedia.com

Dontopedia uses **DigitalOcean DNS** — the same account `doctl` is authed
against owns the zone and the droplet, so `infra/deploy/do-dns.sh` (and
the `go.sh` wrapper) handles the whole thing from one CLI. No Cloudflare
API tokens, no separate providers.

## One-time registrar step (manual — we can't do this for you)

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

That's everything the site needs. Caddy grabs Let's Encrypt certs within
~30s of DNS resolving.

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
# after registrar NS change has propagated:
dig +short A dontopedia.com       # → droplet IP
dig +short A www.dontopedia.com   # → droplet IP
curl -I https://dontopedia.com    # once Caddy has the cert, HTTP/2 200
```
