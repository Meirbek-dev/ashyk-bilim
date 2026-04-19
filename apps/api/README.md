# Docker (API) - Build & Run

This README includes minimal instructions to build and run the `apps/api` Docker image locally.

## Prerequisites

- Docker (or Docker Desktop)
- PowerShell or a POSIX shell

## Build the API image

Build the image for `apps/api` using the Dockerfile in that folder:

```powershell
docker build -f apps/api/Dockerfile -t learnhouse-api:local apps/api
```

## Run the API image (detached)

Run the built image from the repository root and provide the backend env contract explicitly:

```powershell
docker run -d --name learnhouse-api --env-file extra/.env -p 8000:8000 learnhouse-api:local
```

## Stop and remove the container

```powershell
docker stop learnhouse-api; docker rm learnhouse-api
```

## Run via root `docker-compose` (recommended)

The monorepo includes a root Dockerfile and a compose setup that builds/starts both API and web. Use
the compose command from the repository root to build and run the app service/manage multiple
containers:

```powershell
docker-compose up -d --build app
```

## Environment and notes

- The backend runtime configuration is environment-only. It does not auto-load `apps/api/.env` and
  it does not read `apps/api/config/config.yaml` at runtime.
- Use `extra/.env` for Docker deployments and treat `extra/example-conf.env` as the canonical
  template.
- Use `apps/api/.env.example` only as a local backend example when you want a file to copy from
  during development.
- If you modify dependencies, rebuild the image.
- If you need to inspect logs:

```powershell
docker logs -f learnhouse-api
```

## Troubleshooting

- If ports conflict, use `-p <host>:<container>` to remap.
- If dependency installation fails during the Docker build, check the `uv.lock` and `pyproject.toml`
  for mismatches.
