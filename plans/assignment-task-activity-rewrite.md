I have a thorough picture of the system. Here is the full critical analysis and rewrite plan.

---

## Critical Analysis

### What the system is doing well

The unified `Submission` model (`db/grading/submissions.py`) is clean, well-structured, and correctly separates concerns. The grading service decomposition (`grader.py` → `quiz_grader.py`, `exam_grader.py`, `code_grader.py`, `assignment_breakdown.py`) is reasonable. The typed `AssignmentTaskConfig` discriminated union already exists in `assignments.py:232` — it just isn't enforced anywhere.

---

### Issue Inventory (confirmed from source, not inferred)

#### Dead code — remove without replacement

| Location                          | Problem                                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routers/assignments.py:58-68`    | `POST /assignments` → `create_assignment()` which unconditionally raises HTTP 410. Both endpoint and service function are dead.                                |
| `routers/assignments.py:119-129`  | `DELETE /{assignment_uuid}` → `delete_assignment()` which unconditionally raises HTTP 409 telling callers to use the activity endpoint instead. Both are dead. |
| `routers/assignments.py:248-324`  | 6 endpoints all call `_legacy_assignment_submission_endpoint_disabled()` → HTTP 410. Dead code cluttering the router contract.                                 |
| `routers/assignments.py:395-414`  | 2 more legacy submission endpoints returning 410: `/{uuid}/submissions/me`, `/{uuid}/submissions/{user_id}`.                                                   |
| `services/assignments.py:494-507` | `create_assignment()` body is `raise HTTPException(status_code=410, ...)`.                                                                                     |
| `services/assignments.py:686-726` | `delete_assignment()` body is `raise HTTPException(status_code=409, ...)`.                                                                                     |

**Total dead code: 2 service functions + 8 router functions + helper `_legacy_assignment_submission_endpoint_disabled`.**

#### Monolith — the 1397-line service file

`services/courses/activities/assignments.py` mixes six unrelated concerns:

1. Date/time coercion utilities (`_coerce_datetime`, `_derive_due_at`, `_assignment_due_deadline`)
2. Answer normalization & validation (`_normalize_assignment_answers`, `_validate_assignment_answer_tasks`)
3. DB query helpers (`_get_assignment_context`, `_get_assignment_task_context`, `_get_assignment_tasks`, `_get_open_assignment_draft`, `_get_blocking_assignment_submission`, `_count_previous_assignment_attempts`)
4. Course access/permission logic (`_require_assignment_submit_access`, `_user_has_course_access`, `_get_active_course_author_user_ids`, `_get_course_member_user_ids`)
5. Assignment CRUD (`read_assignment`, `read_assignment_from_activity_uuid`, `update_assignment`, `delete_assignment_from_activity_uuid`, `create_assignment_with_activity`, `get_assignments_from_course`, `get_assignments_from_courses`, `get_editable_assignments_from_courses`)
6. Task CRUD + file uploads (`create_assignment_task`, `read_assignment_tasks`, `read_assignment_task`, `update_assignment_task`, `delete_assignment_task`, `put_assignment_task_reference_file`, `put_assignment_task_submission_file`)
7. Submission lifecycle (`get_assignment_draft_submission`, `save_assignment_draft_submission`, `submit_assignment_draft_submission`)

#### Duplicate Submission creation block (lines 391–408 vs 448–465)

Both `save_assignment_draft_submission` and `submit_assignment_draft_submission` contain an identical `if not draft:` block that builds a new `Submission(...)`. Any change to Submission initialization must be made twice. The only difference after creation is that `submit` sets `status`, `is_late`, `submitted_at`, `grading_json`.

#### Schema design problems in `db/courses/assignments.py`

**`AssignmentBase` leaks internal DB IDs into API responses:**
```python
# AssignmentBase fields exposed in AssignmentRead:
course_id: int      # internal DB integer FK
chapter_id: int     # internal DB integer FK
activity_id: int    # internal DB integer FK
```
Clients receive raw database row IDs. `AssignmentRead` extends `AssignmentBase`, so these are serialized into every API response. The existing `course_uuid` and `activity_uuid` fields in `AssignmentRead` are what clients should use.

**Dual `due_date` / `due_at` fields:**
`AssignmentBase` has `due_date: str` (ISO string, validated by `_normalize_due_date_value`) AND `due_at: datetime | None` (the parsed, UTC-normalized version). Both stored in the DB. `_derive_due_at` recomputes `due_at` from `due_date` on every write. The two can drift. Clients can pass either or both. Pick one source of truth.

**`creation_date` / `update_date` as raw strings:**
```python
# Assignment model:
creation_date: str | None = None
update_date: str | None = None
# AssignmentTask model:
creation_date: str     # no None, no default
update_date: str
```
These are set as `datetime.now().isoformat()` (naive, no timezone). Inconsistent with `Submission.created_at`/`updated_at` (proper `DateTime(timezone=True)`). The task model doesn't even allow None, which means it must be set before every insert.

**`AssignmentTaskRead` exposes `max_grade_value` from `AssignmentTaskBase`:**
`contents: dict[str, object]` is stored as an untyped JSON blob. The `AssignmentTaskConfig` discriminated union exists in the same file at line 232 but is never used for validation before DB write or API response.

#### Router design problems in `routers/courses/assignments.py`

**POST-as-GET pattern:**
```python
@router.post("/courses")     # body: {"course_uuids": [...]}
@router.post("/courses/editable")  # body: {"course_uuids": [...]}
```
These are read-only queries using POST to pass a list. Should be `GET /courses?course_uuids=a,b,c` or a properly-named batch endpoint.

**Inconsistent URL for single task:**
```python
GET /task/{assignment_task_uuid}       # no assignment_uuid in path
GET /{assignment_uuid}/tasks/{uuid}    # only for update/delete
```
`/task/{uuid}` is a different URL pattern from everything else. Cross-assignment task reads without the assignment context is also a permission-checking gap.

**`request: Request` parameter threaded through everything:**
Every service function takes `request: Request` as its first argument but nothing in the service layer uses it — the `request` is only relevant at the HTTP boundary. This is a FastAPI anti-pattern; the router should extract anything it needs from the request and pass typed values to services.

#### Frontend type drift

`apps/web/types/grading.ts` (232 lines) is a hand-maintained mirror of `db/grading/submissions.py` Pydantic models. No codegen. Already missing some fields added in recent backend changes.

---

## Rewrite Plan

### Phase 0 — Delete dead code (no risk, do first)

**`apps/api/src/routers/courses/assignments.py`** — remove the following endpoints entirely (no redirect, no comment, no tombstone):

- `POST /` (`api_create_assignments`) — dead, raises 410
- `DELETE /{assignment_uuid}` (`api_delete_assignment`) — dead, raises 409
- `GET /{uuid}/tasks/{task_uuid}/submissions/me`
- `GET /{uuid}/tasks/{task_uuid}/submissions/user/{user_id}`
- `GET /{uuid}/tasks/{task_uuid}/submissions`
- `PUT /{uuid}/tasks/{task_uuid}/submissions`
- `PUT /submissions/{task_submission_uuid}`
- `DELETE /{uuid}/tasks/{task_uuid}/submissions/{submission_uuid}`
- `GET /{uuid}/submissions/me`
- `GET /{uuid}/submissions/{user_id}`
- The `_legacy_assignment_submission_endpoint_disabled` helper

Also remove the now-unused imports from the router (`AssignmentCreate`, `AssignmentRead` from the explicit create path).

**`apps/api/src/services/courses/activities/assignments.py`** — remove:

- `create_assignment()` function (raises 410)
- `delete_assignment()` function (raises 409)

Update the router imports accordingly.

---

### Phase 1 — Fix the data model

**`apps/api/src/db/courses/assignments.py`**

**1a. Collapse `due_date`/`due_at` into a single field.**

Keep only `due_at: datetime` (UTC-aware, required). Remove `due_date: str`. Clients that currently pass `due_date` as a string ISO date should pass `due_at` instead. The `_coerce_datetime` / `_derive_due_at` / `_assignment_due_deadline` utilities in the service go away.

Migration: `ALTER TABLE assignment DROP COLUMN due_date`. `due_at` already exists and is populated; existing rows are not affected.

**1b. Remove internal FK integer IDs from `AssignmentRead`.**

`AssignmentBase` currently is the shared base for both the DB table model and the API read model, which forces internal IDs into the API contract. Split them:

```
AssignmentDB (table=True)  — has id, course_id, chapter_id, activity_id as FK columns
AssignmentRead             — has assignment_uuid, course_uuid, activity_uuid, due_at, title, description, grading_type, published
AssignmentCreate           — input model, takes course_id/chapter_id (internal, for the service layer only, not returned)
AssignmentUpdate           — partial patch, only title/description/due_at/grading_type
```

`AssignmentRead` must not inherit from `AssignmentBase`. It is a projection model.

**1c. Replace `creation_date`/`update_date` strings with proper datetime fields.**

```python
# Before:
creation_date: str | None = None
update_date: str | None = None

