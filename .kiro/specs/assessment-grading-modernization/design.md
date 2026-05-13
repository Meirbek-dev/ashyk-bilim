# Technical Design Document

## Overview

This design describes the architecture for the Assessment & Grading System Modernization. The system is a monorepo with `apps/api` (Python/FastAPI) and `apps/web` (Next.js/TypeScript). The modernization preserves the existing well-structured unified assessment model while eliminating all legacy artifacts, hardening the grading pipeline, and delivering world-class UX for teachers and students.

**Design Principles:**
- Zero-debt: No legacy wrappers, adapters, or compatibility shims beyond the one-release permission transition
- Pipeline architecture: All grading flows through a single deterministic pipeline
- Append-only audit: GradingEntry is immutable — no UPDATE/DELETE
- Event-driven UX: Redis pub/sub → SSE for real-time teacher/student updates
- Optimistic concurrency: Version fields prevent silent overwrites

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Frontend (Next.js)                              │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │Assessment │  │  Grading     │  │ Gradebook │  │  Code Challenge  │  │
│  │  Studio   │  │  Review      │  │  Matrix   │  │  IDE             │  │
│  └─────┬─────┘  └──────┬───────┘  └─────┬─────┘  └────────┬─────────┘  │
│        │               │                │                  │            │
│  ┌─────┴───────────────┴────────────────┴──────────────────┴─────────┐  │
│  │              React Query + useGradingSSE + Generated Types         │  │
│  └───────────────────────────────────┬───────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────┘
                                       │ HTTPS / SSE
