# Requirements Document

## Introduction

Ground-up modernization of the assessment, exam, coding challenge, and grading system for the Ashyq Bilim educational platform. This initiative delivers zero-debt production-level code by completely removing all legacy assignment artifacts (no wrapping or porting), rewriting the system with clean separation of concerns, and providing a world-class UX for both teachers and students. The scope covers legacy deletion with DB migration, assessment authoring, student assessment-taking, grading pipeline hardening, teacher grading UX, gradebook, real-time updates, anti-cheat, code execution, policy/override system, audit trail, and permission model modernization.

## Glossary

- **Assessment_System**: The unified backend service responsible for authoring, lifecycle management, submission handling, and grading of all assessment types (QUIZ, EXAM, ASSIGNMENT, CODE_CHALLENGE)
- **Grading_Pipeline**: The sequential processing stages (validate → enforce → grade → penalize → persist → emit) that transform a raw submission into a graded result
- **GraderRegistry**: The pluggable dispatch mechanism that routes grading to the appropriate type-specific grader (QuizGrader, ExamGrader, CodeChallengeGrader, ManualReviewGrader)
- **GradingEntry**: An append-only ledger row recording one grading event for a submission, forming the immutable audit trail
- **Submission**: A single unified row per student per assessment attempt, tracking answers, scores, status, and metadata
- **AssessmentPolicy**: The configuration object defining late policies, attempt limits, time limits, grade release mode, and completion rules for an assessment
- **StudentPolicyOverride**: A per-student exception to the AssessmentPolicy (extended deadline, extra attempts, waived penalty)
- **SSE_Channel**: The Redis pub/sub backed Server-Sent Events channel delivering real-time grading events to connected clients
- **Judge0_Service**: The external code execution engine used for running and evaluating student code submissions
- **Gradebook**: The course-level and student-level aggregated view of all assessment scores and progress
- **Legacy_Artifact**: Any file, database table, permission key, or code path referencing the deprecated assignment system that predates the unified Assessment model
- **Review_Queue**: The teacher-facing prioritized list of submissions awaiting manual grading or review
- **Anti_Cheat_Monitor**: The client-side and server-side system that detects and records academic integrity violations during timed assessments
- **Permission_Model**: The RBAC system controlling access to assessment operations (authoring, submitting, grading, viewing)
- **Bulk_Action**: A batch operation performed by a teacher on multiple submissions simultaneously (publish grades, return all, extend deadline)

## Requirements

### Requirement 1: Legacy Artifact Complete Deletion

**User Story:** As a platform maintainer, I want all legacy assignment artifacts permanently removed from the codebase and database, so that the system carries zero technical debt and no dead code paths exist.

#### Acceptance Criteria

1. WHEN the migration executes, THE Assessment_System SHALL delete the file `apps/api/src/tasks/assignment_scheduler.py` and its compiled bytecode artifact (`assignment_scheduler.pyc`). IF the file does not exist at migration time, THEN THE Assessment_System SHALL skip deletion and log a warning without failing the migration.
2. WHEN the migration executes, THE Assessment_System SHALL remove all occurrences of the `grade_assignments` permission key from `apps/api/src/services/courses/courses.py` and replace each occurrence with the modernized permission key `assessment:grade`. THE Assessment_System SHALL fail the migration if zero occurrences are found, indicating an unexpected codebase state.
3. WHEN the migration executes, THE Assessment_System SHALL delete the stale coverage report `apps/web/coverage/services/courses/assignments.ts.html`. IF the file does not exist at migration time, THEN THE Assessment_System SHALL skip deletion and log a warning without failing the migration.
4. WHEN the migration executes, THE Assessment_System SHALL remove the `grade_assignments` key from `apps/api/openapi.json` and regenerate `apps/web/src/lib/api/generated/schema.ts`. THE Assessment_System SHALL verify that the regenerated schema contains zero occurrences of the strings `grade_assignments`, `assignment_scheduler`, and `assignmenttask` before completing successfully.
5. WHEN the migration executes, THE Assessment_System SHALL retain the `LEGACY_ANSWER_KEYS` frozenset in `apps/api/src/services/grading/pipeline/validate.py` as a permanent guard rail. WHEN a grading request payload contains any key present in the `LEGACY_ANSWER_KEYS` frozenset, THE Assessment_System SHALL reject the request with HTTP 400 and an error message indicating which legacy key was detected and that the payload format is no longer supported.
6. THE Assessment_System SHALL produce a single Alembic migration that drops all legacy assignment tables (`assignment`, `assignmenttask`, `assignmentusersubmission`, `assignmenttasksubmission`). The downgrade path SHALL recreate the table schemas (columns, indexes, and constraints) without restoring row data.
7. WHEN a client sends a request referencing a legacy assignment UUID that matches a UUID formerly belonging to a dropped assignment table, THE Assessment_System SHALL respond with HTTP 404, error code `MIGRATION_REQUIRED`, and a message indicating that the referenced assignment has been permanently migrated. THE Assessment_System SHALL return this response within 500 milliseconds.

