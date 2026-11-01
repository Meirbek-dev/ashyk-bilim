# Rewrite spec (v3)

Status: proposed 2026-10-21, revised the same day after a system audit (prod host, public
site, repo). In progress: parts of phase 0 and the first phase-5 restructuring are done (section 15),
phase 1 waits for the owner's date (section 16). Replaces `apps/web`, the current stack topology and the shape of
`apps/server`; `apps/web-2` survives as the frontend (converted to an SPA). Until phase 6
lands, `ARCHITECTURE.md`, `INFRA.md` and `RUNBOOK.md` describe production; this file
describes where it goes and in what order.

Approach: **delete first, in place.** Operations are fixed before code (phase 0). Cut
features, services and the second frontend are removed from the running system, each
step deployable with production working. The v3 server shape (section 4) and schema
(section 5) are then reached by restructuring `apps/server` module by module on the live
database. A fresh crate plus one big import (section 9.5) is the fallback, not the plan.

## 1. Why

Measured on prod 2026-10-20:

| | |
| --- | --- |
| Users / active 30 d / active 7 d | 236 / 175 / 41 |
| Courses / activities | 51 / 483 |
| Database / media | 107 MB / 16 GB |
| Submissions since cutover (2026-09-30) | 66, from 20 learners |
| Code runs | 41,167 ever, all Python (Judge0 language 71); 41,166 from one account (Jun–Oct 2026), 1 from anyone else |
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
- Two frontends receive fixes in parallel (586 of the 1,566 commits are `fix(web)` or
  `fix(web-2)`); the dual-web compatibility tax runs through the server (`WEB_LINKS`,
  20 deprecated operations, `apps/server/docs/phase9-removals.md`).

The machinery around the code grew the same way: 5 compose files, 18 services, 44
interpolated variables, 589-line CI workflow (red in 23 of the last 40 runs, 19 of them
web2-e2e), an 8.5-minute pre-push hook, 46 + 23 just recipes, 2.5k lines of `infra/dev`,
1.7k lines of web-2 gates, 95k lines of vendored agent skills and ~9k lines of docs.

Operations found by the audit on 2026-10-21 that no code rewrite fixes:

- Resend answers 403: verification and password-reset emails fail (14 in 30 h), unnoticed.
- Backups never leave `cs01`, are full 10.7 GB copies of the media store every night,
  contain `.env`/`server.env` in clear, and no restore drill has ever run on the host
  (its ports 18080/18443 are taken by other tenants).
- AI agents and editors run in the prod checkout; commits were authored there; the live
  nginx config is newer than the deployed images; stray `ashyq-dual-*` containers run.
- The host shares one Docker daemon with ~90 unrelated containers, including Portainer
  with the Docker socket on `0.0.0.0`; `user` is in `docker` and `sudo`; SSH accepts
  passwords; published Docker ports bypass UFW.
- One query (`activities … EXISTS (… is_course_staff …)`) takes 1.6 s median.
- The old web is still the default: `/ru` is 1.3 MB of HTML (1.2 MB inline RSC);
  web-2's home page carries 128 `modulepreload` links.

## 2. Goals and non-goals

Goals:

- Production keeps working after every phase; no single cutover day carries the rewrite.
- Backups leave the host, are encrypted, and a restore is rehearsed monthly.
- One Rust binary, one Postgres, one static frontend, nginx, Judge0 (if kept). Nothing
  else, in its own VM.
- Every course-scoped handler gets its access decision from one place, by construction.
- Every write that must happen together happens in one transaction, jobs included.
- Every JSONB column has a Rust type that is deserialized on write and on read.
- The kept feature set works for the existing data with the same ids and URLs.
- The tooling, CI and docs shrink with the code (sections 12–14).

Non-goals:

- Multi-tenancy, federation/OIDC, passkeys, push/email notification feeds.
- Interop until a named pilot asks (owner decision 2026-10-31): LTI 1.3 waits for a concrete
  platform/tool and a teacher using it; Platonus waits for its API docs and test access from TOU IT.
  SCORM is dropped: packages run arbitrary teacher JS, and the owner rejects both a separate
  origin and an iframe sandbox, the only safe ways to serve them.
- Feature parity with v2 for anything on the cut list (section 10).
- Horizontal scaling. One process on one host handles 100× today's load.

Size expectations (guidance, not a gate): server ≤ 30k lines of production Rust,
≤ 35 tables, ≤ 120 operations; web-2 shrinks by the cut features; docs ≤ 1,500 lines;
CI ≤ 10 minutes.

## 3. Target topology

```
browser ─► university proxy (TLS, 4 KiB response headers, ~100 MiB bodies)
             └─► VM "ashyq" on cs01
                   nginx :80/:443
                     ├─ /assets/*            static files (immutable, 1 year)
                     ├─ /media/_internal/*   internal; served after X-Accel-Redirect
                     ├─ /api/*               ashyq :8000
                     └─ everything else      ashyq :8000 (index.html + page meta)
                   ashyq (one binary: HTTP, worker loop, scheduler, SSE fan-out)
                     ├─ Postgres 18  (app data, sessions, jobs, LISTEN/NOTIFY)
                     ├─ /data/ashyq/media  (local disk, nginx reads it)
                     ├─ Resend  (email, called from jobs only)
                     ├─ Google OAuth
                     └─ Anthropic API  (course Q&A only)
                   restic (cron)  pg_dump + media ─► encrypted repo on a second machine
             VM "judge" on cs01
                   Judge0 1.13.1 (server, workers, its Postgres and Redis; privileged
                   inside the VM only), reachable from VM "ashyq" with a token
second machine (tailnet): restic repository, monthly restore drill, dead-man check
```

