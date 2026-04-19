#!/usr/bin/env bash
#
# Point dontopedia.com at a droplet IP via Cloudflare.
#
# Required env:
#   CF_API_TOKEN   — Cloudflare token with Zone:DNS:Edit scope on the zone
#                    (and Zone:Edit if the zone doesn't exist yet)
#   DROPLET_IP     — the droplet's public IPv4 (script calls doctl if unset)
#
# Optional env:
#   ZONE           — default: dontopedia.com
#   DROPLET_NAME   — default: dontopedia-prod (used to look up the IP)
#   EXTRA_SUBS     — space-separated subdomains that should also point at
#                    the droplet, e.g. "donto temporal grafana".
#                    Default: none — admin UIs stay on localhost.
#   PROXIED        — "true" / "false" (default "false"). If "true", records
#                    are orange-clouded through Cloudflare. Caddy still runs
#                    on the droplet; just set TLS "flexible" at CF or let
#                    Caddy handle origin certs (recommended "off" so LE works
#                    out of the box).
#
# Idempotent: re-running updates records in place.
set -euo pipefail

: "${CF_API_TOKEN:?set CF_API_TOKEN to a Cloudflare API token (Zone:DNS:Edit)}"

ZONE="${ZONE:-dontopedia.com}"
DROPLET_NAME="${DROPLET_NAME:-dontopedia-prod}"
PROXIED="${PROXIED:-false}"

if [ -z "${DROPLET_IP:-}" ]; then
  DROPLET_IP=$(doctl compute droplet list \
    --format Name,PublicIPv4 --no-header \
    | awk -v n="$DROPLET_NAME" '$1==n{print $2; exit}')
  if [ -z "$DROPLET_IP" ]; then
    echo "couldn't find a droplet named $DROPLET_NAME via doctl"
    echo "pass DROPLET_IP=… or run bash infra/deploy/create-droplet.sh first"
    exit 1
  fi
fi

echo "[cf] zone=$ZONE ip=$DROPLET_IP proxied=$PROXIED"

api() {
  local method="$1"; shift
  local path="$1"; shift
  curl -fsS -X "$method" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4$path" \
    "$@"
}

zone_id=$(api GET "/zones?name=$ZONE" | jq -r '.result[0].id // empty')
if [ -z "$zone_id" ]; then
  echo "[cf] zone $ZONE not found — create it at https://dash.cloudflare.com first"
  echo "      (and set the registrar's nameservers to whatever CF assigns)"
  exit 1
fi
echo "[cf] zone_id=$zone_id"

upsert() {
  local name="$1" type="$2" value="$3"
  local fqdn
  if [ "$name" = "@" ]; then fqdn="$ZONE"; else fqdn="$name.$ZONE"; fi

  local existing
  existing=$(api GET "/zones/$zone_id/dns_records?type=$type&name=$fqdn" \
              | jq -r '.result[0].id // empty')

  local body
  body=$(jq -nc --arg t "$type" --arg n "$fqdn" --arg c "$value" \
                --argjson p "$PROXIED" \
                '{type:$t, name:$n, content:$c, ttl:300, proxied:$p}')

  if [ -n "$existing" ]; then
    api PUT "/zones/$zone_id/dns_records/$existing" --data "$body" >/dev/null
    echo "  updated $type $fqdn -> $value"
  else
    api POST "/zones/$zone_id/dns_records" --data "$body" >/dev/null
    echo "  created $type $fqdn -> $value"
  fi
}

# Required: apex + www
upsert "@"   A "$DROPLET_IP"
upsert "www" A "$DROPLET_IP"

# Optional subdomains (admin UIs). Only created if EXTRA_SUBS is set.
for sub in ${EXTRA_SUBS:-}; do
  upsert "$sub" A "$DROPLET_IP"
done

# Constrain which CA can issue — Let's Encrypt (Caddy) only.
upsert_txt_caa() {
  # CAA has type "CAA" and its data is a compound blob; reuse the generic
  # upsert but with a CAA-shaped body.
  local name="$1" flags="$2" tag="$3" value="$4"
  local fqdn
  if [ "$name" = "@" ]; then fqdn="$ZONE"; else fqdn="$name.$ZONE"; fi

  local existing
  existing=$(api GET "/zones/$zone_id/dns_records?type=CAA&name=$fqdn" \
              | jq -r --arg tag "$tag" '.result[] | select(.data.tag==$tag) | .id' | head -1)

  local body
  body=$(jq -nc --arg n "$fqdn" --argjson f "$flags" --arg t "$tag" --arg v "$value" \
                '{type:"CAA", name:$n, ttl:300, data:{flags:$f, tag:$t, value:$v}}')

  if [ -n "$existing" ]; then
    api PUT "/zones/$zone_id/dns_records/$existing" --data "$body" >/dev/null
    echo "  updated CAA $fqdn $tag=$value"
  else
    api POST "/zones/$zone_id/dns_records" --data "$body" >/dev/null
    echo "  created CAA $fqdn $tag=$value"
  fi
}
upsert_txt_caa "@" 0 issue     "letsencrypt.org"
upsert_txt_caa "@" 0 issuewild "letsencrypt.org"

echo "[cf] done. Propagation is typically <1 min at CF but registrar NS may take longer."
echo "[cf] verify: dig +short A $ZONE  →  $DROPLET_IP"