### Requirement 2: Permission Model Modernization

**User Story:** As a platform administrator, I want a consistent, namespace-scoped permission model for all assessment operations, so that RBAC rules are predictable and auditable.

#### Acceptance Criteria

1. THE Permission_Model SHALL use the namespace pattern `assessment:{action}` for all assessment-related permissions where action is one of: `create`, `update`, `delete`, `submit`, `grade`, `publish`, `view_grades`, `manage_policy`, `override_policy`
2. WHILE the deprecated-permission compatibility flag is enabled, WHEN the `grade_assignments` permission key is encountered in an RBAC check, THE Permission_Model SHALL treat it as equivalent to `assessment:grade`
3. IF the deprecated-permission compatibility flag is disabled and a request relies on the `grade_assignments` key, THEN THE Permission_Model SHALL reject the request with HTTP 403 and error code `PERMISSION_DEPRECATED`
4. THE Permission_Model SHALL enforce that only users with `assessment:grade` permission can modify submission scores or transition submission status, except for transitions governed by a more specific permission (e.g., `assessment:publish`)
5. THE Permission_Model SHALL enforce that only users with `assessment:publish` permission can transition a submission from GRADED to PUBLISHED status
6. IF a user without the required `assessment:{action}` permission attempts a protected operation, THEN THE Permission_Model SHALL deny the operation, return HTTP 403, and include an error message indicating which permission is required

### Requirement 3: Feedback Router Bug Fix

**User Story:** As a developer, I want the feedback router to use the correct field name when creating GradingEntry records, so that grading data persists without runtime errors.

#### Acceptance Criteria

1. WHEN `_latest_or_create_grading_entry` in `apps/api/src/routers/grading/feedback.py` constructs a GradingEntry, THE Assessment_System SHALL pass only keyword arguments that correspond to fields defined on the GradingEntry model (`raw_breakdown`, `effective_breakdown`) and SHALL NOT pass the undefined keyword argument `breakdown`
2. WHEN a GradingEntry is created from a Submission, THE Assessment_System SHALL set `raw_breakdown` to `submission.raw_grading_json` (defaulting to an empty dict if the value is not a dict) and `effective_breakdown` to `submission.grading_json` (defaulting to an empty dict if the value is not a dict), such that both fields are non-null Python dicts at the time of database flush
3. IF the `PLATFORM_DEVELOPMENT_MODE` environment variable is set to a truthy value (1, true, yes, or on), THEN THE Assessment_System SHALL configure the SQLModel base class with `extra="forbid"` so that constructing a GradingEntry with an unrecognized keyword argument raises a Pydantic ValidationError before any database operation occurs
4. IF `submission.grading_json` is not an instance of `dict`, THEN THE Assessment_System SHALL substitute an empty dict `{}` for both `effective_breakdown` and the `overall_feedback` extraction, rather than passing the non-dict value to GradingEntry

### Requirement 4: Assessment Authoring (Teacher Workflow)

