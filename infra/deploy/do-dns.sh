#!/usr/bin/env bash
#
# Point dontopedia.com at a droplet IP via DigitalOcean DNS.
#
# Required env:
#   DROPLET_IP     — the droplet's public IPv4 (script calls doctl if unset)
#
# Optional env:
#   ZONE           — default: dontopedia.com
#   DROPLET_NAME   — default: dontopedia-prod
#   EXTRA_SUBS     — space-separated subdomains to also point at the droplet,
#                    e.g. "donto temporal grafana". Default: none.
#
# Prereqs at the *registrar* (one-time, manual):
#   Set nameservers for dontopedia.com to:
#     ns1.digitalocean.com
#     ns2.digitalocean.com
#     ns3.digitalocean.com
#   Propagation takes 5–30 minutes. Until that's done, dig won't resolve
#   no matter what records you create here.
#
# Idempotent: safe to re-run; existing records are updated in place.
set -euo pipefail

ZONE="${ZONE:-dontopedia.com}"
DROPLET_NAME="${DROPLET_NAME:-dontopedia-prod}"

if [ -z "${DROPLET_IP:-}" ]; then
  DROPLET_IP=$(doctl compute droplet list \
    --format Name,PublicIPv4 --no-header \
    | awk -v n="$DROPLET_NAME" '$1==n{print $2; exit}')
  if [ -z "$DROPLET_IP" ] || [ "$DROPLET_IP" = "0.0.0.0" ]; then
    echo "[dns] couldn't find a droplet named $DROPLET_NAME via doctl"
    exit 1
  fi
fi

echo "[dns] zone=$ZONE ip=$DROPLET_IP"

# Ensure the zone exists (creates apex A record in the same call).
if ! doctl compute domain list --format Domain --no-header | grep -qx "$ZONE"; then
  echo "[dns] creating zone $ZONE (this also sets the apex A record)"
  doctl compute domain create "$ZONE" --ip-address "$DROPLET_IP" >/dev/null
else
  echo "[dns] zone $ZONE already exists — updating records"
fi

# Helper: upsert an A record for <name>.<ZONE> (or the apex when name=@).
upsert_a() {
  local name="$1" value="$2"

  # Find existing record id, if any. For the apex the API uses name "@".
  local id
  id=$(doctl compute domain records list "$ZONE" \
        --format ID,Type,Name --no-header \
      | awk -v n="$name" '$2=="A" && $3==n {print $1; exit}')

  if [ -n "$id" ]; then
    doctl compute domain records update "$ZONE" --record-id "$id" \
      --record-data "$value" --record-ttl 300 >/dev/null
    echo "  updated A $name.$ZONE -> $value"
  else
    doctl compute domain records create "$ZONE" \
      --record-type A --record-name "$name" \
      --record-data "$value" --record-ttl 300 >/dev/null
    echo "  created A $name.$ZONE -> $value"
  fi
}

# Helper: upsert a CAA record (type + tag uniquely identifies).
upsert_caa() {
  local name="$1" flags="$2" tag="$3" value="$4"

  local id
  id=$(doctl compute domain records list "$ZONE" \
        --format ID,Type,Name,Tag --no-header \
      | awk -v n="$name" -v t="$tag" '$2=="CAA" && $3==n && $4==t {print $1; exit}')

  if [ -n "$id" ]; then
    doctl compute domain records update "$ZONE" --record-id "$id" \
      --record-flags "$flags" --record-tag "$tag" --record-data "$value" \
      --record-ttl 300 >/dev/null
    echo "  updated CAA $name $tag=$value"
  else
    doctl compute domain records create "$ZONE" \
      --record-type CAA --record-name "$name" \
      --record-flags "$flags" --record-tag "$tag" \
      --record-data "$value" --record-ttl 300 >/dev/null
    echo "  created CAA $name $tag=$value"
  fi
}

# Apex A is set by `domain create`. Re-upsert it so re-runs fix drift.
upsert_a "@"   "$DROPLET_IP"
upsert_a "www" "$DROPLET_IP"

for sub in ${EXTRA_SUBS:-}; do
  upsert_a "$sub" "$DROPLET_IP"
done

# Constrain which CA can issue — Let's Encrypt only (Caddy).
upsert_caa "@" 0 issue     "letsencrypt.org"
upsert_caa "@" 0 issuewild "letsencrypt.org"

echo "[dns] done."
echo "[dns] verify once registrar NS propagates:"
echo "      dig +short A $ZONE  →  $DROPLET_IP"
