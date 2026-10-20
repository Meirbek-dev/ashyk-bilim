# Rewrite spec (v3)

Status: proposed 2026-10-21, not started. Replaces `apps/server`, `apps/web` and the
current stack topology. `apps/web-2` survives as the frontend (converted to an SPA).
Until phase 5 lands, `ARCHITECTURE.md`, `INFRA.md` and `RUNBOOK.md` describe production;
this file describes where it goes and in what order.

## 1. Why

Measured on prod 2026-10-20:

| | |
| --- | --- |
| Users / active 30 d / active 7 d | 236 / 175 / 41 |
| Courses / activities | 51 / 483 |
| Database / media | 107 MB / 16 GB |
| Submissions since cutover (2026-09-30) | 66, from 20 learners |
| Code runs since cutover | ~5 (41k imported) |
| AI runs, ever | 13 (41 Q&A messages) |
| File-submission attempts | 0 |

What serves that today: 17 containers (two frontends, server, worker, Zitadel, Redis,
RustFS, Judge0 ×4, Postgres ×2, nginx, backup, init jobs), 86k lines of production Rust
in 8 crates, 83 tables, 286 API operations, ~170k lines of hand-written TypeScript across
two frontends, 1,565 commits in 30 days.

The cost is scope and parallel paths, not code quality:

- Authorization is enforced by remembered calls (53 `ensure_not_archived`, 84 gate
  helpers); the permission matrix test is the only net. Most of the 384 QA bugs were a
  sibling entry point missing a check.
- No transaction discipline: 134 db functions take `&PgPool`, jobs are enqueued after
  commit, emails go through `tokio::spawn`.
- 73 JSONB columns read as `serde_json::Value`; the "typed" wire types are schema-only.
- Three parallel type sets (db rows, domain, DTO) for one shape.
- Zitadel, Redis and RustFS each add a service, secrets and glue for work Postgres and a
  disk already do at this size.
- AI (12.5k lines, 15 tables), analytics (11.6k, 9 tables) and gamification (2k) carry
  most of the schema and are barely used.
- Two frontends receive fixes in parallel; the dual-web compatibility tax runs through
  the server (`WEB_LINKS`, 21 deprecated operations, `phase9-removals.md`).

## 2. Goals and non-goals

Goals:

- One Rust binary, one Postgres, one static frontend, nginx, Judge0. Nothing else.
- Every course-scoped handler gets its access decision from one place, by construction.
- Every write that must happen together happens in one transaction, jobs included.
- Every JSONB column has a Rust type that is deserialized on write and on read.
- The kept feature set works for the existing data with the same ids and URLs.

Non-goals:

- Multi-tenancy, federation/OIDC, passkeys, push/email notification feeds.
- Feature parity with v2 for anything on the cut list (section 9).
- Horizontal scaling. One process on one host handles 100× today's load.

Size expectations (guidance, not a gate): server ≤ 30k lines of production Rust,
≤ 35 tables, ≤ 120 operations; web-2 shrinks by the cut features.

## 3. Target topology

```
browser ─► university proxy (TLS, 4 KiB response headers, ~100 MiB bodies)
             └─► nginx :80/:443
                   ├─ /assets/*            static files (immutable, 1 year)
                   ├─ /media/_internal/*   internal; served after X-Accel-Redirect
                   ├─ /api/*               ashyq :8000
                   └─ everything else      ashyq :8000 (index.html + page meta)
ashyq (one binary: HTTP, worker loop, scheduler, SSE fan-out)
   ├─ Postgres 18  (app data, sessions, jobs, LISTEN/NOTIFY)
   ├─ /data/ashyq/media  (local disk, nginx reads it)
   ├─ Judge0 1.13.1  (separate VM or host, HTTP + token)
   ├─ Resend  (email, called from jobs only)
   ├─ Google OAuth
   └─ Anthropic API  (course Q&A only)
```

Containers on the app host: `nginx`, `ashyq`, `postgres`, `backup`. Judge0 (server,
workers, its Postgres and Redis) runs elsewhere because it is `privileged`.

Host: a dedicated LXD VM on `cs01` (the `user` account is already in `lxd`) or its own
machine. Today the stack shares a Docker daemon with ~80 unrelated containers, including
Portainer, n8n and a Postgres published on `0.0.0.0`; published Docker ports bypass UFW.

