# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Inkpub production image.
#
# Multi-stage: dependencies, build, then a minimal runtime containing only the
# Next standalone server plus the migration runner. No secrets are needed at
# build time and none are baked into the image — src/lib/env.ts defers its
# production checks to runtime precisely so this stays true.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1

# --------------------------------------------------------------- dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --------------------------------------------------------------------- build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
RUN npm run build

# ------------------------------------------------------------------- runtime
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# The migration runner is plain JavaScript and needs only `pg`, which Next's
# standalone trace already vendored into ./node_modules for the app itself.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs

USER nextjs
EXPOSE 3000

# server.js is emitted by Next's standalone output and handles SIGTERM itself;
# the pg pool registers its own shutdown hook in src/db/client.ts.
CMD ["node", "server.js"]
