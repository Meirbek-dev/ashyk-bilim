# Implementation Tasks

## Task 1: Fix Feedback Router Bug (Req 3)
- [ ] 1. In `apps/api/src/routers/grading/feedback.py`, replace the `breakdown=submission.grading_json` kwarg with `effective_breakdown=grading_dict` where `grading_dict = submission.grading_json if isinstance(submission.grading_json, dict) else {}`
- [ ] 2. Set `raw_breakdown=submission.raw_grading_json if isinstance(submission.raw_grading_json, dict) else {}` in the same GradingEntry constructor
- [ ] 3. Extract `overall_feedback` safely: `overall_feedback=grading_dict.get("feedback", "") if isinstance(grading_dict, dict) else ""`
- [ ] 4. In `apps/api/src/db/strict_base_model.py`, add conditional `model_config = ConfigDict(extra="forbid")` when `os.environ.get("PLATFORM_DEVELOPMENT_MODE")` is truthy
- [ ] 5. Write a unit test that constructs a GradingEntry with an invalid kwarg and asserts `ValidationError` is raised in dev mode

## Task 2: Delete Legacy Bytecode and Stale Files (Req 1)
- [ ] 1. Delete `apps/api/src/tasks/__pycache__/assignment_scheduler.cpython-314.pyc`
- [ ] 2. Delete `apps/web/coverage/services/courses/assignments.ts.html` (if exists)
- [ ] 3. Verify no imports or references to `assignment_scheduler` exist in any `.py` file
- [ ] 4. Add a CI check script that greps for `assignment_scheduler` and fails if found

## Task 3: Replace `grade_assignments` Permission Key (Req 1, 2)
- [ ] 1. In `apps/api/src/services/courses/courses.py` line 1668, replace `"grade_assignments": False` with `"assessment:grade": False`
- [ ] 2. In `apps/api/src/services/courses/courses.py` line 1840, replace `rights["permissions"]["grade_assignments"] = True` with `rights["permissions"]["assessment:grade"] = True`
- [ ] 3. In `apps/api/src/routers/courses/courses.py`, update the `CoursePermissions` Pydantic model: rename `grade_assignments: bool` to `assessment_grade: bool`
- [ ] 4. Update all docstrings and OpenAPI examples in `courses.py` that reference `grade_assignments`
- [ ] 5. Add `DEPRECATED_PERMISSION_MAP = {"grade_assignments": "assessment:grade"}` to `src/security/rbac.py`
- [ ] 6. Add `DEPRECATED_PERMISSIONS_ENABLED` setting (default True) to `AppSettings`
- [ ] 7. Implement `_resolve_permission()` in `PermissionChecker` that maps deprecated keys when flag is enabled, raises HTTP 403 `PERMISSION_DEPRECATED` when disabled

## Task 4: Write Alembic Migration to Drop Legacy Tables (Req 17)
- [ ] 1. Create migration file `migrations/versions/YYYY_MM_DD_drop_legacy_assignment_tables.py`
- [ ] 2. In `upgrade()`: verify zero rows in each of `assignment`, `assignmenttask`, `assignmentusersubmission`, `assignmenttasksubmission` — abort with descriptive error if any have rows
- [ ] 3. In `upgrade()`: execute `DROP TABLE` for each legacy table
- [ ] 4. In `upgrade()`: strip `legacy_assignment_type` and `legacy_task_submission_uuid` keys from `submission.metadata_json` using PostgreSQL JSON operators
- [ ] 5. In `downgrade()`: recreate all four table schemas (columns, indexes, constraints) without data
- [ ] 6. Add migration execution logging (tables dropped, duration, operator)
- [ ] 7. Write a test that runs the migration against a test DB with empty legacy tables and verifies they are dropped