## 4. Server

### 4.1 Layout

One crate, `apps/ashyq`, organized by feature. No `domain`/`db`/`api` layer crates.

```
apps/ashyq/
  Cargo.toml
  migrations/
  src/
    main.rs          serve | migrate | import-v2 | admin <cmd>
    app.rs           router, state, middleware
    error.rs         ErrorCode registry + problem+json (port as-is)
    db.rs            pool, Tx alias, NOTIFY listener
    jobs.rs          queue, worker loop, schedules
    access.rs        Viewer, CourseCtx, Caps (section 6.3)
    auth/            passwords, sessions, google, email tokens
    catalog/         courses, chapters, activities, staff
    content/         typed activity bodies, Tiptap doc schema
    media/           uploads, chunking, X-Accel-Redirect
    assessments/     items, attempts, auto-grading
    grading/         grades, release, gradebook
    code/            Judge0 client, code runs
    progress/        enrolments, completions, progress views
    certificates/    awards, PDF rendering, public verify
    announcements/
    qa/              course Q&A (Anthropic)
    admin/           users, roles, platform settings
    reports/         teacher reports, CSV
```

Rules:

- A feature module owns its SQL, handlers and types. A row struct is the API type unless
  the shapes really differ; then the module has one `From`.
- Modules call each other through plain functions that take `&mut Tx`. No traits with one
  implementation, no service structs.
- Workspace-wide lints carry over (`unwrap`/`panic` denied in non-test code).
- One TLS stack: `rustls` with `ring` everywhere (sqlx, reqwest). No `object_store`, no
  `aws-lc-rs`.

### 4.2 Dependencies

Keep: `axum`, `tokio`, `tower-http`, `sqlx` (Postgres, macros, offline cache), `serde`,
`serde_json`, `utoipa`, `tracing`, `tracing-subscriber` (JSON), `reqwest`, `argon2`,
`bcrypt` (legacy hash verification only), `rand`, `sha2`, `hmac`, `time`, `uuid`,
`pdf-writer` + font subsetting (certificates), `thiserror`.

Drop: `redis`, `object_store`, the three `opentelemetry` crates, `tiktoken-rs`,
the Zitadel client. Add nothing that one module could replace in under 200 lines.

### 4.3 Transactions and jobs

- Every db function takes `&mut PgConnection` (or `&mut Tx`). A handler opens one
  transaction, calls functions, commits. Reads may use the pool.
- `jobs::enqueue(&mut tx, Job)` is the only way to start background work. Email, Judge0
  polling, certificate rendering and Q&A indexing are jobs. No `tokio::spawn` for work
  that must survive a crash.
- The queue is the current `SKIP LOCKED` + `LISTEN/NOTIFY` design (`db/src/queue.rs`),
  run as a task inside the same process. Succeeded rows are deleted after 7 days, failed
  rows after 30.
- Time-based behaviour is data, not polling:
  - scheduled publishing is `published_at > now()`; readers filter on it, no job;
  - auto-submit is one job with `run_at = attempt.deadline_at`, enqueued when the attempt
    starts and ignored if the attempt is already submitted.
- Pool size 20. A handler holds at most one connection.

### 4.4 Live updates

`/api/v2/me/events` is the only SSE endpoint. Writers `NOTIFY ashyq_events, '<user_id>:<kind>:<id>'`
inside their transaction (delivered on commit). One listener task fans out to connected
streams through a `tokio::sync::broadcast`. The client refetches the named query on each
event and on reconnect; no replay log, no clock compensation. Q&A answers stream on their
own POST response.

### 4.5 Contract

- utoipa derives on the handler and type definitions, committed `openapi.json`, CI fails
  on diff. Nullability and integer formats are fixed in annotations, not in a JSON
  rewrite pass.
- problem+json with the closed `ErrorCode` registry, unchanged.
- Optimistic concurrency (`version` + `If-Match`) only on course, chapter, activity,
  assessment item and grade edits. Idempotency only where a retry could double-count:
  attempt submit (state machine: `in_progress → submitted` happens once) and code-run
  create (`client_key` unique per user). No `Prefer` header, no generic idempotency table.