# After:
created_at: datetime = Field(sa_column=Column(DateTime(timezone=True)))
updated_at: datetime = Field(sa_column=Column(DateTime(timezone=True)))
```

Migration: `ALTER TABLE assignment RENAME COLUMN creation_date TO created_at; ALTER TABLE assignmenttask ...` — then cast to `TIMESTAMPTZ`. Same for `AssignmentTask`. The values are already valid ISO strings so `USING creation_date::timestamptz` works.

**1d. Enforce `AssignmentTaskConfig` on write.**

In `AssignmentTaskBase.contents`, replace the untyped `dict[str, object]` with:

```python
contents: AssignmentTaskConfig = Field(
    default_factory=AssignmentOtherTaskConfig,
    sa_column=Column(JSON),
)
```

The discriminated union `AssignmentTaskConfig` already exists in `assignments.py:232`. This just plugs it in. Pydantic will reject malformed configs before they reach the DB.

**1e. Make `order` append-only via the API.**

Remove `order: int | None = None` from `AssignmentTaskUpdate`. The order of an existing task cannot be changed via a plain PATCH; a dedicated `POST /{assignment_uuid}/tasks/reorder` endpoint (body: `[{task_uuid, order}]`) should do the reorder atomically.

---

### Phase 2 — Break up the service monolith

Split `apps/api/src/services/courses/activities/assignments.py` into:

```
apps/api/src/services/courses/activities/assignments/
├── __init__.py          — re-exports the public functions (no logic)
├── crud.py              — read, update, delete_from_activity, create_with_activity, get_from_course(s)
├── tasks.py             — create_task, read_task(s), update_task, delete_task, reorder_tasks
├── uploads.py           — put_task_reference_file, put_task_submission_file
├── submissions.py       — get_draft, save_draft, submit_draft
└── _queries.py          — internal DB helpers (prefixed _, not exported):
                             _get_assignment_context
                             _get_assignment_task_context
                             _get_assignment_tasks
                             _get_open_assignment_draft
                             _get_blocking_assignment_submission
                             _count_previous_assignment_attempts
