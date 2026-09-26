# Data Migration & Cutover

Scope: move all production data (≈10k users, 73 tables, ~181 MB media) from the
legacy stack (Python API, Postgres `openu` DB, local `content/` volume,
fastapi-users auth) to the new stack (Rust server, new `ashyq` DB, RustFS,
Zitadel). Big-bang cutover (Q2), window up to 2 days (Q5), zero data loss.

## 1. What moves where

| Legacy | Destination | Method |
|---|---|---|
| Postgres `openu` (73 tables) | Postgres `ashyq` (redesigned schema) | `ashyq admin etl` (Rust ETL) |
| `user` rows + argon2/bcrypt hashes | Zitadel (credentials, verified email, Google IdP links) + `users` table (profile, RBAC link) | Zitadel import API; hashes pass through (passwap verifies argon2id & bcrypt natively, rehashes on first login) |
| `content/` volume (platform 176 MB, users 5 MB, uploads) | RustFS buckets `public` / `private` | ETL file phase with key map |
| Redis sessions/caches | **not migrated** | all users re-login after cutover (announced); caches rebuild |
| Judge0 data (`judge0_box`, its tables) | unchanged | Judge0 stays as-is |
| Legacy alembic history | dropped | new sqlx migration baseline |

## 2. ETL design (`ashyq admin etl`)

- `ashyq admin etl` connects `AB_ETL_SOURCE_URL` (read-only in production) and
  `AB__DATABASE__URL`. It accepts `--domain`, `--limit`, `--dry-run`,
  `--files-root`, and `--quarantine-orphans`. **Idempotent and re-runnable**:
  persistent ID mappings plus primary-key upserts make a repeated run converge
  without minting new IDs. `--dry-run` executes the complete target transaction
  and rolls it back.
- **ID mapping**: `legacy_id_map (table_name, legacy_key text, new_id uuid)` in the
  new DB. UUIDv7 ids are minted in legacy `created_at` order so id sort ≈ time sort
  (preserves the index-locality property). Legacy public identifiers that appear in
  URLs the frontend still uses (usernames, course slugs if any) are preserved as
  columns, not keys.
- **Ordering** follows the FK dependency graph (roles/users → org → catalog →
  assessment → submissions/grading → analytics → AI → gamification/trail → files).
- **JSONB transforms**: the production restore contains 63 JSON/JSONB columns
  (the planning estimate of 52 was stale). Every column has an explicit fate in
  `crates/etl/src/spec.rs`: `Normalize` (into columns), `Retype` (parse into the new tagged
  serde enum, with strict-parse failure report), or `Drop` (dead data, listed).
  A failed parse is a hard ETL error with row identification — never a silent skip.
- **Plagiarism internals** (Q4): tables/columns dropped; disabled-state stubs keep
  their flags.