**User Story:** As a teacher, I want a streamlined assessment authoring experience with real-time validation, so that I can create high-quality assessments efficiently.

#### Acceptance Criteria

1. THE Assessment_System SHALL support creating assessments of types QUIZ, EXAM, ASSIGNMENT, and CODE_CHALLENGE through a unified authoring API
2. WHEN a teacher adds an item to an assessment, THE Assessment_System SHALL validate the item body against the schema for its kind (CHOICE, OPEN_TEXT, FILE_UPLOAD, FORM, CODE, MATCHING) and return field-level errors within 200ms
3. WHEN a teacher transitions an assessment from DRAFT to PUBLISHED, THE Assessment_System SHALL verify that all required fields (title, at least one item, and associated AssessmentPolicy) are populated, and IF any verification fails, THEN THE Assessment_System SHALL reject the transition with HTTP 422, error code `PUBLISH_VALIDATION_FAILED`, and a list of failing field paths
4. WHILE an assessment is in PUBLISHED state with at least one submission in DRAFT or SUBMITTED status, THE Assessment_System SHALL prevent deletion of items and restrict edits to non-scoring fields (title, description, explanation) only, returning HTTP 409 with error code `ASSESSMENT_LOCKED` for disallowed modifications
5. WHEN a teacher reorders items in an assessment, THE Assessment_System SHALL persist the new order atomically and increment the assessment content_version
6. THE Assessment_System SHALL support assessment duplication that creates a deep copy of all items, policy settings, and metadata with a new UUID, setting the duplicated assessment status to DRAFT
7. WHEN a teacher configures a CODE item, THE Assessment_System SHALL validate that at least one test case exists, a time limit between 1 and 480 seconds is set, and at least one language from the platform-supported list is allowed
8. IF a teacher attempts to add more than 200 items to a single assessment, THEN THE Assessment_System SHALL reject the addition with HTTP 422 and error code `ITEM_LIMIT_EXCEEDED`

### Requirement 5: Student Assessment-Taking (Quiz and Exam)

**User Story:** As a student, I want a focused, distraction-free assessment-taking experience with clear progress indicators, so that I can perform my best under timed conditions.

#### Acceptance Criteria

1. WHEN a student starts a timed assessment, THE Assessment_System SHALL record `started_at` server-side and return the remaining duration in seconds
2. WHILE a student is taking a timed assessment, THE Assessment_System SHALL accept draft saves (auto-save) that update `answers_json` without changing submission status, throttled to at most one accepted save per 5 seconds per submission
3. WHEN a student submits answers, THE Assessment_System SHALL process the submission through the full Grading_Pipeline (validate → enforce → grade → penalize → persist → emit) within 3 seconds for non-code assessments
4. IF the time limit expires before a student submits, THEN THE Assessment_System SHALL auto-submit the latest draft answers and apply the configured time-expiry policy; if no draft answers exist, THE Assessment_System SHALL create a submission with an empty answers payload and mark it as `TIMED_OUT_EMPTY`
5. WHEN a student attempts to submit after the attempt limit is reached, THE Assessment_System SHALL reject the submission with HTTP 422 and error code `ATTEMPT_LIMIT_EXCEEDED`
6. THE Assessment_System SHALL support optimistic concurrency on draft saves using the `draft_version` field, returning HTTP 409 if the version does not match
7. WHEN a QUIZ submission is graded with `GradeReleaseMode.IMMEDIATE`, THE Assessment_System SHALL return the score and breakdown in the submission response without requiring a separate fetch
8. WHILE a student is taking a timed assessment, THE Assessment_System SHALL include in each response the count of answered items out of total items and the remaining time in seconds, enabling the client to render progress
9. IF a student attempts to submit an assessment that has already been auto-submitted due to time expiry, THEN THE Assessment_System SHALL reject the submission with HTTP 409 and error code `ALREADY_AUTO_SUBMITTED`

### Requirement 6: Student Assessment-Taking (Code Challenge)

