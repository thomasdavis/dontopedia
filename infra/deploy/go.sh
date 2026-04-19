#!/usr/bin/env bash
#
# One-command deploy: create droplet, wait for cloud-init, point DO DNS,
# print the `claude login` + compose-up instructions.
#
# Required env:
#   DO_SSH_KEY                 — fingerprint from `doctl compute ssh-key list`
#
# Optional env:
#   DONTOPEDIA_OPENAI_API_KEY  — baked into /srv/dontopedia/.env by the droplet
#   DO_REGION                  — default sfo3
#   DO_SIZE                    — default s-2vcpu-4gb (~$24/mo)
#   EXTRA_SUBS                 — extra subdomains to wire (e.g. "grafana")
#   ZONE                       — default dontopedia.com
#
set -euo pipefail

: "${DO_SSH_KEY:?set DO_SSH_KEY to an SSH key fingerprint in your DO account}"

HERE="$(cd "$(dirname "$0")" && pwd)"
ZONE="${ZONE:-dontopedia.com}"

echo "[go] ensuring droplet"
DO_REGION="${DO_REGION:-sfo3}" \
DO_SIZE="${DO_SIZE:-s-2vcpu-4gb}" \
DO_SSH_KEY="$DO_SSH_KEY" \
DONTOPEDIA_OPENAI_API_KEY="${DONTOPEDIA_OPENAI_API_KEY:-}" \
  bash "$HERE/create-droplet.sh" || echo "[go] droplet probably already exists — continuing"

echo "[go] waiting for droplet to have an IP"
IP=""
for _ in $(seq 1 60); do
  IP=$(doctl compute droplet list --format Name,PublicIPv4 --no-header \
       | awk '$1=="dontopedia-prod"{print $2; exit}' || true)
  if [ -n "${IP:-}" ] && [ "$IP" != "0.0.0.0" ]; then
    echo "[go] IP: $IP"
    break
  fi
  sleep 2
done
: "${IP:?droplet never got an IP}"

echo "[go] pointing DNS at $IP (DigitalOcean DNS)"
DROPLET_IP="$IP" EXTRA_SUBS="${EXTRA_SUBS:-}" ZONE="$ZONE" \
  bash "$HERE/do-dns.sh"

cat <<EOF

[go] droplet up. DO DNS set.

  $ZONE       → $IP
  www.$ZONE   → $IP

Registrar: make sure the nameservers for $ZONE are pointed at
  ns1.digitalocean.com / ns2.digitalocean.com / ns3.digitalocean.com
Propagation: 5–30 min after the NS change.

Cloud-init is bringing up Docker + the whole stack (everything except the
Temporal worker, which waits on Claude auth). Takes ~5–8 min. Watch live:

  ssh root@$IP "tail -f /var/log/cloud-init-output.log"

When the bootstrap finishes (you'll see the next-steps block at the tail),
SSH in and:

  # 1. Auth Claude Code (browser OAuth, one-time):
  ssh root@$IP
  claude login

  # 2. Start the worker:
  cd /srv/dontopedia/infra/compose
  docker compose --env-file ../../.env up -d --build worker

  # 3. Verify:
  docker compose ps
  curl -I https://$ZONE   # 200 once DNS + cert are settled

EOF
