# syntax=docker/dockerfile:1

# The build output is plain JavaScript, so it is built once on the builder's own
# architecture; only the small runtime stage below exists per target platform.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
COPY . .
# No install scripts: only the desktop app needs them (native modules, Electron).
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @houston/app build:web \
 && pnpm --filter @houston/server build

FROM node:24-alpine
ARG VERSION=dev
LABEL org.opencontainers.image.title="Houston" \
      org.opencontainers.image.description="Remote help: voice, video, screen sharing and remote control" \
      org.opencontainers.image.url="https://help.punzet.me"
ENV NODE_ENV=production \
    HOUSTON_VERSION=$VERSION \
    HOUSTON_DATA_DIR=/data \
    HOUSTON_WEB_DIR=/app/web \
    HOUSTON_PORT=3000
WORKDIR /app
COPY --from=build /src/apps/server/dist ./server
COPY --from=build /src/apps/app/dist ./web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
# HTTP (behind your reverse proxy), STUN/TURN, TURN relay ports.
EXPOSE 3000/tcp 3478/udp 3478/tcp 49160-49200/udp
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1:${HOUSTON_PORT}/api/health || exit 1
CMD ["node", "--enable-source-maps", "server/main.js"]