- Cursor pagination with one shape (`items`, `next_cursor`); the generated client gets one
  hand-written `infiniteQueryOptions` helper instead of 34.

### 4.6 Observability

- JSON logs; one `tracing` span per request with `request_id`, user id, route and status;
  spans on job runs and external calls (Judge0, Resend, Anthropic).
- `GET /api/v2/health` (process) and `GET /api/v2/health/ready` (database plus last
  worker heartbeat), the paths `smoke.sh` already checks.
- No metrics backend. Alerting is an owner decision (section 11).

## 5. Schema

New database `ashyq3` in the same Postgres cluster, populated by `ashyq import-v2`
(section 8). The v2 database is left untouched for rollback. Ids are kept: every row
that survives keeps its v2 `id`, so URLs, certificates and media keys stay valid.
`legacy_uuid`, `etl_*` and `zitadel_user_id` columns do not exist in v3.

Conventions: `uuid` primary keys (`uuidv7()` default), `timestamptz`, `text` + `CHECK` for
enums, composite foreign keys wherever a row repeats its parent's `course_id`, so the
copy cannot drift. Deletes of learning records are soft (`deleted_at`) or forbidden; no
cascade from `users`.

### 5.1 Identity

```sql
create table users (
  id               uuid primary key default uuidv7(),
  email            text not null,
  username         text not null unique,
  display_name     text not null,
  password_hash    text,                     -- argon2id PHC; '$2a$' accepted until first login
  role             text not null default 'learner'
                   check (role in ('learner', 'teacher', 'admin')),
  locale           text not null default 'ru' check (locale in ('ru', 'kk', 'en')),
  theme            text,
  bio              text not null default '',
  organization     text not null default '',
  avatar_key       text,
  email_verified_at timestamptz,
  disabled_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index users_email_lower on users (lower(email));

create table google_accounts (
  sub        text primary key,
  user_id    uuid not null references users,
  email      text not null,
  created_at timestamptz not null default now()
);

create table sessions (
  token_hash   bytea primary key,           -- sha256 of the cookie value
  user_id      uuid not null references users,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  ip           inet,
  user_agent   text
);
create index on sessions (user_id);

create table auth_tokens (
  token_hash bytea primary key,
  user_id    uuid not null references users,
  purpose    text not null check (purpose in ('verify-email', 'reset-password')),
  expires_at timestamptz not null,
  used_at    timestamptz
);

create table audit_log (
  id       uuid primary key default uuidv7(),
  actor_id uuid references users,
  action   text not null,                   -- 'login-failed', 'grade-released', 'role-set', ...
  target   text,                            -- '<kind>:<uuid>'
  ip       inet,
  data     jsonb not null default '{}',
  at       timestamptz not null default now()
);
create index on audit_log (actor_id, at);
```

### 5.2 Catalog and content

```sql
create table courses (
  id          uuid primary key default uuidv7(),
  title       text not null,
  summary     text not null default '',
  about       text not null default '',
  learnings   text[] not null default '{}',
  tags        text[] not null default '{}',
  cover_key   text,
  public      boolean not null default false,
  enrol_required_for_assessments boolean not null default true,
  archived_at timestamptz,
  created_by  uuid not null references users,
  search      tsvector generated always as (
                to_tsvector('simple', title || ' ' || summary)) stored,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table course_staff (
  course_id uuid not null references courses,
  user_id   uuid not null references users,
  role      text not null check (role in ('owner', 'editor')),
  primary key (course_id, user_id)
);

create table chapters (
  id        uuid primary key default uuidv7(),
  course_id uuid not null references courses,
  title     text not null,
  position  integer not null,
  version   integer not null default 1,
  unique (id, course_id)
);

create table activities (
  id           uuid primary key default uuidv7(),
  course_id    uuid not null,
  chapter_id   uuid not null,
  position     integer not null,
  kind         text not null
               check (kind in ('page', 'video', 'pdf', 'quiz', 'exam', 'assignment', 'code')),
  title        text not null,
  body         jsonb not null,              -- ActivityBody, tagged by kind (5.3)
  body_version smallint not null,
  required     boolean not null default true,
  published_at timestamptz,                 -- null = draft; future = scheduled
  version      integer not null default 1,
  created_by   uuid not null references users,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (chapter_id, course_id) references chapters (id, course_id),
  unique (id, course_id)
);

create table media (
  id          uuid primary key default uuidv7(),
  owner_id    uuid not null references users,
  course_id   uuid references courses,
  visibility  text not null check (visibility in ('public', 'private')),
  path        text not null unique,         -- relative to /data/ashyq/media/<visibility>/
  mime        text not null,
  size_bytes  bigint not null,
  status      text not null check (status in ('uploading', 'ready')),
  created_at  timestamptz not null default now()
);

create table activity_media (                -- rewritten on every body save, same tx
  activity_id uuid not null references activities,
  media_id    uuid not null references media,
  primary key (activity_id, media_id)
);
```

