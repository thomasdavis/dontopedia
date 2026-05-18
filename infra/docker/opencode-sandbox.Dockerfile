# syntax=docker/dockerfile:1.7
# Per-session OpenCode sandbox — replaces the old codex sandbox for
# dontopedia agentic research. Same hardening as before
# (--cap-drop ALL, --pids-limit 256, --memory 1g, restricted network,
# no-new-privileges). The container starts as root, the entrypoint
# seeds OpenCode auth into the agent user's home, then drops to that
# uid and runs `opencode run` with the prompt.
#
# Auth: prefer mounted /creds/auth.json (host's
# ~/.local/share/opencode/auth.json); otherwise synthesise an
# auth.json from $OPENROUTER_API_KEY.
#
# Default model: openrouter/z-ai/glm-5. Override with $OPENCODE_MODEL.

FROM node:22-alpine

RUN apk add --no-cache bash ca-certificates curl git su-exec shadow \
 && npm install -g opencode-ai \
 && addgroup -S agent \
 && adduser -S -G agent -h /home/agent -s /bin/sh agent \
 && mkdir -p /workspace /home/agent \
 && chown -R agent:agent /workspace /home/agent \
 && chmod 0777 /workspace

COPY dontopedia/infra/docker/opencode-entrypoint.sh /usr/local/bin/opencode-entrypoint.sh
RUN chmod +x /usr/local/bin/opencode-entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/opencode-entrypoint.sh"]
