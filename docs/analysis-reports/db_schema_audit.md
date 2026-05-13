# Ashyk Bilim LMS — Schema Architectural Audit & Refactoring Playbook

> **Stack:** PostgreSQL 18 · FastAPI · Alembic · SQLModel · Judge0 · pgvector  
> **Scope:** ~60 tables, full constraint/index scan performed  
> **Classification:** P0 = Data Integrity Blocker · P1 = High-Impact Feature Gap · P2 = Design Improvement

---

## Part 1 — Prioritized Flaw Catalogue

### P0 — Data Integrity Blockers

These issues silently corrupt data or make correct reasoning about records impossible.

---

#### P0-1 · Timestamp Type Chaos (18+ columns across 15+ tables)

The schema has **three different representations** for timestamps, all co-existing:

| Table | Column | Current Type | Problem |
|---|---|---|---|
| `activity` | `creation_date`, `update_date` | `CHARACTER VARYING` | Entirely untyped. No DB-level ordering, arithmetic, or indexing |
| `block` | `creation_date`, `update_date` | `TEXT` | Same |
| `certifications` | `creation_date`, `update_date` | `TEXT` | Same |
| `certificateuser` | `created_at`, `updated_at` | `CHARACTER VARYING` | Same |
| `collection` | `creation_date`, `update_date` | `TEXT` | Same |
| `examattempt` | `started_at`, `submitted_at` | `CHARACTER VARYING` | Timing arithmetic is impossible |
| `hint_usage` | `unlocked_at` | `CHARACTER VARYING` | Same |
| `role` | `creation_date`, `update_date` | `CHARACTER VARYING` | Same |
| `trail`/`trailrun`/`trailstep` | `creation_date`, `update_date` | `TEXT` | Same |
| `auth_audit_log` | `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | Loses timezone offset; incorrect for KZ users in different locales |
| `auth_sessions` | `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | Security-critical table, session expiry math will be wrong |
| `xp_transactions` | `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | Daily streak calculations will break at DST boundaries |
| `gamification_profiles` | `created_at`, `updated_at`, `last_xp_award_date` | `TIMESTAMP WITHOUT TIME ZONE` | Same |
| `analytics_event` | `event_ts` | `TIMESTAMP WITHOUT TIME ZONE` | Event ordering across timezones is wrong |

These are Rails-era remnants. The newer FastAPI tables (`submission`, `assessment_policy`, `activity_progress`) use `TIMESTAMP WITH TIME ZONE` correctly. The fix is to normalize everything to `TIMESTAMPTZ`.

---

#### P0-2 · Floating-Point Money

```sql
-- paymentsproduct
amount double precision NOT NULL
```

`DOUBLE PRECISION` stores amounts in IEEE 754 binary. `99.95 KZT` may be stored as `99.94999999999999`. For Kaspi payments, Stripe reconciliation, and invoice generation, this **will cause rounding discrepancies** in production. `NUMERIC(12,2)` is the universally correct type for monetary amounts.

---

#### P0-3 · `course.tags` Stored as a Flat VARCHAR

```sql
-- course table
tags character varying   -- e.g. "python,data-science,beginner"
```

This is a denormalized string blob. You cannot:
- Index tags for course search (`WHERE 'python' = ANY(...)`)
- Count how many courses have a given tag
- Rename or merge tags across all courses
- Enforce tag spelling consistency

---

#### P0-4 · `JSON` Instead of `JSONB` on Hot Columns

At least 18 columns on performance-critical tables use the `JSON` type instead of `JSONB`. `JSON` is stored as raw text (re-parsed on every access) and **cannot be indexed with GIN**. `JSONB` is stored in a decomposed binary form that supports operators, GIN indexes, and partial updates.

Most impacted columns: `activity.content`, `activity.details`, `activity.settings`, `assessment_item.body_json`, `assessment_policy.late_policy_json`, `assessment_policy.anti_cheat_json`, `submission.answers_json`, `submission.grading_json`, `submission.raw_grading_json`, `learner_risk_snapshot.reason_codes`, `analytics_event.payload`.

---

#### P0-5 · `creator_id` Columns Are Orphaned `BIGINT`s

```sql
-- activity, chapter, course, collection, usergroup all have:
creator_id bigint   -- NO foreign key constraint!
```

The `user` table's PK is `INTEGER`. These `creator_id` columns are `BIGINT` with no FK — they are dangling Rails-era user IDs that reference nothing PostgreSQL knows about. If you look up `creator_id = 42` from `course`, that user may not exist in your `user` table, and the DB will not stop you from deleting them.

---

#### P0-6 · Duplicate & Conflicting Role System

You have two completely separate RBAC systems:

**System A (Rails-era):** `role` (rights stored as raw JSON), no FK to any user table.

**System B (FastAPI):** `roles` + `permissions` + `role_permissions` + `user_roles` — a proper, normalized RBAC system with slugs, priorities, and FK constraints.

These are not connected. Any FastAPI RBAC checks go through System B. System A is dead weight with potential for confusion.

---

#### P0-7 · `submissions` Table Is a Floating Judge0 Mirror

```sql
CREATE TABLE public.submissions (   -- Judge0 raw mirror
    id integer,
    source_code text,
    token character varying,
    ...
);
CREATE TABLE public.submission (    -- Your LMS submission model
    id integer,
    submission_uuid character varying,
    ...
);
```

`submissions` (plural) is a direct copy of Judge0's internal submission schema, likely from running Judge0 in the same DB. It has no FK to `code_run`, `user`, or any LMS entity. Meanwhile `code_run` tracks Judge0 tokens via `code_run_case.judge0_token`. The `submissions` table is **an orphan** — it is the raw Judge0 state leaked into your application schema.

---

### P1 — High-Impact Feature Gaps

---

#### P1-1 · Missing `enrollment` Table — The Most Critical LMS Primitive

`course_progress` is being used as a proxy for enrollment. This conflates two different concepts:

- **Enrollment** = the act of granting a user access to a course (has a source, a status, an expiry, a price paid)
- **Progress** = how far the user has gotten through that course

Without a dedicated `enrollment` table you cannot:
- Track who enrolled them (admin, self-service, Kaspi purchase)
- Set `access_expires_at` for time-limited courses
- Put students on a `WAITLISTED` status
- Distinguish `DROPPED` (intentional) from `NEVER_STARTED`
- Associate an enrollment with a payment transaction
- Assign a student to a specific cohort/section at enrollment time

---

#### P1-2 · No pgvector Index on `document_chunks`

```sql
-- document_chunks
embedding public.vector(512) NOT NULL
-- No HNSW or IVFFlat index declared anywhere in the schema
```

Every RAG query against this table performs a **full sequential scan**, computing cosine distances for every single row. At 10,000 chunks this is slow; at 100,000 it is unusable. An HNSW index reduces search time from O(n) to O(log n) with sub-millisecond ANN latency.

---

#### P1-3 · `paymentproviderenum` Only Has `'STRIPE'`

```sql
CREATE TYPE public.paymentproviderenum AS ENUM ('STRIPE');
```

Ashyk Bilim is targeting the Kazakhstani market. Kaspi Pay is the dominant payment method in Kazakhstan (Kaspi QR and Kaspi Credit cover the majority of e-commerce transactions). Building without it means you cannot monetize the core demographic. The enum needs `KASPI_PAY`, `KASPI_CREDIT`, `CLICK`, `PAYME` as future-proof values, and `paymentsproduct` needs a KZT-aware currency field.

---

#### P1-4 · Unused Enums — Type Safety Holes

These enums exist but the corresponding columns use `CHARACTER VARYING` instead:

| Table | Column | Declared Enum | Actual Type |
|---|---|---|---|
| `submission` | `status` | `submissionstatus` | `character varying` |
| `submission` | `assessment_type` | — | `character varying` |
| `assessment` | `grading_type` | `gradingtypeenum` | `character varying` |
| `assessment` | `lifecycle` | — | `character varying` |
| `activity_progress` | `state` | — | `character varying` (no CHECK either) |
| `assessment_policy` | `grading_mode`, `completion_rule`, `grade_release_mode` | — | `character varying` |

Any typo in application code (`"COMPLTED"` instead of `"COMPLETED"`) will silently insert bad data that the DB accepts without complaint.

---

#### P1-5 · `block` Table Has No Parent Integrity Constraint

```sql
CREATE TABLE public.block (
    course_id  integer,   -- nullable
    chapter_id integer,   -- nullable
    activity_id integer,  -- nullable
    ...
);
```

All three parent FK columns are nullable. There is no CHECK constraint ensuring exactly one is non-null. A block can legally belong to zero parents (orphaned) or all three simultaneously (nonsensical). In practice, what does it mean for a block to belong to both a chapter AND an activity?

---

#### P1-6 · Missing Core LMS Domain Tables

The following tables are architecturally absent and represent gaps that world-class LMSes like Canvas and Moodle treat as first-class entities:

| Missing Table | Impact |
|---|---|
| `enrollment` | Already detailed in P1-1 |
| `course_prerequisite` | Cannot enforce "complete Course A before Course B" |
| `notification` + `notification_preference` | No in-platform notification system for due dates, grades, replies |
| `course_rating` | No student feedback / star rating on courses |
| `tag` + `course_tag` | Needed to fix P0-3 properly |
| `certificate_template` | `certifications.config json` has no structure; template HTML, issuer, validity period, verification URL are undeclared |
| `course_section` / `cohort` | `usergroup` is too generic; a proper section model carries schedule, instructor assignment, and enrollment scope |

---

#### P1-7 · `activity_progress` Unique Constraint Excludes `course_id`

```sql
-- Existing constraint:
UNIQUE (activity_id, user_id)
```

An activity can be assigned to multiple courses via the `course_id` column on both `activity` and `activity_progress`. The current unique constraint means a student can only have one progress record per activity globally, even if they're enrolled in two courses that both include that activity. The constraint should be `UNIQUE (user_id, activity_id, course_id)`.

---

### P2 — Design Improvements

---

#### P2-1 · `exam` Is a Legacy Parallel Assessment System

The `exam` and `examattempt` tables predate your `assessment` / `submission` / `grading_entry` architecture. The comment on `exam.settings` literally reads: *"Compatibility storage for older exam routes. Canonical assessment settings live on activity.settings."* This is acknowledged technical debt. Having two grading pipelines means analytics, grade calculations, and reporting logic must be duplicated.

#### P2-2 · `discussionlike` / `discussiondislike` Should Be One `discussion_reaction` Table

Two separate tables with identical structures (`discussion_id`, `user_id`, `creation_date`) where the only difference is the table name. A single `discussion_reaction` table with a `reaction_type ENUM('LIKE','DISLIKE')` column is cleaner and allows future reaction types.

#### P2-3 · `usergroupresource` Has No Type Discriminator

`resource_uuid` is a bare VARCHAR — you can't tell if it's a course, an activity, or a collection without a separate lookup. Adding a `resource_type` column and validated FKs would make group-based access control queries trivially simple.

#### P2-4 · `ar_internal_metadata` + `schema_migrations` + `clients` Are Rails Relics

These tables serve no purpose in a FastAPI/Alembic stack and should be dropped after confirming nothing references them.

#### P2-5 · `collectioncourse` Lacks a Unique Constraint

A course can be added to the same collection multiple times. `UNIQUE(collection_id, course_id)` is missing.

#### P2-6 · `xp_transactions` FK Has No Delete Behavior

```sql
ALTER TABLE ONLY public.xp_transactions
    ADD CONSTRAINT xp_transactions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public."user"(id);
    -- No ON DELETE action → defaults to RESTRICT
