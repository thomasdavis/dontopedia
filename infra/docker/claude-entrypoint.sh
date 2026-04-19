#!/bin/sh
# Copy host-mounted creds into claude-user's home, then drop to that uid
# via su-exec and run claude --print. See claude-sandbox.Dockerfile for
# the isolation guarantees around this container.
set -eu

if [ -f /creds/.claude.json ]; then
  cp /creds/.claude.json /home/claude/.claude.json
fi
if [ -d /creds/.claude ]; then
  cp -r /creds/.claude /home/claude/.claude
fi
chown -R claude:claude /home/claude
chmod 0600 /home/claude/.claude.json 2>/dev/null || true

# --allowed-tools is a variadic flag; passing a comma-separated single
# arg stops it from greedily swallowing the prompt.
exec su-exec claude claude \
  --print \
  --permission-mode bypassPermissions \
  --allowed-tools "WebSearch,WebFetch,Bash,Read,Grep,Glob" \
  -- "$@"