**User Story:** As a student, I want to write, run, and submit code with immediate visible-test feedback, so that I can iterate on my solution before final submission.

#### Acceptance Criteria

1. WHEN a student clicks Run, THE Assessment_System SHALL execute the code against visible test cases via Judge0_Service and return results within 10 seconds
2. WHEN a student submits a CODE_CHALLENGE, THE Assessment_System SHALL execute the code against all test cases (visible and hidden) via Judge0_Service as a FINAL run and return results within the per-item configured `time_limit_seconds` (maximum 30 seconds)
3. THE Assessment_System SHALL store each run entry in `SubmissionMetadata.runs` as an append-only list, where each entry includes: run_uuid, purpose (RUN or FINAL), language_id, passed_count, total_count, status, and executed_at timestamp, up to a maximum of 50 run entries per submission
4. IF Judge0_Service does not respond within 10 seconds or returns an HTTP 5xx status, THEN THE Assessment_System SHALL return HTTP 503 with error code `CODE_RUNNER_DEGRADED` and `is_retryable: true`
5. WHEN a code submission completes, THE Assessment_System SHALL calculate the score based on the configured code strategy: all-or-nothing (100% if all tests pass, 0% otherwise) or proportional (score = passed_count / total_count × max_points)
6. IF a student submits code in a language not included in the item's allowed languages list, THEN THE Assessment_System SHALL reject the submission with HTTP 400 and error code `LANGUAGE_NOT_ALLOWED`
7. IF a code run results in a compilation error, THEN THE Assessment_System SHALL return the compile_output to the student with status `COMPILATION_ERROR` and a score of zero without executing test cases

### Requirement 7: Student Assessment-Taking (Assignment / File Upload)

**User Story:** As a student, I want to submit assignments with file uploads and rich text responses, so that I can complete open-ended work.

#### Acceptance Criteria

1. WHEN a student uploads a file for a FILE_UPLOAD item, THE Assessment_System SHALL validate the file against configured constraints (max_files, max_mb per file, allowed MIME types) before accepting the upload. IF validation fails, THEN THE Assessment_System SHALL reject the upload with HTTP 422 and error code `FILE_VALIDATION_FAILED` indicating which constraint was violated.
2. WHEN a student submits an ASSIGNMENT, THE Assessment_System SHALL set `needs_manual_review=true` on the GradingBreakdown and route the submission to the Review_Queue
3. THE Assessment_System SHALL support multiple file attachments per item up to the configured `max_files` limit
4. WHILE a submission is in DRAFT status, THE Assessment_System SHALL allow the student to replace or remove uploaded files
5. IF a student attempts to upload or modify files on a submission that is not in DRAFT status, THEN THE Assessment_System SHALL reject the operation with HTTP 409 and error code `SUBMISSION_NOT_EDITABLE`
6. THE Assessment_System SHALL support OPEN_TEXT items with rich text responses (Markdown format) up to 50,000 characters per item

### Requirement 8: Grading Pipeline Integrity

**User Story:** As a platform architect, I want the grading pipeline to be deterministic, auditable, and resilient, so that grades are always correct and traceable.

#### Acceptance Criteria