```

Deleting a user is blocked if they have any XP transactions. This should be `ON DELETE CASCADE` (or `SET NULL` if you want to preserve the ledger for audit purposes).

---

## Part 2 — DDL Implementations

### Fix P0-1: Normalize Timestamps to `TIMESTAMPTZ`

```sql
-- Migration: normalize legacy text/varchar timestamps to TIMESTAMPTZ
-- Run CONCURRENTLY where possible; use a maintenance window for the ALTER TYPE changes.

-- activity table
ALTER TABLE public.activity
    ALTER COLUMN creation_date TYPE TIMESTAMPTZ
        USING COALESCE(
            creation_date::TIMESTAMPTZ,
            NOW()
        ),
    ALTER COLUMN update_date TYPE TIMESTAMPTZ
        USING COALESCE(
            update_date::TIMESTAMPTZ,
            NOW()
        );

-- Rename to match the modern convention used by FastAPI tables
ALTER TABLE public.activity
    RENAME COLUMN creation_date TO created_at;
ALTER TABLE public.activity
    RENAME COLUMN update_date TO updated_at;

-- Repeat the pattern for each affected table. Template:
-- ALTER TABLE public.<table>
--     ALTER COLUMN creation_date TYPE TIMESTAMPTZ
--         USING COALESCE(creation_date::TIMESTAMPTZ, NOW()),
--     ALTER COLUMN update_date TYPE TIMESTAMPTZ
--         USING COALESCE(update_date::TIMESTAMPTZ, NOW());

