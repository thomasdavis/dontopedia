#!/usr/bin/env bash
#
# Create the dontopedia.com droplet via doctl.
# Run locally. Requires `doctl auth init` to have been done.
#
# Env:
#   DO_SSH_KEY           — fingerprint from `doctl compute ssh-key list`
#   DONTOPEDIA_OPENAI_API_KEY  — (optional) baked into /srv/dontopedia/.env by bootstrap
#   DO_REGION, DO_SIZE, DO_NAME, DO_IMAGE — tuning knobs
set -euo pipefail

: "${DO_REGION:=sfo3}"
: "${DO_SIZE:=s-2vcpu-4gb}"
: "${DO_IMAGE:=ubuntu-24-04-x64}"
: "${DO_NAME:=dontopedia-prod}"
: "${DO_SSH_KEY:?set DO_SSH_KEY to the fingerprint of the SSH key you want access with}"

# The secret is expanded into cloud-init write_files so it reaches the
# droplet once. It never appears in the DO control-plane UI beyond this
# initial write; delete /etc/dontopedia-bootstrap.env after bootstrap
# if you care about zeroing it.
OPENAI_VAL="${DONTOPEDIA_OPENAI_API_KEY:-}"

USER_DATA=$(cat <<EOF
#cloud-config
write_files:
  - path: /etc/dontopedia-bootstrap.env
    owner: root:root
    permissions: '0600'
    content: |
      DONTOPEDIA_OPENAI_API_KEY=${OPENAI_VAL}
runcmd:
  - [ bash, -lc, "set -a && . /etc/dontopedia-bootstrap.env && set +a && curl -fsSL https://raw.githubusercontent.com/thomasdavis/dontopedia/master/infra/deploy/bootstrap-droplet.sh | bash" ]
EOF
)

doctl compute droplet create "$DO_NAME" \
  --region "$DO_REGION" \
  --size "$DO_SIZE" \
  --image "$DO_IMAGE" \
  --ssh-keys "$DO_SSH_KEY" \
  --user-data "$USER_DATA" \
  --enable-monitoring \
  --enable-backups \
  --tag-names "dontopedia,prod" \
  --wait \
  --format ID,Name,PublicIPv4,Status
