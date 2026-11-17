FROM node:26-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 has no prebuilt binary for this Node ABI on linux/amd64, so its
# install script falls through to node-gyp. The toolchain lives only in this
# discarded stage.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM node:26-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build
RUN npm prune --omit=dev

FROM node:26-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/scripts/backup-db.mjs ./scripts/backup-db.mjs
COPY --from=build /app/scripts/valuation-snapshot.mjs ./scripts/valuation-snapshot.mjs
COPY --from=build /app/scripts/snapshot-schedule.mjs ./scripts/snapshot-schedule.mjs
COPY --from=build /app/server/database/migrations ./server/database/migrations

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