-- Tables to process (all have text/varchar dates):
-- block, certifications, certificateuser (created_at/updated_at varchar),
-- collection, collectioncourse, coursediscussion, courseupdate,
-- discussionlike, discussiondislike, exam, examattempt (started_at, submitted_at),
-- hint_usage (unlocked_at), install, quiz_question_stat, resourceauthor,
-- role, trail, trailrun, trailstep, usergroup, usergroupresource, usergroupuser

-- Fix TIMESTAMP WITHOUT TZ → TIMESTAMPTZ on FastAPI tables:
ALTER TABLE public.auth_audit_log
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Almaty';

ALTER TABLE public.auth_sessions
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Almaty';

ALTER TABLE public.xp_transactions
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Almaty';

ALTER TABLE public.gamification_profiles
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Almaty',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'Asia/Almaty',
    ALTER COLUMN last_xp_award_date TYPE TIMESTAMPTZ USING last_xp_award_date AT TIME ZONE 'Asia/Almaty',
    ALTER COLUMN last_login_date TYPE TIMESTAMPTZ USING last_login_date AT TIME ZONE 'Asia/Almaty',
    ALTER COLUMN last_learning_date TYPE TIMESTAMPTZ USING last_learning_date AT TIME ZONE 'Asia/Almaty';

ALTER TABLE public.analytics_event
    ALTER COLUMN event_ts TYPE TIMESTAMPTZ USING event_ts AT TIME ZONE 'Asia/Almaty';
```

### Fix P0-2: Fix Floating-Point Money

```sql
-- Step 1: Add new column with correct type
ALTER TABLE public.paymentsproduct
    ADD COLUMN amount_numeric NUMERIC(12, 2);

-- Step 2: Copy data with rounding
UPDATE public.paymentsproduct
    SET amount_numeric = ROUND(amount::NUMERIC, 2);

-- Step 3: Verify no data loss
-- SELECT id, amount, amount_numeric FROM paymentsproduct WHERE amount != amount_numeric::float8;

-- Step 4: Swap (do in a transaction during maintenance)
ALTER TABLE public.paymentsproduct
    DROP COLUMN amount,
    ALTER COLUMN amount_numeric SET NOT NULL,
    RENAME COLUMN amount_numeric TO amount;
```

### Fix P0-3 + P1-6 (Tags): Introduce `tag` and `course_tag` Tables

```sql
CREATE TABLE public.tag (
    id          SERIAL PRIMARY KEY,
    slug        VARCHAR(100) NOT NULL,
    label       VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT  uq_tag_slug UNIQUE (slug)
);

CREATE INDEX ix_tag_slug ON public.tag USING btree (slug);

CREATE TABLE public.course_tag (
    course_id   INTEGER NOT NULL REFERENCES public.course(id) ON DELETE CASCADE,
    tag_id      INTEGER NOT NULL REFERENCES public.tag(id)    ON DELETE CASCADE,
    PRIMARY KEY (course_id, tag_id)
);

CREATE INDEX ix_course_tag_tag ON public.course_tag USING btree (tag_id);

-- Data migration: parse existing tags varchar
-- Run in Python migration script (see Part 3):
-- for each course, split tags on comma, insert into tag (upsert on slug),
-- insert into course_tag.
-- After migration, drop the old column:
ALTER TABLE public.course DROP COLUMN tags;
```

### Fix P0-4: Migrate `JSON` → `JSONB` on Hot Columns

```sql
-- These can be done CONCURRENTLY on a live system (PG 18 supports this)
-- but the ALTER TABLE itself requires an ACCESS EXCLUSIVE lock briefly.
-- Batch them by table to minimize lock contention.

