# syntax=docker/dockerfile:1.7
# Per-session sandbox: the worker spawns one of these containers per research
# session via `docker run --rm`. Nothing persists between runs. The image
# has just enough to run `claude --print` and reach dontosrv on the
# compose network (the spawner passes --network=dontopedia_default).

FROM node:22-alpine

RUN apk add --no-cache bash ca-certificates curl git \
 && npm install -g @anthropic-ai/claude-code

# Non-root execution. claude writes its auth/session cache under $HOME.
RUN addgroup -S claude && adduser -S -G claude -h /home/claude claude
USER claude
WORKDIR /workspace

# The worker passes the prompt via argv; stdout/stderr are captured.
ENTRYPOINT ["claude", "--print"]
