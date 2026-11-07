FROM node:22-alpine AS base
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

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Listen on every interface of the container (Fastify defaults to localhost),
# so `web` reaches it as api:4000. Never publish this port (see compose file).
ENV HOST=0.0.0.0
COPY --from=builder /prod/api .
EXPOSE 4000
# Probe the real Terminus health endpoint (checks the DB, and SMTP when it is
# configured). A 5xx makes `fetch` resolve with `ok: false`, so the container
# is reported unhealthy.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]
