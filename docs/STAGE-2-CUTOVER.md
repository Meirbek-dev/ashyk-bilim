# Stage 2 cutover: status and pending steps

Prod runs the new web (`apps/web`, then published as `ashyq-web-2`) since **2026-10-04 10:50:50 UTC**,
release `9c88be2c` (branch `release/stage2`). Spec history: `docs/archive/MODERNIZATION-STAGE-2.md`.
Host facts, `dc` helper, smoke command: `docs/RUNBOOK.md` section 0. On the host in `~/openu-prod`, bash:

```bash
env_set() { grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >>.env; }
Q() { dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d ashyq -At' <<<"$1"; }   # read-only SQL
A() { dc exec -T server ashyq admin "$@"; }
```

## 1. Done (2026-10-04)

- **Release** `9c88be2c`: CI green incl. stack-smoke with the old and the new web and e2e (one shard
  needed a re-run: two different flaky specs, `file-submissions-studio.spec.ts:33` and
  `notifications.spec.ts:74`, failed once each). The first push of the branch failed G-13 (no base
  commit for a new branch); an empty release commit fixed it. G-13 is gone since phase 9.1.
- **G-14** on a scratch copy of the prod database made the same day: 128/128 editor documents,
  736/736 markdown texts, 0 losses, before and after the migrations. migrate-themes 0,
  migrate-locales 183, migrate-editor-docs 86 activities / 87 embeds / 1 url / 1 discussion
  (applied on the scratch copy only).
- **2.2 server release under the old web:** deployed 10:48:57 UTC, 6 migrations applied as role
  `ashyq`, pre-deploy dump `dumps/pre-deploy-9c88be2c.dump`.
- **2.3 data migrations on prod:** migrate-themes 0, migrate-locales 183; migrate-editor-docs
  dry-run only (its real run is 2.8).
