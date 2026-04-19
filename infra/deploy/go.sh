#!/usr/bin/env bash
#
# One-command deploy: create droplet, wait for cloud-init, point DNS, print
# URL. Idempotent enough to re-run for DNS changes, but droplet creation
# only happens once.
#
# Required env (or positional prompts at the top):
#   DO_SSH_KEY     — fingerprint from `doctl compute ssh-key list`
#   CF_API_TOKEN   — Cloudflare API token with DNS:Edit on dontopedia.com
#
# Optional env:
#   DO_REGION      — default sfo3
#   DO_SIZE        — default s-2vcpu-4gb ($24/mo)
#   EXTRA_SUBS     — extra subdomains to wire (e.g. "donto grafana")
#
set -euo pipefail

: "${DO_SSH_KEY:?set DO_SSH_KEY to the fingerprint of an SSH key}"
: "${CF_API_TOKEN:?set CF_API_TOKEN to a Cloudflare token (Zone:DNS:Edit)}"

HERE="$(cd "$(dirname "$0")" && pwd)"

echo "[go] ensuring droplet"
DO_REGION="${DO_REGION:-sfo3}" \
DO_SIZE="${DO_SIZE:-s-2vcpu-4gb}" \
DO_SSH_KEY="$DO_SSH_KEY" \
  bash "$HERE/create-droplet.sh" || echo "[go] droplet probably already exists — continuing"

echo "[go] waiting for droplet to have an IP"
for i in $(seq 1 60); do
  IP=$(doctl compute droplet list --format Name,PublicIPv4 --no-header \
       | awk '$1=="dontopedia-prod"{print $2; exit}')
  if [ -n "${IP:-}" ] && [ "$IP" != "0.0.0.0" ]; then
    echo "[go] IP: $IP"
    break
  fi
  sleep 2
done
: "${IP:?droplet never got an IP}"

echo "[go] pointing DNS at $IP"
DROPLET_IP="$IP" CF_API_TOKEN="$CF_API_TOKEN" \
  EXTRA_SUBS="${EXTRA_SUBS:-}" \
  bash "$HERE/cf-dns.sh"

cat <<EOF

[go] all set.

  dontopedia.com     → $IP   (via Cloudflare)
  www.dontopedia.com → $IP

The cloud-init bootstrap is installing Docker, cloning repos, and setting
up the firewall on the droplet. That takes ~3–5 minutes. Watch it live:

  ssh root@$IP "tail -f /var/log/cloud-init-output.log"

Once it's done, SSH in and fill /srv/dontopedia/.env (OPENAI_API_KEY,
ANTHROPIC_API_KEY, BACKUP S3_*), then:

  cd /srv/dontopedia/infra/compose
  docker compose --env-file ../../.env up -d --build

Caddy will grab a Let's Encrypt cert within ~30s of DNS propagating.

EOF
