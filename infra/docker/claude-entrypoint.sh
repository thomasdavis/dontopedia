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

exec claude --print "$@"
