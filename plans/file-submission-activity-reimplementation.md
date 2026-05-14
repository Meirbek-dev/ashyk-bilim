# File Submission Activity Reimplementation Plan

## Goal

Reimplement file submission as a first-class course activity, not as an assignment assessment item. The new activity should feel like a modern LMS assignment dropbox: clear requirements, resilient upload, draft state, submission history, teacher review, feedback, revision, and gradebook visibility. The legacy `FILE_UPLOAD` item must be removed from `TYPE_ASSIGNMENT` authoring and runtime once existing data is migrated.

## Current Implementation

File submission currently lives inside the unified assessment stack:

- Activity shell: `TYPE_ASSIGNMENT` routes students into `/assessments/{assessmentUuid}` from `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/ActivityContentSurface.tsx`.
- Authoring: `apps/web/src/features/assessments/registry/assignment.tsx` allows `FILE_UPLOAD` as one assignment task kind in the shared `NativeItemStudio`.
- Student runtime: `apps/web/src/features/assessments/registry/assignment-attempt.tsx` renders all assignment items through `CanonicalAttemptItem`.
- File item UI: `apps/web/src/features/assessments/items/file-upload/index.tsx` implements constraints, upload, answer mutation, and review detail.
- Backend schema: `apps/api/src/db/assessments.py` defines `ItemKind.FILE_UPLOAD`, `FileUploadItemBody`, and `FileUploadItemAnswer`.
- Backend validation: `apps/api/src/services/assessments/_shared.py` validates finalized uploads during assessment draft save/submit.
- Grading: `apps/api/src/services/grading/registry.py` grades all assignment items through `AssessmentType.ASSIGNMENT` with manual review.
- Upload storage: `apps/api/src/routers/uploads/chunked_upload.py` owns generic `Upload` creation, byte receipt, finalization, and signed-url placeholders.

## Critical Findings

1. File submission is conceptually the wrong shape.
   A file dropbox is a complete activity with instructions, attachments, due dates, allowed attempts, submission receipts, feedback, and revision loops. Treating it as one item inside `ASSIGNMENT` forces it through question/task navigation and assessment item scoring semantics.

2. The student UX is too thin for LMS-quality file work.
   The current UI is a basic file input inside a task card. It lacks drag and drop, multiple-file management, upload progress, retry/cancel, file preview, submission receipt, deadline state, rubric visibility, version history, and clear "submitted vs draft" confirmation.

3. `max_files` is not actually supported end to end.
   The authoring schema has `max_files`, but the client stores only `uploads[0]`, and the backend validation does not reject answers exceeding `max_files`.

4. The upload contract appears broken.
   The backend `UploadCreateResponse` returns `upload_uuid`, but `FileUploadAttempt` reads `created.upload_id` and then finalizes `uploads/${created.upload_id}/finalize`. Unless another layer rewrites this shape, finalization and stored answers can target `undefined`.

5. Stored upload IDs and media URLs do not align.
   The file item stores `uploads[].upload_uuid`, but the UI builds legacy media paths through `getAssessmentItemSubmissionFileDir(...)`, while the upload service stores files under `uploads/{user_uuid}/{yyyy}/{mm}/{upload_uuid}/{sha256}.{ext}`.

6. File submission side effects are fragile.
   The grading pipeline emits plagiarism events by extracting `file_key`, but current file answers store `uploads[].upload_uuid`. A file submission can complete without triggering file-aware post-submit subscribers.

7. The legacy assessment type absorbs unrelated policy.
   File submissions inherit assessment lifecycle, item readiness, attempts, anti-cheat fields, review projections, and assignment grading assumptions. This makes future UX improvements harder and keeps assessment code coupled to upload/dropbox concerns.

8. Removal is not just a UI deletion.
   Migrations already converted old `FILE_SUBMISSION` assignment tasks into `FILE_UPLOAD` assessment items. A correct removal requires data migration, API compatibility windows, generated contract changes, tests, analytics updates, and gradebook/reporting updates.

9. Backend authoring enforcement is incomplete.
   The service has readiness logic for allowed item kinds, but item creation itself does not reject forbidden kinds at write time. Removal must add hard backend guards, not just hide controls in the web UI.

10. The oversized-upload error path is suspect.
   `put_assessment_upload_bytes` uses `status.HTTP_413_REQUEST_ENTITY_TOO_LARGE`, but the router import list does not include `status`. That can turn an intended 413 into an internal error on large uploads.

## Target Product Experience