```

The `_user_has_course_access`, `_get_active_course_author_user_ids`, `_get_course_member_user_ids` functions are not assignment-specific — move them to `services/courses/access.py` (or wherever course-membership checks live) and import from there.

Drop `request: Request` from all service function signatures. The request object is never used inside services; it was only threaded in by convention. Remove it from service functions and update the router call sites.

---

### Phase 3 — Deduplicate submission creation

In the new `submissions.py`, extract the shared draft-construction logic:

```python
def _get_or_create_draft(
    activity_id: int,
    user_id: int,
    db_session: Session,
    *,
    now: datetime,
) -> Submission:
    draft = _get_open_assignment_draft(activity_id, user_id, db_session)
    if draft:
        return draft
    return Submission(
        submission_uuid=f"submission_{ULID()}",
        assessment_type=AssessmentType.ASSIGNMENT,
        activity_id=activity_id,
        user_id=user_id,
        status=SubmissionStatus.DRAFT,
        attempt_number=_count_previous_assignment_attempts(activity_id, user_id, db_session) + 1,
        answers_json={},
        grading_json={},
        started_at=now,
        created_at=now,
        updated_at=now,
    )
```

`save_draft` calls `_get_or_create_draft`, patches `answers_json`, commits.
`submit_draft` calls `_get_or_create_draft`, patches `answers_json`, then additionally sets `status`, `is_late`, `submitted_at`, `grading_json`.

---

### Phase 4 — Fix the router

**4a. Replace POST-as-GET with proper GET endpoints.**

```python
# Before:
@router.post("/courses")         # body: {"course_uuids": [...]}
@router.post("/courses/editable")

