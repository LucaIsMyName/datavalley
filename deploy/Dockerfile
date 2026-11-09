FROM node:26-bookworm AS build

WORKDIR /app

# argon2 builds a native module during npm ci.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY . .
RUN npm ci
RUN npm run build --workspace @datavalley/web

FROM node:26-bookworm-slim AS app

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app
# A fresh media volume copies this directory's owner, so the unprivileged user can write uploads.
RUN mkdir -p /var/lib/datavalley/media && chown node:node /var/lib/datavalley/media
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || 3000) + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["npm", "run", "start", "-w", "@datavalley/api"]

FROM caddy:2 AS web

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
