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
# The entrypoint copies /creds → ~/ so claude has a writable copy to refresh
# its OAuth token against (Claude writes the token back on every call, so a
# :ro bind mount fails with EROFS and transcripts come back empty).
#
# Build context: parent of dontopedia/ and donto/.

FROM node:22-alpine

RUN apk add --no-cache bash ca-certificates curl git \
 && npm install -g @anthropic-ai/claude-code

COPY dontopedia/infra/docker/claude-entrypoint.sh /usr/local/bin/claude-entrypoint.sh
RUN chmod +x /usr/local/bin/claude-entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/claude-entrypoint.sh"]