`blocks` disappears: image, PDF and video blocks inside a page are Tiptap nodes that hold
a `media_id`. Media with no `activity_media`, avatar, cover or attempt reference for 24 h
is deleted by a daily job.

### 5.3 Typed bodies

`content::ActivityBody` is a `#[serde(tag = "kind")]` enum, one variant per
`activities.kind`. Writes deserialize the request into it and reject unknown fields;
reads deserialize the column and fail loudly. `body_version` selects a migration
function when the shape changes; migrations run on read and the next write persists them.

| kind | body |
| --- | --- |
| `page` | Tiptap document (`content::Doc`: allowed node and mark types, attrs typed per node) |
| `video` | `{ source: youtube { id } \| media { media_id }, captions? }` |
| `pdf` | `{ media_id }` |
| `quiz`, `exam` | `AssessmentPolicy` (attempts, time limit, due, late policy, grade release, review visibility, randomization, partial credit, negative marking, passing score, weight; `exam` adds the anti-cheat set: copy/paste, tab switch, devtools, right click, fullscreen, violation threshold) |
| `assignment` | `{ instructions: Doc, rubric, allowed_mime, max_files, max_file_mb, policy: AssessmentPolicy }` |
| `code` | `{ prompt: Doc, policy: AssessmentPolicy }` (items carry languages and tests) |

The Tiptap node list is shared with web-2 through the OpenAPI schema; the editor's
content-loss check (G-14) runs against the server's validator.

### 5.4 Learning records

```sql
create table enrolments (
  course_id   uuid not null references courses,
  user_id     uuid not null references users,
  enrolled_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

create table assessment_items (
  id          uuid primary key default uuidv7(),
  activity_id uuid not null references activities,
  position    integer not null,
  kind        text not null check (kind in ('choice', 'matching', 'code')),
  body        jsonb not null,               -- ItemBody, tagged by kind
  max_score   numeric(8, 2) not null,
  version     integer not null default 1
);

create table attempts (                      -- quizzes, exams, assignments, code
  id              uuid primary key default uuidv7(),
  course_id       uuid not null,
  activity_id     uuid not null,
  user_id         uuid not null references users,
  number          integer not null,
  status          text not null check (status in ('in_progress', 'submitted', 'graded')),
  preview         boolean not null default false,   -- staff preview, excluded from reports
  answers         jsonb not null default '{}',      -- Answers, keyed by item id
  items_snapshot  jsonb not null,                   -- frozen at start
  policy_snapshot jsonb not null,
  started_at      timestamptz not null default now(),
  deadline_at     timestamptz,
  submitted_at    timestamptz,
  auto_submitted  boolean not null default false,
  violations      jsonb not null default '[]',
  auto_score      numeric(8, 2),
  is_late         boolean not null default false,
  version         integer not null default 1,
  foreign key (activity_id, course_id) references activities (id, course_id),
  unique (activity_id, user_id, number)
);

create table attempt_files (
  attempt_id uuid not null references attempts,
  media_id   uuid not null references media,
  position   integer not null,
  primary key (attempt_id, media_id)
);

create table grades (                        -- one current grade per attempt
  attempt_id    uuid primary key references attempts,
  graded_by     uuid references users,       -- null = auto
  raw_score     numeric(8, 2) not null,
  penalty_pct   numeric(5, 2) not null default 0,
  final_score   numeric(8, 2) not null,
  feedback      text not null default '',
  item_feedback jsonb not null default '{}',
  released_at   timestamptz,
  version       integer not null default 1,
  updated_at    timestamptz not null default now()
);

create table completions (                   -- the only progress fact
  activity_id  uuid not null references activities,
  user_id      uuid not null references users,
  completed_at timestamptz not null default now(),
  attempt_id   uuid references attempts,    -- set for graded kinds
  primary key (activity_id, user_id)
);

create table code_runs (
  id          uuid primary key default uuidv7(),
  user_id     uuid not null references users,
  item_id     uuid not null references assessment_items,
  attempt_id  uuid references attempts,      -- null = practice run
  client_key  text not null,
  language_id integer not null,
  source      text not null,
  status      text not null check (status in ('queued', 'running', 'done', 'error')),
  passed      integer,
  total       integer,
  cases       jsonb not null default '[]',   -- per-test results
  created_at  timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, client_key)
);

create table certificates (
  course_id   uuid primary key references courses,
  config      jsonb not null,               -- CertificateConfig
  disabled_at timestamptz
);

create table certificate_awards (
  id          uuid primary key default uuidv7(),
  course_id   uuid not null references certificates,
  user_id     uuid not null references users,
  verify_code text not null unique,
  issued_at   timestamptz not null default now(),
  unique (course_id, user_id)
);

create table announcements (
  id         uuid primary key default uuidv7(),
  course_id  uuid not null references courses,
  author_id  uuid not null references users,
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now()
);
```