Containers in VM `ashyq`: `nginx`, `ashyq`, `postgres`. No backup container, no Docker
socket mounts, no init jobs (the binary runs `migrate`; Postgres roles come from the
image's `docker-entrypoint-initdb.d`).

LXD 5.21 is installed on `cs01` with no instances and `user` is in `lxd`, so both VMs cost
no hardware. A VM, not a separate compose project, is what isolates Ashyq from the other
tenants and contains the privileged Judge0 containers.

nginx stays while the host itself terminates TLS on 443 (`infra/nginx/nginx.conf.template:180`).
If direct 443 access is dropped (section 16), nginx can go too: the binary serves assets
and media with `tower-http` `ServeDir` (Range requests included).

## 4. Server

### 4.1 Layout

End state: one crate, `apps/ashyq`, organized by feature, reached in phase 5 by
collapsing the 8 `apps/server` crates module by module. No `domain`/`db`/`api` layer
crates.

```
apps/ashyq/
  Cargo.toml
  migrations/
  src/
    main.rs          serve | migrate | admin <cmd> | verify <module>
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
  rows after 30. A job outlives the deploy that enqueued it, so its payload carries a
  version and a handler still accepts the previous one for one release.
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
- How the contract changes while getting there: section 8.

### 4.6 Observability

- JSON logs; one `tracing` span per request with `request_id`, user id, route and status;
  spans on job runs and external calls (Judge0, Resend, Anthropic).
- `GET /api/v2/health` (process) and `GET /api/v2/health/ready` (database, last worker
  heartbeat, and the count of jobs that failed permanently in the last 24 h by kind), the
  paths `smoke.sh` already checks.
- No metrics backend. Alerting is the dead-man check in section 11.5.

## 5. Schema

The target schema, reached by forward migrations on the existing `ashyq` database in
phases 3–5 (section 9). Ids are kept by construction, so URLs, certificates and media
keys stay valid. `etl_*` and every `legacy_uuid` but `blocks.legacy_uuid` were dropped
2026-11-01; `blocks.legacy_uuid` and `zitadel_user_id` go once nothing reads them.

Conventions: `uuid` primary keys (`uuidv7()` default), `timestamptz`, `text` + `CHECK` for
enums, composite foreign keys wherever a row repeats its parent's `course_id`, so the
copy cannot drift. Deletes of learning records are soft (`deleted_at`) or forbidden; no
cascade from `users`. The database also holds what the code would otherwise have to
remember:

- references to other rows are foreign keys, media included (`avatar_id`, not a storage
  key), so a daily sweep can find unreferenced media by joins;
- a row that repeats several parents (a code run's item, attempt and learner) binds
  them with composite keys, so each id can be valid and the combination still wrong;
- sibling order is `unique (<parent>, position) deferrable initially deferred` with
  `position >= 1`, so a reorder renumbers in one transaction without duplicates;
- scores are `numeric` with explicit bounds that also exclude `'NaN'` (it passes
  `>= 0`), percentages are `0..100`;
- `jsonb` bodies and snapshots carry `check (jsonb_typeof(x) = 'object')`; Rust does the
  detailed validation;
- a status implies its timestamps (`status <> 'in_progress'` needs `submitted_at`).

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
  avatar_id        uuid,                     -- references media (5.2)
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
create index on sessions (expires_at);       -- the daily sweep deletes expired rows
alter table sessions add check (octet_length(token_hash) = 32 and expires_at > created_at);

create table auth_tokens (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  user_id    uuid not null references users,
  purpose    text not null check (purpose in ('verify-email', 'reset-password')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,
  check (expires_at > created_at and (used_at is null or used_at >= created_at))
);
create index on auth_tokens (user_id, purpose);
create index on auth_tokens (expires_at);    -- swept with sessions

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
  cover_id    uuid,                         -- references media
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
  position  integer not null check (position >= 1),
  version   integer not null default 1,
  unique (id, course_id),
  unique (course_id, position) deferrable initially deferred
);

create table activities (
  id           uuid primary key default uuidv7(),
  course_id    uuid not null,
  chapter_id   uuid not null,
  position     integer not null check (position >= 1),
  kind         text not null
               check (kind in ('page', 'video', 'pdf', 'quiz', 'exam', 'assignment', 'code')),
  title        text not null,
  body         jsonb not null check (jsonb_typeof(body) = 'object'),  -- ActivityBody (5.3)
  body_version smallint not null,
  required     boolean not null default true,
  published_at timestamptz,                 -- null = draft; future = scheduled
  version      integer not null default 1,
  created_by   uuid not null references users,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (chapter_id, course_id) references chapters (id, course_id),
  unique (id, course_id),
  unique (chapter_id, position) deferrable initially deferred
);

create table media (
  id          uuid primary key default uuidv7(),
  owner_id    uuid not null references users,
  course_id   uuid references courses,
  visibility  text not null check (visibility in ('public', 'private')),
  path        text not null unique,         -- relative to /data/ashyq/media/<visibility>/
  mime        text not null,
  size_bytes  bigint not null check (size_bytes >= 0),
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
a `media_id`. Media with no `activity_media`, `attempt_files`, avatar, cover or logo
reference for 24 h is deleted by a daily job; there is no reference counter to drift.
`courses.cover_id`, `users.avatar_id` and `platform.logo_id` reference `media` (added
after `media` exists).

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
  position    integer not null check (position >= 1),
  kind        text not null check (kind in ('choice', 'matching', 'code')),
  body        jsonb not null check (body->>'kind' = kind),  -- ItemBody, tagged by kind
  max_score   numeric(8, 2) not null check (max_score >= 0 and max_score <> 'NaN'),
  version     integer not null default 1,
  unique (id, activity_id),
  unique (activity_id, position) deferrable initially deferred
);

create table attempts (                      -- quizzes, exams, assignments, code
  id              uuid primary key default uuidv7(),
  course_id       uuid not null,
  activity_id     uuid not null,
  user_id         uuid not null references users,
  number          integer not null check (number >= 1),
  status          text not null check (status in ('in_progress', 'submitted', 'graded')),
  preview         boolean not null default false,   -- staff preview, excluded from reports
  answers         jsonb not null default '{}',      -- Answers, keyed by item id
  items_snapshot  jsonb not null check (jsonb_typeof(items_snapshot) = 'object'),  -- frozen at start
  policy_snapshot jsonb not null check (jsonb_typeof(policy_snapshot) = 'object'),
  started_at      timestamptz not null default now(),
  deadline_at     timestamptz,
  submitted_at    timestamptz,
  auto_submitted  boolean not null default false,
  violations      jsonb not null default '[]',
  auto_score      numeric(8, 2) check (auto_score >= 0 and auto_score <> 'NaN'),
  is_late         boolean not null default false,
  version         integer not null default 1,
  foreign key (activity_id, course_id) references activities (id, course_id),
  unique (activity_id, user_id, number),
  unique (id, activity_id, user_id),
  check ((status = 'in_progress') = (submitted_at is null))
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
  raw_score     numeric(8, 2) not null check (raw_score >= 0 and raw_score <> 'NaN'),
  penalty_pct   numeric(5, 2) not null default 0
                check (penalty_pct between 0 and 100),  -- excludes 'NaN'
  final_score   numeric(8, 2) not null check (final_score >= 0 and final_score <> 'NaN'),
  feedback      text not null default '',
  item_feedback jsonb not null default '{}' check (jsonb_typeof(item_feedback) = 'object'),
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
  activity_id uuid not null,
  item_id     uuid not null,
  attempt_id  uuid,                          -- null = practice run
  client_key  text not null,
  language_id integer not null,
  source      text not null,
  status      text not null check (status in ('queued', 'running', 'done', 'error')),
  passed      integer,
  total       integer,
  cases       jsonb not null default '[]',   -- per-test results
  created_at  timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, client_key),
  -- the item is the activity's, the attempt is this learner's on that activity
  foreign key (item_id, activity_id) references assessment_items (id, activity_id),
  foreign key (attempt_id, activity_id, user_id) references attempts (id, activity_id, user_id),
  check (total >= 0 and passed between 0 and total),
  check (status <> 'done' or (finished_at is not null and total is not null))
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
  -- what the certificate shows and why it was earned, frozen at issue: recipient name,
  -- course title, the CertificateConfig used, required_total and the completed
  -- activity ids. Later edits to the course, config or profile do not change it.
  snapshot    jsonb not null check (jsonb_typeof(snapshot) = 'object'),
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
left join activities a on a.course_id = e.course_id      -- an empty course keeps its learners
                      and a.published_at <= now()
left join completions c on c.activity_id = a.id and c.user_id = e.user_id
group by e.course_id, e.user_id;
```

A completion row is written in the same transaction as the event that causes it: the
learner marking a page/video/pdf done, or a grade that passes. Certificate eligibility
is `required_total > 0 and required_done = required_total`, checked in the same
transaction, which enqueues the award job.

Learning history survives edits: `items_snapshot` and `policy_snapshot` (for `assignment`
the instructions, rubric, effective deadline and late policy) are written when the
attempt starts and a trigger refuses to change them. `grades` holds the current grade
only; every insert or change of it writes an `audit_log` row (`grade-set`,
`grade-released`) whose `data` holds the previous and the new grade, feedback and
release time, in the same transaction, so a correction stays reconstructible.
Name corrections re-issue an award (new `snapshot`, same `verify_code`, an audit row);
erasure blanks the name in it.

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
  reserved_tokens integer,                  -- set while the assistant call runs
  created_at    timestamptz not null default now()
);