## Task 5: Regenerate OpenAPI Schema (Req 18)
- [ ] 1. Run the OpenAPI generation command to produce a fresh `apps/api/openapi.json`
- [ ] 2. Verify the generated schema contains zero occurrences of: `grade_assignments`, `assignment_scheduler`, `assignmenttask`, `assignmentusersubmission`, `assignmenttasksubmission`
- [ ] 3. Regenerate `apps/web/src/lib/api/generated/schema.ts` from the cleaned OpenAPI spec
- [ ] 4. Run TypeScript compilation (`tsc --noEmit`) and verify zero type errors
- [ ] 5. Add a `check:contracts` npm script that greps the generated schema for legacy patterns and exits non-zero if found

## Task 6: Implement Permission Model Namespace (Req 2)
- [ ] 1. Define `ASSESSMENT_PERMISSIONS` frozenset in `src/security/rbac.py` with all `assessment:{action}` keys
- [ ] 2. Update all `PermissionChecker.require()` calls in assessment routes to use `assessment:grade`, `assessment:publish`, etc.
- [ ] 3. Add `assessment:publish` permission check to the `bulk_publish_grades` and `api_publish_grades` endpoints
- [ ] 4. Add HTTP 403 error response with `{"code": "PERMISSION_REQUIRED", "required": "assessment:{action}"}` format
- [ ] 5. Write integration tests: user without `assessment:grade` → 403; user with permission → 200

## Task 7: Assessment Duplication Endpoint (Req 4)
- [ ] 1. Add `POST /assessments/{uuid}/duplicate` route in `unified.py`
- [ ] 2. Implement `duplicate_assessment()` in `services/assessments/core.py`: deep-copy Assessment + all AssessmentItems + AssessmentPolicy with new UUIDs, set lifecycle=DRAFT
- [ ] 3. Ensure duplicated items get new `item_uuid` values and reset `order` sequentially
- [ ] 4. Return the new `AssessmentRead` with all items populated
- [ ] 5. Write test: duplicate a PUBLISHED assessment → verify new UUID, DRAFT status, same item count

## Task 8: Assessment Item Limit Guard (Req 4)
- [ ] 1. In `create_assessment_item()`, add a count query: `SELECT COUNT(*) FROM assessment_item WHERE assessment_id = :id`
- [ ] 2. If count >= 200, raise HTTPException(422, detail={"code": "ITEM_LIMIT_EXCEEDED", "max": 200})
- [ ] 3. Write test: create 200 items → success; create 201st → 422

## Task 9: Assessment Content Locking (Req 4)
- [ ] 1. In `update_assessment_item()` and `delete_assessment_item()`, check if assessment is PUBLISHED AND has submissions with status != DRAFT
- [ ] 2. If locked: for updates, allow only `title`, `description`, `explanation` fields; reject scoring field changes with HTTP 409 `ASSESSMENT_LOCKED`
- [ ] 3. If locked: for deletes, reject with HTTP 409 `ASSESSMENT_LOCKED`
- [ ] 4. Write test: publish assessment, create submission, attempt to delete item → 409

## Task 10: Draft Save Throttle (Req 5)
- [ ] 1. Add Redis-based rate limiter: key `draft_throttle:{submission_uuid}`, TTL 5 seconds
- [ ] 2. In `save_assessment_draft()`, check if key exists → if yes, return HTTP 429 or silently accept (design choice: accept but skip DB write)
- [ ] 3. Include `answered_count` and `total_items` in draft save response
- [ ] 4. Include `time_remaining_seconds` computed from `started_at + time_limit - now()` in response
- [ ] 5. Write test: two saves within 5 seconds → second is throttled

## Task 11: Auto-Submit on Time Expiry (Req 5)
- [ ] 1. Create background task `assessment_timer_loop` in `src/tasks/assessment_timer.py`
- [ ] 2. Query: submissions WHERE status=DRAFT AND started_at IS NOT NULL AND (started_at + time_limit) < now()
- [ ] 3. For each expired submission: call `submit_assessment()` with current draft answers
- [ ] 4. If no draft answers exist, create submission with empty payload and mark metadata `timed_out_empty: true`
- [ ] 5. Wire into app lifespan startup alongside `assessment_scheduler_loop`
- [ ] 6. Add guard in `submit_assessment()`: if submission already auto-submitted → HTTP 409 `ALREADY_AUTO_SUBMITTED`

