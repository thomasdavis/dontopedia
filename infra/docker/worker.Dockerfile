# syntax=docker/dockerfile:1.7
# Build context: parent of dontopedia/ and donto/.

FROM node:22-alpine AS base
RUN apk add --no-cache bash ca-certificates docker-cli
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY dontopedia/package.json dontopedia/pnpm-workspace.yaml dontopedia/pnpm-lock.yaml* dontopedia/tsconfig.base.json ./
COPY dontopedia/apps/web/package.json apps/web/
COPY dontopedia/apps/agent-runner/package.json apps/agent-runner/
COPY dontopedia/apps/worker/package.json apps/worker/
COPY dontopedia/packages/ui/package.json packages/ui/
COPY dontopedia/packages/donto-sdk/package.json packages/donto-sdk/
COPY dontopedia/packages/workflows/package.json packages/workflows/
COPY dontopedia/packages/extraction/package.json packages/extraction/
COPY donto/packages/donto-client /repo-donto/packages/donto-client
RUN for f in apps/web/package.json apps/agent-runner/package.json apps/worker/package.json packages/donto-sdk/package.json; do \
      node -e "const f='$f';const j=JSON.parse(require('fs').readFileSync(f));if(j.dependencies&&j.dependencies['@donto/client']){j.dependencies['@donto/client']='file:/repo-donto/packages/donto-client';require('fs').writeFileSync(f,JSON.stringify(j,null,2));}"; \
    done
RUN pnpm install --prefer-offline --no-frozen-lockfile

FROM deps AS run
ENV NODE_ENV=production
COPY dontopedia/. .
WORKDIR /repo/apps/worker
CMD ["node", "--import", "tsx", "src/main.ts"]
