# Stage 2 cutover: old web -> `ashyq-web-2` (pending)

Scope: `docs/MODERNIZATION-STAGE-2.md`; acceptance: `docs/web/ACCEPTANCE.md`. Host facts, `dc` helper, smoke
command: `docs/RUNBOOK.md` section 0. Run on the host in `~/cs-mooc`, bash. `<sha>` = 8-char
release commit. The switch is configuration only (`.env`), no compose edits:

| `.env` key | Before (unset = default) | After switch |
| --- | --- | --- |
| `WEB_IMAGE_NAME` | `ashyq-web` | `ashyq-web-2` (same `IMAGE_TAG`) |
| `WEB_LINKS` | `legacy` | `v2` (server `AB__SERVER__WEB_LINKS`, S-11) |
| `WEB_MEMORY` | `2g` | `512m` (watch `docker stats`, back to `1g` if it OOMs) |

`compose.prod.yaml` already gives `web` both `PUBLIC_ORIGIN` (`PUBLIC_SCHEME://NGINX_SERVER_NAME`)
and `INTERNAL_API_URL=http://server:8000/api/v2/` (the new web uses only its origin). `NEXT_*`
and `APP_URL` stay until Ф9; the new web ignores them. Port 3000 and the image `HEALTHCHECK`
are the same contract for both images.

```bash
env_set() { grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >>.env; }
Q() { dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d ashyq -At' <<<"$1"; }   # read-only SQL
A() { dc exec -T server ashyq admin "$@"; }
```

## 1. Preconditions (all, in order)

1. **Release published.** Orchestrator cuts `release/stage2` from a green `main` and pushes it.
   That CI run is green end to end: app gates, images, stack smoke,
   `web2-e2e`, `publish` and `publish-web2`. Check the current workflow rather
   than relying on historical job or step names. Check:
   `for i in server web web-2; do docker manifest inspect ghcr.io/meirbek-dev/ashyq-$i:<sha> >/dev/null && echo ok $i; done`.
   `ashyq-web:<sha>` is the current Next.js build. Record the deployed tag/digest
   and confirm that the previous production image remains available for rollback.
2. **Full e2e incl. `@judge0`** on the local stand (including tagged scenarios) green with this `<sha>`'s images.
3. **G-14 on a fresh restore** of the newest prod backup (local):
   `pg_restore` `backup/db_dumps/ashyq.dump` into a scratch DB, apply the release's migrations
   (`ashyq migrate`; on Windows from an LF checkout, use `just eol` for CRLF working copies), run the three
   `migrate-*` commands for real (editor docs with `--after-cutover`), then
   `cd apps/web-2 && DATABASE_URL=<scratch> bun gates/corpus.ts`: 0 losses in both sections.
4. **Backup** on the host just before step 2.1: `just backup`, archive in `backups/` non-empty.
5. **Exam-free window**, confirmed by the owner (old-web local drafts are not carried over;
   server drafts are). Check right before 2.4, expect 0:
   `Q "select count(*) from submissions where status = 'draft' and updated_at > now() - interval '2 hours'"`
6. Owner available on prod SSH; one admin, one teacher and one student account to sign in
   with (the owner signs in, or provides dedicated accounts; never paste passwords in chat).

## 2. Cutover

Order keeps rollback a web switch until 2.8: the server release and the reversible data
migrations land first under the old web; the only old-web-breaking step comes last.

1. **Host checkout.** Record the current branch and deployed tag before switching.
   `git fetch && git switch release/stage2 && git log -1 --format=%h` = `<sha>`.
2. **Server release under the old web.** `.env` unchanged (no `WEB_*` keys). `just deploy`:
   preflight, pull, `pre-deploy-<sha>.dump` when migrations change, additive
   migrations, `up --wait`, smoke. The old web now runs on the new server (expand only).
   Check `tail -1 .deploy-history` = `<sha>`; open `/` and sign in once in the old web.
   **nginx: recreate, never reload** (the first release with SEC-1 5c6940a's template: CSP
   `sandbox` and CORP on `/content`, unsigned `/ab-*` queries refused): `nginx -t` fails on a
   reload with the new template, so `dc up -d --no-build --force-recreate nginx`, then
   `curl -sI https://cs-mooc.tou.edu.kz/content/_probe/smoke.txt | grep -i cross-origin-resource-policy`.
   The recreate empties nginx's `/content` cache (container fs, not a volume); browsers keep
   `/content` responses cached before it with their old headers up to 7 days (`max-age=604800, immutable`).
