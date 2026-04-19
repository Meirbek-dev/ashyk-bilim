# Frontend Environment Contract

This file is the authoritative frontend environment contract for the web app.

## Build-Time Public Variables

These values are baked into the Next.js bundle and must be present during `docker build` or
`bun run build`.

- `NEXT_PUBLIC_SITE_URL`: Canonical public site origin, for example `https://example.com/`
- `NEXT_PUBLIC_API_URL`: Public browser-facing API base URL, for example
  `https://example.com/api/v1/`
- `NEXT_PUBLIC_MEDIA_URL`: Optional separate media origin. If omitted, the app falls back to
  `NEXT_PUBLIC_SITE_URL`

## Runtime Server Variables

These values are used only by the Node.js server runtime.

- `INTERNAL_API_URL`: Optional internal API base URL for server-side/container traffic, for example
  `http://localhost:9000/api/v1/`
- `APP_URL`: Canonical frontend origin used for same-origin validation and cookie derivation, for
  example `https://example.com`

## Notes

- Do not configure protocol, host, top-domain, and SSL as separate frontend env variables. Those
  values are derived from `NEXT_PUBLIC_SITE_URL` and `APP_URL`.
- Authentication is fully backend-managed via HttpOnly SameSite=strict cookies. The frontend does
  not hold or sign JWT tokens; no auth secret is needed in the web environment.
- `docker-compose` must receive the public `NEXT_PUBLIC_*` values at build time via shell env or
  `--env-file extra/.env`. `env_file` inside the service definition does not populate Docker build
  args.
- For full-stack deployments, copy `extra/example-conf.env` to `extra/.env` and keep both frontend
  and backend runtime variables there.
- Backend runtime settings are environment-only. The API does not read `apps/api/config/config.yaml`
  or auto-load `apps/api/.env` in containers.
- `apps/web/.env.example` is the local development example.
- `apps/api/.env.example` is the local backend example.
- `extra/example-conf.env` is the full-stack deployment example.
