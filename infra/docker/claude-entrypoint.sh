#!/bin/sh
# Copy the host-mounted Claude credentials into a writable location owned
# by the 'claude' user, then drop privileges and exec claude.
#
# Why: Claude CLI refreshes its OAuth token on every call, so a :ro bind
# mount fails with EROFS. And it refuses --permission-mode bypassPermissions
# when running as root. Solution:
#   1. Container starts as root.
#   2. Entrypoint copies /creds/* into /home/claude/ and chowns to claude.
#   3. Exec `su claude -c claude --print ...` to drop to uid 100.
set -eu

if [ -f /creds/.claude.json ]; then
  cp /creds/.claude.json /home/claude/.claude.json
fi
if [ -d /creds/.claude ]; then
  cp -r /creds/.claude /home/claude/.claude
fi
chown -R claude:claude /home/claude
chmod 0600 /home/claude/.claude.json 2>/dev/null || true

# Pass the prompt(s) on as argv to claude. Using --permission-mode
# bypassPermissions + an explicit allowlist so WebSearch etc run without
# prompts, but Edit/Write are still denied by omission.
exec su claude -c "exec claude \
  --print \
  --permission-mode bypassPermissions \
  --allowed-tools WebSearch WebFetch Bash Read Grep Glob \
  \"\$@\"" -- sh "$@"