3. **Reversible data migrations** (D-02, D-03; the old web keeps working: responses keep the
   legacy `locale`). Dry-run, compare with the fresh restore rehearsal, then for real:
   ```bash
   A migrate-themes --dry-run && A migrate-themes
   A migrate-locales --dry-run && A migrate-locales
   A migrate-editor-docs --dry-run                         # counts only; NOT run for real here
   ```
   `migrate-editor-docs` without `--after-cutover` refuses while any embed would become type
   `url` (1 on prod data); with it, the old web shows that node by host when its embed catalog has the host
   (else "unknown embed"). So D-01 waits for 2.8. The new web normalizes `blockEmbed` on read (G-14 148/148
   before D-01).
4. **Switch the web** (downtime = web container restart, about 15 s). If dual web runs (RUNBOOK 3.12), turn it
   off first: after this step `web` itself is the new web.
   ```bash
   env_set WEB_IMAGE_NAME ashyq-web-2; env_set WEB_LINKS v2; env_set WEB_MEMORY 512m
   dc up -d --no-build --wait            # recreates web, server, worker (env changed)
   dc exec -T web env | grep -E '^(PUBLIC_ORIGIN|INTERNAL_API_URL)='
   dc exec -T server sh -c 'echo $AB__SERVER__WEB_LINKS'   # v2
   ```
5. **Smoke.** `SMOKE_RESOLVE_IP=127.0.0.1 bash infra/scripts/smoke.sh https://cs-mooc.tou.edu.kz`, then
   with `O=https://cs-mooc.tou.edu.kz` and `C=$(Q "select verify_code from certificate_users order by created_at limit 1")`:
   | URL | Expect |
   | --- | --- |
   | `$O/`, `$O/courses`, `$O/collections`, `$O/search`, `$O/login` | 200 |
   | `$O/certificates/$C/verify` | 200, holder and course shown (canonical, new QR codes) |
   | `$O/ru/certificates/$C/verify`, `$O/kz/...`, `$O/en/...` | 200 in ru / kk / en (printed QR codes) |
   | `$O/certificates/XXXX-0000/verify` | "certificate not valid" page, not 5xx |
   | A legacy URL for a real course; an unmatched URL | 301 to its new equivalent; 404 with search |
   | `$O/api/v2/health/ready`, `$O/content/_probe/smoke.txt` | 200 |
   Response headers of `/`: `content-security-policy` with a nonce, `x-request-id`.
   Browser pass by an agent (desktop and 390 px): public routes, sign-in, sign-out, and one
   scenario per role: student `/home` -> `/learn/<course>/<activity>`, completes an activity,
   saves an assessment draft; teacher `/teach/courses/<id>/gradebook`, grades one submission;
   admin `/admin/users`, `/admin/platform`. One presigned upload (avatar) and one file download.
   A password-reset mail to a test account links to `$O/reset-password...`, no `/ru`, `/kz`, `/en`.
6. **Record** the switch time for the orchestrator: it starts the 7-day window.
7. **Watch, 7 days**, daily:
   ```bash
   dc logs --since 24h web | grep '"source":"browser"' | wc -l      # /_client-error reports
   dc logs --since 24h web | grep '"source":"browser"' | tail -20
   dc logs --since 24h nginx | grep -c '"status":5'                  # 5xx at the edge
   dc logs --since 24h web server | grep '"level":"error"' | tail -20
   docker stats --no-stream | grep -E 'web|server'                   # web under 512m
   ```
   Plus user reports via the owner. Any data-loss report = rollback (section 3), then triage.
8. **Close the window** (owner decision, rollback no longer wanted). Then the one-way step:
   `A migrate-editor-docs --dry-run --after-cutover && A migrate-editor-docs --after-cutover`
   Check the affected rows and corpus results from the current restore.

## 3. Rollback (until 2.8)

Web only; the server stays on `<sha>` (it serves both webs until Ф9):
```bash
env_set WEB_IMAGE_NAME ashyq-web; env_set WEB_LINKS legacy; env_set WEB_MEMORY 2g
dc up -d --no-build --wait
SMOKE_RESOLVE_IP=127.0.0.1 bash infra/scripts/smoke.sh https://cs-mooc.tou.edu.kz
```
`ashyq-web:<sha>` is the release's Next.js image, already pulled. D-02/D-03 need no undo.

Not reversible by a web switch:
- **2.8 `migrate-editor-docs --after-cutover`**: the `url` embed it writes cannot be rendered by
  the old web. Hence it runs only after the window.
