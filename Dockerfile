# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Digital Profile OS — production image.
#
# Multi-stage so the runtime layer carries no toolchain, no source and no
# development dependencies. Build arguments carry no secrets: the application
# validates its environment on first request, not at build time, so an image
# can be built in CI without production credentials.
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# --- Dependencies ----------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- Build -----------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client, then compile. `output: 'standalone'` in
# next.config.ts emits a self-contained server bundle.
RUN npx prisma generate && npm run build

# --- Runtime ---------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Migrations and the Prisma CLI dependencies are needed to run
# `prisma migrate deploy` on release.
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Local storage provider root; mount a Railway Volume at /app/storage, or switch to R2.
RUN mkdir -p /app/storage && chown nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