Progress is a view, not a projection:

```sql
create view course_progress as
select e.course_id, e.user_id,
       count(a.id) filter (where a.required)                         as required_total,
       count(c.activity_id) filter (where a.required)                as required_done,
       max(c.completed_at)                                           as last_completed_at
from enrolments e
join activities a on a.course_id = e.course_id
                 and a.published_at <= now()
left join completions c on c.activity_id = a.id and c.user_id = e.user_id
group by e.course_id, e.user_id;
```

A completion row is written in the same transaction as the event that causes it: the
learner marking a page/video/pdf done, or a grade that passes. Certificate eligibility
is `required_done = required_total`, checked in the same transaction, which enqueues the
award job.

### 5.5 Q&A, jobs, settings

```sql
create table qa_threads (
  id         uuid primary key default uuidv7(),
  user_id    uuid not null references users,
  course_id  uuid not null references courses,
  created_at timestamptz not null default now()
);

create table qa_messages (
  id            uuid primary key default uuidv7(),
  thread_id     uuid not null references qa_threads,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  citations     jsonb not null default '[]',
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);

-- jobs and job_schedules: port the v2 tables as they are (migrations 0001, 0002).

create table platform (
  id       boolean primary key default true check (id),
  name     text not null,
  about    text not null default '',
  email    text not null default '',
  logo_key text,
  settings jsonb not null default '{}',     -- PlatformSettings (typed), incl. Q&A on/off, monthly token cap
  version  integer not null default 1
);
```

The monthly Q&A budget is `sum(input_tokens + output_tokens)` over the current month,
checked before each call. No ledger or reservation tables.

## 6. Auth

### 6.1 Passwords

- argon2id (m=19 MiB, t=2, p=1), PHC string in `users.password_hash`.
- Import keeps each user's latest Zitadel hash (section 8.2). At login, a `$2a$`/`$2b$`
  hash is verified with bcrypt and replaced by argon2id in the same request; an
  `$argon2…` hash is verified as is.
- A user with no hash signs in with Google or uses password reset.
- Lockout: 5 `login-failed` audit rows for the same account in 15 min returns
  `too-many-attempts` for 15 min. Per-IP limits stay in nginx (`auth_limit`).
- Constant-time failure path: an unknown login verifies against a fixed dummy hash.

### 6.2 Sessions

- Cookie `ab_session`: 32 random bytes, base64url, `HttpOnly; Secure; SameSite=Lax;
  Path=/`. The database stores only the sha256.
- Sliding idle 14 days, absolute 90 days, at most 10 per user (oldest deleted).
  `last_seen_at` is written at most once per 5 minutes.
- New session id on login and on role change; role change deletes the user's other
  sessions. Logout deletes the row.
- CSRF: `SameSite=Lax` plus an `Origin`/`Sec-Fetch-Site` check on every non-GET.
- All v2 sessions end at cutover (they live in Redis). Users sign in again once.

### 6.3 Authorization

