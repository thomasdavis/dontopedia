#!/bin/sh
# Copy host-mounted Codex auth into the sandbox user's home, then drop to that
# uid and run `codex --search exec --yolo`. The worker only wants the final
# message transcript, so this wrapper captures Codex's noisy progress output
# and prints only the last assistant message on success.
set -eu

mkdir -p /home/codex/.codex

if [ -f /creds/.codex/auth.json ]; then
  cp /creds/.codex/auth.json /home/codex/.codex/auth.json
fi
if [ -f /creds/.codex/config.toml ]; then
  cp /creds/.codex/config.toml /home/codex/.codex/config.toml
fi
if [ -f /creds/.codex/installation_id ]; then
  cp /creds/.codex/installation_id /home/codex/.codex/installation_id
fi

chown -R codex:codex /home/codex
chmod 0600 /home/codex/.codex/auth.json 2>/dev/null || true
chmod 0600 /home/codex/.codex/config.toml 2>/dev/null || true

out_file=/tmp/codex-last-message.txt
json_file=/tmp/codex-events.jsonl
err_file=/tmp/codex-stderr.log

set +e
su-exec codex env HOME=/home/codex codex \
  --search \
  exec \
  --yolo \
  --skip-git-repo-check \
  --color never \
  --json \
  --output-last-message "$out_file" \
  "$@" >"$json_file" 2>"$err_file"
status=$?
set -e

if [ "$status" -ne 0 ]; then
  cat "$err_file" >&2 2>/dev/null || true
  cat "$json_file" >&2 2>/dev/null || true
  exit "$status"
fi

if [ ! -s "$out_file" ]; then
  echo "codex did not write a final message" >&2
  cat "$err_file" >&2 2>/dev/null || true
  cat "$json_file" >&2 2>/dev/null || true
  exit 1
fi

cat "$out_file"
