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

- One Rust subcommand, connects `AB__ETL__LEGACY_DATABASE_URL` (read-only role) and
  the new DB. **Idempotent and re-runnable**: every run truncates-and-reloads the
  new DB (it is not live until cutover), so rehearsals are cheap and deterministic.
- **ID mapping**: `legacy_id_map (table_name, legacy_key text, new_id uuid)` in the
  new DB. UUIDv7 ids are minted in legacy `created_at` order so id sort ≈ time sort
  (preserves the index-locality property). Legacy public identifiers that appear in
  URLs the frontend still uses (usernames, course slugs if any) are preserved as
  columns, not keys.
- **Ordering** follows the FK dependency graph (roles/users → org → catalog →
  assessment → submissions/grading → analytics → AI → gamification/trail → files).
- **JSONB transforms**: each of the 52 legacy JSON columns has an explicit fate in
  `etl/spec.rs`: `Normalize` (into columns), `Retype` (parse into the new tagged
  serde enum, with strict-parse failure report), or `Drop` (dead data, listed).
  A failed parse is a hard ETL error with row identification — never a silent skip.
- **Plagiarism internals** (Q4): tables/columns dropped; disabled-state stubs keep
  their flags.
- **Role display names**: Cyrillic literals replaced by i18n keys during transform
  (FINDINGS #15).
- Every phase emits a report row: source count, written count, dropped (with
  reasons), duration. The final **verification phase** re-checks: per-table counts,
  FK integrity (`NOT EXISTS` orphan scans), spot checksums (e.g. sum of grade
  points per course, submission counts per assessment, XP totals per user), and a
  sample of 100 random entities deep-compared through both stacks' serializers.
  ETL exits non-zero if any check fails.

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
4. `users.zitadel_user_id` is written back into the new DB; a verification pass
   asserts a 1:1 mapping and that a sample login works via the Session API in the
   rehearsal environment.
5. The bootstrap admin account is imported like everyone else; the owner rotates
   its password at cutover (FINDINGS #4) and optionally enrolls MFA.

## 4. Files → RustFS

- Walk legacy `content/` (from a restored backup or the live volume mounted ro):
  classify by path convention (platform/courses/avatars → `public`; file
  submissions, exports → `private`); upload via `object_store` multipart; write
  `(legacy_path → bucket, key)` into the file key map used by the DB transform
  (thumbnail/avatar/block references become object keys).
- Integrity: size + sha256 compared post-upload; report as in §2.
- Orphan files (on disk, referenced nowhere) are copied to a `quarantine/` prefix,
  listed in the report, deleted 30 days post-cutover.

## 5. Rehearsals (exit gate for phase P10)

Run the **entire** pipeline against a restored production backup in a scratch
compose stack (fresh PG + Zitadel + RustFS), repeatedly, until:
1. ETL exits green with zero unexplained drops, twice in a row on fresh restores;
2. rehearsal wall-clock is measured (informs the cutover window; expected minutes,
   not hours, at 16 MB of relational data);
3. smoke suite passes against the rehearsal stack: login with imported password,
   Google-linked login, course render, assessment submit + grade + SSE, file
   upload/download, AI QA stream, analytics dashboard, certificate verify;
4. the Playwright E2E suite passes against the rehearsal stack.

## 6. Cutover runbook (window ≤ 2 days; expected actual: ~2–4 hours)

```
T-7d   Announce maintenance window to users (all sessions will be logged out).
T-1d   Final rehearsal on fresh backup. Freeze legacy deploys entirely.
T-0    1. docker compose stop web api taskiq-worker taskiq-scheduler   (Judge0, db, redis stay up)
       2. Final backup (offen manual run) — verified restorable.
       3. Run ETL + zitadel-import against live legacy DB (read-only) → new ashyq DB.
       4. Verification phase green (hard gate — abort on red).
       5. Bring up: zitadel, rustfs, server, worker; run `ashyq migrate` no-op check;
          swap nginx template (v2 routes, /content → rustfs); reload nginx.
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