### Student Experience

The file submission activity should open directly in the course activity page, not behind a generic "open assessment" handoff. The first viewport should show:

- Title, due state, attempt/revision status, and grading visibility.
- Teacher instructions with course attachments and optional rubric.
- A dropzone with drag and drop, click-to-browse, paste support where useful, and mobile-friendly file picking.
- Accepted file types, max file size, max number of files, late policy, and remaining attempts as compact requirement chips.
- Per-file rows with icon, filename, size, checksum status, upload progress, retry, cancel, remove, preview/download, and validation errors.
- Explicit actions: save draft, submit, replace before submit, start revision, view feedback.
- Submission receipt after submit: timestamp, file list, attempt number, late status, and immutable receipt ID.

### Teacher Experience

Teachers should author and review file submissions in a dedicated workflow:

- Create modal option: "File submission" alongside video, document, dynamic, assignment, exam, quiz, and code challenge.
- Authoring form: instructions, supporting materials, allowed file types, max files, max size, attempts, due date, late policy, grade visibility, rubric, and resubmission rules.
- Course studio page: dense configuration panels, readiness checks, preview as student, and publish controls.
- Review queue: submitted files, late/returned status, student search, batch filters, bulk download, rubric grading, inline feedback, return for revision, publish grades.
- Grader detail: file preview/download, file metadata, previous attempts, rubric criteria, private notes, student-visible feedback, and audit trail.

### Accessibility And Reliability

- Keyboard-operable dropzone and file list.
- Screen-reader announcements for upload progress, upload failure, draft save, and submit completion.
- No hidden-only file input as the primary control.
- Offline/interrupted upload recovery for finalized but unsubmitted uploads.
- Optimistic UI only for draft state; submission confirmation must come from the server.

## Target Architecture

### Activity Type

Add a dedicated activity type:

- `ActivityTypeEnum.TYPE_FILE_SUBMISSION`
- `ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD`
- Web activity registry key: `TYPE_FILE_SUBMISSION`
- Course sidebar/icon label: "File submission"

Do not model this as `AssessmentType.FILE_SUBMISSION` unless the gradebook architecture absolutely requires it. The goal is to keep file dropbox behavior out of assessment item authoring. If shared gradebook/reporting code needs a source enum, introduce a neutral `GradableActivityType` or `GradebookSourceType` rather than expanding legacy assessment semantics.

### Data Model

Add file-submission-specific tables:

- `file_submission_activity`
  - `activity_id`, `file_submission_uuid`, `instructions`, `rubric_json`, `allowed_mime_types`, `max_files`, `max_file_size_mb`, `due_at`, `allow_late`, `late_policy_json`, `max_attempts`, `grade_release_mode`, `published_at`, `archived_at`, `settings_json`, timestamps.
- `file_submission_attempt`
  - `attempt_uuid`, `activity_id`, `user_id`, `status` (`DRAFT`, `SUBMITTED`, `GRADED`, `PUBLISHED`, `RETURNED`), `attempt_number`, `submitted_at`, `is_late`, `late_penalty_pct`, `final_score`, `feedback_json`, `version`, timestamps.
- `file_submission_attempt_file`
  - `attempt_id`, `upload_id`, `display_name`, `content_type`, `size_bytes`, `sha256`, `storage_key`, `position`, `scan_status`, timestamps.
- `file_submission_grade`
  - optional if the existing gradebook entry model cannot cleanly attach to `file_submission_attempt`.
- `file_submission_audit_event`
  - optional but recommended for submit, replace, return, publish, download bundle, and rubric grade events.

Keep `Upload` as the generic pre-submission upload record, but create a clean linking layer from finalized upload to file submission attempt files.

### API

Create a dedicated router, for example `apps/api/src/routers/file_submissions/`:

- `POST /api/v1/file-submissions`
  Create activity and file-submission configuration.
- `GET /api/v1/file-submissions/activity/{activity_uuid}`
  Read student/teacher activity view model.
- `PATCH /api/v1/file-submissions/{file_submission_uuid}`
  Update authoring configuration.
- `POST /api/v1/file-submissions/{file_submission_uuid}/publish`
  Publish after readiness passes.
- `GET /api/v1/file-submissions/{file_submission_uuid}/draft`
  Get current student's draft attempt.
- `POST /api/v1/file-submissions/{file_submission_uuid}/draft`
  Start or create a draft attempt.
- `PATCH /api/v1/file-submissions/{file_submission_uuid}/draft`
  Attach/remove finalized uploads with optimistic locking.