-- activity
ALTER TABLE public.activity
    ALTER COLUMN content  TYPE JSONB USING content::JSONB,
    ALTER COLUMN details  TYPE JSONB USING details::JSONB,
    ALTER COLUMN settings TYPE JSONB USING settings::JSONB;

-- assessment_item
ALTER TABLE public.assessment_item
    ALTER COLUMN body_json TYPE JSONB USING body_json::JSONB;

-- assessment_policy
ALTER TABLE public.assessment_policy
    ALTER COLUMN late_policy_json  TYPE JSONB USING late_policy_json::JSONB,
    ALTER COLUMN anti_cheat_json   TYPE JSONB USING anti_cheat_json::JSONB,
    ALTER COLUMN settings_json     TYPE JSONB USING settings_json::JSONB;

-- submission
ALTER TABLE public.submission
    ALTER COLUMN answers_json     TYPE JSONB USING answers_json::JSONB,
    ALTER COLUMN grading_json     TYPE JSONB USING grading_json::JSONB,
    ALTER COLUMN metadata_json    TYPE JSONB USING metadata_json::JSONB,
    ALTER COLUMN raw_grading_json TYPE JSONB USING raw_grading_json::JSONB;

-- analytics_event
ALTER TABLE public.analytics_event
    ALTER COLUMN payload TYPE JSONB USING payload::JSONB;

-- learner_risk_snapshot
ALTER TABLE public.learner_risk_snapshot
    ALTER COLUMN reason_codes TYPE JSONB USING reason_codes::JSONB;

-- After migration, add GIN indexes on the most-queried JSONB columns:
CREATE INDEX CONCURRENTLY ix_activity_settings_gin
    ON public.activity USING GIN (settings);

CREATE INDEX CONCURRENTLY ix_submission_answers_gin
    ON public.submission USING GIN (answers_json);

CREATE INDEX CONCURRENTLY ix_analytics_payload_gin
    ON public.analytics_event USING GIN (payload);
```

### Fix P0-5: Add FK Constraints for `creator_id` Columns

The `creator_id` columns are `BIGINT` while `user.id` is `INTEGER`. You need to either cast or change the column type. The safest path is to add a new `INTEGER` column and backfill:

```sql
-- Pattern for each table. Shown for 'course':

-- 1. Add new typed FK column
ALTER TABLE public.course
    ADD COLUMN creator_user_id INTEGER REFERENCES public."user"(id) ON DELETE SET NULL;

-- 2. Backfill where the legacy bigint ID can be matched
UPDATE public.course c
    SET creator_user_id = u.id
    FROM public."user" u
    WHERE u.id = c.creator_id::INTEGER
      AND c.creator_id IS NOT NULL
      AND c.creator_id::INTEGER = c.creator_id;  -- safe cast check

-- 3. After FastAPI is updated to write creator_user_id, drop the old column:
-- ALTER TABLE public.course DROP COLUMN creator_id;

-- Repeat for: activity, chapter, collection, usergroup
```

### Fix P0-6: Consolidate the Dual Role System

```sql
-- Phase 1: mark the old 'role' table as deprecated (no data loss)
COMMENT ON TABLE public.role IS
    'DEPRECATED: Legacy Rails-era role table. '
    'Use public.roles / public.role_permissions / public.user_roles instead. '
    'Will be dropped after migration to new RBAC is complete.';

-- Phase 2: ensure no new rows are being written (application-level)
-- Phase 3 (later migration): after confirming zero writes:
-- DROP TABLE public.role CASCADE;
```

### Fix P0-7: Clean Up the Orphaned `submissions` Table

```sql
-- Verify it is truly unused by application code first:
-- SELECT count(*) FROM public.submissions;
-- Check if any code writes to it outside of Judge0's own DB operations.

-- Option A: If Judge0 runs in a separate DB (recommended), just drop it:
DROP TABLE public.submissions;

-- Option B: If Judge0 must share this DB, move it to a separate schema:
CREATE SCHEMA IF NOT EXISTS judge0;
ALTER TABLE public.submissions SET SCHEMA judge0;
-- This keeps it accessible to Judge0 but out of your application schema.
```

### Fix P1-1: Add the `enrollment` Table

```sql
CREATE TYPE public.enrollmentstatusenum AS ENUM (
    'ACTIVE',
    'WAITLISTED',
    'DROPPED',
    'COMPLETED',
    'EXPIRED',
    'PENDING_PAYMENT'
);

CREATE TYPE public.enrollmentsourceenum AS ENUM (
    'SELF_ENROLL',
    'ADMIN_ENROLL',
    'PAYMENT',
    'KASPI_PAY',
    'KASPI_CREDIT',
    'COHORT_ASSIGN',
    'API',
    'INVITATION'
);

CREATE TABLE public.enrollment (
    id                  SERIAL PRIMARY KEY,
    enrollment_uuid     VARCHAR NOT NULL,
    user_id             INTEGER NOT NULL REFERENCES public."user"(id)   ON DELETE CASCADE,
    course_id           INTEGER NOT NULL REFERENCES public.course(id)   ON DELETE CASCADE,
    status              public.enrollmentstatusenum NOT NULL DEFAULT 'ACTIVE',
    source              public.enrollmentsourceenum NOT NULL DEFAULT 'SELF_ENROLL',
    enrolled_by         INTEGER REFERENCES public."user"(id)            ON DELETE SET NULL,
    payment_id          INTEGER REFERENCES public.paymentsuser(id)      ON DELETE SET NULL,
    section_id          INTEGER,  -- FK to future course_section table
    access_expires_at   TIMESTAMPTZ,
    dropped_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    completion_source   VARCHAR,  -- 'PROGRESS_THRESHOLD', 'MANUAL_ADMIN', etc.
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_enrollment_user_course UNIQUE (user_id, course_id)
);