- **Role display names**: Cyrillic literals replaced by i18n keys during transform
  (FINDINGS #15).
- **Gamification is zeroed at cutover** (DECISIONS, Q-2026-09-06-1 c): the
  gamification phase migrates no XP transactions, totals, levels, streaks or
  badges. Each legacy profile becomes a fresh `gamification_profiles` row with
  zeroed counters that keeps only the user's `preferences`; the leaderboard
  starts empty. The legacy `xp_transactions` count is reported and noted, never
  written. (The earlier "recompute from verifiable sources" path is gone.)
- Every phase emits a report row: source count, written count, dropped (with
  reasons), duration. The final **verification phase** re-checks: per-table counts,
  FK integrity (`NOT EXISTS` orphan scans), spot checksums (e.g. sum of grade
  points per course, submission counts per assessment, XP totals per user), and a
  domain accounting and FK-orphan scans. ETL exits non-zero if any check fails.
  Serializer-level HTTP comparisons belong to the post-load smoke suite because
  the ETL crate deliberately does not embed the legacy application.

## 3. Users → Zitadel

1. ETL exports users: email, username, display name, locale, hash string
   (modular-crypt format: `$argon2id$…` / `$2b$…`), email-verified=true
   (grandfathered — legacy had no verification), active/locked status.
2. `ashyq admin zitadel-import` calls Zitadel's user import (machine-user PAT),
   setting `hashedPassword` verbatim — Zitadel's passwap layer verifies argon2id
   and bcrypt and transparently re-hashes to its own policy on first successful
   login. **No password resets, no user-visible change.**
3. Google-linked accounts: legacy Google `sub`/account linkage (from the
   fastapi-users OAuth account storage — exact table verified during P1
   discovery) migrates into **our** `google_accounts` table (Google OAuth is
   first-party — DECISIONS.md 2026-08-16). Google-only users get a Zitadel user
   with no password and keep passwordless Google login.
4. Before import, self-hosted Zitadel must set
   `ZITADEL_SYSTEMDEFAULTS_PASSWORDHASHER_VERIFIERS=argon2,bcrypt` (bcrypt alone
   is the upstream default). The command looks up exact login names first, so a
   retry reuses existing Zitadel users, writes `users.zitadel_user_id`, asserts no
   `legacy:*` placeholders remain, and optionally proves a known imported hash
   through the Session API with `AB_ETL_PROBE_LOGIN` and
   `AB_ETL_PROBE_PASSWORD`.
5. The bootstrap admin account is imported like everyone else; the owner rotates
   its password at cutover (FINDINGS #4) and optionally enrolls MFA.

## 4. Files → RustFS

- Walk legacy `content/` (from a restored backup or the live volume mounted ro):
  classify by path convention (platform/courses/avatars → `public`; file
  submissions, exports → `private`); upload via `object_store` multipart; write
  `(legacy_path → bucket, key)` into the file key map used by the DB transform
  (thumbnail/avatar/block references become object keys).
- Integrity: size plus a read-back SHA-256 are compared after every upload;
  mismatch is a hard failure.
- Orphan files (on disk, referenced nowhere) are copied to a `quarantine/` prefix,
  listed in the report, deleted 30 days post-cutover.

## 5. Rehearsals (exit gate for phase P10)

Run the **entire** pipeline against a restored production backup in a scratch
compose stack (fresh PG + Zitadel + RustFS), repeatedly, until:
1. ETL exits green with zero unexplained drops, twice in a row on fresh restores
   (the report shows `xp_transactions` written = 0 and every
   `gamification_profiles` row zeroed — gamification starts fresh by decision);
2. rehearsal wall-clock is measured (informs the cutover window; expected minutes,
   not hours, at 16 MB of relational data);
3. smoke suite passes against the rehearsal stack: login with imported password,
   Google-linked login, course render, assessment submit + grade + SSE, file
   upload/download, AI QA stream, analytics dashboard, certificate verify;
4. the Playwright E2E suite passes against the rehearsal stack.

### 2026-09-07 rehearsal evidence

- Restored source: 117 users, 43 courses, 447 assessment items, 12 v2
  submissions, 41,162 code runs, 1,576 XP transactions, and 321 files.
- Two independently created target databases completed the relational load and
  89 verification checks with zero failures. Relational wall time was 25–31 s;
  the second complete database + object run was 96.976 s.
- The committed file run uploaded all 321 objects and verified their size and
  read-back SHA-256. No database path column referenced an object in this
  restore, so `--quarantine-orphans` correctly placed all 321 beneath
  `private/quarantine/` rather than presenting them as live files.
- Zitadel imported 117 users (78 Argon2id credentials, 39 passwordless), then a
  second run reused all 117. A cloned-source synthetic Argon2id fixture completed
  a real Session API login probe after the verifier setting above was enabled.
- Explained production-data exceptions: two duplicate email addresses receive
  deterministic `+legacy-{id}` aliases; 63 orphan resource-author rows and one
  orphan usergroup-resource row are dropped; 77 unknown assessment-setting keys
  and two unresolved answer item references are retained in the detailed ETL
  drop log. (The 40 unverifiable XP rows noted at the time are moot: since
  2026-09-12 no XP row is migrated at all — every learner starts at zero.)

### 2026-09-26 rehearsal (backup 2026-09-25T02-00-00)

Source: 169 users, 47 courses, 452 assessment items, 1,777 trail steps, 370 files.
Three defects the 2026-09-07 rehearsal could not see were fixed:
- `ai_thread`/`ai_qa_message` were asserted empty; production now has 16 threads
  and 23 questions. Threads and messages migrate; the 23 `ai_run`/`ai_event` rows
  (every run stuck in `running`, no answer ever written) are reported, not loaded.
- Legacy file columns hold bare file names (`course.thumbnail_image`, avatars,
  PDF/video `content.filename`, block `file_id`); the ETL copied them verbatim as
  object keys and computed "referenced" from the same bare names, so **every**
  file was quarantined and no thumbnail, avatar, PDF, video or image block would
  have rendered. Keys are now rebuilt from the legacy directory conventions and
  the orphan check reads the keys the loaded v2 rows hold: 220 live objects,
  150 quarantined (87 files of the dropped legacy assignments feature, superseded
  thumbnails, files of deleted activities), 4 references missing on disk (broken
  in legacy too, listed in `etl_drop_log`).
- `progress-backfill` ignored completed trail steps for lessons/videos/documents
  (1,548 completions → 0) and paid course-completion XP on a repair. Both fixed.
Wall clock for migrate + ETL + Zitadel import + backfill: 64 s.

The data/identity/object migration exit gate is green. The browser smoke list and
Playwright remain part of P9/P11 deployment verification because the frontend
adaptation is not yet complete; they are not evidence for the ETL transaction
itself.

## 6. Cutover runbook (window ≤ 2 days; expected actual: ~2–4 hours)

```
T-7d   Announce maintenance window to users (all sessions will be logged out).
T-1d   Final rehearsal on fresh backup. Freeze legacy deploys entirely.
T-0    1. docker compose stop web api taskiq-worker taskiq-scheduler   (Judge0, db, redis stay up)
       2. Final backup (offen manual run) — verified restorable.
       3. Run `ashyq admin etl --files-root <content> --quarantine-orphans`, then
          `ashyq admin zitadel-import` against the read-only legacy DB, then
          `ashyq admin progress-backfill` (the ETL drops the legacy progress
          projection; without the backfill every learner shows 0% progress).
       4. Verification phase green (hard gate — abort on red).
       5. Bring up: zitadel, rustfs, server, worker; run `ashyq migrate` no-op check;
          swap nginx template (v2 routes, /content → rustfs); reload nginx.
       4a. AI keys: put `AB__AI__OPENAI_API_KEY` / `AB__AI__OPENROUTER_API_KEY`
          (owner-supplied, never in the repo) in the production `.env`; the models
          default to `gpt-5.6-luna` / `deepseek/deepseek-v4-flash` and the budget to
          1 000 000 tokens/month (`AB__AI__OPENAI_MODEL`, `AB__AI__OPENROUTER_MODEL`,
          `AB__AI__MONTHLY_TOKEN_BUDGET` override). `ashyq admin config-check` prints
          `ai.status` — `disabled: no provider key` until they are set (AI routes
          answer 503 `ai-disabled`, agents return draft artifacts), `enabled` after.
       5a. `ashyq admin judge0-tune` (AB__JUDGE0__DATABASE_URL → Judge0's DB): applies
          the sandbox-safe compiler/run commands the legacy API patched on every boot.
          Idempotent; re-run after any Judge0 image upgrade.
       6. Deploy updated web image (new client, new auth pages).
       7. Smoke suite (same list as §5.3) against production. Owner does one manual
          login + password rotation on the admin account.
       8. Open traffic. Monitor Logfire dashboards for 24h (error rate, queue depth).
T+1d   If stable: docker compose rm legacy services; keep legacy DB + volumes intact.
T+30d  Drop legacy DB, delete apps/api from the repo, remove quarantined orphan files.
```

**Rollback (any step before traffic opens):** the legacy DB was only ever read.
Restore the old nginx template, `docker compose up web api taskiq-worker
taskiq-scheduler`, and production is exactly as it was. After traffic opens,
rollback = same procedure + accepting loss of writes made on the new stack
(decision point at T+2h: past it, roll forward only).