# After:
@router.get("/courses")          # query: ?course_uuids=a&course_uuids=b
@router.get("/courses/editable")
```

Update the frontend query hooks (`assignments.query.ts`) to pass `course_uuids` as repeated query params.

**4b. Fix inconsistent single-task URL.**

```python
# Before:
GET /task/{assignment_task_uuid}

# After:
GET /{assignment_uuid}/tasks/{assignment_task_uuid}
```

Update frontend `useAssignments` hooks and query options. The old URL can be removed (no backwards compat shim needed since this is an internal API).

**4c. Drop `request: Request` from all route handlers** where it is not used (it's passed to services which don't use it either). Keep it only where middleware/logging actually reads it.

---

### Phase 5 — Frontend type generation

Add `openapi-typescript` to the frontend build:

```json
// apps/web/package.json
"scripts": {
  "generate:types": "openapi-typescript http://localhost:8000/openapi.json -o src/types/api.generated.ts"
}
```

Replace hand-maintained `apps/web/types/grading.ts` with imports from the generated file. The generated types become the single source of truth for all API shapes. Run `generate:types` as part of CI.

---

### Phase 6 — `AssignmentTask.contents` type validation on the frontend

`TaskEditor` components (`TaskFileObject.tsx`, `TaskQuizObject.tsx`, `TaskFormObject.tsx`) currently build `contents` as plain objects. Add Zod schemas mirroring the backend `AssignmentTaskConfig` discriminated union so validation happens at form submission, not silently on the server.

---

### What NOT to change

- `db/grading/submissions.py` — clean, do not touch
- `services/grading/` modules (`grader.py`, `quiz_grader.py`, `exam_grader.py`, `code_grader.py`, `assignment_breakdown.py`, `teacher.py`, `submit.py`) — well-structured, leave alone
- `db/courses/activities.py` — fine as-is
- The migration files already run — do not alter them
- `AssignmentTaskConfig` discriminated union — already correct, just wire it in (Phase 1d)
- Submission state machine logic in `teacher.py` — correct, just needs an optimistic-lock column added later (not in this rewrite)

---

### Execution order

```
Phase 0  (delete dead code)          — 1-2 hours, zero risk
Phase 1a (collapse due fields)       — requires 1 migration
Phase 1b (split AssignmentRead)      — schema-only, no migration
Phase 1c (fix date string fields)    — requires 1 migration (can batch with 1a)
Phase 1d (enforce TaskConfig)        — schema-only
Phase 1e (append-only order)         — schema + new reorder endpoint
Phase 2  (split service module)      — mechanical refactor, no logic change
Phase 3  (dedup draft creation)      — logic change, needs tests
Phase 4  (fix router)                — requires frontend call-site updates
Phase 5  (type codegen)              — tooling only
Phase 6  (frontend Zod validation)   — frontend only, low risk
```

Phases 0–1 are independent of each other and can be done in any order. Phase 2 is a prerequisite for Phase 3 (easier to see the duplication once isolated). Phase 4 requires Phase 2 to be done (no more `request` threading). Phases 5–6 are purely additive and can be done any time.