CREATE UNIQUE INDEX uq_enrollment_uuid ON public.enrollment USING btree (enrollment_uuid);
CREATE INDEX ix_enrollment_course_status ON public.enrollment USING btree (course_id, status);
CREATE INDEX ix_enrollment_user_status   ON public.enrollment USING btree (user_id, status);
CREATE INDEX ix_enrollment_expires_at    ON public.enrollment USING btree (access_expires_at)
    WHERE access_expires_at IS NOT NULL;

-- Backfill from existing course_progress records:
INSERT INTO public.enrollment (
    enrollment_uuid, user_id, course_id, status, source, created_at, updated_at
)
SELECT
    gen_random_uuid()::text,
    user_id,
    course_id,
    CASE
        WHEN completed_at IS NOT NULL THEN 'COMPLETED'::public.enrollmentstatusenum
        ELSE 'ACTIVE'::public.enrollmentstatusenum
    END,
    'SELF_ENROLL'::public.enrollmentsourceenum,
    created_at,
    updated_at
FROM public.course_progress
ON CONFLICT (user_id, course_id) DO NOTHING;
```

### Fix P1-2: Add HNSW Index for pgvector

```sql
-- HNSW is preferred over IVFFlat for most LMS use cases
-- (no training phase, better recall, supports dynamic inserts)
-- ef_construction=128, m=16 are good starting defaults for 512-dim vectors

CREATE INDEX CONCURRENTLY ix_document_chunks_embedding_hnsw
    ON public.document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);

-- Also add a GIN index on metadata for filtered ANN searches:
ALTER TABLE public.document_chunks
    ALTER COLUMN metadata TYPE JSONB USING metadata::JSONB;

CREATE INDEX CONCURRENTLY ix_document_chunks_metadata_gin
    ON public.document_chunks USING GIN (metadata);
```

### Fix P1-3: Expand `paymentproviderenum` for Kazakhstan

```sql
-- In PostgreSQL, adding values to an enum is safe and non-blocking:
ALTER TYPE public.paymentproviderenum ADD VALUE IF NOT EXISTS 'KASPI_PAY';
ALTER TYPE public.paymentproviderenum ADD VALUE IF NOT EXISTS 'KASPI_CREDIT';
ALTER TYPE public.paymentproviderenum ADD VALUE IF NOT EXISTS 'CLICK';
ALTER TYPE public.paymentproviderenum ADD VALUE IF NOT EXISTS 'PAYME';

-- Add KZT-specific fields to paymentsproduct:
ALTER TABLE public.paymentsproduct
    ADD COLUMN currency_code CHAR(3) NOT NULL DEFAULT 'KZT',
    ADD COLUMN kaspi_merchant_id VARCHAR,
    ADD COLUMN kaspi_product_code VARCHAR;
```

### Fix P1-4: Fix Unused Enum Types

```sql
-- submission.status: switch from varchar to the existing enum
-- Step 1: verify all existing values are valid enum members
SELECT DISTINCT status FROM public.submission
WHERE status NOT IN ('PENDING','PROCESSING','COMPLETED','FAILED','PENDING_JUDGE0');
-- If the above returns rows, fix data first.

-- Step 2: cast the column
ALTER TABLE public.submission
    ALTER COLUMN status TYPE public.submissionstatus
        USING status::public.submissionstatus;

-- assessment.grading_type
ALTER TABLE public.assessment
    ALTER COLUMN grading_type TYPE public.gradingtypeenum
        USING grading_type::public.gradingtypeenum;

-- activity_progress.state: add a proper enum and check constraint
CREATE TYPE public.activityprogressstateenum AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'SUBMITTED',
    'GRADED',
    'PASSED',
    'FAILED',
    'COMPLETED',
    'EXCUSED'
);

-- First verify all current values fit:
SELECT DISTINCT state FROM public.activity_progress
WHERE state NOT IN
    ('NOT_STARTED','IN_PROGRESS','SUBMITTED','GRADED','PASSED','FAILED','COMPLETED','EXCUSED');

-- Then cast:
ALTER TABLE public.activity_progress
    ALTER COLUMN state TYPE public.activityprogressstateenum
        USING state::public.activityprogressstateenum;
```

### Fix P1-5: `block` Parent Integrity

```sql
-- Add a CHECK constraint ensuring exactly one parent is set:
ALTER TABLE public.block
    ADD CONSTRAINT ck_block_exactly_one_parent CHECK (
        (
            (course_id   IS NOT NULL)::INT +
            (chapter_id  IS NOT NULL)::INT +
            (activity_id IS NOT NULL)::INT
        ) = 1
    );
```

### Fix P1-6 (Notifications): New Domain Tables

```sql
-- ─── Notification system ─────────────────────────────────────────────────────

CREATE TYPE public.notificationtypeenum AS ENUM (
    'ASSIGNMENT_DUE',
    'GRADE_PUBLISHED',
    'DISCUSSION_REPLY',
    'COURSE_UPDATE',
    'ENROLLMENT_CONFIRMED',
    'CERTIFICATE_ISSUED',
    'AT_RISK_ALERT',        -- teacher notification
    'SUBMISSION_RECEIVED',  -- teacher notification
    'SYSTEM'
);

CREATE TABLE public.notification (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    notification_type public.notificationtypeenum NOT NULL,
    title           VARCHAR(255) NOT NULL,
    body            TEXT NOT NULL,
    action_url      VARCHAR,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- polymorphic context
    course_id       INTEGER REFERENCES public.course(id)   ON DELETE SET NULL,
    activity_id     INTEGER REFERENCES public.activity(id) ON DELETE SET NULL
);

