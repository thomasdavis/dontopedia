#!/bin/sh
# Copy the host-mounted claude credentials into a writable location inside
# the container, then exec claude. Claude CLI refreshes its OAuth token on
# every call, so a :ro bind mount of /root/.claude.json fails with EROFS.
#
# The mounted copies live at /creds/ (read-only); we rewrite a live copy
# into $HOME. Nothing writes back to the host.
set -eu

if [ -f /creds/.claude.json ]; then
  cp /creds/.claude.json /root/.claude.json
  chmod 0600 /root/.claude.json
fi
if [ -d /creds/.claude ]; then
  cp -r /creds/.claude /root/.claude
fi

#
# --permission-mode bypassPermissions: the sandbox is already isolated
# (cap-drop, memory/pid caps, docker network), so we don't need per-tool
# prompts. Lets WebSearch / WebFetch / Bash run without interactive approval.
# --allowed-tools WebSearch WebFetch Bash Read Grep Glob: explicit allowlist
# so the agent can research but can't Edit or Write (no local writes matter
# here — it's a throwaway container).
exec claude \
  --print \
  --permission-mode bypassPermissions \
  --allowed-tools WebSearch WebFetch Bash Read Grep Glob \
  "$@"