- **2.4 web switched** 10:50:50 UTC (`.env.pre-web2` kept: the pre-switch `.env`).
- **2.5 checks:** smoke green; the public URL table green through the university proxy (response
  headers about 1 KB; the proxy's limit is 4 KB, `docs/FINDINGS.md` #31); unauthenticated browser
  pass at desktop and 375 px: home, catalog, course page, sign-in render, no console errors; web
  container 79 MiB of 512 MiB.
- **Phase 9 items 1, 2, 4, 5**: old web and root workspace deleted, Next
  config out of compose/env/CI, `apps/web-2` -> `apps/web` (image `ashyq-web`), `main` publishes
  again, docs.

## 2. Pending (owner)

1. **Authenticated pass** in a browser (desktop and 390 px): student `/home` ->
   `/learn/<course>/<activity>`, completes an activity, saves an assessment draft; teacher
   `/teach/courses/<id>/gradebook`, grades one submission; admin `/admin/users`,
   `/admin/platform`. One presigned upload (avatar), one file download. A password-reset mail to a
   test account links to `https://cs-mooc.tou.edu.kz/reset-password...` (no `/ru`, `/kz`, `/en`).
2. **7-day watch** (2.7; window started 2026-10-04 10:50 UTC), daily:
   ```bash
   dc logs --since 24h web | grep '"source":"browser"' | wc -l      # /_client-error reports
   dc logs --since 24h web | grep '"source":"browser"' | tail -20
   dc logs --since 24h nginx | grep -c '"status":5'                  # 5xx at the edge
   dc logs --since 24h web server | grep '"level":"error"' | tail -20
   docker stats --no-stream | grep -E 'web|server'                   # web under 512m
   ```
   Plus user reports via the owner. Any data-loss report = rollback (section 3), then triage.
3. **First release of the rename** (any time in the window, as long as it adds no migration): CI
   publishes it from `main`. On the host `git fetch && git switch main && just deploy`, then delete
   the `.env` keys nothing reads any more: `WEB_IMAGE_NAME`, `WEB_MEMORY`, `WEB_LINKS`,
   `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (preflight no longer requires the last one;
   `.env.pre-web2` keeps them for a rollback). Check `dc exec -T web env`: only `PUBLIC_ORIGIN`,
   `INTERNAL_API_URL` plus system variables.
4. **Close the window** (owner decision, rollback no longer wanted). Then, in order:
   - 2.8, the one-way data step:
     `A migrate-editor-docs --dry-run --after-cutover && A migrate-editor-docs --after-cutover`
     (rehearsal: activities 86, embeds 87, url 1, discussions 1; second dry-run `{}`).
   - Phase 9.3, S-12 server contract cleanup: every row of `apps/server/docs/phase9-removals.md`
     (operations, fields, `can_*`, course/submission streams, 409 -> 412, the `WEB_LINKS` setting
     and the `ab_core::links` legacy map, `kz` prefix in `language.rs`, camelCase gamification keys
     plus stored rewrite); a migration dropping `ru-RU|kk-KZ|en-US` from `users_locale_check`;
     `just openapi-check`, regenerate the web client, G-07 and G-08 green; drop
     `AB__SERVER__WEB_LINKS` from `compose.prod.yaml`. Acceptance:
     ```bash
     git grep -n "course_uuid\|usergroups\|/trail\|can_update" -- apps/web apps/server/openapi.v2.json
     ```
     empty. Then this file moves to `docs/archive/`.

## 3. Rollback while the window is open

The frozen old web is `ghcr.io/meirbek-dev/ashyq-web:9c88be2c`; its compose config lives on branch
`release/stage2` (`main` no longer has it). Valid as long as no release adds a migration. On the host:

```bash
git fetch && git switch release/stage2
# from .env.pre-web2: the old web's secret
env_set NEXT_SERVER_ACTIONS_ENCRYPTION_KEY "$(sed -n 's/^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=//p' .env.pre-web2)"
env_set IMAGE_TAG 9c88be2c; env_set WEB_IMAGE_NAME ashyq-web; env_set WEB_LINKS legacy; env_set WEB_MEMORY 2g
dc up -d --no-build --wait
SMOKE_RESOLVE_IP=127.0.0.1 bash infra/scripts/smoke.sh https://cs-mooc.tou.edu.kz
```

D-02/D-03 need no undo. Not reversible by this switch:

- **2.8 `migrate-editor-docs --after-cutover`**: the `url` embed it writes cannot be rendered by
  the old web. Hence it runs only after the window.
- **Documents saved by the new web** during the window are already `embedBlock` (the old web
  reads it); a new embed of type `url` is not. Before a rollback count them, expect 0:
  `Q "select count(*) from activities where jsonb_path_exists(content, '\$.** ? (@.type == \"embedBlock\" && @.attrs.type == \"url\")')"`.
  Non-zero: tell the owner which activities; the old web shows those blocks broken.
- **Emails already sent** with v2 links (reset, verification): they 404 on the old web.
- **New-web-only data** (notifications, groups renamed in UI) stays; the old web ignores it.
- **Server rollback to f5e493c4** is not a web rollback: migrations differ, and after 2.3 the
  stage-1 server sees short locales. Only via the pre-deploy dump (RUNBOOK 3.2), losing writes
  since 2.2.

## Rehearsal 2026-10-04 (local, scratch copy of `ashyq_restore`)

Scratch DB `createdb -T ashyq_restore`, dropped afterwards. Before: 226 users, 590 activities,
locales ru-RU 218 / en-US 7 / kk-KZ 1, G-14 editor 148/148 (legacy: `blockEmbed` x87, one
centered `blockEmbed`, one HTML post), markdown 1051/1051. Migrations: 6 pending applied
(20261002000001 .. 20261004000001) in well under 1 s. `migrate-themes` 0; `migrate-locales`
226 (then ru 218 / en 7 / kk 1); `migrate-editor-docs` without the flag refused (1 url embed),
with `--after-cutover` activities 86, embeds 87, url 1, discussions 1; second dry-runs 0 / 0 / `{}`.
After: G-14 148/148 with no legacy shapes, markdown 1051/1051. Each command took under 1 s.
Local hazard: the Windows working tree has CRLF migrations (`.gitattributes` says LF), so a
binary built from it fails `migrate` with "previously applied but has been modified"; the
rehearsal applied migrations with `sqlx migrate run` from `git archive HEAD` and LF checksums.
Prod images are built on Linux from git (LF).