1. THE Grading_Pipeline SHALL execute stages in the fixed order: validate → enforce → grade → penalize → persist → emit, with no stage skipping
2. WHEN the validate stage encounters a payload matching `LEGACY_ANSWER_KEYS`, THE Grading_Pipeline SHALL reject the submission with HTTP 422 and error code `LEGACY_PAYLOAD_REJECTED`
3. WHEN the grade stage completes, THE Grading_Pipeline SHALL store the raw (pre-penalty) result in `raw_grading_json` and the effective (post-penalty) result in `grading_json`
4. THE Grading_Pipeline SHALL apply late penalties using the formula: `final_score = round(raw_score * (1 - late_penalty_pct / 100), 2)` where `late_penalty_pct` is clamped to [0, 100] and snapshotted from the effective policy at submit time
5. WHEN the persist stage commits, THE Grading_Pipeline SHALL increment `Submission.version` atomically to support optimistic concurrency for teacher grading
6. THE Grading_Pipeline SHALL snapshot `content_version`, `policy_version`, `items_snapshot`, and `policy_snapshot` at submit time to ensure grading is reproducible against the exact assessment state the student saw
7. FOR ALL valid submissions, grading then re-grading with the same inputs and snapshots SHALL produce an identical `final_score` (determinism property), where scores are compared at 2 decimal places of precision
8. IF any pipeline stage raises an unhandled exception, THEN THE Grading_Pipeline SHALL roll back the database transaction, leave the submission in its pre-submit status, and return HTTP 500 with error code `GRADING_PIPELINE_FAILURE`
9. THE Grading_Pipeline SHALL complete all stages within 30 seconds for any single submission; IF the 30-second timeout is exceeded, THEN the pipeline SHALL abort, roll back, and return HTTP 504 with error code `GRADING_TIMEOUT`

### Requirement 9: Teacher Grading UX (Review Queue)

**User Story:** As a teacher, I want a prioritized review queue with inline feedback tools, so that I can grade efficiently and provide meaningful feedback.

#### Acceptance Criteria

1. THE Review_Queue SHALL display submissions ordered by: PENDING status first, then by `submitted_at` ascending (oldest first), with late submissions distinguished by a visible "late" indicator adjacent to the submission entry
2. WHEN a teacher opens a submission for grading, THE Assessment_System SHALL acquire a soft lock by emitting a `grade.conflict` SSE event to other connected teachers viewing the same submission, and SHALL automatically release the lock after 30 minutes of inactivity or when the teacher navigates away
3. WHEN a teacher saves a grade, THE Assessment_System SHALL validate the `version` header (If-Match) against `Submission.version` and return HTTP 412 if mismatched, requiring the teacher to reload the submission before retrying
4. THE Assessment_System SHALL support per-item inline feedback via the `ItemFeedback` model, allowing a score override between 0 and the item's configured maximum score (inclusive) and a text comment of up to 2000 characters per question or task
5. WHEN a teacher grades a submission, THE Assessment_System SHALL create a new append-only GradingEntry row recording the per-item scores, per-item feedback, overall feedback, penalty applied, and final score, preserving the full audit history
6. THE Assessment_System SHALL support batch grading operations (BatchGradeRequest) that apply the same score and feedback to a maximum of 50 submissions atomically
7. IF any submission within a BatchGradeRequest fails validation (version conflict or status incompatibility), THEN THE Assessment_System SHALL reject the entire batch without applying changes and return the list of failed submission IDs with failure reasons
8. WHEN a teacher returns a submission for revision, THE Assessment_System SHALL transition the status to RETURNED, record the teacher's revision comment in the GradingEntry, and emit a `submission.returned` event to the student via SSE_Channel

### Requirement 10: Grade Publishing and Visibility

**User Story:** As a teacher, I want fine-grained control over when students see their grades, so that I can review all grades before releasing them.

#### Acceptance Criteria

1. WHEN `GradeReleaseMode` is IMMEDIATE, THE Assessment_System SHALL transition auto-graded submissions directly to PUBLISHED status upon pipeline completion
2. WHEN `GradeReleaseMode` is MANUAL, THE Assessment_System SHALL keep submissions in GRADED status until the teacher explicitly publishes via individual or bulk publish action
3. WHEN a teacher triggers bulk publish, THE Assessment_System SHALL transition all GRADED submissions for the activity to PUBLISHED status within 30 seconds and emit a `grade.published` SSE event for each transitioned submission
4. WHILE a submission is in GRADED status, THE Assessment_System SHALL omit the `score`, `raw_breakdown`, `effective_breakdown`, and `overall_feedback` fields from student API responses and return `published_at` as null
5. WHEN a submission transitions to PUBLISHED, THE Assessment_System SHALL set `published_at` on the latest GradingEntry and include the `score`, `raw_breakdown`, `effective_breakdown`, and `overall_feedback` fields in subsequent student API responses
6. WHEN a teacher triggers individual publish for a single submission, THE Assessment_System SHALL transition that submission from GRADED to PUBLISHED status and emit a `grade.published` SSE event for the affected student
7. IF one or more submissions fail to transition during a bulk publish operation, THEN THE Assessment_System SHALL complete processing of all remaining submissions, return the count of successful and failed transitions, and leave failed submissions in GRADED status

