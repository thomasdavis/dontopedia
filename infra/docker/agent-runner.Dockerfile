# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/agent-runner/package.json apps/agent-runner/
COPY packages/workflows/package.json packages/workflows/
COPY packages/extraction/package.json packages/extraction/
COPY packages/donto-sdk/package.json packages/donto-sdk/
RUN pnpm install --prefer-offline

FROM deps AS build
COPY . .

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache bash git curl ca-certificates
# Claude Code CLI — v0 runs stubbed; installers wire this up in v1.
# The droplet should have already run `claude login` interactively.
RUN npm install -g @anthropic-ai/claude-code
COPY --from=build /repo ./
EXPOSE 4001
WORKDIR /app/apps/agent-runner
CMD ["node", "--import", "tsx", "src/server.ts"]