Three global roles in code, not in tables: `learner`, `teacher` (may create courses),
`admin` (everything). Course rights come from `course_staff` (`owner`, `editor`) and
`enrolments`. The v2 permission tables, `moderator` and `maintainer` (0 users) and
`instructor-legacy-grants` are not carried over.

```rust
// access.rs
pub struct Viewer { pub user: Option<UserId>, pub role: Role }

pub struct CourseCtx {
    pub course: CourseRow,      // loaded once
    pub viewer: Viewer,
    pub caps: Caps,             // bitflags, computed once
}

bitflags! { pub struct Caps: u32 {
    const VIEW = 1; const ENROL = 2; const LEARN = 4; const EDIT = 8;
    const GRADE = 16; const MANAGE_STAFF = 32; const VIEW_REPORTS = 64;
} }
```

- `CourseCtx` is an axum extractor for every route under `/api/v2/courses/{course_id}/…`.
  It loads the course, the viewer's staff role and enrolment in one query, computes
  `Caps` (archived courses lose every write capability here, nowhere else), and rejects
  a missing course with 404. Routes for chapters, activities, attempts and grades are
  nested under the course path, so they cannot skip it.
- A handler states its need once: `ctx.require(Caps::EDIT)?`. The same `Caps` become
  the resource's `allowed_actions` in responses, so UI and server cannot disagree.
- Rows below the course (activity, attempt) are fetched with `course_id = ctx.course.id`
  in the `WHERE` clause; a row from another course is a 404.
- `admin::` routes take an `Admin` extractor. Account routes take `SignedIn`.
- The v2 `permission_matrix` test is ported: every route in the OpenAPI document is
  called as anonymous, learner, enrolled learner, other teacher, course editor, course
  owner and admin, against an archived and a live course; an unclassified route fails.

### 6.4 Google, email

- Google OAuth (authorization code, signed `state`) ports from v2 as is. Callback path
  `/api/v2/auth/google/callback`; the Google console entry for `/api/v1/…` and its nginx
  rewrite are removed first.
- Verify-email and reset-password use `auth_tokens` (sha256 stored, 1 h / 24 h expiry)
  and send through a job. TOTP is not carried over (one enrolment ever, never verified).

## 7. Frontend

`apps/web-2` stays the codebase. Changes, in order:

1. **SPA.** Drop TanStack Start's server: build static files, nginx serves
   `/assets/*` with `immutable`; the server answers every page path with `index.html`.
   For public course and catalog paths the server fills `<title>`, description and
   Open Graph tags from the database before sending it (string replace on the file read
   at boot). No Node container, no header forwarding, no `useHydrated` gates.
2. **CSP** becomes static and is sent by nginx: the directives of
   `src/shared/lib/csp.ts` with `script-src 'self'` in place of the nonce and
   `strict-dynamic`. The university proxy adds a second `X-Frame-Options`, HSTS and a
   conflicting `Referrer-Policy`; ask IT to stop adding them.
3. **Cut features** follow the server (section 9): routes, queries, SPEC files and e2e
   specs for cut features are deleted, not hidden.
4. **Tests.** e2e selects by role, label and message key, never by literal Russian text.
   Keep the editor content-loss check and the contract/codegen gate. Drop the 300/80-line
   caps, one-component-per-file, the behaviour-id bookkeeping and the gates whose only job
   is process (keep: format, lint, typecheck, unit, contract, e2e).
5. **Toolchain** pinned to stable releases of TypeScript, Vite and Vitest; no aliased
   or pre-release build tools and no loader shims (`gates/ts6-*.mjs`).
6. **One markdown/rich-text path:** Tiptap renders read-only views too.

Kept as they are: generated client from OpenAPI (hey-api), loader prefetch +
`useSuspenseQuery`, `meta.invalidates`, the routes → features → shared import rule,
shadcn, Paraglide with the ru/kk/en catalogs, `allowed_actions`-driven UI.

## 8. Migration

### 8.1 Data (`ashyq import-v2`)

Runs against a stopped v2 (maintenance page up), reads the v2 database and Zitadel's
database through a second connection, writes `ashyq3` in one transaction, then runs the
checks below. Idempotent: it drops and recreates `ashyq3` each time.

