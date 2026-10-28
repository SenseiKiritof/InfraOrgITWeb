FROM node:24-alpine AS build
WORKDIR /app

ARG APP_VERSION=0.0.0

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN echo "VITE_APP_VERSION=${APP_VERSION#v}" > .env.production
RUN yarn build

FROM caddy:2-alpine

ARG APP_VERSION=0.0.0
LABEL org.opencontainers.image.title="InfraOrgIT Web" \
      org.opencontainers.image.description="SPA InfraOrgIT servita da Caddy" \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.source="https://github.com/SenseiKiritof/InfraOrgITWeb"

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 80 443 443/udp
