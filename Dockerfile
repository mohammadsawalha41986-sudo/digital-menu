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
# `--ignore-scripts`: the package's own postinstall is `prisma generate`, and
# neither the schema nor the source tree exists at this layer — dependencies
# are installed from the lockfile alone so the layer caches on it. The build
# stage generates the client explicitly once the source is present.
RUN npm ci --ignore-scripts

# --- Migrator --------------------------------------------------------------
# A minimal, isolated Prisma CLI install. The standalone Next.js bundle traces
# only what the server imports, so the CLI is absent from it, and Railway (like
# any release-command host) needs `migrate deploy` to run inside this image
# rather than from a developer's machine. Kept in its own directory so it can
# never shadow the runtime's own @prisma/* packages. The version is read from
# package.json so it cannot drift from the client.
FROM base AS migrator
COPY package.json ./
RUN VERSION="$(node -p "require('./package.json').devDependencies.prisma")" \
 && npm install --prefix /migrator --no-audit --no-fund --omit=dev "prisma@$VERSION"

# --- Build -----------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client, then compile. `output: 'standalone'` in
# next.config.ts emits a self-contained server bundle.
#
# The placeholder DATABASE_URL is a build-time artefact and nothing else: the
# root prisma.config.ts resolves the datasource eagerly, and code generation
# reads the schema, never the database. It is not baked into the image — the
# runtime takes DATABASE_URL from the environment, and boots with no database
# reachable only to fail its health check loudly.
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
    npx prisma generate \
 && npm run build

# --- Runtime ---------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Migrations plus the isolated CLI that applies them on release.
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=migrator --chown=nextjs:nodejs /migrator/node_modules ./migrator/node_modules
COPY --chown=nextjs:nodejs docker/prisma.config.mjs ./migrator/prisma.config.mjs
COPY --chown=nextjs:nodejs docker/entrypoint.sh /usr/local/bin/entrypoint.sh

# Local storage provider root. Mount a volume here (Railway volumes, a compose
# volume, a host bind), or switch to R2. Deliberately no `VOLUME` instruction:
# it makes the path an anonymous volume on hosts that honour it, and Railway
# rejects the image outright.
RUN mkdir -p /app/storage && chown nextjs:nodejs /app/storage \
 && chmod +x /usr/local/bin/entrypoint.sh

# No `USER` here: the entrypoint needs root briefly to take ownership of the
# storage mount, then drops to uid 1001 before exec'ing the server. Nothing
# serves traffic as root.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
