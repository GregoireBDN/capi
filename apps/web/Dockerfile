FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# The typed API client (apps/web/src/api) is generated and git-ignored: build
# it from the API's OpenAPI spec before bundling the web app.
RUN pnpm generate
RUN pnpm --filter @finances/web build

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runner
# The runtime only runs `node`: drop the package managers bundled with the base
# image (npm, npx, corepack, yarn), whose own dependencies show up in the
# Trivy scan (#101) and are never used here.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.output .
EXPOSE 3000
CMD ["node", "server/index.mjs"]
