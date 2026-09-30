# Frontend Environment Contract

This file is the authoritative frontend environment contract for the web app.

## Build-Time Public Variables

These values are baked into the Next.js bundle and must be present during `docker build` or
`bun run build`.

- `NEXT_PUBLIC_SITE_URL`: Canonical public site origin, for example `https://example.com/`
- `NEXT_PUBLIC_API_URL`: Public browser-facing API base URL, for example
  `https://example.com/api/v2/`
- `NEXT_PUBLIC_MEDIA_URL`: Optional separate media origin. If omitted, the app falls back to
  `NEXT_PUBLIC_SITE_URL`

## Runtime Server Variables

These values are used only by the Node.js server runtime.

- `INTERNAL_API_URL`: Optional internal API base URL for server-side/container traffic, for example
  `http://server:8000/api/v2/`
- `APP_URL`: Canonical frontend origin used for same-origin validation and cookie derivation, for
  example `https://example.com`

## Notes

- Do not configure protocol, host, top-domain, and SSL as separate frontend env variables. Those
  values are derived from `NEXT_PUBLIC_SITE_URL` and `APP_URL`.
- Authentication is fully backend-managed via HttpOnly SameSite=strict cookies. The frontend does
  not hold or sign JWT tokens; no auth secret is needed in the web environment.
- In production, `docker-compose.yml` derives the `NEXT_PUBLIC_*` build args from
  `NGINX_SERVER_NAME`; `env_file` inside a service does not populate Docker build args.
- `CONTENT_REWRITE_TARGET` (local dev only, no nginx): proxy `/content/{key}` to the public
  bucket, e.g. `http://localhost:9002/ab-public`.
- `apps/web/.env.example` is the local frontend example, `apps/server/.env.example` the local
  backend example, and the root `.env.example` the production example.