- `POST /api/v1/file-submissions/{file_submission_uuid}/submit`
  Atomically submit current draft and create receipt.
- `GET /api/v1/file-submissions/{file_submission_uuid}/me`
  Student attempt history.
- `GET /api/v1/file-submissions/{file_submission_uuid}/submissions`
  Teacher review queue.
- `GET /api/v1/file-submissions/{file_submission_uuid}/submissions/export`
  CSV export.
- `POST /api/v1/file-submissions/{file_submission_uuid}/submissions/download`
  Bulk download selected files as a zip.
- `PATCH /api/v1/file-submissions/{file_submission_uuid}/submissions/{attempt_uuid}/grade`
  Save rubric/score/feedback and optionally publish or return.
- `GET /api/v1/file-submissions/files/{attempt_file_uuid}/url`
  Signed download URL, permission checked against student ownership or teacher rights.

The upload router should return one canonical field name. Prefer `upload_uuid` everywhere and type the web client from generated OpenAPI types rather than hand-written `{ upload_id: string }` casts.

### Frontend

Add a dedicated feature folder:

- `apps/web/src/features/file-submissions/domain/`
- `apps/web/src/features/file-submissions/services/`
- `apps/web/src/features/file-submissions/hooks/`
- `apps/web/src/features/file-submissions/student/FileSubmissionActivity.tsx`
- `apps/web/src/features/file-submissions/student/FileDropzone.tsx`
- `apps/web/src/features/file-submissions/student/SubmissionReceipt.tsx`
- `apps/web/src/features/file-submissions/studio/FileSubmissionStudio.tsx`
- `apps/web/src/features/file-submissions/review/FileSubmissionReviewWorkspace.tsx`
- `apps/web/src/features/file-submissions/review/FileSubmissionGrader.tsx`

Integrate it into:

- `ActivityContentSurface.tsx` so `TYPE_FILE_SUBMISSION` renders directly in the activity page.
- `NewActivity.tsx` with a new create option and modal.
- Course navigation icons and labels.
- Course studio route selection.
- Teacher dashboard/review links.
- Analytics/gradebook source labels.
- Generated OpenAPI types and React Query keys.

### Upload UX Implementation

Use one upload state machine per file:

`queued -> validating -> uploading -> finalizing -> attached -> failed -> removed`

For large files, use the existing chunked upload helper only after the API contract is unified. The student UI should support:

- Concurrent uploads with a small concurrency limit.
- AbortController cancellation.
- Retry failed files without losing successful files.
- Client-side MIME/size/count validation plus identical server validation.
- Server-side `max_files`, MIME, size, ownership, status, expiration, and malware/plagiarism hook checks.
- Persistent draft recovery using server draft state first, then local recovery only for unsent UI state.

## Removal Plan From Legacy Assessment Type

### Phase 1: Build The New Path Behind A Feature Flag

- Add `TYPE_FILE_SUBMISSION` and subtype to backend models, migrations, OpenAPI, and frontend generated schema.
- Add dedicated data model, service, router, and web feature folder.
- Add create modal entry and direct course activity rendering behind `fileSubmissionsV2`.
- Keep existing `FILE_UPLOAD` assignment item untouched during this phase.

### Phase 2: Migrate Existing File Upload Assignment Items

Write an idempotent migration service/script:

1. Find assessments where `kind = ASSIGNMENT` and any item has `kind = FILE_UPLOAD`.
2. For single-file-upload-only assignments, create one `TYPE_FILE_SUBMISSION` activity in the same chapter/order neighborhood.
3. Copy title, description, lifecycle, due policy, grade release mode, item prompt, file constraints, max score, and rubric-like metadata.
4. Convert each relevant `Submission.answers_json.answers[item_uuid].uploads[]` into `file_submission_attempt_file` rows.
5. Preserve attempt number, status mapping, submitted timestamp, late fields, scores, grading feedback, and grade visibility.
6. Add a redirect/alias map from old assessment/activity UUIDs to new file-submission activity UUIDs.
7. Mark migrated legacy file-upload items read-only with an internal migration marker until final deletion.

For mixed assignments that contain file upload plus other item kinds, require an explicit product decision:

- Split the file upload item into a new file-submission activity and leave the rest as an assignment.
- Or block automatic migration and produce an instructor-facing report for manual cleanup.

### Phase 3: Stop New Legacy Usage