## Task 12: SSE Replay and Connection Limits (Req 12)
- [ ] 1. Add Redis sorted set `sse_events:{activity_id}` to store events with timestamp scores
- [ ] 2. In `publish_grading_event()`, also ZADD the event to the sorted set with TTL cleanup
- [ ] 3. Add `Last-Event-ID` header parsing in the SSE endpoint
- [ ] 4. On reconnect, replay events from sorted set where score > last_event_timestamp, up to 5 minutes
- [ ] 5. Add connection counter: `sse_conn:{user_id}` in Redis, increment on connect, decrement on disconnect
- [ ] 6. If counter > 5, return HTTP 429
- [ ] 7. Add 30-second keepalive comment emission when no events arrive
- [ ] 8. Add `event_id` field (ULID) to all emitted events

## Task 13: Anti-Cheat Violation Threshold Auto-Submit (Req 13)
- [ ] 1. In `submit_assessment()` orchestrator, after `check_violations()` returns `violation_exceeded=True`, set submission metadata `auto_submit_reason: "INTEGRITY_VIOLATION"`
- [ ] 2. Add `FLAGGED` to `SubmissionStatus` enum (or use existing violation_zeroed logic)
- [ ] 3. Cap `SubmissionMetadata.violations` list at 500 entries
- [ ] 4. Include violation history in `TeacherSubmissionRead` response
- [ ] 5. Write test: submit with violation_count > threshold → auto_score=0, metadata contains reason

## Task 14: Plagiarism Detection Background Task (Req 13)
- [ ] 1. Create `src/tasks/plagiarism_checker.py` with `check_plagiarism(submission_id)` function
- [ ] 2. After CODE_CHALLENGE submission completes, enqueue plagiarism check as background task
- [ ] 3. Compare source code against other submissions for the same item using token-based similarity
- [ ] 4. Store result in `SubmissionMetadata.plagiarism`: `{score: float, checked_at: str, flagged: bool, status: "COMPLETE"|"INCOMPLETE", details: {}}`
- [ ] 5. If detection fails, set `status: "INCOMPLETE"` with error reason
- [ ] 6. Write test: two identical submissions → plagiarism score > 0.9

## Task 15: Policy Override Validation (Req 14)
- [ ] 1. Add constants `MAX_ATTEMPTS_CEILING = 10` and `MAX_TIME_LIMIT_MINUTES = 480` to settings
- [ ] 2. In `create_student_policy_override()`, validate override fields against ceilings
- [ ] 3. If exceeded, raise HTTPException(422, detail={"code": "OVERRIDE_EXCEEDS_MAXIMUM", "field": ..., "max": ...})
- [ ] 4. Add logic to handle multiple non-expired overrides: select the one with most recent `created_at`
- [ ] 5. Write test: create override with 11 attempts → 422; create with 10 → 201

## Task 16: GradingEntry Immutability Guards (Req 15)
- [ ] 1. Add SQLAlchemy event listener `@event.listens_for(GradingEntry, "before_update")` that raises `ImmutableRecordError`
- [ ] 2. Add SQLAlchemy event listener `@event.listens_for(GradingEntry, "before_delete")` that raises `ImmutableRecordError`
- [ ] 3. Define `SYSTEM_GRADER_ID = 0` constant for auto-grading pipeline entries
- [ ] 4. In pipeline `persist.py`, when creating GradingEntry for auto-graded results, set `graded_by=SYSTEM_GRADER_ID`
- [ ] 5. Write test: attempt to update a GradingEntry → raises error; attempt to delete → raises error

