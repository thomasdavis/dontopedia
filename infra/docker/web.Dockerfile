# syntax=docker/dockerfile:1.7
# Build context is the repo root.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
COPY packages/donto-sdk/package.json packages/donto-sdk/
# donto's TS client — linked via file: ref from @dontopedia/sdk
COPY ../donto/packages/donto-client /donto-client
RUN pnpm install --frozen-lockfile=false --prefer-offline

FROM deps AS build
COPY . .
RUN pnpm --filter @dontopedia/web build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next ./.next
COPY --from=build /repo/apps/web/package.json ./package.json
COPY --from=build /repo/apps/web/public ./public
COPY --from=build /repo/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