### Requirement 11: Gradebook

**User Story:** As a teacher, I want a comprehensive course-level gradebook with filtering and export capabilities, so that I can track student progress across all assessments.

#### Acceptance Criteria

1. THE Gradebook SHALL display a matrix of students (rows) by activities (columns) with the latest published score in each cell; cells for activities without a published submission SHALL display a dash (—)
2. THE Gradebook SHALL support cursor-based pagination for courses with more than 50 students, returning pages within 2 seconds
3. WHEN a teacher requests the gradebook, THE Assessment_System SHALL include summary statistics per activity (average score of published submissions, pass rate as percentage of students scoring ≥ passing_score, submission count) and per student (weighted grade average, completion rate as completed_required / total_required)
4. THE Gradebook SHALL support filtering by assessment type, date range, and score range
5. WHEN a student views their own gradebook, THE Assessment_System SHALL display only PUBLISHED scores and hide GRADED or PENDING submissions
6. THE Assessment_System SHALL support exporting the gradebook as a CSV file via streaming response, including all students and all activities with their published scores

### Requirement 12: Real-Time Updates (SSE System)

**User Story:** As a teacher or student, I want real-time notifications when grading events occur, so that I stay informed without manual page refreshes.

#### Acceptance Criteria

1. THE SSE_Channel SHALL emit events of types: `submission.submitted`, `grade.published`, `submission.returned`, and `grade.conflict`, where each event payload includes at minimum: `event_id` (unique), `event_type`, `activity_id`, `submission_id`, `triggered_by` (user ID), and `timestamp`
2. WHEN a student submits an assessment, THE SSE_Channel SHALL emit a `submission.submitted` event to all teachers subscribed to that activity within 1 second
3. WHEN a grade is published, THE SSE_Channel SHALL emit a `grade.published` event to the affected student within 1 second
4. WHEN a teacher begins grading a submission while another teacher holds an active SSE connection filtered to the same submission, THE SSE_Channel SHALL emit a `grade.conflict` event to the other teacher within 2 seconds
5. IF the SSE connection drops, THEN the client SHALL automatically reconnect using the EventSource built-in retry mechanism with an initial retry interval of 3 seconds
6. THE SSE_Channel SHALL support filtering by `activity_id` and optional `assessment_uuid` query parameters
7. WHEN a client reconnects after a dropped connection, THE SSE_Channel SHALL deliver any events missed since the last received `event_id` (supplied via the `Last-Event-ID` header), up to a maximum replay window of 5 minutes
8. THE SSE_Channel SHALL accept a maximum of 5 concurrent connections per authenticated user, rejecting additional connection attempts with HTTP 429
9. IF no events are emitted for 30 seconds on an active connection, THEN THE SSE_Channel SHALL send a keep-alive comment to prevent proxy or network timeout

### Requirement 13: Anti-Cheat System

**User Story:** As a teacher, I want automated detection of suspicious behavior during timed assessments, so that academic integrity is maintained.

#### Acceptance Criteria