## Task 17: Grading Pipeline Timeout (Req 8)
- [ ] 1. Wrap the pipeline execution in `asyncio.timeout(30)` in `submit_assessment()` orchestrator
- [ ] 2. On `asyncio.TimeoutError`: rollback transaction, return HTTP 504 `GRADING_TIMEOUT`
- [ ] 3. On any unhandled exception: rollback transaction, return HTTP 500 `GRADING_PIPELINE_FAILURE`
- [ ] 4. Write test: mock a slow grader that sleeps 31 seconds → verify 504 response

## Task 18: Batch Grade All-or-Nothing Semantics (Req 9)
- [ ] 1. In `batch_grade_submissions()`, pre-validate all submissions before applying any changes
- [ ] 2. Check version conflicts and status compatibility for each submission in the batch
- [ ] 3. If any validation fails, return `BatchGradeResponse` with `failed > 0` and no changes applied
- [ ] 4. Cap batch size at 50 submissions (already enforced by `max_length=100` on schema — tighten to 50)
- [ ] 5. Write test: batch of 3 where 1 has version conflict → entire batch rejected

## Task 19: Grade Publishing Visibility Control (Req 10)
- [ ] 1. In `StudentSubmissionRead` serializer, add field omission logic: if status == GRADED, set `final_score=None`, `grading_json={}`, `raw_grading_json={}`
- [ ] 2. Ensure `published_at` is null for GRADED submissions in student responses
- [ ] 3. In bulk publish, emit `grade.published` SSE event for each transitioned submission
- [ ] 4. Handle partial failures: continue processing remaining submissions, return success/failure counts
- [ ] 5. Write test: student fetches GRADED submission → score fields are null; after publish → score visible

## Task 20: Gradebook CSV Export (Req 11)
- [ ] 1. Verify existing `export_grades_csv()` streaming generator works correctly
- [ ] 2. Add assessment type and date range filter parameters to the export endpoint
- [ ] 3. Ensure the CSV includes: student name, email, activity title, score, submission date, status
- [ ] 4. Write test: export CSV for a course with 5 students and 3 activities → verify row count and headers

## Task 21: Code Challenge Compilation Error Handling (Req 6)
- [ ] 1. In `CodeExecutionService._execute_sync()`, detect compilation errors from Judge0 status
- [ ] 2. When compilation fails, return `CodeExecutionResult` with status=COMPILE_ERROR, score=0, and compile_output populated
- [ ] 3. In the API response, include `compile_output` field for student visibility
- [ ] 4. Ensure no test cases are executed after a compilation error
- [ ] 5. Write test: submit code with syntax error → status COMPILE_ERROR, score 0, compile_output non-empty

## Task 22: File Upload Validation (Req 7)
- [ ] 1. In the file upload handler, validate: file count ≤ `max_files`, file size ≤ `max_mb` MB, MIME type in allowed list
- [ ] 2. Return HTTP 422 `FILE_VALIDATION_FAILED` with detail indicating which constraint was violated
- [ ] 3. Add guard: if submission status != DRAFT, reject upload with HTTP 409 `SUBMISSION_NOT_EDITABLE`
- [ ] 4. Add OPEN_TEXT character limit validation: reject if text length > 50,000 characters
- [ ] 5. Write test: upload file exceeding max_mb → 422; upload to non-DRAFT submission → 409

## Task 23: Legacy UUID 404 Guard (Req 1)
- [ ] 1. In assessment lookup endpoints, if UUID starts with `assignment_` prefix and no Assessment row exists, return HTTP 404 with `MIGRATION_REQUIRED` error code
- [ ] 2. Verify the existing test in `test_assessment_phase0_contract_api.py` covers this case
- [ ] 3. Ensure response time < 500ms (no expensive DB scans)

## Task 24: CI Contract Verification Script (Req 18)
- [ ] 1. Create `scripts/check_contracts.sh` (or npm script) that greps `openapi.json` and `schema.ts` for legacy patterns
- [ ] 2. Patterns to check: `grade_assignments`, `assignment_scheduler`, `assignmenttask`, `assignmentusersubmission`, `assignmenttasksubmission`
- [ ] 3. Exit non-zero if any pattern found
- [ ] 4. Add to CI pipeline as a required check
