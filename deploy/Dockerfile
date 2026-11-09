FROM node:22-bookworm AS build

WORKDIR /app

# argon2 builds a native module during npm ci.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY . .
RUN npm ci
RUN npm run build --workspace @datavalley/web

FROM node:22-bookworm-slim AS app

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@datavalley/api"]

FROM caddy:2 AS web

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