- Remove `FILE_UPLOAD` from `allowedKinds` in `apps/web/src/features/assessments/registry/assignment.tsx`.
- Remove the file upload authoring branch from `NativeItemStudio`.
- Add backend write guards so `AssessmentItemCreate` and `AssessmentItemUpdate` reject `FILE_UPLOAD` for assignment assessments.
- Keep read-only rendering for migrated-but-not-removed legacy submissions during the compatibility window.
- Add telemetry for any legacy `FILE_UPLOAD` reads.

### Phase 4: Cut Over Review, Gradebook, Analytics, And Progress

- Add file-submission review queue and grade endpoints to teacher dashboards.
- Include file submissions in course progress using their own completion rule.
- Include file submissions in gradebook/reporting without routing through `AssessmentType.ASSIGNMENT`.
- Add analytics labels and drilldowns for file submission source type.
- Add event subscribers for `FileSubmissionSubmitted`, `FileSubmissionGraded`, `FileSubmissionReturned`, and `FileSubmissionPublished`.

### Phase 5: Delete Legacy File Upload Assessment Code

After migration and compatibility telemetry show no remaining live usage:

- Remove `ItemKind.FILE_UPLOAD`, `FileUploadItemBody`, and `FileUploadItemAnswer` from assessment schemas.
- Remove `apps/web/src/features/assessments/items/file-upload`.
- Remove `FILE_UPLOAD` branches from canonical item rendering, readiness, grading breakdown, and tests.
- Remove legacy media helper paths for assessment task submission files if unused.
- Add a DB constraint or service invariant preventing future assessment items with `kind = FILE_UPLOAD`.
- Regenerate OpenAPI contracts and update frontend generated types.

## Testing Strategy

### Backend

- Migration tests for empty, single-file, multi-file, mixed assignment, returned, published, late, and draft cases.
- API tests for create, publish readiness, draft attach/remove, submit, attempt history, review queue, grade, return, publish, and bulk download.
- Upload contract tests verifying `upload_uuid` naming, finalized ownership, expiry, MIME, size, count, and referenced upload behavior.
- Permission tests for student download, teacher download, cross-course access denial, and anonymous denial.
- Event tests proving file submission emits file-aware plagiarism/scan hooks with the actual storage keys or upload UUIDs.

### Frontend

- Unit tests for file validation, upload state reducer, retry/cancel behavior, and submit button state.
- Component tests for dropzone keyboard use, progress rendering, failed file recovery, receipt display, and revision flow.
- Integration tests for activity creation, student submit, teacher grade, return for revision, and grade publication.
- Playwright flow covering a real file upload through draft, submit, review, and feedback visibility.

### Contract And Regression

- `bun run check:contracts`
- Backend API test suite.
- Web typecheck and relevant Vitest suites.
- Playwright smoke for course activity routing and review workspace.

## Acceptance Criteria

- A teacher can create a file submission activity without creating an assignment assessment.
- A student can submit one or more files with clear validation, progress, retry, and receipt behavior.
- A teacher can review, download, grade, publish, and return file submissions from a dedicated review UI.
- Existing pure file-upload assignment data is migrated with no lost files, scores, statuses, or feedback.
- New assignment authoring cannot create `FILE_UPLOAD` items.
- File submissions no longer depend on `AssessmentType.ASSIGNMENT` for runtime, submission, or grading.
- The legacy `FILE_UPLOAD` assessment item code is deleted after the migration window.

## Implementation Order

1. Fix and lock down the upload contract (`upload_uuid` everywhere) with tests.
2. Add `TYPE_FILE_SUBMISSION` backend enum, subtype, migration, and read models.
3. Build file-submission tables, service layer, router, and OpenAPI contracts.
4. Build student activity UI with robust upload state and receipt.
5. Build teacher authoring and review workspaces.
6. Add gradebook/progress/analytics/event integrations.
7. Write and dry-run the migration from legacy assignment `FILE_UPLOAD` items.
8. Disable new `FILE_UPLOAD` item creation in assignment authoring and backend writes.
9. Migrate production data behind a feature flag and validate counts.
10. Delete legacy assessment file-upload code once no live reads remain.

## Open Decisions

- Mixed assignments: automatic split vs manual instructor migration.
- Whether file submissions should support text comments alongside files.
- Whether students can replace files after submission before the due date, or only through a new attempt/revision.
- Whether plagiarism/malware scanning blocks submission or marks a submitted attempt as "processing".
- Whether bulk downloads should be synchronous for small batches and async for large cohorts.
