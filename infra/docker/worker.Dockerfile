# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/workflows/package.json packages/workflows/
COPY packages/extraction/package.json packages/extraction/
COPY packages/donto-sdk/package.json packages/donto-sdk/
RUN pnpm install --prefer-offline

FROM deps AS run
ENV NODE_ENV=production
RUN apk add --no-cache ca-certificates
COPY . .
WORKDIR /repo/apps/worker
CMD ["node", "--import", "tsx", "src/main.ts"]
