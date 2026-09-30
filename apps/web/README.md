# Docker (Web) - Build & Run

Minimal instructions to build and run the `apps/web` Docker image locally. The
app talks to the Rust server (`apps/server`) at `/api/v2`.

## Build the web image

From the repository root (the Dockerfile copies the root `package.json` and
`bun.lock`, so the build context must be the repo root):

```powershell
docker build `
  --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:3000/ `
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000/api/v2/ `
  -f apps/web/Dockerfile -t ashyq-web:local .
```

## Run the web image

```powershell
docker run -d --name ashyq-web --env-file extra/.env -p 3000:3000 ashyq-web:local
```

The image exposes port 3000 (`ENV PORT=3000`).

## Run via root `docker-compose` (recommended)

The root `docker-compose.yml` builds and runs `web` together with `server`,
`nginx` and the rest of the stack:

```powershell
docker compose up -d --build web
```

## Environment variables

- `NEXT_PUBLIC_*` variables are baked into the bundle at build time.
- The authoritative contract is documented in `/docs/FRONTEND_ENV.md`.
- `extra/.env` is the deployment env file; `apps/web/.env.example` is the local web-only example.
- `env_file` does not populate Docker build args; pass build-time public env via shell env or `--env-file`.
