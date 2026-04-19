# Docker (Web) - Build & Run

This README includes minimal instructions to build and run the `apps/web` Docker image locally.

## Prerequisites

- Docker (or Docker Desktop)
- PowerShell or a POSIX shell

## Build the web image

From repository root:

```powershell
docker build \
  --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:3000/ \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:1338/api/v1/ \
  --build-arg NEXT_PUBLIC_MEDIA_URL=http://localhost:1338/ \
  -f apps/web/Dockerfile -t learnhouse-web:local apps/web
```

## Run the web image

```powershell
docker run -d --name learnhouse-web --env-file extra/.env -p 3000:3000 learnhouse-web:local
```

The image exposes port 3000 by default (see `ENV PORT=3000`). If you'd like to use a different port,
change the container or host mapping.

## Stop and remove the container

```powershell
docker stop learnhouse-web; docker rm learnhouse-web
```

## Run via root `docker-compose` (recommended)

The repo includes a root Dockerfile and compose setup that can build and run both `api` and `web`
together. From the repo root:

```powershell
docker-compose up -d --build app
```

## Environment variables (important)

- The web container uses a small set of `NEXT_PUBLIC_*` environment variables and they are baked
  into the build.
- The authoritative contract is documented in `/docs/FRONTEND_ENV.md`.
- `extra/.env` is the deployment env file used by the `app` service at runtime.
- `extra/example-conf.env` is the deployment template; `apps/web/.env.example` is the local web-only
  example.
- When using root `docker-compose`, pass build-time public env via shell env or
  `--env-file extra/.env` because `env_file` does not populate Docker build args.

## Troubleshooting

- If the build fails with package manager errors, ensure `bun` is installed during the Docker build
  (the Dockerfile uses `oven/bun:1-alpine` base image). If building locally you can run
  `bun install` in `apps/web` to verify your lockfile.
- If changes to dependencies are not picked up, re-run the build with no cache:

```powershell
docker build --no-cache -f apps/web/Dockerfile -t learnhouse-web:local apps/web
```

- To view real-time logs:

```powershell
docker logs -f learnhouse-web
```
