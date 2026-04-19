# syntax=docker/dockerfile:1.7
#
# Build context: PARENT of both repos (../../../ from infra/compose/).
# That lets pnpm resolve the local @donto/client file: link without
# juggling submodules or publishing a package.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---- deps ----------------------------------------------------------------
FROM base AS deps
COPY dontopedia/package.json dontopedia/pnpm-workspace.yaml dontopedia/pnpm-lock.yaml* dontopedia/tsconfig.base.json ./
COPY dontopedia/apps/web/package.json apps/web/
COPY dontopedia/apps/agent-runner/package.json apps/agent-runner/
COPY dontopedia/apps/worker/package.json apps/worker/
COPY dontopedia/packages/ui/package.json packages/ui/
COPY dontopedia/packages/donto-sdk/package.json packages/donto-sdk/
COPY dontopedia/packages/workflows/package.json packages/workflows/
COPY dontopedia/packages/extraction/package.json packages/extraction/
# donto-client source lives outside the dontopedia tree; mount it beside it.
COPY donto/packages/donto-client /repo-donto/packages/donto-client
# Rewrite file: refs to point at /repo-donto so pnpm inside the container
# can resolve the same source.
RUN for f in apps/web/package.json apps/agent-runner/package.json apps/worker/package.json packages/donto-sdk/package.json; do \
      node -e "const f='$f';const j=JSON.parse(require('fs').readFileSync(f));if(j.dependencies&&j.dependencies['@donto/client']){j.dependencies['@donto/client']='file:/repo-donto/packages/donto-client';require('fs').writeFileSync(f,JSON.stringify(j,null,2));}"; \
    done
RUN pnpm install --prefer-offline --no-frozen-lockfile

# ---- build ---------------------------------------------------------------
FROM deps AS build
COPY dontopedia/. .
RUN pnpm --filter @dontopedia/web build

# ---- runtime -------------------------------------------------------------
FROM base AS run
ENV NODE_ENV=production
COPY --from=build /repo /repo
COPY --from=build /repo-donto /repo-donto
EXPOSE 3000
WORKDIR /repo/apps/web
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
