FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# The API types (src/api/generated) are git-ignored: generate them from the
# committed OpenAPI document (apps/api/openapi.json), then compile.
RUN pnpm --filter @finances/mcp generate
RUN pnpm --filter @finances/mcp build
# Copies the package's `files` (dist/) plus its production dependencies (the
# MCP SDK and zod). `--legacy`: pnpm 10 otherwise only deploys injected
# workspace packages (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE).
RUN pnpm --filter @finances/mcp deploy --prod --legacy /prod/mcp

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runner
# The runtime only runs `node`: drop the package managers bundled with the base
# image (npm, npx, corepack, yarn), whose own dependencies show up in the
# Trivy scan (#101) and are never used here.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
ENV NODE_ENV=production
# The remote adapter (#78, ADR 0003) listens on every interface of the
# container, so Caddy reaches it as finances-mcp:4100 on the `proxy` network.
# Never publish this port: the public host is Caddy's (infra repo).
ENV MCP_HTTP_HOST=0.0.0.0
ENV MCP_HTTP_PORT=4100
COPY --from=builder /prod/mcp .
EXPOSE 4100
# Unprivileged user of the base image; the app files stay owned by root (read-only for it).
USER node
# A TCP connect: no request, so no log line and no rate-limit bucket used.
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "require('net').connect(Number(process.env.MCP_HTTP_PORT),'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
# Refuses to start unless REMOTE_MCP_ENABLED=true (the kill switch).
CMD ["node", "dist/index.js", "--http"]