CREATE INDEX ix_notification_user_unread
    ON public.notification USING btree (user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE TABLE public.notification_preference (
    user_id             INTEGER NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    notification_type   public.notificationtypeenum NOT NULL,
    email_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    in_app_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (user_id, notification_type)
);

-- ─── Course prerequisites ─────────────────────────────────────────────────────

CREATE TABLE public.course_prerequisite (
    course_id           INTEGER NOT NULL REFERENCES public.course(id) ON DELETE CASCADE,
    prerequisite_id     INTEGER NOT NULL REFERENCES public.course(id) ON DELETE CASCADE,
    min_progress_pct    NUMERIC(5,2) NOT NULL DEFAULT 100.0,
    is_mandatory        BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (course_id, prerequisite_id),
    CONSTRAINT ck_no_self_prerequisite CHECK (course_id <> prerequisite_id)
);

-- ─── Course ratings ───────────────────────────────────────────────────────────

CREATE TABLE public.course_rating (
    id          SERIAL PRIMARY KEY,
    course_id   INTEGER NOT NULL REFERENCES public.course(id)   ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES public."user"(id)   ON DELETE CASCADE,
    rating      SMALLINT NOT NULL,
    review      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_course_rating_user UNIQUE (course_id, user_id),
    CONSTRAINT ck_rating_range CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX ix_course_rating_course ON public.course_rating USING btree (course_id);
```

### Fix P2-2: Merge `discussionlike` / `discussiondislike`

```sql
CREATE TYPE public.reactiontypeenum AS ENUM ('LIKE', 'DISLIKE');

CREATE TABLE public.discussion_reaction (
    id              SERIAL PRIMARY KEY,
    discussion_id   INTEGER NOT NULL REFERENCES public.coursediscussion(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    reaction_type   public.reactiontypeenum NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_discussion_reaction UNIQUE (discussion_id, user_id, reaction_type)
);

-- Migrate existing data:
INSERT INTO public.discussion_reaction (discussion_id, user_id, reaction_type, created_at)
SELECT discussion_id, user_id, 'LIKE'::public.reactiontypeenum,
    COALESCE(creation_date::TIMESTAMPTZ, NOW())
FROM public.discussionlike
WHERE discussion_id IS NOT NULL AND user_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.discussion_reaction (discussion_id, user_id, reaction_type, created_at)
SELECT discussion_id, user_id, 'DISLIKE'::public.reactiontypeenum,
    COALESCE(creation_date::TIMESTAMPTZ, NOW())
FROM public.discussiondislike
WHERE discussion_id IS NOT NULL AND user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- After FastAPI is updated:
-- DROP TABLE public.discussionlike, public.discussiondislike;
```

### Fix P2-3: `usergroupresource` Type Discriminator

```sql
CREATE TYPE public.resourcetypeenum AS ENUM (
    'COURSE',
    'COLLECTION',
    'ACTIVITY',
    'CHAPTER'
);

ALTER TABLE public.usergroupresource
    ADD COLUMN resource_type public.resourcetypeenum,
    ADD COLUMN resource_id   INTEGER;

-- Backfill resource_type manually or via application logic.
-- After backfill, make NOT NULL:
-- ALTER TABLE public.usergroupresource
--     ALTER COLUMN resource_type SET NOT NULL;

CREATE INDEX ix_ugresource_type_id
    ON public.usergroupresource USING btree (resource_type, resource_id);
```

### Fix P2-5: `collectioncourse` Unique Constraint

```sql
ALTER TABLE public.collectioncourse
    ADD CONSTRAINT uq_collectioncourse UNIQUE (collection_id, course_id);
```

### Fix P2-6: `xp_transactions` Cascade

```sql
ALTER TABLE public.xp_transactions
    DROP CONSTRAINT xp_transactions_user_id_fkey;

ALTER TABLE public.xp_transactions
    ADD CONSTRAINT xp_transactions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
```

---

## Part 3 — Alembic Migration Strategy

### Guiding Principles

The changes span three risk tiers. Execute them in separate Alembic revisions grouped by tier, never combining a risky structural change with a new table addition in the same revision.

**Tier 1 — Additive (zero risk, run any time):** New tables, new indexes, new nullable columns, enum value additions.

**Tier 2 — Type Coercions (low risk, during low-traffic window):** `JSON→JSONB`, timestamp type changes, varchar→enum casts. Each requires a brief `ACCESS EXCLUSIVE` lock but no data loss.

**Tier 3 — Destructive (requires coordinated deploy):** Dropping columns, dropping tables, renaming columns. These must be coordinated with a FastAPI deploy that has already stopped reading/writing the old structure.

---

### Recommended Revision Order

```
001_additive_enrollment_table.py          ← P1-1 (new table, zero risk)
002_additive_tags_tables.py               ← P0-3 (tag + course_tag, zero risk)
003_additive_notification_tables.py       ← P1-6 (new tables, zero risk)
004_additive_course_prereq_rating.py      ← P1-6 (new tables, zero risk)
005_additive_indexes_missing.py           ← P1-2, P1-7, P2-5 (CONCURRENTLY)
006_additive_payment_enum_kz.py           ← P1-3 (enum ADD VALUE, safe)
007_coerce_json_to_jsonb.py               ← P0-4 (type coercion, low-traffic window)
008_coerce_timestamps_text.py             ← P0-1 part A (legacy text dates)
009_coerce_timestamps_without_tz.py       ← P0-1 part B (WITHOUT TZ → WITH TZ)
010_fix_money_numeric.py                  ← P0-2 (add column, copy, swap)
011_fix_submission_status_enum.py         ← P1-4 (varchar→enum casts)
012_fix_block_parent_constraint.py        ← P1-5 (CHECK constraint)
013_additive_creator_user_id_cols.py      ← P0-5 part A (add new FK columns)
014_migrate_creator_ids.py                ← P0-5 part B (data migration)
015_drop_old_creator_id_cols.py           ← P0-5 part C (destructive, coord deploy)
016_drop_submissions_orphan_table.py      ← P0-7 (destructive)
017_merge_discussion_reactions.py         ← P2-2 (migrate + drop old tables)
018_drop_rails_relics.py                  ← P2-4 (ar_internal_metadata, schema_migrations)
019_deprecate_exam_table.py               ← P2-1 (comment + FK guard, not drop yet)
```

---

### Example: Revision 001 (Enrollment Table)

```python
# migrations/versions/001_additive_enrollment_table.py
"""Add enrollment table

Revision ID: 001a
Revises: <current_head>
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade() -> None:
    # Create enums first
    op.execute("""
        CREATE TYPE enrollmentstatusenum AS ENUM (
            'ACTIVE','WAITLISTED','DROPPED','COMPLETED','EXPIRED','PENDING_PAYMENT'
        )
    """)
    op.execute("""
        CREATE TYPE enrollmentsourceenum AS ENUM (
            'SELF_ENROLL','ADMIN_ENROLL','PAYMENT','KASPI_PAY',
            'KASPI_CREDIT','COHORT_ASSIGN','API','INVITATION'
        )
    """)

    op.create_table(
        "enrollment",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("enrollment_uuid", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(),
                  sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", sa.Integer(),
                  sa.ForeignKey("course.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status",
                  postgresql.ENUM("ACTIVE","WAITLISTED","DROPPED","COMPLETED",
                                  "EXPIRED","PENDING_PAYMENT",
                                  name="enrollmentstatusenum", create_type=False),
                  nullable=False, server_default="ACTIVE"),
        sa.Column("source",
                  postgresql.ENUM("SELF_ENROLL","ADMIN_ENROLL","PAYMENT","KASPI_PAY",
                                  "KASPI_CREDIT","COHORT_ASSIGN","API","INVITATION",
                                  name="enrollmentsourceenum", create_type=False),
                  nullable=False, server_default="SELF_ENROLL"),
        sa.Column("enrolled_by", sa.Integer(),
                  sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("payment_id", sa.Integer(),
                  sa.ForeignKey("paymentsuser.id", ondelete="SET NULL"), nullable=True),
        sa.Column("access_expires_at",
                  sa.DateTime(timezone=True), nullable=True),
        sa.Column("dropped_at",
                  sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at",
                  sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("user_id", "course_id", name="uq_enrollment_user_course"),
    )

    op.create_index("uq_enrollment_uuid", "enrollment",
                    ["enrollment_uuid"], unique=True)
    op.create_index("ix_enrollment_course_status", "enrollment",
                    ["course_id", "status"])
    op.create_index("ix_enrollment_user_status", "enrollment",
                    ["user_id", "status"])

    # Backfill from existing course_progress
    op.execute("""
        INSERT INTO enrollment (
            enrollment_uuid, user_id, course_id, status, source, created_at, updated_at
        )
        SELECT
            gen_random_uuid()::text,
            user_id,
            course_id,
            CASE
                WHEN completed_at IS NOT NULL
                THEN 'COMPLETED'::enrollmentstatusenum
                ELSE 'ACTIVE'::enrollmentstatusenum
            END,
            'SELF_ENROLL'::enrollmentsourceenum,
            created_at,
            updated_at
        FROM course_progress
        ON CONFLICT (user_id, course_id) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_table("enrollment")
    op.execute("DROP TYPE IF EXISTS enrollmentstatusenum")
    op.execute("DROP TYPE IF EXISTS enrollmentsourceenum")
```

---

### Example: Revision 007 (JSON → JSONB, Safe Coercion)

```python
# migrations/versions/007_coerce_json_to_jsonb.py
"""Migrate JSON columns to JSONB on hot tables

Revision ID: 007a
"""
from alembic import op

# IMPORTANT: each ALTER TABLE briefly acquires ACCESS EXCLUSIVE lock.
# Run during low-traffic window. Each statement is fast but not instantaneous.

def upgrade() -> None:
    op.execute("""
        ALTER TABLE activity
            ALTER COLUMN content  TYPE JSONB USING content::JSONB,
            ALTER COLUMN details  TYPE JSONB USING details::JSONB,
            ALTER COLUMN settings TYPE JSONB USING settings::JSONB
    """)
    op.execute("""
        ALTER TABLE assessment_item
            ALTER COLUMN body_json TYPE JSONB USING body_json::JSONB
    """)
    op.execute("""
        ALTER TABLE assessment_policy
            ALTER COLUMN late_policy_json TYPE JSONB USING late_policy_json::JSONB,
            ALTER COLUMN anti_cheat_json  TYPE JSONB USING anti_cheat_json::JSONB,
            ALTER COLUMN settings_json    TYPE JSONB USING settings_json::JSONB
    """)
    op.execute("""
        ALTER TABLE submission
            ALTER COLUMN answers_json     TYPE JSONB USING answers_json::JSONB,
            ALTER COLUMN grading_json     TYPE JSONB USING grading_json::JSONB,
            ALTER COLUMN metadata_json    TYPE JSONB USING metadata_json::JSONB,
            ALTER COLUMN raw_grading_json TYPE JSONB USING raw_grading_json::JSONB
    """)
    op.execute("""
        ALTER TABLE analytics_event
            ALTER COLUMN payload TYPE JSONB USING payload::JSONB
    """)

    # GIN indexes after coercion
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_activity_settings_gin
            ON activity USING GIN (settings)
    """)
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_submission_answers_gin
            ON submission USING GIN (answers_json)
    """)


def downgrade() -> None:
    # JSONB → JSON is lossless
    op.execute("""
        ALTER TABLE activity
            ALTER COLUMN content  TYPE JSON USING content::JSON,
            ALTER COLUMN details  TYPE JSON USING details::JSON,
            ALTER COLUMN settings TYPE JSON USING settings::JSON
    """)
    # (repeat for other tables)
```

---

### Example: Revision 008 (Timestamp Text → TIMESTAMPTZ)

```python
# migrations/versions/008_coerce_timestamps_text.py
"""Normalize legacy text/varchar timestamps to TIMESTAMPTZ

Revision ID: 008a
"""
from alembic import op

_TABLES_WITH_CREATION_DATE = [
    "block", "certifications", "collection", "collectioncourse",
    "coursediscussion", "courseupdate", "exam", "quiz_question_stat",
    "resourceauthor", "trail", "trailrun", "trailstep",
    "usergroup", "usergroupresource", "usergroupuser",
]

def upgrade() -> None:
    for table in _TABLES_WITH_CREATION_DATE:
        op.execute(f"""
            ALTER TABLE {table}
                ALTER COLUMN creation_date TYPE TIMESTAMPTZ
                    USING COALESCE(
                        NULLIF(TRIM(creation_date), '')::TIMESTAMPTZ,
                        NOW()
                    ),
                ALTER COLUMN update_date TYPE TIMESTAMPTZ
                    USING COALESCE(
                        NULLIF(TRIM(update_date), '')::TIMESTAMPTZ,
                        NOW()
                    )
        """)

    # activity has its own column names
    op.execute("""
        ALTER TABLE activity
            ALTER COLUMN creation_date TYPE TIMESTAMPTZ
                USING COALESCE(NULLIF(TRIM(creation_date),'')::TIMESTAMPTZ, NOW()),
            ALTER COLUMN update_date TYPE TIMESTAMPTZ
                USING COALESCE(NULLIF(TRIM(update_date),'')::TIMESTAMPTZ, NOW())
    """)

    # certificateuser
    op.execute("""
        ALTER TABLE certificateuser
            ALTER COLUMN created_at TYPE TIMESTAMPTZ
                USING COALESCE(NULLIF(TRIM(created_at),'')::TIMESTAMPTZ, NOW()),
            ALTER COLUMN updated_at TYPE TIMESTAMPTZ
                USING COALESCE(NULLIF(TRIM(updated_at),'')::TIMESTAMPTZ, NOW())
    """)

    # examattempt
    op.execute("""
        ALTER TABLE examattempt
            ALTER COLUMN started_at TYPE TIMESTAMPTZ
                USING COALESCE(NULLIF(TRIM(started_at),'')::TIMESTAMPTZ, NULL),
            ALTER COLUMN submitted_at TYPE TIMESTAMPTZ
                USING COALESCE(NULLIF(TRIM(submitted_at),'')::TIMESTAMPTZ, NULL)
    """)

    # hint_usage
    op.execute("""
        ALTER TABLE hint_usage
            ALTER COLUMN unlocked_at TYPE TIMESTAMPTZ
                USING COALESCE(NULLIF(TRIM(unlocked_at),'')::TIMESTAMPTZ, NOW())
    """)


def downgrade() -> None:
    # Reversing is possible but lossy (timezone info is dropped).
    # For safety, do not implement an automatic downgrade for timestamp migrations.
    raise NotImplementedError(
        "Timestamp normalization cannot be safely reversed automatically. "
        "Restore from backup if needed."
    )
```

---

## Summary Priority Matrix

| Issue | Risk | Effort | Revenue/UX Impact | Do When |
|---|---|---|---|---|
| P0-2: Floating-point money | **HIGH** | Low | Payment correctness | **Immediately** |
| P1-1: Add `enrollment` table | Medium | Medium | Core LMS feature | **Sprint 1** |
| P1-2: pgvector HNSW index | Low | Trivial | RAG performance | **Sprint 1** |
| P1-3: Kaspi Pay enum | Low | Trivial | Monetization | **Sprint 1** |
| P0-4: JSON → JSONB | Low | Low | Query performance | **Sprint 1** |
| P0-1: Timestamp normalization | Low | Medium | Data correctness | **Sprint 2** |
| P0-3: Tags tables | Low | Medium | Search/discovery | **Sprint 2** |
| P1-4: Unused enums | Low | Low | Type safety | **Sprint 2** |
| P1-6: Notifications, prereqs, ratings | Low | Medium | Platform maturity | **Sprint 2-3** |
| P0-5: `creator_id` FK | Low | Medium | Data integrity | **Sprint 3** |
| P1-5: `block` parent constraint | Low | Trivial | Content integrity | **Sprint 3** |
| P0-6: Consolidate roles | Medium | Medium | Maintainability | **Sprint 3** |
| P0-7: Drop `submissions` orphan | Low | Trivial | Schema hygiene | **Sprint 3** |
| P2-1: Deprecate `exam` table | Medium | High | Architecture | **Sprint 4+** |
| P2-2: Merge discussion reactions | Low | Low | Schema hygiene | **Sprint 4** |
| P2-4: Drop Rails relics | Low | Trivial | Schema hygiene | **Sprint 4** |
