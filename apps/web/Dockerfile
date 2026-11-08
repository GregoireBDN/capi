FROM node:22-alpine AS base
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

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.output .
EXPOSE 3000
CMD ["node", "server/index.mjs"]