┌──────────────────────────────────────┼──────────────────────────────────┐
│                          Backend (FastAPI)                               │
│  ┌───────────────────────────────────┴───────────────────────────────┐  │
│  │                     API Router Layer                               │  │
│  │  /assessments/*  │  /grading/*  │  /code-execution/*              │  │
│  └───────┬──────────────────┬──────────────────┬─────────────────────┘  │
│          │                  │                  │                         │
│  ┌───────┴──────┐  ┌───────┴──────┐  ┌───────┴──────┐                  │
│  │  Assessment  │  │   Grading    │  │    Code      │                  │
│  │   Service    │  │   Pipeline   │  │  Execution   │                  │
│  │  (core.py)   │  │ (orchestr.)  │  │  (Judge0)    │                  │
│  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘                  │
│          │                  │                  │                         │
│  ┌───────┴──────────────────┴──────────────────┴─────────────────────┐  │
│  │                    Domain Models (SQLModel)                        │  │
│  │  Assessment │ Submission │ GradingEntry │ AssessmentPolicy │ ...   │  │
│  └───────────────────────────────┬───────────────────────────────────┘  │
│                                  │                                       │
│  ┌───────────────────────────────┴───────────────────────────────────┐  │
│  │              Infrastructure Layer                                  │  │
│  │  PostgreSQL  │  Redis (pub/sub + cache)  │  Judge0 (HTTP)         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. Legacy Deletion Module (Req 1, 17, 18)

**Strategy:** A single coordinated cleanup operation executed as a development task (not a runtime migration). The Alembic migration handles DB schema changes; file deletions and code changes are committed alongside.

```
Migration Sequence:
  Step 1: Alembic migration — verify 0 rows → DROP legacy tables
  Step 2: Code commit — delete files, replace permission keys, regenerate OpenAPI
  Step 3: CI gate — verify schema contains zero legacy identifiers
```

**Files to modify/delete:**
| Action | File | Change |
|--------|------|--------|
| DELETE | `apps/api/src/tasks/__pycache__/assignment_scheduler.cpython-314.pyc` | Remove cached bytecode |
| MODIFY | `apps/api/src/services/courses/courses.py` | Replace `grade_assignments` → `assessment:grade` |
| DELETE | `apps/web/coverage/services/courses/assignments.ts.html` | Remove stale coverage |
| MODIFY | `apps/api/openapi.json` | Remove `grade_assignments` from schema |
| REGENERATE | `apps/web/src/lib/api/generated/schema.ts` | Regenerate from cleaned OpenAPI |
| KEEP | `apps/api/src/services/grading/pipeline/validate.py` | LEGACY_ANSWER_KEYS guard rail stays |

**Alembic Migration Design:**
```python
# migrations/versions/YYYY_MM_DD_final_legacy_drop.py
LEGACY_TABLES = ("assignment", "assignmenttask", "assignmentusersubmission", "assignmenttasksubmission")

def upgrade():
    for table in LEGACY_TABLES:
        count = op.get_bind().execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
        if count > 0:
            raise RuntimeError(f"Table {table} has {count} rows — cannot drop")
    for table in LEGACY_TABLES:
        op.drop_table(table)
    # Strip legacy metadata keys from submission.metadata_json
    op.execute("""
        UPDATE submission
        SET metadata_json = metadata_json - 'legacy_assignment_type' - 'legacy_task_submission_uuid'
        WHERE metadata_json ? 'legacy_assignment_type' OR metadata_json ? 'legacy_task_submission_uuid'
    """)

def downgrade():
    # Recreate schemas without data (for emergency rollback)
    ...
```

### 2. Permission Model (Req 2)

**Design:** Add a compatibility layer in the existing `PermissionChecker` that maps legacy keys to modern namespaced keys during a transition period controlled by a feature flag.

```python
# src/security/rbac.py — additions

ASSESSMENT_PERMISSIONS = frozenset({
    "assessment:create", "assessment:update", "assessment:delete",
    "assessment:submit", "assessment:grade", "assessment:publish",
    "assessment:view_grades", "assessment:manage_policy", "assessment:override_policy",
})

DEPRECATED_PERMISSION_MAP = {
    "grade_assignments": "assessment:grade",
}

class PermissionChecker:
    def _resolve_permission(self, key: str) -> str:
        if key in DEPRECATED_PERMISSION_MAP:
            if not settings.DEPRECATED_PERMISSIONS_ENABLED:
                raise PermissionDeprecatedError(key)
            return DEPRECATED_PERMISSION_MAP[key]
        return key
```

**Frontend:** The `CoursePermissions` TypeScript interface replaces `grade_assignments: boolean` with `assessment_grade: boolean`. The generated schema handles this automatically after OpenAPI cleanup.

### 3. Feedback Router Fix (Req 3)

**Change:** In `apps/api/src/routers/grading/feedback.py`, function `_latest_or_create_grading_entry`:

```python
# BEFORE (broken):
entry = GradingEntry(
    ...,
    breakdown=submission.grading_json if isinstance(submission.grading_json, dict) else {},
    raw_breakdown=submission.raw_grading_json if isinstance(submission.raw_grading_json, dict) else {},
    effective_breakdown=submission.grading_json if isinstance(submission.grading_json, dict) else {},
    ...
)

# AFTER (fixed):
grading_dict = submission.grading_json if isinstance(submission.grading_json, dict) else {}
raw_dict = submission.raw_grading_json if isinstance(submission.raw_grading_json, dict) else {}
entry = GradingEntry(
    ...,
    raw_breakdown=raw_dict,
    effective_breakdown=grading_dict,
    overall_feedback=grading_dict.get("feedback", "") if isinstance(grading_dict, dict) else "",
    ...
)
```

**Dev-mode guard:** Add `model_config = ConfigDict(extra="forbid")` to `SQLModelStrictBaseModel` when `PLATFORM_DEVELOPMENT_MODE` is truthy.

### 4. Assessment Authoring Service (Req 4)

**Existing architecture is sound.** Key additions:

| Feature | Implementation |
|---------|---------------|
| Item limit (200) | Add check in `create_assessment_item()` before INSERT |
| Assessment duplication | New `POST /assessments/{uuid}/duplicate` endpoint |
| Publish readiness | Already exists via `check_publish_readiness()` — add CODE item validation |
| Content locking | Add guard in `update_assessment_item()` / `delete_assessment_item()` checking submission count |

**Duplication endpoint:**
```python
@router.post("/{assessment_uuid}/duplicate", response_model=AssessmentRead)
async def api_duplicate_assessment(...):
    """Deep-copy assessment + items + policy into a new DRAFT assessment."""
```

### 5. Student Assessment-Taking (Req 5, 6, 7)

**Timer Architecture:**
```
Client                          Server
  │                               │
  │── POST /start ───────────────►│ records started_at, returns time_remaining_seconds
  │                               │
  │── PATCH /draft (auto-save) ──►│ throttled: 1 save per 5s per submission
  │◄── 200 {draft_version, progress} ─│
  │                               │
  │── POST /submit ──────────────►│ full pipeline execution
  │◄── 200 {score, breakdown} ────│ (if IMMEDIATE release)
  │                               │
  │   [time expires]              │
  │                               │── background: auto-submit draft
  │◄── SSE: submission.submitted ─│
```

**Draft throttle:** Implemented via Redis rate limiter key `draft_throttle:{submission_uuid}` with 5-second TTL.

**Auto-submit on timeout:** Background task `assessment_timer_loop` polls for submissions where `started_at + time_limit_seconds < now()` and status is DRAFT.

**Code Challenge flow:**
- `POST /assessments/{uuid}/items/{item_uuid}/runs` → RUN purpose (visible tests)
- `POST /assessments/{uuid}/submit` → triggers FINAL purpose (all tests) via orchestrator
- Results stored in `CodeRun` + `CodeRunCase` tables with idempotency

### 6. Grading Pipeline (Req 8)

**Current pipeline is well-designed.** Additions for hardening:

```python
# src/services/grading/pipeline/orchestrator.py — additions

PIPELINE_TIMEOUT_SECONDS = 30

async def submit_assessment(...) -> SubmissionRead:
    async with asyncio.timeout(PIPELINE_TIMEOUT_SECONDS):
        try:
            # ... existing pipeline stages ...
        except asyncio.TimeoutError:
            db_session.rollback()
            raise HTTPException(504, detail={"code": "GRADING_TIMEOUT"})
        except Exception:
            db_session.rollback()
            raise HTTPException(500, detail={"code": "GRADING_PIPELINE_FAILURE"})
```

**Determinism guarantee:** Already achieved by:
- Snapshotting `items_snapshot` and `policy_snapshot` at submit time
- Using `round(..., 2)` for all score calculations
- Clamping `late_penalty_pct` to [0, 100]

### 7. Teacher Grading (Req 9, 10)

**Review Queue ordering:**
```sql
SELECT * FROM submission
WHERE activity_id = :activity_id AND status != 'DRAFT'
ORDER BY
  CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END,
  submitted_at ASC
```

**Soft lock via SSE:**
```python
# When teacher opens a submission for grading:
publish_grading_event("grade.conflict", submission_uuid, {
    "graded_by": current_user.id,
    "action": "viewing",
})
# Auto-release after 30 min via Redis key TTL
```

**Batch grading (all-or-nothing):**
```python
async def batch_grade_submissions(batch_request, current_user, db_session):
    # Pre-validate all submissions
    for item in batch_request.grades:
        submission = _get_submission(item.submission_uuid)
        if submission.version != item.expected_version:
            return BatchGradeResponse(failed=[...])  # reject entire batch
    # Apply all grades in single transaction
    ...
```

**Grade visibility control:**
- `StudentSubmissionRead` serializer checks `submission.status`:
  - If GRADED → omit score fields, set `release_state = "AWAITING_RELEASE"`
  - If PUBLISHED → include all fields, set `release_state = "VISIBLE"`

### 8. Gradebook (Req 11)

**Existing implementation is solid.** Key design points:

- **Matrix query:** Single SQL query joining `activity_progress` with `submission` for published scores
- **Cursor pagination:** Uses `(user_id, activity_id)` composite cursor for deterministic ordering
- **CSV export:** Streaming generator via `StreamingResponse` — no memory cap
- **Student view:** Filter `WHERE state IN ('GRADED', 'PASSED', 'COMPLETED')` and only show published scores

### 9. SSE System (Req 12)

**Enhanced design with replay and connection limits:**

```python
# src/routers/grading/sse.py — enhanced

MAX_CONNECTIONS_PER_USER = 5
REPLAY_WINDOW_SECONDS = 300
KEEPALIVE_INTERVAL_SECONDS = 30

@router.get("/sse")
async def api_grading_sse(
    request: Request,
    activity_id: int,
    assessment_uuid: str | None = None,
    last_event_id: str | None = Header(None, alias="Last-Event-ID"),
    current_user: PublicUser = Depends(get_public_user),
):
    # Check connection limit
    conn_count = await redis.incr(f"sse_conn:{current_user.id}")
    if conn_count > MAX_CONNECTIONS_PER_USER:
        await redis.decr(f"sse_conn:{current_user.id}")
        raise HTTPException(429, "Too many SSE connections")

    async def event_generator():
        try:
            # Replay missed events if Last-Event-ID provided
            if last_event_id:
                missed = await _get_missed_events(activity_id, last_event_id, REPLAY_WINDOW_SECONDS)
                for event in missed:
                    yield encode_sse(event["type"], event)

            # Subscribe to Redis channel
            pubsub = redis.pubsub()
            await pubsub.subscribe(f"grading:activity:{activity_id}")
            while not await request.is_disconnected():
                msg = await pubsub.get_message(timeout=KEEPALIVE_INTERVAL_SECONDS)
                if msg is None:
                    yield ": keepalive\n\n"
                else:
                    yield encode_sse(msg["type"], msg)
        finally:
            await redis.decr(f"sse_conn:{current_user.id}")
            await pubsub.unsubscribe()
```

**Event storage for replay:** Events are stored in a Redis sorted set `sse_events:{activity_id}` with score = timestamp, TTL = 5 minutes.

### 10. Anti-Cheat System (Req 13)

**Architecture:**
```
Client (Anti-Cheat Overlay)          Server
  │                                    │
  │── POST /draft {violations: [...]} ─►│ appended to metadata_json.violations
  │                                    │
  │   [threshold exceeded]             │
  │                                    │── auto-submit + set FLAGGED
  │◄── SSE: submission.submitted ──────│
```

**Plagiarism detection (background task):**
```python
# src/tasks/plagiarism_checker.py
async def check_plagiarism(submission_id: int):
    """Compare source code against other submissions for the same item."""
    # Uses token-based similarity (not string matching)
    # Stores result in SubmissionMetadata.plagiarism
```

### 11. Policy & Override System (Req 14)

**Effective policy resolution (already implemented in `pipeline/enforce.py`):**
```python
def resolve_effective_policy(
    policy: AssessmentPolicy | None,
    override: StudentPolicyOverride | None,
    settings: AssessmentSettings,
) -> EffectivePolicy:
    """Merge base policy with student override. Override fields take precedence."""
    base_due = policy.due_at if policy else None
    effective_due = override.due_at_override if override and override.due_at_override else base_due
    # ... similar for max_attempts, time_limit, waive_late_penalty
```

**System-wide maximums validation:**
```python
MAX_ATTEMPTS_CEILING = 10
MAX_TIME_LIMIT_MINUTES = 480

def validate_override(override: StudentPolicyOverrideCreate):
    if override.max_attempts_override and override.max_attempts_override > MAX_ATTEMPTS_CEILING:
        raise HTTPException(422, detail={"field": "max_attempts_override", "max": MAX_ATTEMPTS_CEILING})
```

### 12. Audit Trail (Req 15)

**Immutability enforcement:**
- Database level: `REVOKE UPDATE, DELETE ON grading_entry FROM app_user;` (PostgreSQL role)
- Application level: `GradingEntry` model has no `update()` method; the service layer only calls `db_session.add(new_entry)`
- Dev-mode: SQLAlchemy event listener on `before_update` / `before_delete` raises `ImmutableRecordError`

**System actor for auto-grading:**
```python
SYSTEM_GRADER_ID = 0  # Reserved user ID for auto-grading pipeline
```

### 13. Code Execution (Req 16)

**Existing `CodeExecutionService` is production-ready.** Key design points:

- **Idempotency:** `uq_code_run_idempotency` unique index on `(user_id, item_uuid, purpose, idempotency_key)`
- **Conflict detection:** If same key + different source → HTTP 409
- **Output truncation:** `_truncate_output()` caps at `max_output_bytes` (64KB default)
- **Purpose separation:** `CodeRunPurpose` enum: CUSTOM, VISIBLE, FINAL, REFERENCE_CHECK

## Data Model

### Core Tables (unchanged — already canonical)

```
assessment (1) ──── (N) assessment_item
     │
     │ activity_id
     ▼
activity (1) ──── (1) assessment_policy
     │                      │
     │                      │ (N) student_policy_override
     │
     │ (N) submission
     │         │
     │         │ (N) grading_entry  [append-only]
     │         │ (N) code_run → code_run_case
     │         │ (N) item_feedback_entry
     │
     │ (N) activity_progress
     │
course (1) ──── (N) course_progress
```

### Key Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| submission | `idx_submission_activity_status_submitted` | Review queue ordering |
| submission | `idx_submission_activity_user_status` | Student's own submissions |
| grading_entry | `ix_grading_entry_submission_published` | Published grade lookup |
| activity_progress | `ix_activity_progress_course_user` | Gradebook matrix |
| code_run | `uq_code_run_idempotency` | Deduplication |

## API Design

### Assessment Routes (`/api/v1/assessments/`)

| Method | Path | Purpose | Req |
|--------|------|---------|-----|
| POST | `/` | Create assessment | 4 |
| GET | `/{uuid}` | Get assessment detail | 4 |
| PATCH | `/{uuid}` | Update assessment | 4 |
| POST | `/{uuid}/lifecycle` | Transition lifecycle | 4 |
| GET | `/{uuid}/readiness` | Check publish readiness | 4 |
| POST | `/{uuid}/duplicate` | Deep-copy assessment | 4 |
| POST | `/{uuid}/items` | Add item | 4 |
| PATCH | `/{uuid}/items/{item_uuid}` | Update item | 4 |
| DELETE | `/{uuid}/items/{item_uuid}` | Delete item | 4 |
| POST | `/{uuid}/items:reorder` | Reorder items | 4 |
| POST | `/{uuid}/start` | Start attempt | 5 |
| GET | `/{uuid}/draft` | Get current draft | 5 |
| PATCH | `/{uuid}/draft` | Save draft (auto-save) | 5 |
| POST | `/{uuid}/submit` | Submit attempt | 5, 6, 7 |
| GET | `/{uuid}/me` | My submissions | 5 |
| GET | `/{uuid}/attempt-state` | Attempt state projection | 5 |
| POST | `/{uuid}/items/{item_uuid}/runs` | Run code | 6 |
| GET | `/{uuid}/submissions` | Teacher: list submissions | 9 |
| GET | `/{uuid}/submissions/stats` | Submission statistics | 9 |
| PATCH | `/{uuid}/submissions/{sub_uuid}` | Save grade | 9 |
| PATCH | `/{uuid}/submissions/{sub_uuid}/grade` | Save grading draft | 9 |
| POST | `/{uuid}/publish-grades` | Bulk publish | 10 |
| GET | `/{uuid}/overrides` | List overrides | 14 |
| POST | `/{uuid}/overrides` | Create override | 14 |
| GET | `/{uuid}/audit` | Audit trail | 15 |

### Grading Routes (`/api/v1/grading/`)

| Method | Path | Purpose | Req |
|--------|------|---------|-----|
| GET | `/courses/{uuid}/gradebook` | Course gradebook | 11 |
| GET | `/courses/{uuid}/gradebook/cursor` | Paginated gradebook | 11 |
| GET | `/submissions` | Teacher submission list | 9 |
| GET | `/submissions/stats` | Stats | 9 |
| GET | `/submissions/export` | CSV export | 11 |
| PATCH | `/submissions/{uuid}` | Save grade | 9 |
| PATCH | `/submissions/batch` | Batch grade | 9 |
| POST | `/activities/{id}/publish-grades` | Bulk publish | 10 |
| POST | `/activities/{id}/extend-deadline` | Extend deadline | 14 |
| GET | `/submissions/{uuid}/feedback` | List feedback | 9 |
| POST | `/submissions/{uuid}/feedback` | Create feedback | 9 |
| GET | `/submissions/{uuid}/feedback-stream` | SSE stream | 12 |
| GET | `/sse` | Activity SSE stream | 12 |

## Error Codes

| Code | HTTP | Trigger |
|------|------|---------|
| `MIGRATION_REQUIRED` | 404 | Legacy UUID referenced |
| `PERMISSION_DEPRECATED` | 403 | Deprecated permission key used |
| `PUBLISH_VALIDATION_FAILED` | 422 | Assessment not ready for publish |
| `ASSESSMENT_LOCKED` | 409 | Edit attempt on published assessment with submissions |
| `ITEM_LIMIT_EXCEEDED` | 422 | >200 items |
| `ATTEMPT_LIMIT_EXCEEDED` | 422 | Max attempts reached |
| `ALREADY_AUTO_SUBMITTED` | 409 | Time-expired submission |
| `CODE_RUNNER_DEGRADED` | 503 | Judge0 unavailable |
| `LANGUAGE_NOT_ALLOWED` | 400 | Disallowed language |
| `COMPILATION_ERROR` | 200 | Code compile failure (in response body) |
| `FILE_VALIDATION_FAILED` | 422 | Upload constraint violated |
| `SUBMISSION_NOT_EDITABLE` | 409 | Non-DRAFT file modification |
| `LEGACY_PAYLOAD_REJECTED` | 422 | Legacy answer format |
| `GRADING_PIPELINE_FAILURE` | 500 | Unhandled pipeline error |
| `GRADING_TIMEOUT` | 504 | Pipeline exceeded 30s |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key, different payload |

## Security Considerations

1. **RBAC enforcement:** Every route handler calls `PermissionChecker.require()` with the appropriate `assessment:{action}` permission
2. **Optimistic concurrency:** `If-Match` header prevents silent grade overwrites between teachers
3. **Rate limiting:** Draft saves throttled to 1/5s; SSE connections capped at 5/user
4. **Input validation:** All payloads validated via Pydantic strict models before DB operations
5. **Code execution isolation:** Judge0 runs with `enable_network=False`, per-item time/memory limits
6. **Audit immutability:** PostgreSQL REVOKE + application-level guards on GradingEntry

## Performance Considerations

1. **Gradebook:** Cursor-based pagination avoids OFFSET performance degradation; 2-second SLA
2. **Pipeline timeout:** 30-second hard cap prevents runaway grading
3. **SSE keepalive:** 30-second heartbeat prevents proxy timeouts
4. **Code execution:** Idempotency prevents duplicate Judge0 submissions
5. **Draft throttle:** Redis-based rate limiter prevents auto-save storms
6. **Bulk publish:** Processes submissions in batches of 50 within a 30-second window

## Testing Strategy

1. **Unit tests:** Each pipeline stage tested in isolation with typed context objects
2. **Determinism tests:** Grade → re-grade with same snapshots → assert identical scores
3. **Contract tests:** Legacy UUID → 404 MIGRATION_REQUIRED; legacy payload → 422
4. **Integration tests:** Full pipeline end-to-end with real DB (SQLite for speed)
5. **Load tests:** Gradebook with 2000 students; bulk publish with 500 submissions