| v2 | v3 |
| --- | --- |
| `users` | `users` (role from `user_roles`: admin > instructor/legacy-grants → teacher > learner) |
| Zitadel eventstore | `users.password_hash` (8.2) |
| `google_accounts` | `google_accounts` |
| `courses`, `chapters` | same, `legacy_uuid` dropped |
| `resource_authors` | `course_staff` (creator → owner, contributor → editor, active only) |
| `activities` + `blocks` | `activities` with typed `body`; block media → `media` + `activity_media` |
| `assessments` | `activities.body.policy` for quiz/exam/code |
| `file_submissions` | `activities.body` for `assignment` |
| `assessment_items` | `assessment_items` |
| `submissions` + `grading_entries` | `attempts` + `grades` |
| `file_submission_attempts` (+ files, grading) | `attempts` (+ `attempt_files`, `grades`); 0 rows today |
| `code_runs` + `code_run_cases` | `code_runs` (cases folded into `cases`) |
| `trail_runs` | `enrolments` |
| `activity_progress` (completed) | `completions` |
| `certifications`, `certificate_users` | `certificates`, `certificate_awards` (same `verify_code`) |
| `course_updates` | `announcements` |
| `ai_threads`, `ai_qa_messages` | `qa_threads`, `qa_messages` |
| `uploads` | `media` (status `ready` only) |
| `platforms` | `platform` |
| `auth_audit_log`, `assessment_audit_events` | `audit_log` |
| everything else | not imported (section 9); stays in the v2 dump |

Checks (the import fails if any fails):

- Row counts per mapped table equal the source, minus documented exclusions.
- Every `activities.body` and `assessment_items.body` deserializes into its Rust type.
- G-14 on every page: the Tiptap document rendered from v3 equals the v2 rendering
  (text, node count, media references).
- Every `course_progress` row computed by the view matches v2 `course_progress`
  `completed_required_count`/`total_required_count`, or the difference is listed with a
  reason (known: Q-2026-09-26-1 empty assignments).
- Every certificate `verify_code` resolves.

### 8.2 Password hashes

Zitadel keeps hashes in `eventstore.events2` payloads (`encodedHash`). On 2026-10-20:
23 `$2a$` (bcrypt, imported from the legacy system), 105 `$argon2…`, 109 `user.human.added`
events without a hash (Google-only accounts or hashes set by later events). The importer
takes the latest hash-bearing event per Zitadel user (`user.human.added`,
`user.human.password.changed`, and any other event type found carrying `encodedHash`),
maps it through `users.zitadel_user_id`, and reports users who had a password login in
`auth_audit_log` but get no hash. That list must be empty before cutover.

### 8.3 Media

RustFS stores objects in its own on-disk format, so files are copied through its S3 API
(`rclone sync` from `ab-public` and `ab-private`) into `/data/ashyq/media/{public,private}/`
with the same keys. `media.path` = the v2 key. Run once ahead of cutover, then again
inside the window for the delta.

### 8.4 Rehearsal

Use the restore recipe (prod backup → local stack) and run `import-v2` until it passes
cleanly on two consecutive backups. Then run the web-2 e2e suite (adapted per section 7)
and the ported permission matrix against the imported data, and sign in as one user of
each hash type.

## 9. Cut list

Removed in v3. Data stays in the final v2 dump. "Back on request" means rebuild when a
teacher asks, against the new schema, not port the v2 code.

| Area | Evidence (prod, 2026-10-20) | v3 |
| --- | --- | --- |
| Old Next.js web (`apps/web`) | superseded by web-2 | deleted in phase 1 |
| Dual web, `WEB_LINKS`, phase-9 operations | compatibility only | deleted in phase 1 |
| Zitadel | 1 TOTP enrolment, never verified | own auth (section 6) |
| Redis | sessions + rate limits | Postgres + nginx |
| RustFS | 16 GB, 31 tracked uploads | local disk |
| Gamification (XP, levels, streaks) | reset at cutover | removed |
| Analytics heuristics (forecasts, anomalies, risk snapshots, interventions, saved views, daily rollups) | 0 saved views, 0 interventions | removed; live SQL reports (below) |
| AI agents other than course Q&A (course analysis, lecture review, submission analysis, remediation, student memory, evals, approvals) | 13 runs ever | removed |
| OpenAI-compatible provider | Claude is primary | Anthropic only |
| Collections | 0 rows | removed, back on request |
| In-app notifications, deadline reminders | 0 notifications | removed; SSE refresh only |
| Discussions | 2 posts, 0 reactions | removed, back on request (owner decision) |
| User groups | 1 group, 22 members, 0 course links | removed (owner decision) |
| Per-assessment audiences, overrides/extensions | 0 rows each | removed, back on request |
| Bulk grading actions | 0 rows | removed |
| Generic idempotency, `Prefer`, blanket `If-Match` | infrastructure | section 4.5 |
| TOTP | see Zitadel | removed |
| ETL tables, `legacy_uuid`, legacy setting keys | import artefacts | not imported |
| OTLP export | no collector | JSON logs only |

