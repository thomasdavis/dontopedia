# syntax=docker/dockerfile:1.7
# Per-session Codex sandbox. Spawned by the worker via `docker run --rm`
# with:
#   --cap-drop ALL                 no kernel caps
#   --security-opt no-new-privileges
#   --pids-limit 256               no fork bomb
#   --memory 1g                    no memory runaway
#   --network dontopedia_default   compose bridge only
#   -v /root/.codex:/creds/.codex:ro
#
# Container starts as root, entrypoint copies the small auth/config files it
# needs into /home/codex and drops to the codex user (uid 100). The host
# creds are root-owned, so the entrypoint bridges that into a writable home.

FROM node:22-alpine

RUN apk add --no-cache bash ca-certificates curl git su-exec shadow \
 && npm install -g @openai/codex \
 && addgroup -S codex \
 && adduser -S -G codex -h /home/codex -s /bin/sh codex \
 && mkdir -p /workspace /home/codex \
 && chown -R codex:codex /workspace /home/codex \
 && chmod 0777 /workspace

COPY dontopedia/infra/docker/codex-entrypoint.sh /usr/local/bin/codex-entrypoint.sh
RUN chmod +x /usr/local/bin/codex-entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/codex-entrypoint.sh"]
