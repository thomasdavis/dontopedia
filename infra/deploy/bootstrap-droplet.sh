#!/usr/bin/env bash
#
# Bootstrap a fresh Ubuntu 24.04 DigitalOcean droplet for Dontopedia.
# Idempotent-ish: safe to re-run, but it will update packages every time.
#
# Usage (from the droplet or via cloud-init):
#   curl -fsSL <url>/bootstrap-droplet.sh | bash
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

log "installing claude code cli"
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

log "creating .env (fill in keys, then up)"
if [ ! -f /srv/dontopedia/.env ]; then
  cp /srv/dontopedia/.env.example /srv/dontopedia/.env
fi

log "done"
cat <<EOF

Next steps (run on the droplet):

  # 1. Fill in secrets
  nano /srv/dontopedia/.env

  # 2. OAuth the claude CLI (interactive)
  claude login

  # 3. Bring the stack up
  cd /srv/dontopedia/infra/compose
  docker compose --env-file ../../.env up -d --build

  # 4. Point DNS (A record: dontopedia.com -> droplet IP)
  #    Caddy will grab a cert automatically.

EOF
