# Stage 2 cutover: what is still open

Production switched to `apps/web-2` by way of dual web (both webs on one origin, the new one the default);
`apps/web` and the `dual-web` profile left `main` on 2026-11-08. The `web` container now runs `ashyq-web-2`
(Node, SSR); `docs/REWRITE.md` phase 1 replaces it with the SPA build. This file lists only what is left. A
rollback is a normal `just rollback` to an earlier tag (`ashyq-web-2:<sha>` exists for the recent releases);
there is no way back to the old web through `.env`.

Host facts, `dc` helper, smoke command: `docs/RUNBOOK.md` section 0. Run on the host in `~/cs-mooc`, bash:

```bash
Q() { dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d ashyq -At' <<<"$1"; }   # read-only SQL
A() { dc exec -T server ashyq admin "$@"; }
```

## 1. First deploy without the old web (host, once)

Until production runs a release from after 2026-11-08: RUNBOOK 3.12. Before `just deploy`, `COMPOSE_PROFILES`
loses `dual-web` (keeps `runner`) and `.env` loses `WEB_IMAGE_NAME`, `WEB_MEMORY` and
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`; after it, `dc up -d --no-build --wait --remove-orphans` removes the orphan
`web2`. `WEB_LINKS` stays `legacy` until item 3 of section 3. Then check, with `O=https://cs-mooc.tou.edu.kz` and
`C=$(Q "select verify_code from certificate_users order by created_at limit 1")`:

| URL | Expect |
| --- | --- |
| `$O/`, `$O/courses`, `$O/login`, `$O/api/v2/health/ready`, `$O/content/_probe/smoke.txt` | 200 |
| `$O/certificates/$C/verify`, `$O/ru/certificates/$C/verify` (also `/kz`, `/en`) | 200, holder and course shown |
| `$O/ui/classic` | the web's «Страница не найдена», not the old web |
| a legacy URL of a real course (`$O/ru/course/...`) | 301 to its new page |

## 2. Editor documents, one way (owner)

`migrate-editor-docs --after-cutover` (D-01) writes the one `url` embed the old web could not render; it waits for
the owner's decision that the old web will not come back. A `--dry-run --after-cutover` that changes 0 rows means
it already ran. The web normalizes `blockEmbed` on read until then.

1. Rehearse on a fresh restore of the newest prod backup (local): `pg_restore` `backup/db_dumps/ashyq.dump` into a
   scratch database, `ashyq migrate`, the three `migrate-*` commands for real (editor docs with `--after-cutover`),
   then `cd apps/web-2 && DATABASE_URL=<scratch> bun gates/corpus.ts` (G-14): 0 losses in both sections.
2. On the host, `just backup`, then check that D-02/D-03 left nothing (`A migrate-themes --dry-run`,
   `A migrate-locales --dry-run` change 0 rows; otherwise run them, they are reversible), and:
   `A migrate-editor-docs --dry-run --after-cutover && A migrate-editor-docs --after-cutover`.
   Compare the affected rows with the rehearsal.

## 3. Phase 9 (after section 2; one `main` series, then a release)

Items land on `main` in this order; publish only after all release gates pass. Items 1 (`apps/web`, root
workspaces, publish from `main`) and 2 (Next.js build args, `APP_URL`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`,
`PROD_DOMAIN` build args, the `web` CI leg, `WEB_MEMORY`) are done; left of 2: the host `.env` key (section 1)
and the GitHub repository variable `PROD_DOMAIN`, which nothing reads any more.

3. **Server contract** (S-12): every row of `apps/server/docs/phase9-removals.md` (operations, fields, `can_*`,
   course/submission streams, 409 -> 412, `WEB_LINKS` setting and `ab_core::links` legacy map, `kz` prefix in
   `language.rs`, camelCase gamification keys + stored rewrite); a new migration dropping `ru-RU|kk-KZ|en-US`
   from `users_locale_check`; `just contract`, review the generated client diff, G-07 and G-08 green. Remove
   `AB__SERVER__WEB_LINKS` from `compose.prod.yaml` and `WEB_LINKS` from the host `.env` (the host may set
   `WEB_LINKS=v2` any time before; emails then link the new addresses directly).
4. **Rename** `git mv apps/web-2 apps/web`, then every path naming `web-2`/`web2`:
   `.github/workflows/ci.yaml` (filters, `web2-*` jobs, `apps/web-2` working dirs and `bun-version-file`,
   artifact paths, matrix `web-2` -> `web`, publish), `justfile` (`web2*` recipes -> `web*`), `infra/scripts/lib.sh`
   (`use_web2`), `compose.web2.yaml` (the e2e stand, under a new name), `compose.prod.yaml` image default and
   comments, `infra/scripts/deploy.sh` (required images, prune regex), `.claude/settings.json`,
   `.claude/launch.json`, `.vite-hooks/pre-commit`, `infra/dev/*`, `docs/INFRA.md`, `docs/web/*`, `QUESTIONS.md`,
   root `AGENTS.md`, the skills, agent memory. The image becomes `ashyq-web` built from `apps/web`; the first
   deploy after it needs `ashyq-web:<sha>` (deploy.sh checks it).
5. **Docs:** delete `apps/web-2/BACKLOG.md` and this file once their open items are done or moved; keep the
   active guides current.
6. **Acceptance**, all empty / green:
   ```bash
   git grep -n "course_uuid\|web-2\|usergroups\|/trail\|can_update" \
     -- apps/web apps/server/openapi.v2.json compose*.yaml infra/ .github/ justfile
   git grep -n 'stage-2' -- . ':!apps/server/migrations'
   dc exec -T web env      # only PUBLIC_ORIGIN, INTERNAL_API_URL + system variables
   ```
   `main` CI green as a whole, `publish` included.
