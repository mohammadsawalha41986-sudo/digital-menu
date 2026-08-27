#!/bin/sh
# Release entrypoint: prepare storage, apply migrations, drop privileges, serve.
#
# 1. Migrations run in the container that is about to serve, so a schema change
#    can never be live before the code that needs it. A failed migration aborts
#    the release: the previous deployment keeps serving rather than a new one
#    serving against a schema it does not match.
#
# 2. The image starts as root only long enough to take ownership of the storage
#    mount. Mounted volumes (Railway volumes, compose volumes, host binds)
#    arrive owned by root, and the application writes uploads there as an
#    unprivileged user. The server itself never runs as root: privileges are
#    dropped before `node` is exec'd.
set -e

APP_UID=1001
APP_GID=1001
STORAGE_ROOT="${STORAGE_LOCAL_ROOT:-/app/storage}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$STORAGE_ROOT"
  chown "$APP_UID:$APP_GID" "$STORAGE_ROOT"
fi

echo "-> applying database migrations"
node /app/migrator/node_modules/prisma/build/index.js \
  migrate deploy --config /app/migrator/prisma.config.mjs

echo "-> starting server on port ${PORT:-3000}"

if [ "$(id -u)" != "0" ]; then
  exec node /app/server.js
fi

# Drop to the application account. setpriv is the direct route; su is the
# fallback. If neither exists the process would otherwise serve as root, which
# is not something to do silently.
if command -v setpriv >/dev/null 2>&1; then
  exec setpriv --reuid="$APP_UID" --regid="$APP_GID" --init-groups node /app/server.js
elif command -v su >/dev/null 2>&1; then
  exec su nextjs -s /bin/sh -c 'exec node /app/server.js'
else
  echo "refusing to start: cannot drop root privileges (no setpriv, no su)" >&2
  exit 1
fi
