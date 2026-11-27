# syntax=docker/dockerfile:1
# Images for the Sing365 web app and mail relay. Build from the repository root:
#   docker build -f deploy/Dockerfile --target web .
#   docker build -f deploy/Dockerfile --target relay .
# deploy/docker-compose.yml does this for you.

FROM node:22-slim AS build
ENV CI=1 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
# Only what the web app and the relay need: the local-development database (embedded-postgres) is left out.
RUN pnpm install --frozen-lockfile --filter "@sing365/web..." --filter "@sing365/relay..."
RUN pnpm --filter @sing365/web build \
 && pnpm --filter @sing365/relay build \
 && pnpm --filter @sing365/relay exec esbuild ../../packages/db/scripts/migrate.ts --bundle --platform=node \
      --target=node22 --format=esm --outfile=/out/db/scripts/migrate.mjs \
 && cp -r packages/db/migrations /out/db/migrations \
 && cp deploy/cron.mjs /out/cron.mjs

# The panel. Applies database migrations, then serves on port 3000.
FROM node:22-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY --from=build /out ./
USER node
EXPOSE 3000
CMD ["sh", "-c", "node db/scripts/migrate.mjs && exec node apps/web/server.js"]

# The mail relay: one bundled file, no node_modules.
FROM node:22-slim AS relay
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/relay/dist/relay.mjs ./relay.mjs
CMD ["node", "relay.mjs"]
