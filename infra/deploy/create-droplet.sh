#!/usr/bin/env bash
#
# Create the dontopedia.com droplet via doctl.
# Run locally. Requires `doctl auth init` to have been done.
set -euo pipefail

: "${DO_REGION:=sfo3}"
: "${DO_SIZE:=s-2vcpu-4gb}"
: "${DO_IMAGE:=ubuntu-24-04-x64}"
: "${DO_NAME:=dontopedia-prod}"
: "${DO_SSH_KEY:?set DO_SSH_KEY to the fingerprint of the SSH key you want access with — \`doctl compute ssh-key list\`}"

USER_DATA=$(cat <<'EOF'
#cloud-config
runcmd:
  - [ bash, -lc, "curl -fsSL https://raw.githubusercontent.com/thomasdavis/dontopedia/main/infra/deploy/bootstrap-droplet.sh | bash" ]
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
