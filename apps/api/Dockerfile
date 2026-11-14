FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @finances/api build
# Copies the package's `files` (dist/ and the drizzle/ migrations, read by
# `node dist/database/migrate.js` as /app/drizzle) plus production
# dependencies. `--legacy`: pnpm 10 otherwise only deploys injected workspace
# packages (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE); the API uses
# `@finances/shared` for types only, so nothing from it is needed at runtime.
RUN pnpm --filter @finances/api deploy --prod --legacy /prod/api

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runner
# The runtime only runs `node`: drop the package managers bundled with the base
# image (npm, npx, corepack, yarn), whose own dependencies show up in the
# Trivy scan (#101) and are never used here.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
ENV NODE_ENV=production
# Listen on every interface of the container (Fastify defaults to localhost),
# so `web` reaches it as api:4000. Never publish this port (see compose file).
ENV HOST=0.0.0.0
COPY --from=builder /prod/api .
EXPOSE 4000
# Unprivileged user of the base image; the app files stay owned by root (read-only for it).
USER node
# Probe the real Terminus health endpoint (checks the DB, and SMTP when it is
# configured). A 5xx makes `fetch` resolve with `ok: false`, so the container
# is reported unhealthy.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]
