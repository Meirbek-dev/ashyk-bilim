# ashyq-web-2: build with bun, run on Node 26 (spec 7.13). No build args: one image for any domain;
# PUBLIC_ORIGIN and INTERNAL_API_URL are read at startup (src/shared/lib/env.server.ts).
# Build context is the repository root: podman build -f apps/web-2/Dockerfile .
# The root .dockerignore keeps host node_modules out of the context.
# apps/web-2 is a member of the root bun workspace: the root package.json (catalog, overrides) and the one bun.lock
# come along, and `--filter web-2` installs only this app (not the root tools).

FROM oven/bun:1.4.4-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web-2/package.json apps/web-2/
RUN bun install --frozen-lockfile --ignore-scripts --filter web-2

FROM deps AS build
COPY apps/web-2/ apps/web-2/
WORKDIR /app/apps/web-2
RUN bun run build

# Hoisted: plain directories in one /app/node_modules beside serve.ts, as the app had with its own lockfile
# (minus the workspace's own link, node_modules/web-2 -> ../apps/web-2, which the runtime image does not have).
FROM deps AS runtime-deps
RUN rm -rf node_modules apps/web-2/node_modules \
    && bun install --frozen-lockfile --production --ignore-scripts --filter web-2 --linker hoisted \
    && rm node_modules/web-2

FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runtime
RUN apk upgrade --no-cache --available && rm -rf /usr/local/lib/node_modules/npm
# The heap is capped for the 512m container (compose WEB_MEMORY): V8 sized it from the host (2 GiB) and collects
# lazily, so RSS reached ~480 MiB at 50 rps; capped, it stayed under 300 MiB (docs/DECISIONS.md).
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=256 \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=runtime-deps /app/node_modules ./node_modules
# Native TypeScript is a build tool; Node strips serve.ts types itself.
RUN rm -rf node_modules/@typescript node_modules/typescript
COPY --from=build /app/apps/web-2/dist ./dist
COPY apps/web-2/package.json apps/web-2/serve.ts ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/healthz`).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# srvx `gracefulShutdown`: SIGTERM stops accepting and drains in-flight requests (serve.ts).
STOPSIGNAL SIGTERM
CMD ["node", "serve.ts"]
