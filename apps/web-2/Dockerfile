# ashyq-web-2: build with bun, run on Node 26 (spec 7.13). No build args: one image for any domain;
# PUBLIC_ORIGIN and INTERNAL_API_URL are read at startup (src/shared/lib/env.server.ts).
# Build context is the repository root: podman build -f apps/web-2/Dockerfile .
# The root .dockerignore keeps host node_modules out of the context.

FROM oven/bun:1.4.3-alpine AS deps
WORKDIR /app
COPY apps/web-2/package.json apps/web-2/bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY apps/web-2/ ./
# `build` = vp build + the chunk budgets (G-05): an over-budget bundle fails the image.
RUN bun run build

FROM deps AS runtime-deps
RUN rm -rf node_modules && bun install --frozen-lockfile --production --ignore-scripts

FROM node:26-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY apps/web-2/package.json apps/web-2/serve.ts ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/healthz`).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# srvx `gracefulShutdown`: SIGTERM stops accepting and drains in-flight requests (serve.ts).
STOPSIGNAL SIGTERM
CMD ["node", "serve.ts"]