- **Documents saved by the new web** during the window are already `embedBlock` (the old web
  reads it); a new embed of type `url` it shows by host, unless its embed catalog lacks the host. Before a
  rollback count them:
  `Q "select count(*) from activities where jsonb_path_exists(content, '\$.** ? (@.type == \"embedBlock\" && @.attrs.type == \"url\")')"`.
  Non-zero: check their hosts against the old catalog; tell the owner which activities show "unknown embed".
- **Emails already sent** with v2 links (reset, verification): they 404 on the old web.
- **New-web-only data** (notifications, groups renamed in UI) stays; the old web ignores it.
- **Server rollback** is not a web rollback. Compare the target's migrations and locale
  support first; an incompatible target requires the pre-deploy dump (RUNBOOK 3.2), losing
  later writes. Reset `WEB_*` to the target's frontend before `just rollback`; otherwise
  it may request a replacement-web image that was never published for that tag.

## 4. Phase 9 (after 2.8; one `main` series, then a release)

Items land on `main` in this order; publish only after all release gates pass.
Item 3 ends the old web's compatibility for good. Before deploying item 4, remove
`WEB_IMAGE_NAME`, `WEB_MEMORY` (and `WEB_LINKS` after 3) from the host `.env`; if forgotten,
`pull` of `ashyq-web-2:<sha>` fails before migrations and nothing changes.

1. **Old web.** `git rm -r apps/web`; root `package.json` workspaces and `bun.lock`; publish
   from `main` again (drop the release-only condition and the old-web alias in `publish`);
   `apps/web/AGENTS.md`; G-13 (freeze gate in `apps/web-2/gates`, its allowlist entries,
   `GATES_BASE` in ci.yaml if only G-13 used it); `infra/smoke/stub-web` comments about Next.
2. **Next.js config.** `compose.prod.yaml` web: `build.args`, `APP_URL`,
   `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`; `infra/env/prod.env.example`, `infra/env/smoke.env`
   (the key); host `.env` key; ci.yaml `Web build args from PROD_DOMAIN` step, repo variable
   `PROD_DOMAIN`, `changes.web` filter, the `web` matrix leg, the "Smoke with stub web"
   comment about Next; `WEB_MEMORY` default -> `512m` (or a literal).
3. **Server contract** (S-12): every row of `apps/server/docs/phase9-removals.md` (operations,
   fields, `can_*`, course/submission streams, 409 -> 412, `WEB_LINKS` setting and
   `ab_core::links` legacy map, `kz` prefix in `language.rs`, camelCase gamification keys +
   stored rewrite); a new migration dropping `ru-RU|kk-KZ|en-US` from `users_locale_check`;
   `just contract`, review both generated client diffs, G-07 and G-08 green. Remove
   `AB__SERVER__WEB_LINKS` from `compose.prod.yaml` and `WEB_LINKS` from the host `.env`.
4. **Rename** `git mv apps/web-2 apps/web`, then every path naming `web-2`/`web2`:
   `.github/workflows/ci.yaml` (filters, `web2-*` jobs, `apps/web-2` working dirs and
   `bun-version-file`, artifact paths, matrix `web-2` -> `web`, publish), `justfile`
   (`web2-*` recipes -> `web-*`, `web` recipe), `infra/scripts/lib.sh` (`use_web2`),
   `compose.web2.yaml` (fold into `compose.smoke.yaml` or keep as the e2e stand under a new
   name), `compose.prod.yaml` image default and comments, `infra/scripts/deploy.sh` prune
   regex, `.claude/settings.json`, `.claude/launch.json`, `.vite-hooks/pre-commit`,
   `docs/INFRA.md`, `docs/DECISIONS.md`, `docs/web/DESIGN.md`, `QUESTIONS.md`, root
   `AGENTS.md`, agent memory. The image becomes `ashyq-web` built from `apps/web`.
5. **Docs:** remove Next.js-only guidance and the renamed app's `BACKLOG.md`;
   update `docs/INFRA.md`, `docs/web/DESIGN.md` and root/app agent guides.
   Delete this procedure, `docs/MODERNIZATION-STAGE-2.md` and the completed
   acceptance checklist once durable behavior is covered by the active guides.
6. **Acceptance** (`docs/web/ACCEPTANCE.md`), all empty / green:
   ```bash
   git grep -n "from 'next\|NEXT_\|'use server'\|course_uuid\|web-2\|usergroups\|/trail\|can_update" \
     -- apps/web apps/server/openapi.v2.json compose*.yaml infra/ .github/ justfile
   git grep -n 'stage-2' -- . ':!docs/archive' ':!apps/server/migrations'
   dc exec -T web env      # only PUBLIC_ORIGIN, INTERNAL_API_URL + system variables
   ```
   `main` CI green as a whole, `publish` included.