1. WHILE a student is taking a timed assessment, THE Anti_Cheat_Monitor SHALL record violations of types: TAB_SWITCH, COPY_PASTE, FULLSCREEN_EXIT, storing each violation with its type, UTC timestamp, and a running occurrence count per type
2. THE Anti_Cheat_Monitor SHALL store all violations in `SubmissionMetadata.violations` as an append-only list with a maximum of 500 entries per submission
3. WHEN the cumulative violation count exceeds the configured threshold in AssessmentPolicy, THE Assessment_System SHALL auto-submit the current draft, set the submission status to FLAGGED, and record the auto-submit reason as `INTEGRITY_VIOLATION` in the submission metadata
4. IF no violation threshold is configured in AssessmentPolicy for a timed assessment, THEN THE Anti_Cheat_Monitor SHALL record violations without triggering auto-submission
5. THE Assessment_System SHALL include the violation history (type, timestamp, count) and the FLAGGED status indicator in the teacher grading view API response alongside the submission
6. WHEN a CODE_CHALLENGE submission completes grading, THE Anti_Cheat_Monitor SHALL run plagiarism detection as a background task within 5 minutes of submission and store a similarity score (0-100) and matched submission references in `SubmissionMetadata.plagiarism`
7. IF plagiarism detection fails for a submission, THEN THE Anti_Cheat_Monitor SHALL record the failure status and reason in `SubmissionMetadata.plagiarism` and mark the plagiarism check as INCOMPLETE

### Requirement 14: Policy and Override System

**User Story:** As a teacher, I want flexible assessment policies with per-student exceptions, so that I can accommodate diverse student needs while maintaining fairness.

#### Acceptance Criteria

1. THE AssessmentPolicy SHALL support configuration of: attempt limits (1 to 10), time limits (1 to 480 minutes), late policy (NONE, PENALTY, CUTOFF), grade release mode (IMMEDIATE, MANUAL), and completion rules defining the minimum conditions required to mark an attempt as complete
2. WHEN a StudentPolicyOverride exists for a student and the override has not expired, THE Assessment_System SHALL apply the override values for any fields present in the override, falling back to the base policy for all fields not specified in the override
3. IF a StudentPolicyOverride has an `expires_at` timestamp in the past, THEN THE Assessment_System SHALL ignore the override and apply the base policy
4. THE Assessment_System SHALL support late penalty calculation modes: fixed percentage (1% to 100% deduction), linear decay (1% to 50% deduction per day, capped so the final grade does not fall below 0%), and cutoff (100% penalty after a configured timestamp)
5. WHEN a teacher creates a StudentPolicyOverride, THE Assessment_System SHALL validate that the override does not exceed system-wide maximums of 10 attempts and 480 minutes time limit
6. IF a teacher submits a StudentPolicyOverride that exceeds system-wide maximums, THEN THE Assessment_System SHALL reject the override, retain the existing policy unchanged, and return HTTP 422 with an error message indicating which field exceeded its allowed maximum
7. IF multiple non-expired StudentPolicyOverrides exist for the same student on the same assessment, THEN THE Assessment_System SHALL apply only the override with the most recent creation timestamp

### Requirement 15: Audit Trail and Compliance

**User Story:** As a compliance officer, I want a complete, immutable record of all grading actions, so that grade disputes can be resolved with full traceability.

#### Acceptance Criteria

1. IF an UPDATE or DELETE operation is attempted on an existing GradingEntry row, THEN THE Assessment_System SHALL reject the operation and return an error indicating that the ledger is append-only
2. WHEN a teacher modifies a grade, THE Assessment_System SHALL create a new GradingEntry row preserving the previous entry unchanged
3. WHEN the Grading_Pipeline persist stage commits an auto-graded result, THE Assessment_System SHALL create a new GradingEntry row with `graded_by` set to a designated system actor identifier
4. THE GradingEntry SHALL record: entry_uuid, submission_id, graded_by (user ID or system actor identifier), raw_score, penalty_pct, final_score, raw_breakdown, effective_breakdown, overall_feedback, grading_version, created_at, and published_at
5. THE Assessment_System SHALL support querying the full grading history for a submission ordered by created_at ascending, returning all GradingEntry rows ever created for that submission within 2 seconds
6. WHEN a Bulk_Action is performed, THE Assessment_System SHALL record the action_uuid, performer, action_type, target_user_ids, affected_count, and completion status where completion status is one of: COMPLETED, PARTIALLY_COMPLETED, or FAILED

### Requirement 16: Code Execution System (Judge0 Integration)