-- jobs and job_schedules: keep the v2 tables as they are (migrations 0001, 0002).

create table platform (
  id       boolean primary key default true check (id),
  name     text not null,
  about    text not null default '',
  email    text not null default '',
  logo_id  uuid,                            -- references media
  settings jsonb not null default '{}',     -- PlatformSettings (typed), incl. Q&A on/off, monthly token cap
  version  integer not null default 1
);
```

The monthly Q&A budget is `sum(input_tokens + output_tokens)` over the current month's
`qa_messages`. Admission stays atomic as in v2 (BUG-349): under
`pg_advisory_xact_lock`, the sum plus the `reserved_tokens` of pending rows must leave
room, and the assistant row is inserted with its reservation before the call starts; the
call's end writes the real usage and clears `reserved_tokens`, and a pending row older
than the call timeout stops counting. No ledger or reservation tables, and parallel
requests cannot overshoot the cap.

### 5.6 Schema review 2026-11: what is left

The review's guarantees that landed are in ARCHITECTURE §8 "Schema guarantees". What follows is the rest,
in the order it can be done, each step a forward migration on the current schema (no rewrite needed first).
"Done when" is the test that proves it.

1. **Course delete with learner work** (item 3): decided 2026-11-01 - allowed after the teacher acknowledges it
   (COURSE_ARCHIVING 6.2); the cascade from `courses` stays. Nothing left here.
2. **AI run coherence** (item 6, AI-owned tables): `schema_try_check('ai_runs', 'ai_runs_finished_at_check',
   $$status NOT IN ('succeeded','failed','aborted') OR completed_at IS NOT NULL$$)` once the AI work settles
   the status set.
3. **Unchecked references** (item 8). `course_updates.linked_activity_ids` → `course_update_activities
   (update_id → course_updates ON DELETE CASCADE, activity_id → activities ON DELETE CASCADE, PK both)`, backfilled
   with `unnest` filtered by `EXISTS`, the array dropped after the writers move. `assessment_items.outcome_ids`
   names no table: becomes a link table only when outcomes become rows. Kept as text by design (documented):
   `bulk_actions.target_user_ids` (audit snapshot of a past action; users are never deleted),
   `xp_transactions.source_id` / `gamification_completions.source_id` (journal entries must outlive a deleted
   activity or course; their key is `(source, source_id)`), `item_feedback.item_ref` (item id inside a frozen
   `items_snapshot`, item 13 replaces it), `ai_evidence.source_ref` (AI-owned).
4. **Upload references** (item 10). Add `upload_id uuid REFERENCES uploads ON DELETE SET NULL` next to each key
   column (`users.avatar_key`, `courses.thumbnail_image_key`/`thumbnail_video_key`, `chapters.thumbnail_key`,
   `collections.cover_key`, `platforms.logo_key`/`thumbnail_key`, `item_feedback.annotation_key`) and a
   `block_uploads (block_id → blocks ON DELETE CASCADE, upload_id → uploads)` table for `blocks.content->>'file_key'`;
   backfill by `uploads.key`. Writers set the id with the key; the reaper's "referenced" test becomes `EXISTS` over
   those columns and `block_uploads` instead of `referenced_count`; drop the counter (and BUG-209/263's
   repair code) once a release ran with both. Done when: the reaper test that drifts the counter by hand still
   keeps the file.
5. **Enrolments** (item 11). `enrolments (course_id, user_id, enrolled_at, PK both)` as in 5.4, backfilled from
   `trail_runs JOIN trails`; `has_trail_run` / `course_members` / `takes_assessments` read it; trail writers
   insert/delete it in the same transaction; then `trail_runs`/`trails` lose their membership role (steps stay
   until 7). Done when: `progress_flow` and `permission_matrix` pass with `trails` emptied in a test.
6. **One submission pipeline** (item 12). `file_submission_attempts` becomes `submissions` rows of an
   `assessments.kind = 'assignment'` task: map `file_submissions` → `assessments` (policy columns already
   overlap), attempts → `submissions` (files to an `attempt_files` table as in 5.4, grades to `grading_entries`;
   `file_grading_entries` merges into it). The projector's submission and file-attempt branches
   (`projector.rs`, legacy `_apply_progress_from_submissions` / `_recalculate_file_submission_progress`) become one. Needs the AI grading reader to move with it: schedule
   after the AI rubric-draft work lands, behind a contract-compatible read model.
7. **Assessment versions** (item 13). `assessment_versions (id, assessment_id, number, policy jsonb, items
   jsonb, created_at, UNIQUE (assessment_id, number))` written when an assessment is published or changed while
   published; `submissions.assessment_version_id` replaces `items_snapshot`/`policy_snapshot` (backfill: one
   version per distinct snapshot pair, by md5). The 45 `assessments` columns split into identity/lifecycle
   (stay) and policy (move to the version's typed `policy`). Same scheduling constraint as 6.
8. **Projections** (items 15, 16 long term). `maintenance:reconcile` logs drift weekly now; when it reports
   zero for a month, replace `course_progress` with the 5.4 view over `completions` and compute
   gamification totals from the journals in the leaderboard query (an index on `xp_transactions (user_id)`
   already exists), dropping the counters.
9. **Settings and translations** (item 17). Four mechanisms today: `platforms` columns + `description_kk/_en`,
   `about_kk/_en` (column per language), `activities.settings` / `file_submissions.settings` JSONB,
   `gamification_config` (versioned row), `ai_feature_switches` / `feature_activations`. Target: one typed
   `platform.settings` (5.5) read through a serde struct with defaults, and `translations (entity, entity_id,
   field, lang, text, PK all but text)` for user-visible platform text; activity settings move into the typed
   body (5.3).
10. **Users state** (item 20, rest). `status` + `deleted_at` + nullable `email_verified` → `disabled_at`,
    `deleted_at`, `email_verified_at` (NULL = not verified; backfill `email_verified IS TRUE` → `created_at`);
    a CHECK that a deleted user is anonymised. `roles.display_name_key`/`description_key` vs
    `display_name`/`description`: keep only the keys for built-in roles, plain text for custom ones
    (CHECK exactly one set). `profile_version` starts at 0 while every other version starts at 1: leave it
    (the web's If-Match sends what it read).
11. **Search index** (item 23). `search_matches(hay, words, letters, negated)` applies its regexes inside a
    function over arrays, so no index applies. Rewrite the search queries with `QueryBuilder`: one `search_fold(title || ' ' || ...) ~ $n` predicate
    per term in the WHERE clause, then `CREATE INDEX ... USING gin (search_fold(...) gin_trgm_ops)` per
    searched table (`pg_trgm`, trusted, can be created by `ashyq`). Terms under 3 characters fall back to a scan
    (trigram limit). Then drop the tsvector columns if ranking moves to `similarity()`. Done when: the
    existing `search.rs` tests pass and `EXPLAIN` shows a bitmap index scan on a 10 000-course fixture.
12. **Natural keys** (item 26). `activity_progress`, `course_progress`, `gamification_profiles`, the `daily_*`
    rollups and `learner_risk_snapshots` have a uuid PK plus the unique natural key, and code reads the uuid
    (projector rows, prune batches `WHERE id IN (...)`, the leaderboard keyset cursor carries the profile id).
    Switch each reader to the natural key first (prune by `ctid` batches or by date), then promote the unique
    constraint to the PK and drop `id`. `daily_teacher_metrics` keeps a surrogate key (nullable teacher, `NULLS
    NOT DISTINCT`).
13. **One touch trigger** (item 27). `touch_row()` BEFORE UPDATE: `updated_at = now()` unless
    `ab.bookkeeping`, `version = OLD.version + 1` when the table has `version` and the caller did not set it;
    replaces `set_updated_at` + `bump_version` pairs (trigger order by name today). Version columns stay their
    current type (`submissions`/`file_submission_attempts` bigint, the rest integer): the contract carries
    them as integers either way. Done when: every optimistic-lock test still answers 412 on a stale write.
14. **Permissions** (item 19, rest). `Grant::parse` can read `role_permissions.resource/action/scope`
    directly (the columns exist since 2026-11); a CHECK on `resource` against the Rust enum list would turn the
    enum into a lookup table like `notification_kinds`.

### 5.7 Schema review 2 (2026-11-01): owner decisions

A second pass over the schema after 5.6 landed. The owner settled these; each step is a forward migration or a
config change on the current stack.

Done:

- Grade journals guard the whole row (`file_grading_entries` had no guard; `grading_entries` compared a column
  list): `20261102000000_ledger_guards`, `schema_review.rs`.
- Skipped checks are reported, not fatal: `just prod-report` lists `schema_skipped_checks`, `just brief` names them.
- Migrations deploy during classes: `migration_rules.rs` enforces `lock_timeout`, CONCURRENTLY indexes in
  `-- no-transaction` files, and expand/contract (`-- contract:` marker) from 2026-11-02 on. The 2026-11-01
  migrations predate it: their first deploy builds ~45 indexes in one transaction, so it goes in a quiet window.
- Erasing a person is one command (`ashyq admin erase-user`, RUNBOOK 2.3); self-deletion erases the same
  derived data (`erase_personal_data`); `erasure.rs` classifies every key onto `users`. Work embeddings are
  found through the person's submissions and attempts, so they need no `user_id`. The AI tables that cascade from
  `users` (mastery, grade drafts) stay CASCADE: they are derived, the command deletes them anyway, and a learner
  with drafts has submissions, which RESTRICT the delete.

Decided, not done:

1. **Recovery point**: a day of work (nightly dump) is acceptable; no WAL archiving. Backups stay on the
   production host (FINDINGS 3, reconfirmed).
2. **Day boundaries**: one platform time zone (`Asia/Almaty`, config) for the XP daily cap, streaks and rollup
   dates; date parameters bind as `date`; past daily rows are rebuilt once.
3. **Certificates freeze what was issued**: holder name, course name, score and issue date are stored on the
   certificate row; verification shows them; a name change re-issues.
4. **Learner search and AI context check visibility at query time** (activity published, course not archived,
   the caller's access) instead of the copied `content_chunks.published`, which is dropped (expand/contract).
5. **Postgres settings as one file** (`infra/postgres/postgresql.conf`): memory sized to the 1 GB container,
   `random_page_cost = 1.1`, `pg_stat_statements` with a top-by-total-time section in `prod-report`,
   `log_lock_waits`, `log_autovacuum_min_duration`, `log_temp_files`, `track_io_timing`; the pool sets
   `statement_timeout` and `application_name`; Zitadel's role gets a connection limit.
6. **Journals are protected by privileges too**: the app role loses UPDATE/DELETE on grade and audit journals;
   retention runs through a SECURITY DEFINER function owned by the schema owner. Lands with the role switch
   (QUESTIONS Q-2026-11-01-2).
7. **Analytics events are written in the action's transaction** (`events::record` takes the transaction) and
   carry a `schema_version` in the payload.
8. **AI retention**: runs, artifacts, Q&A messages and analyses 400 days, like `analytics_events`; an accepted
   AI grade draft lives as long as the grade. `ai_threads.retention_class` is dropped.
9. **Rollback without restore**: once every migration since the previous release is expand-only (no
   `-- contract:` file), `rollback.sh` may skip the "migrations differ" refusal.

## 6. Auth

Lands in phase 4, inside the current server, replacing Zitadel and Redis sessions.

### 6.1 Passwords

- argon2id (m=19 MiB, t=2, p=1), PHC string in `users.password_hash`.
- The switch copies each user's latest Zitadel hash (section 9.2). At login, a
  `$2a$`/`$2b$` hash is verified with bcrypt and replaced by argon2id in the same request;
  an `$argon2…` hash is verified as is.
- A user with no hash signs in with Google or uses password reset. This depends on email
  delivery working (phase 0).
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
- All Redis sessions end at the phase-4 auth switch. Users sign in again once.

### 6.3 Authorization

Lands in phase 5, module by module.

Three global roles in code, not in tables: `learner`, `teacher` (may create courses),
`admin` (everything). Course rights come from `course_staff` (`owner`, `editor`) and
`enrolments`. The v2 permission tables, `moderator` and `maintainer` (0 users) and
`instructor-legacy-grants` go away.

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
- The `permission_matrix` test stays and grows: every route in the OpenAPI document is
  called as anonymous, learner, enrolled learner, other teacher, course editor, course
  owner and admin, against an archived and a live course; an unclassified route fails.

### 6.4 Google, email

- Google OAuth (authorization code, signed `state`) is kept as is. Callback path
  `/api/v2/auth/google/callback`; the Google console entry for `/api/v1/…` and its nginx
  rewrite are removed first.
- Verify-email and reset-password use `auth_tokens` (sha256 stored, 1 h / 24 h expiry)
  and send through a job. TOTP is not carried over (one enrolment ever, never verified).

## 7. Frontend

`apps/web-2` stays the codebase and becomes the only frontend in phase 1. Changes, in order:

1. **SPA (phase 1, with the cutover).** Drop TanStack Start's server (`serve.ts`): build
   static files, nginx serves `/assets/*` with `immutable`; the server answers every
   page path with `index.html`. For public course and catalog paths the server fills
   `<title>`, description and Open Graph tags from the database before sending it
   (string replace on the file read at boot); `sitemap.xml` lists only routes that exist.
   No Node container, no header forwarding, no `useHydrated` gates.
2. **CSP** becomes static and is sent by nginx: the directives of
   `src/shared/lib/csp.ts` with `script-src 'self'` in place of the nonce and
   `strict-dynamic`. The university proxy adds a second `X-Frame-Options`, HSTS and a
   conflicting `Referrer-Policy`; ask IT to stop adding them.
3. **Chunking.** The home page lists 128 `modulepreload` links; group vendor and route
   chunks so the first page loads a handful of files.
4. **Cut features** follow the server (section 10): routes, queries, SPEC files and e2e
   specs for cut features are deleted, not hidden, in the same commit as the server side.
5. **Tests.** e2e selects by role, label and message key, never by literal Russian text.
   Keep the editor content-loss check and the contract/codegen gate. Drop the 300/80-line
   caps, one-component-per-file, the behaviour-id bookkeeping and the gates whose only job
   is process (keep: format, lint, typecheck, unit, contract, e2e).
6. **Toolchain** pinned to stable releases of TypeScript, Vite and Vitest; no aliased
   or pre-release build tools (`vite-plus`) and no loader shims (`gates/ts6-*.mjs`).
7. **One markdown/rich-text path:** Tiptap renders read-only views too.

Items 4–7 land in phases 1–3 as they become possible.

Kept as they are: generated client from OpenAPI (hey-api), loader prefetch +
`useSuspenseQuery`, `meta.invalidates`, the routes → features → shared import rule,
shadcn, Paraglide with the ru/kk/en catalogs, `allowed_actions`-driven UI.

## 8. Contract during the migration

There is one client, web-2, in the same repository, and from phase 1 on no other. So the
contract does not need a frozen oracle; it changes together with its client:

- A commit that changes an operation changes the handler, the committed `openapi.json`,
  the regenerated web-2 client, the web-2 code that calls it and the affected e2e specs.
  CI's codegen drift gate fails if any of them disagree.
- Phases 1–4: shape changes are removals only (cut features, the 20 deprecated
  operations, `WEB_LINKS`). Auth (phase 4) keeps the web-2-facing operations and changes
  only what is behind them.
- Phase 5: shape changes happen per module (`blocks` → typed bodies, one pagination
  shape, the reduced `If-Match` set, routes moving under `/courses/{course_id}`). The
  check for a module is its e2e specs as updated in that commit, the rest of the e2e suite
  unchanged, and the full permission matrix.
- Paths stay `/api/v2/…`. No version bump and no compatibility operations: with one
  client shipped from the same commit there is nothing to stay compatible with.

## 9. Data migration

### 9.1 In place

Every schema change in phases 3–5 is a forward migration on the live `ashyq` database:

- `just deploy` already dumps before migrations run; a destructive migration (drop,
  type change, table merge) additionally requires a restore rehearsal (9.4) of the same
  commit to pass first.
- A data-moving migration ships with `ashyq verify <module>`, which the deploy runs after
  migrating and which fails the deploy (rollback = restore the pre-migration dump) when:
  - row counts differ from the source minus documented exclusions;
  - any `activities.body` or `assessment_items.body` fails to deserialize into its type;
  - G-14 fails on a page: the Tiptap document rendered from the new body differs from the
    old rendering (text, node count, media references);
  - a `course_progress` view row differs from the old projection's
    `completed_required_count`/`total_required_count` without a listed reason (known:
    Q-2026-09-26-1 empty assignments);
  - a certificate `verify_code` does not resolve, or an award has no `snapshot`;
  - a row breaks a cross-parent rule (activity vs chapter course, attempt vs activity,
    code run vs item/attempt/learner), or a constraint is still `NOT VALID`;
  - a handed-in attempt has no items/policy snapshot;
  - grade history shrank: every v2 `grading_entries`/`file_grading_entries` row is a
    `grades` row or a `grade-set` audit row;
  - completion evidence is lost: a passing graded submission or a completed
    `activity_progress` row has no `completions` row;
  - a media id or storage key referenced anywhere has no `media` row.
- Old tables are dropped one deploy after the code stops reading them, never in the
  same deploy.

Where each v2 table goes and in which phase:

| v2 | target | phase |
| --- | --- | --- |
| tables of cut features (section 10) | dropped after a per-table dump | 3 |
| `etl_*`, `legacy_uuid` columns, legacy setting keys | dropped | 3 |
| Zitadel eventstore | `users.password_hash` (9.2) | 4 |
| `user_roles` | `users.role` (admin > instructor/legacy-grants → teacher > learner) | 4 |
| `uploads` + RustFS objects | `media` (status `ready` only) + `/data/ashyq/media` (9.3) | 4 |
| `resource_authors` | `course_staff` (creator → owner, contributor → editor, active only) | 5 |
| `activities` + `blocks` | `activities` with typed `body`; block media → `media` + `activity_media` | 5 |
| `assessments` | `activities.body.policy` for quiz/exam/code | 5 |
| `file_submissions` | `activities.body` for `assignment` | 5 |
| `submissions` + `grading_entries` | `attempts` + `grades` | 5 |
| `file_submission_attempts` (+ files, grading) | `attempts` (+ `attempt_files`, `grades`); 0 rows today | 5 |
| `code_runs` + `code_run_cases` | `code_runs` (cases folded into `cases`) | 5 |
| `trail_runs` | `enrolments` | 5 |
| `activity_progress` (completed) | `completions` | 5 |
| `certifications`, `certificate_users` | `certificates`, `certificate_awards` (same `verify_code`) | 5 |
| `course_updates` | `announcements` | 5 |
| `ai_threads`, `ai_qa_messages` | `qa_threads`, `qa_messages` | 5 |
| `platforms` | `platform` | 5 |
| `auth_audit_log`, `assessment_audit_events` | `audit_log` | 5 |

### 9.2 Password hashes

Zitadel keeps hashes in `eventstore.events2` payloads (`encodedHash`). On 2026-10-20:
23 `$2a$` (bcrypt, imported from the legacy system), 105 `$argon2…`, 109 `user.human.added`
events without a hash (Google-only accounts or hashes set by later events). The phase-4
migration takes the latest hash-bearing event per Zitadel user (`user.human.added`,
`user.human.password.changed`, and any other event type found carrying `encodedHash`),
maps it through `users.zitadel_user_id`, and reports users who had a password login in
`auth_audit_log` but get no hash. That list must be empty, and the rehearsal (9.4) must
sign in as one bcrypt and one argon2 user, before the switch ships.

### 9.3 Media

RustFS stores objects in its own on-disk format, so files are copied through its S3 API
(`rclone sync` from `ab-public` and `ab-private`) into `/data/ashyq/media/{public,private}/`
with the same keys. `media.path` = the v2 key. Run once ahead of the switch, then again
right before it for the delta; the switch deploy flips reads to disk and nginx
`X-Accel-Redirect`.

### 9.4 Rehearsal

Use the restore recipe (latest backup from the restic repository → local stack) and run
the destructive migration plus `ashyq verify` on it, then the web-2 e2e suite and the
permission matrix against the result. A destructive migration ships only after it passes
on a backup no older than 24 h.

### 9.5 Fallback: fresh crate and one import

If restructuring a module in place costs clearly more than writing it fresh, that module
is written in `apps/ashyq` instead and its data moves with an `ashyq import-v2 <module>`
step that applies the same mapping and the same checks. The target schema and ids are the
same either way. A whole-system import with one cutover is the last resort: it trades the
per-phase rollback for a window in which every write since cutover is lost on rollback.

## 10. Cut list

Removed in phase 3 (services in phase 4). Data stays in the per-table dumps and the final
v2 backup. "Back on request" means rebuild when a teacher asks, against the new schema,
not port the v2 code.

| Area | Evidence (prod, 2026-10-20) | v3 |
| --- | --- | --- |
| Old Next.js web (`apps/web`) | superseded by web-2 | deleted in phase 1 |
| Dual web, `WEB_LINKS`, phase-9 operations | compatibility only | deleted in phase 1 |
| Zitadel | 1 TOTP enrolment, never verified | own auth (section 6), phase 4 |
| Redis | sessions + rate limits | Postgres + nginx, phase 4 |
| RustFS | 16 GB, 31 tracked uploads | local disk, phase 4 |
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
| ETL tables, `legacy_uuid`, legacy setting keys | import artefacts | dropped |
| OTLP export | no collector | JSON logs only |
| Code activities + Judge0 | 1 run ever outside one account's 41,166 | owner decision (section 16): keep in VM `judge`, or back on request |

Reports that stay, computed live with SQL (175 active learners make this instant):
gradebook with CSV export, course progress per learner, "needs grading" inbox, per-item
score distribution, completion funnel by activity.

## 11. Stack and operations

### 11.1 Host

- VM `ashyq` (LXD on `cs01`): Docker + one `compose.yaml`, `/data/ashyq/{postgres,media}`
  on a volume backed by `/data`. Nothing else runs in it: no editors, no agents, no
  checkout, no other tenants. SSH by key only.
- VM `judge` (if kept): Judge0 server, 2 workers, its Postgres and Redis, with CPU and
  memory limits; its port is reachable from VM `ashyq` only, with `AUTHN_TOKEN` set.
- Until phase 2 lands, on `cs01` directly: no agent or editor sessions in
  `~/cs-mooc`, no commits there, no ad-hoc `docker compose` runs from it.

### 11.2 Compose and config

- One `compose.yaml` for prod with no overlays; dev uses the same file with a `dev`
  profile for the extras it needs. `compose.{prod,dev,smoke,web2}.yaml`,
  `infra/compose.{nginx,dual}-check.yaml` and the four init jobs go.
- nginx: one static config directory mounted as a directory (no single-file bind mounts,
  no forced recreate), `server_name` the only templated value, no `COMPOSE_PROFILES`
  `map`, security headers and CSP in one include.
- `.env` holds secrets only and is never edited by a script. The image tag lives in
  `release.env`, written by `just deploy`.

### 11.3 Deploy and rollback

- `just deploy <sha>` (from the dev box): waits for the image `<sha>` on GHCR, copies
  `compose.yaml`, the nginx directory and `release.env` to the VM, dumps the database
  when the image's migrations differ, runs `ashyq migrate` and `ashyq verify`, restarts,
  smokes `health/ready` locally and through the public URL (header size check included),
  appends to `deploy-history`. On failure it rolls back to the previous tag (and the dump
  when migrations ran).
- The VM needs no git: rollback compares the migration lists embedded in the two images.

### 11.4 Backups

- restic, run by cron in VM `ashyq`: `pg_dump -Fc` of `ashyq` plus `/data/ashyq/media`,
  into an encrypted repository on a second machine on the tailnet (section 16). restic
  deduplicates, so a night costs the delta, not 10.7 GB. Retention: 7 daily, 4 weekly,
  6 monthly.
- Secrets (`.env`, restic password) are not in the backups; their copy lives in the
  owner's password manager.
- Monthly drill on the second machine: `restic restore` into a throwaway stack, migrate,
  smoke, sign in with `login-as`. The drill writes its result next to the repository.
- Until phase 2: the same restic setup on `cs01`, replacing the `backup` container and
  its Docker socket mount.

### 11.5 Alerting

A cron on the second machine every 5 minutes: `curl /api/v2/health/ready` through the
public URL; it alerts the owner when the check fails twice in a row or when the response
reports permanently failed jobs (failed email jobs included). No external monitoring
service. The alert channel is an owner decision (section 16).

### 11.6 Judge0

Kept only if code activities stay (section 16). It runs in VM `judge` with resource
limits, not on the app host. The server treats it as optional: when it is down, code
items return `code-runner-unavailable` and nothing else breaks.

## 12. CI

- One workflow, three jobs, target under 10 minutes:
  1. `rust`: fmt, clippy, `sqlx` offline check, nextest, `openapi.json` diff.
  2. `web`: format, lint, typecheck, unit, codegen drift, build.
  3. `e2e`: build the image, start the stack from it, Playwright, then push the image as
     `<sha>` (on `main`, green only).
- Deleted: `stack-smoke` and its stub web, the dual-web and nginx-check tests (after
  phase 1), the `ci-<sha>` → `<sha>` retag job, `infra/tests/development.test.mjs`, the
  web (Next) jobs (phase 1).
- A failing e2e test is fixed or quarantined (skipped with a line in `apps/web-2/BACKLOG.md`)
  the same day. A phase exit requires two consecutive green runs on `main`.

## 13. Developer and agent tooling

- Hooks: pre-commit formats the staged files; pre-push runs the fast checks (rustfmt,
  clippy on changed crates, typecheck, unit; under 2 minutes). The full `just check` and
  e2e run in CI.
- `justfile` under 20 recipes: `stack up|down|logs`, `db reset|sql`, `login-as`, `check`,
  `e2e`, `fmt`, `deploy`, `rollback`, `backup`, `restore-drill`, `wt new|land`.
  `apps/server/justfile` merges into it.
- `infra/dev` shrinks from 2.5k lines to the code those recipes need (~300 lines).
- web-2 gates: keep codegen drift; delete the other G-03…G-13 gates, `SPEC.md` files,
  behaviour ids and `next-id`.
- Vendored third-party skills (`.agents/skills`, 95k lines, `skills-lock.json`,
  `skills-sync`) are deleted; project-written skills stay in `.agents/skills` (at most a
  few), third-party ones are installed per user.
- One lockfile: web-2 joins the root workspace (or the root `package.json` goes).
- Housekeeping on the dev box: `git gc`; `temp-restore/` (a prod backup with secrets and
  personal data) deleted; restores come from the restic repository.
- Agent workflow during the rewrite: one agent per phase item or module, landing with its
  tests and its slice of the permission matrix. No gauntlet or QA sweep loops and no
  feature work until phase 6 ends. Agents never run on the prod host.

## 14. Docs

- `DECISIONS.md` is frozen (2026-10-31): no appends. A new decision changes the doc that
  describes the behavior in place, and its commit message says why.
- Deleted after phase 1: `STAGE-2-CUTOVER.md` (it absorbed the stage 2 scope and acceptance
  docs), `apps/server/docs/phase9-removals.md`, the web-2 `SPEC.md` files.
- End state after phase 6, under 1,500 lines: `README.md`, `ARCHITECTURE.md` (v3, with
  `COURSE_ARCHIVING.md` folded in), `OPERATIONS.md` (`INFRA.md` + `RUNBOOK.md` merged),
  `FINDINGS.md`, the `AGENTS.md` files. `DECISIONS.md` and this file are deleted; their
  history stays in Git.

## 15. Phases

Each phase ends with two consecutive green CI runs on `main` and production working. No
phase starts while the previous one has open items.

**Phase 0 — operations and freeze.**

- Email: Resend 403 fixed (owner), a reset email received end to end.
- Backups: restic to the second machine (11.4) replaces the `backup` container; first
  restore drill passes there.
- Alerting: dead-man check (11.5) live.
- Prod host: agents and editors out of `~/cs-mooc`; deploys only through `just deploy`; IT asked to
  turn off SSH password auth and the proxy's duplicate headers. Done 2026-10-31: no `ashyq-dual-*` containers left;
  `ashyq_backup_verify_20260930`, `ashyq_final_backup_verify_20260930` and `zitadel_bootstrap_failed_20260930`
  dropped after a `pg_dump -Fc` each (kept off Git on the host); `cs_mooc`, ex-`openu`, stays (owner decision).
- The slow `activities … is_course_staff` query fixed. Done 2026-10-31: `activities_with_learner_work` checks
  staff per distinct author plus an index on `code_runs (assessment_id, user_id)` (1.4 s -> 27 ms on 41k runs).
- Dev box: `temp-restore/` deleted, `git gc`. Done 2026-10-31.
- Freeze: no new features; v2 gets only security, data-loss and phase-0 fixes. Flaky e2e
  quarantined (section 12); `DECISIONS.md` frozen.

Exit: restore drill from the off-host repository passed; emails delivered; alert fired
once on purpose.

**Phase 1 — one frontend, as an SPA.** Cut prod over to web-2 (STAGE-2-CUTOVER.md) as the
static build of section 7 items 1–3, with the server filling page meta; dual web off.
7-day watch, then delete `apps/web`, the Node `web` and `web2` containers, the
dual-web profile, `WEB_LINKS`, the deprecated operations, the Next CI jobs and the docs
listed in section 14. Exit: no Node container in prod, `apps/web` gone from `main`.

**Phase 2 — host.** VMs `ashyq` and `judge` (11.1), stack moved with a dump/restore and a
media copy in a short maintenance window, deploys by tag (11.3), backups and drill
running from the VM. Exit: nothing of Ashyq left on `cs01`'s Docker daemon except the
retained v2 volumes; drill passes.

**Phase 3 — deletions.** Cut features (section 10) removed from server and web-2 in the
same commits, their tables dropped after per-table dumps, ETL leftovers dropped. Compose
overlays, CI jobs, tooling and gates trimmed per sections 11.2, 12 and 13. Exit: measured
lines, tables and operations recorded here; CI under 15 minutes.

**Phase 4 — services.** Each its own deploy with its own rollback:

1. Worker folded into the server binary (one container).
2. Media from RustFS to disk (9.3); RustFS stopped, volume kept.
3. Own auth (section 6, 9.2), sessions and rate limits in Postgres; Zitadel and Redis
   stopped, volumes kept. Users sign in once; announce it a week ahead, ship in a
   low-traffic window, and keep Zitadel startable for 14 days as the rollback.

Exit: containers are `nginx`, `ashyq`, `postgres`.

**Phase 5 — restructure.** Module by module, in this order: catalog + content, media,
progress, assessments + grading, code, certificates, announcements, reports, Q&A, admin.
Each module lands with `CourseCtx`/`Caps` (6.3), transactions and jobs (4.3), typed
bodies (5.3), its data migration and `ashyq verify` (9.1), its `sqlx::test`s, its web-2
changes (section 8) and its permission-matrix slice; the crates collapse into
`apps/ashyq` as their contents move. Exit: one crate, the size expectations of section 2
checked.

Started 2026-10-31, across modules (4.3): progress re-projections are owed in the writer's
transaction (`Followup`, ARCHITECTURE 9) instead of enqueued after commit; chapter and
activity delete/move/renumber run in one transaction; a quiz hand-in commits with its
snapshots, grade entry and audit row. `CourseCtx`/`Caps` (6.3) in the catalog module (courses,
curriculum, contributors) on the v2 permission model: one load, `require(Caps)`, the archive
rule in one place, `allowed_actions` from the same caps. Left: `CourseCtx` in the other
modules and as an axum extractor, role grant changes (with 6.3), typed bodies (5.3), the
remaining `&PgPool` db functions.

**Phase 6 — removal.** After a final archived dump: Zitadel, Redis and RustFS volumes, the
v2 tables left only for rollback, the `cs_mooc` database if the owner agrees. Docs rewritten
per section 14.

## 16. Owner decisions

1. Date for phase 1 (web-2 cutover) and the low-traffic window for the phase-4 auth switch.
2. Cut list: confirm, especially discussions, user groups and assessment extensions.
3. Code activities: keep Judge0 in VM `judge`, or cut it (back on request). Prod shows 1
   run outside one account's 41,166 (all Python).
4. Backups: the second machine for the restic repository and the dead-man check (the dev
   box over the tailnet, or another). This reverses "no offsite backup" (FINDINGS #3)
   for a machine the owner controls.
5. Alert channel for the dead-man check (email from the checking machine, or another).
6. Resend: fix the API key or domain behind the 403.
7. Is direct 443 access to the host needed? If not, nginx can be dropped (section 3).
8. Q&A: keep, with which monthly token cap.
