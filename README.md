# Ashyq Bilim

Learning platform: Rust API (`apps/server`) + Next.js web app (`apps/web`).

- Local dev: `bun run services` (Postgres, Redis, Zitadel, RustFS), then
  `just` recipes in `apps/server` and `bun run dev` for the web app.
- Production: `bun run deploy`; see `docs/DEPLOYMENT.md`.
