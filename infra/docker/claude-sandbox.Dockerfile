# syntax=docker/dockerfile:1.7
# Per-session Claude sandbox. Spawned by the worker via `docker run --rm`
# with:
#   --cap-drop ALL                 no kernel caps
#   --security-opt no-new-privileges
#   --pids-limit 256               no fork bomb
#   --memory 1g                    no memory runaway
#   --network dontopedia_default   compose bridge only
#   -v /root/.claude.json:/creds/.claude.json:ro
#   -v /root/.claude:/creds/.claude:ro
#
# Container starts as root, entrypoint copies creds into /home/claude and
# drops to the claude user (uid 100). Claude CLI refuses to skip permission
# prompts when running as root, so we need a non-root final uid; but the
# creds on the host are root:root 0600, so we can't bind-mount them as
# non-root. The entrypoint bridges the two.

FROM node:22-alpine

RUN apk add --no-cache bash ca-certificates curl git su-exec shadow \
 && npm install -g @anthropic-ai/claude-code \
 && addgroup -S claude \
 && adduser -S -G claude -h /home/claude -s /bin/sh claude \
 && chmod 0777 /home/claude

COPY dontopedia/infra/docker/claude-entrypoint.sh /usr/local/bin/claude-entrypoint.sh
RUN chmod +x /usr/local/bin/claude-entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/claude-entrypoint.sh"]