**User Story:** As a student, I want reliable and fast code execution with clear error reporting, so that I can debug and iterate on my solutions.

#### Acceptance Criteria

1. THE Judge0_Service SHALL support execution with configurable per-item time limits (`time_limit_seconds`, range 1–30) and memory limits (`memory_limit_mb`, range 16–512)
2. WHEN a code run completes, THE Assessment_System SHALL return structured results including: passed count, total count, score (0–100), stdout (truncated to 64KB), stderr (truncated to 64KB), compile_output (truncated to 64KB), execution time in seconds, and memory usage in KB
3. THE Assessment_System SHALL deduplicate concurrent identical submissions using an idempotency key of format `{purpose}:{submission_uuid}:{item_uuid}:{language_id}`
4. IF a code run exceeds the time limit, THEN THE Judge0_Service SHALL terminate execution and return status `TIME_LIMIT`
5. IF a code run exceeds the memory limit, THEN THE Judge0_Service SHALL terminate execution and return status `RUNTIME_ERROR`
6. THE Assessment_System SHALL distinguish between RUN purpose (visible tests only, non-finalizing), FINAL purpose (all tests, score-producing), and CUSTOM purpose (user-provided stdin, non-scoring) code executions
7. IF the same idempotency key is submitted with different source code or language, THEN THE Assessment_System SHALL reject the request with HTTP 409 and error code `IDEMPOTENCY_CONFLICT`

### Requirement 17: Database Migration Strategy

**User Story:** As a platform operator, I want a safe, reversible migration path that removes legacy tables without data loss risk, so that the production database is clean and performant.

#### Acceptance Criteria

1. THE Assessment_System SHALL execute legacy table drops in a sequenced multi-step migration: first strip legacy metadata keys, then drop legacy tables, completing the full sequence within 300 seconds
2. WHEN the migration runs, THE Assessment_System SHALL verify that zero rows exist in each legacy table before executing any DROP statement
3. IF any legacy table contains one or more rows during pre-drop verification, THEN THE Assessment_System SHALL abort the migration, preserve all existing tables unchanged, and return an error message indicating which table contains rows and the row count found
4. THE Assessment_System SHALL provide a reversible downgrade path that recreates legacy table schemas (without data) for emergency rollback
5. WHEN the migration completes, THE Assessment_System SHALL remove the columns `legacy_assignment_type` and `legacy_task_submission_uuid` from the submission metadata JSON schema
6. THE Assessment_System SHALL log migration execution details including: tables dropped, rows verified, execution duration, and operator identity
7. IF the migration fails at any step after the first DROP statement, THEN THE Assessment_System SHALL roll back all changes made during the current migration run, restoring dropped tables to their pre-migration schema, and return an error message indicating the step at which failure occurred

### Requirement 18: OpenAPI Schema and Generated Client Cleanup

**User Story:** As a frontend developer, I want the generated TypeScript client to contain only modern assessment types and endpoints, so that the frontend codebase has no dead type references.

#### Acceptance Criteria

1. WHEN the OpenAPI schema is regenerated, THE Assessment_System SHALL exclude all endpoints and schemas whose identifiers contain `assignment`, `assignmenttask`, `assignmentusersubmission`, `assignmenttasksubmission`, or `grade_assignments`
2. WHEN the OpenAPI schema source (`apps/api/openapi.json`) is updated, THE Assessment_System SHALL regenerate `apps/web/src/lib/api/generated/schema.ts` such that the output file contains zero occurrences of the strings `grade_assignments`, `assignment_scheduler`, `assignmenttask`, `assignmentusersubmission`, or `assignmenttasksubmission`
3. WHEN the schema regeneration completes, THE Assessment_System SHALL verify that TypeScript compilation succeeds with zero type errors caused by references to removed schemas
4. IF the OpenAPI source file (`apps/api/openapi.json`) still contains any identifier matching the legacy patterns listed in criterion 1, THEN THE Assessment_System SHALL fail the `check:contracts` script with a non-zero exit code before generating the TypeScript client
