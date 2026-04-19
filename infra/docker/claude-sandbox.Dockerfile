# syntax=docker/dockerfile:1.7
# Per-session sandbox: the worker spawns one of these containers per research
# session via `docker run --rm`. Nothing persists between runs. The image
# has just enough to run `claude --print` and reach dontosrv on the compose
# network (the spawner passes --network=dontopedia_default).
#
# Runs as root INSIDE the container. That's safe in this context because
# the spawner already:
#   --cap-drop ALL                 no kernel caps
#   --security-opt no-new-privileges
#   --pids-limit 256               no fork bomb
#   --memory 1g                    no memory runaway
#   --network dontopedia_default   no arbitrary outbound hosts beyond what
#                                  the compose bridge allows
# We need root UID so the container can read the mounted
# /root/.claude.json (uid=0 on the host) where `claude login` deposited
# the OAuth state.

FROM node:22-alpine

RUN apk add --no-cache bash ca-certificates curl git \
 && npm install -g @anthropic-ai/claude-code

WORKDIR /workspace
ENTRYPOINT ["claude", "--print"]
