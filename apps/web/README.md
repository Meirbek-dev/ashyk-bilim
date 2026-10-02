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
docker run -d --name ashyq-web -p 3000:3000 ashyq-web:local
```

The image exposes port 3000 (`ENV PORT=3000`). Runtime env (`INTERNAL_API_URL`,
`APP_URL`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`) goes in with `-e`.

## Run in the full stack

Production images are built by CI (`.github/workflows/ci.yaml`) and run by
`compose.prod.yaml`. A prod-like stack locally: `IMAGE_TAG=<sha> just stack-up`
(see `docs/INFRA.md`, "Stacks").

## Environment variables

- `NEXT_PUBLIC_*` variables are baked into the bundle at build time.
- The contract between the web app and the infrastructure (and the
  Next-specific leftovers stage 2 removes) is in `docs/INFRA.md`, "Web
  contract for stage 2".
- `apps/web/.env.example` is the local web-only example; production values
  come from `compose.prod.yaml`.
- `env_file` does not populate Docker build args; pass build-time public env via `--build-arg`.