Reports that stay, computed live with SQL (175 active learners make this instant):
gradebook with CSV export, course progress per learner, "needs grading" inbox, per-item
score distribution, completion funnel by activity.

## 10. Phases

Each phase ends green on CI and leaves production working. No phase starts while the
previous one has open items.

**Phase 0 — decisions.** Owner answers section 11. Cut list frozen. No new features on v2
from here on; v2 gets only security and data-loss fixes.

**Phase 1 — one frontend.** Cut prod over to web-2 (STAGE-2-CUTOVER.md), 7-day watch,
delete `apps/web`, the dual-web profile, `WEB_LINKS` and everything in
`phase9-removals.md`. Exit: one web container, `apps/web` gone from `main`.

**Phase 2 — host and hygiene.** Ashyq gets its own LXD VM (or host); Judge0 moves to a
separate VM. Until then on `cs01`: remove the stray `ashyq-dual-*` containers, add the
jobs retention, deploy so images match the checkout, stop running agents in the prod
checkout. Exit: the stack runs in its own VM; backups and restore drill pass there.

**Phase 3 — v3 server.** Build `apps/ashyq` next to `apps/server`, module by module in
this order: auth, catalog + content, media, progress, assessments + grading, code,
certificates, announcements, reports, Q&A, admin. The v3 contract is the v2 contract
minus the cut list, on the same `/api/v2/…` paths, so web-2 and its e2e suite are the
oracle; contract changes beyond removals wait until phase 6. Routes that v2 serves outside
a course path but that are course-scoped move under it only if web-2 moves with them in
the same commit. Each module lands with its `sqlx::test`s and its slice of the permission matrix.
Exit: web-2 (minus cut features) passes its e2e suite against v3 on imported data.

**Phase 4 — import and rehearsal.** `import-v2` complete with every check in 8.1, two
clean rehearsals on fresh backups, media copied, every password user has a hash.

**Phase 5 — cutover.** In an exam-free window:

1. Announce: everyone signs in again.
2. Maintenance page; stop v2 `server`, `worker`, `web2`.
3. Final media delta sync; `ashyq import-v2`; checks pass.
4. Start v3 (`nginx`, `ashyq`) and the web-2 build without the cut features.
5. Smoke as learner, teacher, admin; sign in with a bcrypt and an argon2 account.
6. Lift the maintenance page.

Rollback for 7 days: stop v3, start the v2 containers (their database, Zitadel, Redis and
RustFS volumes were never written by v3). Writes made in v3 since cutover are lost on
rollback; after 7 days rollback is off the table and phase 6 starts.

**Phase 6 — removal.** Delete `apps/server`, Zitadel, Redis, RustFS, their volumes
(after a final archived dump), `compose.*` overlays for them, and the docs that describe
them (`ARCHITECTURE.md`, `DECISIONS.md` and the old parts of `INFRA.md`/`RUNBOOK.md` are
rewritten for v3, with history in Git). Then the frontend SPA work in section 7 if it
was not done in phase 3.

## 11. Owner decisions

1. Cutover date for phase 1 (web-2) and the exam-free window for phase 5.
2. Cut list: confirm, especially discussions, user groups and assessment extensions.
3. Dedicated VM on `cs01` or a separate machine; where Judge0 runs.
4. Local disk instead of S3-style storage for media.
5. Alerting: one dead-man check (a cron curl of `/api/v2/health/ready` that emails on failure) or
   none. Offsite backup stays declined unless decided otherwise (FINDINGS #3).
6. Q&A: keep, with which monthly token cap.
