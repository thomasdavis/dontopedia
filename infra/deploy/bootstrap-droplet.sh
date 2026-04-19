#!/usr/bin/env bash
#
# Bootstrap a fresh Ubuntu 24.04 DigitalOcean droplet for Dontopedia.
# Called from cloud-init. Idempotent — safe to re-run.
#
# Secrets baked in at droplet-create time via user-data (create-droplet.sh
# substitutes them before this script runs):
#   DONTOPEDIA_OPENAI_API_KEY   — seeded into /srv/dontopedia/.env
#
# Everything else the operator fills in afterwards (claude login via OAuth;
# any S3 backup creds if wanted).
set -euo pipefail

log() { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }

log "installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw git

log "installing docker"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

log "installing node + claude code cli (for interactive login on host)"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g @anthropic-ai/claude-code

log "firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

log "cloning repos"
mkdir -p /srv/dontopedia /srv/donto
if [ ! -d /srv/dontopedia/.git ]; then
  git clone https://github.com/thomasdavis/dontopedia.git /srv/dontopedia
fi
if [ ! -d /srv/donto/.git ]; then
  git clone https://github.com/thomasdavis/donto.git /srv/donto
fi

log "seeding /srv/dontopedia/.env"
if [ ! -f /srv/dontopedia/.env ]; then
  cp /srv/dontopedia/.env.example /srv/dontopedia/.env
fi
# Only overwrite OPENAI_API_KEY if a value was baked in at create-droplet time.
if [ -n "${DONTOPEDIA_OPENAI_API_KEY:-}" ]; then
  sed -i -e "s#^OPENAI_API_KEY=.*#OPENAI_API_KEY=${DONTOPEDIA_OPENAI_API_KEY}#" \
         /srv/dontopedia/.env
fi
# Production public URL.
sed -i -e 's#^NEXT_PUBLIC_SITE_URL=.*#NEXT_PUBLIC_SITE_URL=https://dontopedia.com#' \
       /srv/dontopedia/.env

log "bringing up postgres + dontosrv + temporal + web + caddy + obs + backups"
cd /srv/dontopedia/infra/compose
# Worker intentionally started last — it relies on claude login having run,
# and we want the rest of the stack hot so the operator can log in and see
# the site already responding before they OAuth Claude.
docker compose --env-file ../../.env up -d --build \
  postgres dontosrv temporal temporal-ui web caddy loki promtail grafana backups agent-runner

log "done"
cat <<'EOF'

[bootstrap] next steps (interactive — you do these on the droplet):

  # 1. Auth Claude Code (browser OAuth, one-time):
  claude login

  # 2. Start the worker now that Claude is authed:
  cd /srv/dontopedia/infra/compose
  docker compose --env-file ../../.env up -d --build worker

  # 3. Verify:
  docker compose ps
  curl -I https://dontopedia.com   # 200 once public DNS / edge are correct
  curl -I http://64.227.103.33 -H 'Host: dontopedia.com'  # origin check

EOF
