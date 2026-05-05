# Assessments Production Readiness Plan

## Document Status

- Date: 2026-05-04
- Status: Draft for implementation planning
- Audience: product, backend, frontend, QA, design, platform, support
- Scope: assessments, assignments, quizzes, exams, code challenges, forms, submissions, grading, review, gradebook, analytics, teacher workflows, student workflows, operational readiness
- Goal: turn the current assessments area from partially unified but still inconsistent and fragile into a coherent, production-ready subsystem

## Why This Plan Exists

- The repo already contains a serious attempt at a unified assessment model.
- The repo also still contains legacy grading and assessment-specific paths.
- The current user experience is not consistently unified for teachers.
- The current user experience is not consistently unified for students.
- Several areas are clearly mid-migration rather than finished.
- Some important workflow states exist in the domain model but are not reflected cleanly in the UI.
- Some important UI surfaces exist in the UI layer but still depend on legacy APIs.
- Some assessment kinds are integrated deeply.
- Some assessment kinds are only thin passthroughs.
- At least one assessment kind is effectively incomplete in the new shell.
- The overall result is a system that looks structurally promising but operationally uneven.
- The right response is not another patchwork of local fixes.
- The right response is a full hardening and convergence plan.

## Evidence Base Used For This Plan

- Reviewed the canonical assessment overview in [docs/ASSESSMENTS.md](../docs/ASSESSMENTS.md).
- Reviewed the canonical backend authoring and submission service in [apps/api/src/services/assessments/core.py](../apps/api/src/services/assessments/core.py).
- Reviewed the canonical assessment models in [apps/api/src/db/assessments.py](../apps/api/src/db/assessments.py).
- Reviewed canonical submission and grading models in [apps/api/src/db/grading/submissions.py](../apps/api/src/db/grading/submissions.py).
- Reviewed policy and progress models in [apps/api/src/db/grading/progress.py](../apps/api/src/db/grading/progress.py).
- Reviewed per-student override model in [apps/api/src/db/grading/overrides.py](../apps/api/src/db/grading/overrides.py).
- Reviewed unified assessment router in [apps/api/src/routers/assessments/unified.py](../apps/api/src/routers/assessments/unified.py).
- Reviewed teacher grading router in [apps/api/src/routers/grading/teacher.py](../apps/api/src/routers/grading/teacher.py).
- Reviewed student grading router in [apps/api/src/routers/grading/submit.py](../apps/api/src/routers/grading/submit.py).
- Reviewed grading registry in [apps/api/src/services/grading/registry.py](../apps/api/src/services/grading/registry.py).
- Reviewed teacher grading service in [apps/api/src/services/grading/teacher.py](../apps/api/src/services/grading/teacher.py).
- Reviewed assessment settings service in [apps/api/src/services/assessments/settings.py](../apps/api/src/services/assessments/settings.py).
- Reviewed legacy quiz attempt model in [apps/api/src/db/courses/quiz.py](../apps/api/src/db/courses/quiz.py).
- Reviewed shared frontend assessment hook in [apps/web/features/assessments/hooks/useAssessment.ts](../apps/web/features/assessments/hooks/useAssessment.ts).
- Reviewed assessment submission hook in [apps/web/features/assessments/hooks/useAssessmentSubmission.ts](../apps/web/features/assessments/hooks/useAssessmentSubmission.ts).
- Reviewed local attempt persistence hook in [apps/web/features/assessments/shell/hooks/useAssessmentAttempt.ts](../apps/web/features/assessments/shell/hooks/useAssessmentAttempt.ts).
- Reviewed assessment shell in [apps/web/features/assessments/shell/AssessmentLayout.tsx](../apps/web/features/assessments/shell/AssessmentLayout.tsx).
- Reviewed assessment action bar in [apps/web/features/assessments/shell/AssessmentActionBar.tsx](../apps/web/features/assessments/shell/AssessmentActionBar.tsx).
- Reviewed assessment studio workspace in [apps/web/features/assessments/studio/AssessmentStudioWorkspace.tsx](../apps/web/features/assessments/studio/AssessmentStudioWorkspace.tsx).
- Reviewed native item studio in [apps/web/features/assessments/studio/NativeItemStudio.tsx](../apps/web/features/assessments/studio/NativeItemStudio.tsx).
- Reviewed assessment registry in [apps/web/features/assessments/registry/index.ts](../apps/web/features/assessments/registry/index.ts).
- Reviewed assignment registry module in [apps/web/features/assessments/registry/assignment.tsx](../apps/web/features/assessments/registry/assignment.tsx).
- Reviewed exam registry module in [apps/web/features/assessments/registry/exam.ts](../apps/web/features/assessments/registry/exam.ts).
- Reviewed quiz registry module in [apps/web/features/assessments/registry/quiz.tsx](../apps/web/features/assessments/registry/quiz.tsx).
- Reviewed exam attempt implementation in [apps/web/features/assessments/registry/exam/ExamAttemptContent.tsx](../apps/web/features/assessments/registry/exam/ExamAttemptContent.tsx).
- Reviewed review workspace wrapper in [apps/web/features/assessments/review/AssessmentReviewWorkspace.tsx](../apps/web/features/assessments/review/AssessmentReviewWorkspace.tsx).
- Reviewed generic grading review workspace in [apps/web/features/grading/review/GradingReviewWorkspace.tsx](../apps/web/features/grading/review/GradingReviewWorkspace.tsx).
- Reviewed grading query layer in [apps/web/features/grading/queries/grading.query.ts](../apps/web/features/grading/queries/grading.query.ts).
- Reviewed grading compatibility type layer in [apps/web/types/grading.ts](../apps/web/types/grading.ts).
- Reviewed server page for canonical attempt route in [apps/web/app/(platform)/(withmenu)/assessments/[assessmentUuid]/page.tsx](../apps/web/app/%28platform%29/%28withmenu%29/assessments/%5BassessmentUuid%5D/page.tsx).
- Reviewed current web tests list under [apps/web/tests](../apps/web/tests).
- Reviewed current API tests list under [apps/api/src/tests](../apps/api/src/tests).

## High-Level Diagnosis
  
- The backend domain model is ahead of the product integration.
- The backend has a clear canonical direction.
- The frontend is still mid-migration between old kind-specific flows and the new shell-based architecture.
- The UI taxonomy is not yet the same thing as the backend taxonomy.
- The teacher workflows are split between assessment-specific pages and generic grading pages.
- The student workflows are partially unified but not yet uniformly policy-driven.
- The codebase contains overlapping assessment configuration representations.
- The codebase contains overlapping assessment attempt representations.
- The codebase contains overlapping grading and release concepts.
- Some kinds have migrated enough to be credible.
- Some kinds are only registered placeholders.
- The system currently behaves like a platform in transition, not a completed assessment product.

## Executive Summary

- The repo should converge on one canonical assessment domain, not multiple semi-compatible ones.
- Every assessable activity must become a first-class assessment with one authoritative authoring path, one authoritative attempt path, one authoritative review path, and one authoritative analytics path.
- Activity records should remain the course-content anchor.
- Assessment records should remain the gradeable runtime and authoring anchor.
- Policy should have one representation.
- Student attempts should have one representation.
- Teacher grading should have one representation.
- Grade visibility should have one representation.
- Progress should have one representation.
- Item authoring should have one registry-based extension model.
- Each assessment kind should be a preset plus capability matrix, not its own independent workflow implementation.
- The system should stop treating assessment kinds as bespoke products and start treating them as configurations over a stable engine.
- The frontend should stop guessing what the student can do.
- The frontend should render capability and state from API-provided truth.
- The backend should stop supporting legacy shapes as an implicit forever contract.
- Legacy shapes should be explicitly bridged, migrated, and retired.
- The product should become predictable for teachers.
- The product should become safe for students during high-stakes usage.
- The system should be operable during large submission spikes.
- The system should be debuggable when grades, policies, or submissions go wrong.
- The system should be testable without heroic manual QA.

## What "Production Ready" Must Mean Here

- A teacher can create any supported assessment kind without dropping into legacy UI dead ends.
- A teacher can publish, schedule, archive, duplicate, review, and analyze assessments without switching mental models.
- A student can start, resume, save, submit, resubmit, and review results without data loss or surprise state changes.
- A student never loses answers because of refreshes, tab conflicts, or transient network failure.
- A teacher never silently overwrites another teacher's grade edits.
- A grade is either hidden or visible for a clear reason that the system can explain.
- A due date, time limit, late policy, and override behave the same way everywhere.
- Assessment analytics and gradebook values match the authoritative submission and grading ledger.
- Each assessment kind has complete shell integration.
- Each assessment kind has complete review integration.
- Each assessment kind has complete accessibility and mobile coverage.
- The system supports growth without creating new legacy islands.

## Non-Negotiable Product Principles

### Principle 1: Canonical Before Convenient

- The canonical assessment and submission model wins over short-term compatibility hacks.
- New features must target the canonical model first.
- Legacy adapters may exist, but only as thin compatibility boundaries.
- Legacy compatibility must never define the long-term product shape.

### Principle 2: Kinds Are Presets, Not Separate Products

- Assignment is a preset.
- Quiz is a preset.
- Exam is a preset.
- Code challenge is a preset.
- Form-like activities are item combinations and policy choices.
- New kinds should be assembled from capabilities, not by cloning whole flows.

### Principle 3: API Truth Drives UI State

- UI booleans like canEdit, canSaveDraft, canSubmit, and isResultVisible should not be guessed in the client.
- UI actions should derive from authoritative server state.
- Policy enforcement should not be split into backend truth and frontend wishful thinking.

### Principle 4: Assessment Work Is Time-Sensitive Work

- Draft safety is critical.
- Concurrency is critical.
- Recovery is critical.
- Idempotency is critical.
- Observability is critical.
- High-stakes exam flows need stronger correctness than generic content editing.

### Principle 5: Release States Must Be Explainable

- Students should understand why a grade is not visible.
- Teachers should understand whether a grade is saved, graded, published, or returned.
- Support staff should be able to reconstruct how a grade reached its current state.

### Principle 6: Migration Must Be Deliberate

- Legacy routes should not be removed casually.
- Legacy routes should not remain indefinitely either.
- Every legacy path should have an owner, deadline, migration rule, and kill switch.

## Desired End State

### For Teachers

- One coherent studio for authoring assessments.
- One consistent lifecycle control model.
- One consistent readiness system.
- One submission queue model.
- One grading detail model.
- One batch grading model.
- One grade release model.
- One gradebook that matches the submission ledger.
- One analytics surface that reflects item-level and cohort-level insight.

### For Students

- One start flow.
- One save and recovery flow.
- One submission confirmation model.
- One explanation for due dates, time limits, and penalties.
- One consistent results timeline.
- One consistent returned-for-revision workflow.
- One consistent mobile and accessibility baseline.

### For Engineering

- One domain model per concept.
- One versioned API contract.
- One telemetry vocabulary.
- One feature-flagged rollout model.
- One migration playbook.
- One QA matrix.

## Current-State Critical Analysis

## 1. Domain Fragmentation

- The repo already has a canonical Assessment table.
- The repo already has a canonical AssessmentItem table.
- The repo already has a canonical Submission table.
- The repo already has a canonical AssessmentPolicy table.
- The repo still has legacy quiz attempt storage.
- The repo still has legacy kind-specific settings shape logic.
- The repo still has compatibility types in the web layer that preserve old answer payload shapes.
- The repo still mixes activity type, assessment type, and frontend kind naming schemes.
- The repo still requires mapping layers that should be transitional, not permanent.
- Every mapping layer is a long-term drift risk unless ownership is explicit.
- The system is close to convergence but not finished.
- This is the most dangerous phase because the system looks unified while still behaving as multiple subsystems.

### Observable Symptoms

- `Assessment.kind` uses bare domain values.
- `Activity.activity_type` uses legacy platform activity values.
- frontend `AssessmentKind` uses `TYPE_*` values.
- assessment settings layer introduces kind-specific schemas that only partially overlap with policy.
- frontend grading types still expose `QuizAnswers`, `AssignmentAnswers`, `ExamAnswers`, and `CodeChallengeAnswers` as compatibility shapes.
- backend grading registry supports canonical item grading for some paths and legacy question grading for fallback paths.
- review workspace still orbits generic grading services.
- studio shell is assessment-specific, but review shell is still grading-first.

### Why This Is Bad

- Bugs become mapping bugs instead of business-rule bugs.
- Testing load doubles because equivalent states can be represented twice.
- New kinds or policies become harder to add correctly.
- Frontend and backend engineers do not share the same language.
- Support incidents become harder to trace.
- Analytics can disagree with product UI if based on different representations.

### Required Direction

- Keep `Activity` as the curriculum node.
- Keep `Assessment` as the gradeable content runtime.
- Make policy authoritative in one place.
- Make submission authoritative in one place.
- Make compatibility layers explicit adapters with sunset dates.
- Remove duplicate answer-type vocabularies from new code.

## 2. Assessment Taxonomy Is Under-Specified

- The docs describe Assignment, Exam, Code Challenge, and Quiz as presets over shared primitives.
- The implementation is only partially there.
- Assignment authoring already leans into native items.
- Exam attempt is already using canonical items.
- Quiz registry is still a placeholder in the new shell.
- Forms exist as item kinds but are not clearly articulated as product-level capabilities.
- Tasks are referenced across the product language but not consistently mapped to canonical items.
- Teachers are likely experiencing a difference between the kind label they selected and the workflow the system actually gives them.

### Product Risk

- Teachers do not care about the internal migration state.
- Teachers care whether “quiz” works as a fully supported assessment type.
- A kind that exists in the course UI but renders as a null attempt surface is a trust-breaking problem.
- A kind that exists in docs but not in complete UI integration will be perceived as broken.

### Required Direction

- Publish a capability matrix for each kind.
- Define which item kinds are allowed per assessment kind.
- Define which policy fields are available per kind.
- Define which anti-cheat controls are available per kind.
- Define which grading modes are available per kind.
- Define whether results can be immediate, manual, batched, returned, or rubric-based.
- Treat forms as item capabilities, not as a separate product unless there is a distinct workflow requirement.

## 3. Backend Authoring Direction Is Better Than Frontend Integration Direction

- The backend authoring path is coherent enough to serve as the source of truth.
- `create_assessment`, `update_assessment`, lifecycle transition, readiness, item CRUD, draft save, and submit all live in one service area.
- This is a good foundation.
- The frontend is still mixing a native item studio, passthrough kind modules, and generic grading surfaces.
- That means the backend is more unified than the product experience.

### Good Signs

- Item bodies are discriminated unions.
- Item answers are discriminated unions.
- Lifecycle states are explicit.
- Readiness issues are explicit.
- Draft version conflict handling exists.
- Teacher grading optimistic concurrency exists.

### Weak Signs

- The frontend assessment hook is still explicitly phase-based and incomplete.
- The review surface for assessments is still largely a wrapper over the generic grading workspace.
- Some kind modules are real modules.
- Some kind modules are passthrough placeholders.
- The overall architecture invites further drift if not tightened now.

## 4. Frontend Attempt State Is Still Too Optimistic And Too Static

- `useAssessment` currently synthesizes attempt view models with static assumptions.
- The attempt view model currently sets `canEdit: true`.
- The attempt view model currently sets `canSaveDraft: true`.
- The attempt view model currently sets `canSubmit: true`.
- The attempt view model currently sets `releaseState: HIDDEN`.
- The attempt view model currently sets `submissionStatus: null` until additional hooks load.
- This means the shell is not really driven by authoritative attempt capability data.

### Practical Consequences

- The shell may render action affordances that do not actually reflect the current allowed behavior.
- Policy changes may not consistently propagate into the shell state.
- Returned submissions require special handling that may leak into kind implementations.
- Attempt UX becomes kind-specific again because the shell cannot fully represent the real server state.

### Required Direction

- Add a canonical attempt detail/read endpoint if necessary.
- Return actionable capability booleans from the API.
- Return effective policy after overrides.
- Return release state from backend truth.
- Return reason codes for disabled actions.
- Make the shell generic by making the payload more authoritative.

## 5. Quiz Is The Clearest Evidence Of Incomplete Migration

- The canonical attempt route exists.
- The route can resolve quiz assessments.
- The quiz registry module currently registers a null author surface.
- The quiz registry module currently registers a null attempt surface.
- Review for quiz simply defers to generic grading review.
- This means quiz exists in the taxonomy but not as a completed assessment-shell product.

### Why This Matters More Than A Missing Feature

- This is not merely an enhancement gap.
- This is a coherence failure in the new platform surface.
- If a teacher or student reaches the canonical assessments route for a quiz, the product should be fully supported there.
- A placeholder module inside a canonical route is a production-readiness blocker.

### Required Direction

- Decide whether quiz will be canonical in the new shell now or not yet.
- If yes, implement it fully in the new shell quickly.
- If no, remove quiz from the canonical route surface until it is complete.
- Do not keep a half-registered canonical path in production.

## 6. Settings And Policy Are Duplicated Semantically

- Assessment policy already stores max attempts, time limit, due date, late policy, anti-cheat, settings JSON, grading mode, release mode, and completion rule.
- The assessment settings service also defines kind-specific settings payloads.
- Some fields overlap directly.
- Some fields overlap conceptually but use different names.
- Some fields are view-oriented while others are domain-oriented.
- This is likely survivable today.
- It will become a long-term maintenance hazard if not normalized.

### Examples Of Drift Risk

- `attempt_limit` versus `max_attempts`.
- `due_date` versus `due_at`.
- `time_limit` in minutes versus `time_limit_seconds`.
- exam whitelist and access mode living in kind-specific settings instead of a normalized access policy concept.
- hidden versus visible code tests potentially split between item body and settings payloads.

### Required Direction

- Define one canonical policy schema.
- Define one canonical kind extension schema for fields that truly do not belong in the general policy.
- Ensure frontend editors bind to the same schema names the backend persists.
- Ensure API responses always return normalized values.
- Keep view formatting separate from stored policy fields.

## 7. Teacher Review Is Still Generic-Grading-First Instead Of Assessment-First

- Assessment review workspace wraps the generic grading review workspace.
- The generic grading review workspace uses generic grading hooks and APIs by activity ID.
- This is fine as a transitional strategy.
- It also means the teacher review experience is not yet strongly assessment-domain aware.

### Symptoms

- Review filters and detail fetches are tied to generic grading endpoints.
- Assessment kind modules optionally provide a `ReviewDetail` pane, but the core review workspace is still generic.
- The review shell is not clearly using assessment-specific policy, readiness, or release semantics in one unified way.
- The grade queue concept is stronger than the assessment lifecycle concept in this surface.

### Required Direction

- Keep the grading service as the backend authority for teacher grading operations.
- Reframe the frontend review surface as an assessment-native review experience.
- Make kind-specific details plug into a review shell that understands attempt state, policy, release state, late rules, and overrides.
- Ensure teachers reviewing an exam, assignment, or quiz feel like they are inside one product.

## 8. Student Attempt Recovery Is Good In Principle But Not Yet Fully Holistic

- Local storage recovery exists.
- Draft autosave exists.
- Version conflict handling exists.
- This is a strong base.
- The recovery story is still not fully unified between local state, server drafts, and returned attempts.

### Gaps

- Recovery is still kind-driven rather than shell-driven in some places.
- Local storage state is not obviously correlated with server save state in a global UX pattern.
- Multi-tab editing is handled via version conflict, but conflict reconciliation UX is basic.
- Offline behavior is not explicitly designed.
- Autosave timing and indicator semantics are not unified across all kinds.

### Required Direction

- Make local draft recovery a shell-level concern with standardized behaviors.
- Make server draft state and local draft state visually distinct.
- Add an explicit conflict-resolution experience.
- Add offline and reconnect semantics.
- Add submitted-state cleanup and returned-state restoration semantics.

## 9. Grade Release Semantics Need Stronger Productization

- The backend already models immediate versus batch release.
- Teacher routes already expose publish grades operations.
- Student-facing grading routes already describe hidden grade behavior for batch release.
- This is promising.
- The product experience around release modes is still too implicit.

### Product Risks

- Teachers may not know when grades are visible.
- Students may not know why grades are hidden.
- Review queues may not clearly show “graded but not published” versus “published.”
- Gradebook and analytics may be interpreted as student-visible even when they are teacher-only.

### Required Direction

- Add explicit release state UI everywhere relevant.
- Separate grade saved, grade finalized, and grade visible.
- Add teacher-facing bulk publish affordances with preview counts.
- Add student-facing messaging for hidden grades.
- Add support tooling to inspect release state history.

## 10. Manual Review Is Underpowered Compared To The Domain Model

- Open text exists.
- File upload exists.
- Rubric fields exist.
- Returned state exists.
- Per-item feedback exists.
- The end-to-end teacher ergonomics still look limited.

### Risks

- Teachers may fall back to free-form overall comments instead of consistent item feedback.
- Teachers may not use returned-for-revision effectively if the UI is too generic.
- Students may not get actionable revision guidance.
- Rubrics may exist in storage but not in practice.

### Required Direction

- Make rubric-driven grading a first-class experience.
- Make item feedback fast.
- Make return-for-revision operationally cheap.
- Make revision diffs visible.
- Make reviewer throughput measurable.

## 11. Testing Coverage Is Not Close To Production Readiness

- Web tests exist for gradebook and some exam utilities.
- There is almost no assessment-specific backend test surface visible in the repo.
- API tests under the backend are effectively absent except for test scaffolding.
- End-to-end coverage is currently only a home page test.
- That is nowhere near enough for high-stakes assessment workflows.

### Consequences

- Regression risk is high.
- Migration risk is high.
- Refactoring velocity is lower than it should be because safety nets are weak.
- Production incidents are more likely to be discovered by users instead of CI.

### Required Direction

- Build backend integration tests around canonical workflows.
- Build frontend tests around shell state and mutation behavior.
- Build end-to-end tests around full teacher and student journeys.
- Build migration tests around legacy-to-canonical parity.

## 12. Operational Maturity Is Not Yet Visible In The Assessment Surface

- Assessment work is operationally sensitive.
- The current code reads like product migration work, not fully operationalized platform work.
- The plan must therefore include observability, auditability, support tooling, and rollout discipline as first-class deliverables.

### Production Expectations

- Every submission mutation should be traceable.
- Every grading mutation should be traceable.
- Every lifecycle change should be traceable.
- Every failed file upload validation should be visible.
- Every judge execution failure should be visible.
- Every batch publish should be visible.
- Every grade discrepancy should be explainable from data, not guesswork.

## Target Product Architecture

## 1. Canonical Object Model

- `Activity` remains the course structure anchor.
- `Assessment` remains the canonical gradeable unit for assessable activities.
- `AssessmentItem` remains the canonical ordered item collection.
- `AssessmentPolicy` remains the canonical operational policy.
- `StudentPolicyOverride` remains the canonical per-student exception layer.
- `Submission` remains the canonical attempt row.
- `GradingEntry` remains the canonical append-only grading ledger.
- `ActivityProgress` remains the canonical learner progress cache.
- `CourseProgress` remains the canonical course summary cache.

## 2. Canonical API Layers

- Assessment authoring endpoints own creation, editing, lifecycle, readiness, and item authoring.
- Attempt endpoints own start, resume, draft, save, submit, resubmit, and result visibility.
- Review endpoints own teacher queue, detail, grade save, batch grade, publish, return, and extensions.
- Analytics endpoints own cohort and item metrics.
- Support endpoints own diagnostics and audit queries.

## 3. Canonical Frontend Surfaces

- Studio surface for teachers.
- Attempt surface for students.
- Review surface for teachers.
- Results surface for students.
- Gradebook surface for teachers.
- Analytics surface for teachers and admins.

## 4. Canonical Kind Model

- A kind is a preset defined by allowed items, default policy, default release mode, default grading mode, and enabled capabilities.
- A kind is not an excuse to fork the workflow engine.
- The registry remains the extension seam.
- The registry should not be a place where null surfaces are allowed in production for supported kinds.

## 5. Canonical Attempt Capability Payload

- The attempt detail payload should include `can_start`.
- The attempt detail payload should include `can_resume`.
- The attempt detail payload should include `can_edit`.
- The attempt detail payload should include `can_save_draft`.
- The attempt detail payload should include `can_submit`.
- The attempt detail payload should include `can_resubmit`.
- The attempt detail payload should include `can_view_results`.
- The attempt detail payload should include `release_state`.
- The attempt detail payload should include `effective_policy`.
- The attempt detail payload should include `disabled_reason_codes`.
- The attempt detail payload should include `submission_status`.
- The attempt detail payload should include `latest_submission_summary`.

## 6. Canonical Review Capability Payload

- The review queue should expose teacher actions by submission.
- The review detail payload should expose grade editability.
- The review detail payload should expose release state.
- The review detail payload should expose override context.
- The review detail payload should expose late rule and applied penalty context.
- The review detail payload should expose prior attempts.
- The review detail payload should expose returned revision history.

## 7. Canonical Analytics Model

- Assessment analytics should be based on canonical submissions.
- Item analytics should be based on canonical items.
- Cohort summaries should distinguish attempt count, completion count, graded count, published count, returned count, and late count.
- Student-facing results should not be confused with teacher-facing analytics.

## Implementation Strategy

- First converge the domain contract.
- Then converge the frontend shell contracts.
- Then migrate each kind onto the same engine.
- Then deepen review and analytics.
- Then remove legacy paths.
- Then harden with tests, telemetry, and rollout controls.

## Workstream 01 - Canonical Vocabulary And Capability Matrix

### Objective

- Define one stable product vocabulary.
- Define one stable engineering vocabulary.
- Define one capability matrix for all supported kinds.

### Problems To Solve

- Activity type, assessment type, and frontend kind names do not line up naturally.
- Teachers see product labels that do not clearly map to system behavior.
- Engineers still rely on transitional mappings.

### Deliverables

- A canonical terminology document.
- A kind capability matrix.
- A migration glossary from legacy names to canonical names.
- API enum ownership rules.

### Backend Tasks

- [ ] Document the canonical enum source for assessment kind.
- [ ] Document the canonical enum source for submission status.
- [ ] Document the canonical enum source for release state.
- [ ] Document the canonical enum source for lifecycle state.
- [ ] Expose a kind capability descriptor from the API.
- [ ] Ensure kind capability descriptors are versioned.

### Frontend Tasks

- [ ] Remove ad hoc kind naming assumptions from shell logic.
- [ ] Map UI labels from capability descriptors instead of local conventions.
- [ ] Add a single helper for canonical kind display names.
- [ ] Add a single helper for teacher-facing versus student-facing labels.

### Product Tasks

- [ ] Define what “assignment” means in the platform.
- [ ] Define what “quiz” means in the platform.
- [ ] Define what “exam” means in the platform.
- [ ] Define what “code challenge” means in the platform.
- [ ] Define whether “form” is a kind or only an item capability.

### QA Tasks

- [ ] Build a terminology review checklist for design, docs, and engineering.
- [ ] Add snapshot validation for capability matrix serialization.

### Acceptance Criteria

- [ ] Every supported kind has a documented capability matrix.
- [ ] No new code introduces a fourth naming scheme.
- [ ] The UI can render kind labels without hard-coded special cases in shared shells.

### Success Metrics

- Reduced number of translation and mapping helpers.
- Reduced number of UI conditionals by kind in shell components.

## Workstream 02 - Canonical Assessment Detail API

### Objective

- Provide a single authoritative detail payload for each surface.

### Problems To Solve

- The current frontend attempt view model still fabricates action booleans.
- The shell cannot rely entirely on the server.
- Kind modules do too much orchestration themselves.

### Deliverables

- Surface-specific detail endpoints or a unified endpoint with surface-specific projections.
- Effective policy projection.
- Capability booleans.
- Reason codes for disabled actions.

### Backend Tasks

- [ ] Add an attempt detail projection builder.
- [ ] Add a review detail projection builder.
- [ ] Add effective policy resolution that applies student overrides.
- [ ] Add release state resolution.
- [ ] Add disabled reason codes for start, save, submit, resubmit, review.
- [ ] Ensure payloads are stable and versioned.

### Frontend Tasks

- [ ] Replace guessed attempt booleans with server-provided values.
- [ ] Replace local release-state assumptions with server-provided values.
- [ ] Replace shell-side status guesswork with API projections.
- [ ] Move more state out of kind modules into shared view models.

### QA Tasks

- [ ] Add contract tests for projection shapes.
- [ ] Add UI tests for disabled-state reason rendering.

### Acceptance Criteria

- [ ] Shared shells render entirely from authoritative projection data.
- [ ] Attempt shell no longer hard-codes default permissions.
- [ ] Review shell shows release state and editability from backend truth.

## Workstream 03 - Policy Normalization

### Objective

- Collapse overlapping settings and policy semantics into a single coherent contract.

### Problems To Solve

- Policy data exists in both policy fields and kind-specific settings representations.
- Similar concepts use different names and units.
- This invites subtle mismatch bugs.

### Deliverables

- Canonical policy schema.
- Canonical kind extension schema.
- Policy editor contract.
- Migration from old field names to new field names.

### Backend Tasks

- [ ] Classify every settings field as policy, kind extension, item body, or derived view field.
- [ ] Move overlapping fields into one canonical location.
- [ ] Keep `settings_json` only for fields that genuinely do not belong in base policy.
- [ ] Add validation for incompatible policy combinations.
- [ ] Add migration shims for old payload names.

### Frontend Tasks

- [ ] Bind policy editors to canonical field names.
- [ ] Remove unit-conversion ambiguity from editors.
- [ ] Display normalized effective policy everywhere.

### QA Tasks

- [ ] Add unit tests for each policy field mapping.
- [ ] Add integration tests for override application and due date precedence.

### Acceptance Criteria

- [ ] Teachers edit one policy model.
- [ ] Students see one policy model.
- [ ] Support can inspect one policy model.
- [ ] No duplicated naming remains for time limit, attempts, due date, or release mode.

## Workstream 04 - Lifecycle And Readiness Hardening

### Objective

- Make publish and schedule states dependable and explainable.

### Problems To Solve

- Lifecycle is explicit, but readiness is still relatively shallow.
- Teachers need precise guidance on why an assessment cannot publish.

### Deliverables

- Rich readiness issue taxonomy.
- UI surfacing of readiness issues at assessment and item level.
- Readiness checks for kind-specific rules.
- Better schedule validation.

### Backend Tasks

- [ ] Expand readiness codes for missing prompts, empty options, empty files constraints, missing code tests, invalid weights, invalid max scores, missing rubric requirements, and forbidden item-kind combinations.
- [ ] Validate schedule versus due date coherence.
- [ ] Validate time limit coherence.
- [ ] Validate policy presence and shape.
- [ ] Validate kind capability violations.

### Frontend Tasks

- [ ] Surface readiness issues inline in authoring UI.
- [ ] Group issues by severity.
- [ ] Deep link from issue list to affected item.
- [ ] Show clear publish blockers versus advisories.

### QA Tasks

- [ ] Add readiness fixture matrix per item kind.
- [ ] Add publish scheduling regression suite.

### Acceptance Criteria

- [ ] Teachers can understand every publish blocker without inspecting network payloads.
- [ ] Publishing and scheduling behave identically across kinds.

## Workstream 05 - Legacy Quiz Migration Decision And Execution

### Objective

- Remove quiz from the current ambiguous state between legacy and canonical worlds.

### Problems To Solve

- Legacy `QuizAttempt` still exists.
- Canonical assessment routing also supports quiz.
- The canonical quiz registry module is incomplete.

### Decision Required

- Decide whether quiz will complete migration in the next implementation cycle.
- Decide whether legacy quiz routes remain user-facing during the migration window.

### Backend Tasks

- [ ] Audit every remaining read and write to legacy `QuizAttempt`.
- [ ] Identify whether dual-write still exists anywhere.
- [ ] Add telemetry around legacy quiz route usage.
- [ ] Create a backfill and parity verification script if legacy rows still matter.

### Frontend Tasks

- [ ] Implement a fully functional canonical quiz attempt module.
- [ ] Implement a fully functional canonical quiz authoring module or explicitly route quiz authoring to a supported surface until ready.
- [ ] Remove null passthrough placeholders from production paths.

### QA Tasks

- [ ] Run parity tests between legacy quiz grading and canonical quiz grading.
- [ ] Add end-to-end quiz author, attempt, submit, review, and result visibility tests.

### Acceptance Criteria

- [ ] Quiz works completely in the canonical shell.
- [ ] Or quiz is removed from the canonical shell until it works completely.
- [ ] No half-supported canonical quiz path remains.

## Workstream 06 - Kind Completion Strategy

### Objective

- Treat every supported kind as complete only when all three surfaces are complete.

### Completion Definition

- Studio surface is complete.
- Attempt surface is complete.
- Review surface is complete.
- Result visibility is complete.
- Analytics are complete enough for production.
- Tests exist.

### Backend Tasks

- [ ] Add a machine-readable completeness checklist by kind in docs or configuration.
- [ ] Expose capabilities so frontend can guard unsupported surfaces.

### Frontend Tasks

- [ ] Remove null modules from supported kinds.
- [ ] Replace placeholder passthroughs with real modules or explicit unsupported notices guarded out of routing.
- [ ] Publish a completeness dashboard for engineering tracking.

### QA Tasks

- [ ] Validate that every supported kind passes the same journey matrix.

### Acceptance Criteria

- [ ] No kind is labeled supported unless all required surfaces work.
- [ ] The route tree never claims a product exists when the registry module is still a placeholder.

## Workstream 07 - Draft Safety And Versioning

### Objective

- Make drafts resilient under real-world student behavior.

### Problems To Solve

- Students refresh pages.
- Students open multiple tabs.
- Students lose connectivity.
- Students type for long periods before saving.
- High-stakes flows cannot tolerate silent data loss.

### Backend Tasks

- [ ] Keep optimistic versioning as mandatory for mutating draft endpoints.
- [ ] Return structured 409 conflict payloads with merge metadata.
- [ ] Add idempotency keys for critical submit actions where needed.
- [ ] Ensure draft version increments on every material mutation.
- [ ] Emit audit events for conflict occurrences.

### Frontend Tasks

- [ ] Standardize autosave indicators across kinds.
- [ ] Add a conflict-resolution dialog that compares local draft versus server draft.
- [ ] Add “restore server version” and “keep my local version” choices where safe.
- [ ] Preserve unsent local work when a save conflict happens.

### QA Tasks

- [ ] Add multi-tab save conflict tests.
- [ ] Add slow network autosave tests.
- [ ] Add browser refresh recovery tests.

### Acceptance Criteria

- [ ] No silent draft overwrites occur.
- [ ] Conflict handling is understandable to students.
- [ ] Teachers and support can trace why a conflict happened.

## Workstream 08 - Start, Resume, And Re-Entry Model

### Objective

- Make the student entry path into an assessment deterministic.

### Problems To Solve

- Start, resume, and submitted states are spread across multiple hooks and assumptions.
- Students should always know whether they are starting a new attempt, resuming a draft, or viewing a prior submission.

### Backend Tasks

- [ ] Add a canonical attempt summary endpoint.
- [ ] Return whether a draft exists.
- [ ] Return whether max attempts has been reached.
- [ ] Return whether a returned attempt can be resubmitted.
- [ ] Return whether the assessment is not yet open or already closed.

### Frontend Tasks

- [ ] Build a unified start panel component usable across kinds.
- [ ] Show prior attempts and statuses consistently.
- [ ] Show effective time limit and due date in one place.
- [ ] Explain whether the student is resuming an existing draft.

### QA Tasks

- [ ] Add tests for first attempt, resumed draft, max-attempt blocked, not-yet-open, closed, and returned-for-revision entry states.

### Acceptance Criteria

- [ ] A student never lands in an ambiguous state when entering an assessment.
- [ ] The system always explains whether the next click creates or resumes work.

## Workstream 09 - Returned Submission And Resubmission Experience

### Objective

- Turn `RETURNED` into a real product workflow, not just a status value.

### Problems To Solve

- Returned state exists in the model.
- It is not yet a complete teacher and student experience.
- Revision workflows need history, diffs, and messaging.

### Backend Tasks

- [ ] Standardize resubmission draft creation rules.
- [ ] Attach returned feedback context to the new draft.
- [ ] Persist parent-submission lineage for revision history.
- [ ] Add resubmission reason codes and timestamps.

### Frontend Tasks

- [ ] Show returned banner with teacher instructions.
- [ ] Show what changed since the previous submission.
- [ ] Show revision history in both student and teacher views.
- [ ] Make “submit again” language explicit.

### QA Tasks

- [ ] Add tests for returned assignment resubmission.
- [ ] Add tests for returned exam resubmission if allowed.
- [ ] Add tests for returned-to-published and published-to-returned recall flows.

### Acceptance Criteria

- [ ] Returning a submission creates a clear revision loop.
- [ ] Students can distinguish original feedback from new work.
- [ ] Teachers can compare attempts quickly.

## Workstream 10 - Allowed Item Kinds Per Assessment Kind

### Objective

- Make item composition rules explicit and enforced.

### Problems To Solve

- Allowed items currently vary by UI module behavior.
- Enforcement should not depend only on frontend controls.

### Backend Tasks

- [ ] Add a canonical allowed-item matrix.
- [ ] Reject incompatible item kinds at the API layer.
- [ ] Include violations in readiness output.

### Frontend Tasks

- [ ] Drive item creation menus from the allowed-item matrix.
- [ ] Show reason codes when an item kind is unavailable.

### QA Tasks

- [ ] Add tests for invalid kind combinations.

### Acceptance Criteria

- [ ] Teachers cannot create unsupported combinations accidentally.
- [ ] The backend and frontend enforce the same rules.

## Workstream 11 - Studio Convergence

### Objective

- Make teacher authoring feel like one system instead of several migrations.

### Problems To Solve

- Assignment studio already uses native items.
- Exam authoring still has separate legacy-flavored pieces.
- Quiz authoring is incomplete in the new shell.
- This creates inconsistent teacher mental models.

### Backend Tasks

- [ ] Ensure studio writes only canonical assessment and item data.
- [ ] Remove implicit fallback dependencies on legacy activity content for new authoring paths.

### Frontend Tasks

- [ ] Converge all kinds onto the same studio shell patterns.
- [ ] Reuse shared outline, item editing, policy, and readiness UI where possible.
- [ ] Keep kind-specific differences in modules, not in shell forks.
- [ ] Unify save-state visuals across kinds.
- [ ] Add duplication, reorder, and bulk item operations consistently.

### QA Tasks

- [ ] Add shared studio test matrix for create, edit, reorder, delete, readiness, publish, schedule, archive.

### Acceptance Criteria

- [ ] Teachers switching between assessment kinds see the same product grammar.

## Workstream 12 - Item Authoring Quality

### Objective

- Raise the quality and completeness of item editors.

### Problems To Solve

- Item bodies are powerful.
- Power without good editing UX produces authoring mistakes and broken assessments.

### Deliverables

- Better item templates.
- Better inline validation.
- Better previews.
- Better scoring guidance.

### Frontend Tasks

- [ ] Add default templates for each item kind.
- [ ] Add inline validation before save.
- [ ] Add per-item preview mode.
- [ ] Add max score guidance.
- [ ] Add keyboard-friendly authoring flows.
- [ ] Add duplication of existing items.

### Backend Tasks

- [ ] Reject malformed item bodies with precise errors.
- [ ] Validate item score bounds and structural integrity.

### QA Tasks

- [ ] Add malformed item-body regression tests.
- [ ] Add preview rendering tests.

### Acceptance Criteria

- [ ] Teachers can build valid items quickly.
- [ ] Teachers receive precise guidance when an item is invalid.

## Workstream 13 - File Upload Reliability

### Objective

- Make file-based submissions trustworthy.

### Problems To Solve

- File upload answers require finalized uploads and constraint enforcement.
- Teachers and students need clearer file lifecycle behavior.

### Backend Tasks

- [ ] Keep ownership and finalization validation mandatory.
- [ ] Add clearer error codes for invalid upload references.
- [ ] Add orphaned upload cleanup strategy.
- [ ] Add antivirus or content scanning hook if not already present elsewhere.
- [ ] Add stronger limits and telemetry for oversized files.

### Frontend Tasks

- [ ] Show upload state clearly before save and before submit.
- [ ] Prevent submission while required uploads are still in progress.
- [ ] Show allowed file types and size limits next to the drop zone.
- [ ] Make upload retry explicit.

### QA Tasks

- [ ] Add tests for stale upload reference rejection.
- [ ] Add tests for wrong MIME type.
- [ ] Add tests for over-size rejection.
- [ ] Add tests for multi-file item behavior.

### Acceptance Criteria

- [ ] Students cannot accidentally submit unresolved upload placeholders.
- [ ] Teachers can reliably open uploaded work.

## Workstream 14 - Code Challenge Execution And Feedback Model

### Objective

- Treat code assessments as a first-class runtime with reliable execution semantics.

### Problems To Solve

- Code challenge grading is part canonical item grading and part legacy-style challenge grading fallback.
- Students need reliable run feedback before final submission.
- Teachers need predictable scoring semantics.

### Backend Tasks

- [ ] Standardize the canonical code item grading path as the primary path.
- [ ] Define scoring strategies explicitly.
- [ ] Distinguish visible test feedback from hidden test final scoring.
- [ ] Add execution telemetry and retry controls.
- [ ] Add queue backpressure handling for spike periods.

### Frontend Tasks

- [ ] Show latest run state, pass counts, and confidence indicators.
- [ ] Distinguish practice runs from final submission grading.
- [ ] Show language, memory, and time constraints clearly.
- [ ] Surface judge failures gracefully.

### QA Tasks

- [ ] Add run-result parsing tests.
- [ ] Add judge timeout tests.
- [ ] Add hidden-test versus visible-test regression tests.

### Acceptance Criteria

- [ ] Code challenge behavior is predictable under load.
- [ ] Students understand the difference between run feedback and final grading.

## Workstream 15 - Auto-Grading Strategy Framework

### Objective

- Normalize how auto-graded items contribute to final scores.

### Problems To Solve

- Different kinds currently mix canonical and fallback grading paths.
- Partial credit rules should be explicit, not incidental.

### Backend Tasks

- [ ] Define canonical scoring rules per item kind.
- [ ] Define partial-credit semantics for matching and code where applicable.
- [ ] Define aggregate scoring rules per assessment kind.
- [ ] Version the grading algorithms.
- [ ] Persist which grading algorithm version was applied.

### Frontend Tasks

- [ ] Explain scoring logic in teacher authoring and student review where appropriate.
- [ ] Show whether an item is auto-graded or needs manual review.

### QA Tasks

- [ ] Build grading golden tests for all supported auto-graded items.
- [ ] Build deterministic fixtures with expected breakdowns.

### Acceptance Criteria

- [ ] The same answers always produce the same score for a given grading version.
- [ ] Teachers can understand why the score was computed.

## Workstream 16 - Manual Grading And Rubrics

### Objective

- Make manual review both faster and more consistent.

### Problems To Solve

- Rubric fields exist but are not yet clearly integrated into the review experience.
- Manual review throughput will limit product quality if the UI remains generic.

### Backend Tasks

- [ ] Add rubric structures that can be serialized and reused.
- [ ] Add rubric snapshots into grading entries when used.
- [ ] Support rubric criterion feedback in item feedback payloads.

### Frontend Tasks

- [ ] Build rubric-driven grading UI for open text and file review.
- [ ] Allow teachers to reuse rubric comments.
- [ ] Allow teachers to mark criteria as met, partial, or unmet.
- [ ] Summarize rubric feedback for students.

### QA Tasks

- [ ] Add rubric application tests.
- [ ] Add review UI tests for rubric navigation and score calculation.

### Acceptance Criteria

- [ ] Teachers can grade manually without relying on free-form comments only.
- [ ] Students receive structured feedback for revision.

## Workstream 17 - Anti-Cheat As Policy, Not Decoration

### Objective

- Make anti-cheat rules authoritative, explainable, and auditable.

### Problems To Solve

- Anti-cheat is present in policy and attempt guard behavior.
- It must be enforced coherently across start, attempt, submit, and review.

### Backend Tasks

- [ ] Define authoritative anti-cheat event ingestion.
- [ ] Stop relying solely on client-reported counts as the meaningful truth.
- [ ] Persist violation event summaries in submission metadata with clear provenance.
- [ ] Define how thresholds trigger auto-submit, warnings, lockout, or support review.
- [ ] Define teacher visibility rules for violations.

### Frontend Tasks

- [ ] Unify anti-cheat banner and warning language across kinds.
- [ ] Show students the policy before they begin.
- [ ] Show violation count and threshold status consistently where allowed.
- [ ] Show teachers a clear violation timeline in review when relevant.

### QA Tasks

- [ ] Add tests for threshold-triggered auto-submit.
- [ ] Add tests for fullscreen-required flows.
- [ ] Add tests for tab-switch and copy-paste warning semantics.

### Acceptance Criteria

- [ ] Anti-cheat events are not just cosmetic client-side counters.
- [ ] Teachers and support can inspect what happened.

## Workstream 18 - Effective Policy And Override Resolution

### Objective

- Make per-student exceptions first-class and predictable.

### Problems To Solve

- Student overrides exist in the data model.
- Product UX for overrides is not yet central.
- Effective due date and attempt limit must be resolvable consistently.

### Backend Tasks

- [ ] Add one helper that resolves effective policy for a specific student and assessment.
- [ ] Use that helper everywhere start, save, submit, and review require effective policy.
- [ ] Return effective policy and applied override summary in APIs.
- [ ] Add support for multiple override scenarios beyond deadline extension if needed.

### Frontend Tasks

- [ ] Show override-aware due dates to students.
- [ ] Show override badges to teachers in review and gradebook.
- [ ] Build teacher UI for granting and revoking overrides.

### QA Tasks

- [ ] Add tests for max-attempt override.
- [ ] Add tests for due-date override.
- [ ] Add tests for waived late penalty.

### Acceptance Criteria

- [ ] Students only see the policy that applies to them.
- [ ] Teachers can tell when a student is under an override.

## Workstream 19 - Teacher Submission Queue And Triage UX

### Objective

- Make the teacher queue fast, trustworthy, and assessment-aware.

### Problems To Solve

- The current queue is functional but generic.
- Triage is one of the most repeated teacher workflows.
- Generic queues tend to hide kind-specific context that matters.

### Deliverables

- A consistent queue layout.
- Assessment-aware row summaries.
- Strong default filters.
- Keyboard navigation.
- Bulk operations that do not hide individual context.

### Backend Tasks

- [ ] Ensure queue APIs return enough context for kind badges, late flags, override badges, and release state badges.
- [ ] Add sort support for priority fields that actually matter operationally.
- [ ] Add stable pagination behavior under concurrent grading changes.
- [ ] Add saved filter presets if needed.

### Frontend Tasks

- [ ] Rework row cards to show student, attempt number, status, late state, release state, kind, and time-to-grade.
- [ ] Add filters for needs grading, returned, late, published, ungraded, overridden, and suspected anti-cheat.
- [ ] Add keyboard shortcuts for next, previous, publish, return, and save when appropriate.
- [ ] Persist filters per teacher and course.
- [ ] Show whether the selected submission is stale relative to current list state.

### Product Tasks

- [ ] Define the default review priority model.
- [ ] Decide whether late work should float up or down by default.
- [ ] Decide whether returned work gets its own queue lane.

### QA Tasks

- [ ] Test queue behavior with zero, one, many, and thousands of submissions.
- [ ] Test queue behavior while another teacher is grading concurrently.
- [ ] Test filter and pagination interactions.

### Acceptance Criteria

- [ ] A teacher can enter a course review flow and immediately understand what needs attention first.
- [ ] Queue state remains stable and understandable during active grading.

## Workstream 20 - Submission Inspector And Revision Diffing

### Objective

- Make the center review pane useful for actual grading work, not just record viewing.

### Problems To Solve

- Teachers need context.
- Teachers need prior attempts.
- Teachers need revision diffs.
- Teachers need item-level navigation.

### Deliverables

- Item navigator.
- Attempt history panel.
- Revision diff view.
- Policy and override summary.
- Violation and late context panel.

### Backend Tasks

- [ ] Add prior-attempt linkage to review detail payloads.
- [ ] Add revision comparison metadata.
- [ ] Add teacher-facing policy snapshot at submission time.
- [ ] Add release state and ledger summary to review detail.

### Frontend Tasks

- [ ] Add an inspector header summarizing attempt number, student, due date, late status, and current release state.
- [ ] Add an attempt history drawer.
- [ ] Add a diff mode for open text and structured answers.
- [ ] Add compare-current-versus-previous controls.
- [ ] Add item jump navigation for long assessments.

### QA Tasks

- [ ] Add tests for returned resubmission history.
- [ ] Add tests for prior-attempt navigation.
- [ ] Add tests for diff rendering with missing prior data.

### Acceptance Criteria

- [ ] A teacher can understand the full context of a submission without leaving the review workspace.
- [ ] A teacher can compare revisions without manual copy-paste work.

## Workstream 21 - Grade Save, Publish, Return, And Concurrency

### Objective

- Turn grading into an explicit stateful workflow with guardrails.

### Problems To Solve

- Teacher grading concurrency exists in the backend but needs better product expression.
- Grade save and grade publish need distinct UX.
- Return for revision should be first-class.

### Deliverables

- Explicit actions for save grade, publish grade, and return for revision.
- Distinct state badges.
- Better concurrency messaging.
- Grade change audit visibility.

### Backend Tasks

- [ ] Keep optimistic locking on teacher grade mutations.
- [ ] Return rich 412 payloads that identify the latest version and summary of what changed.
- [ ] Add explicit transition reason codes in events.
- [ ] Add a grade mutation audit stream.

### Frontend Tasks

- [ ] Separate “save as graded” from “publish to student” where policy supports it.
- [ ] Distinguish “return for revision” from “grade saved.”
- [ ] Show a stale-review warning when another grader changed the record.
- [ ] Allow easy refresh-and-merge behavior after conflict.

### QA Tasks

- [ ] Add multi-teacher grade conflict tests.
- [ ] Add grade status transition tests.
- [ ] Add published-to-returned recall tests.

### Acceptance Criteria

- [ ] Teachers never silently overwrite each other.
- [ ] Every visible grade action maps to a domain state change the UI can explain.

## Workstream 22 - Bulk Teacher Actions

### Objective

- Support real classroom operations without degrading correctness.

### Problems To Solve

- Teachers need batch grading.
- Teachers need deadline extensions.
- Teachers need bulk publish.
- These operations are powerful and easy to misuse if opaque.

### Deliverables

- Bulk action center.
- Async progress status.
- Dry-run previews.
- Result summaries.

### Backend Tasks

- [ ] Standardize bulk action record structure across operations.
- [ ] Add dry-run endpoints where valuable.
- [ ] Add idempotency and retry semantics.
- [ ] Add per-target result reporting.

### Frontend Tasks

- [ ] Build confirmation dialogs that show exact counts and consequences.
- [ ] Show async progress and errors.
- [ ] Allow export of failed targets for retry.
- [ ] Clear selected rows after successful completion.

### QA Tasks

- [ ] Add tests for partial failure in batch grading.
- [ ] Add tests for async deadline extension action states.
- [ ] Add tests for double-submit protection.

### Acceptance Criteria

- [ ] Bulk actions feel safe and reversible where possible.
- [ ] Teachers can see which rows succeeded and which failed.

## Workstream 23 - Gradebook Correctness And Trust

### Objective

- Make the course gradebook an accurate, explainable projection of canonical submissions and policies.

### Problems To Solve

- Gradebooks are where trust collapses if numbers disagree.
- Grade release state, returned status, and overrides can all confuse gradebook projections.

### Deliverables

- A documented gradebook projection model.
- Clear cell states.
- Drill-down from cell to submission history.
- Better legend and explanation text.

### Backend Tasks

- [ ] Document the gradebook projection algorithm.
- [ ] Ensure gradebook derives from canonical progress and submission data.
- [ ] Include release state and teacher-action-required indicators where useful.
- [ ] Ensure late penalties and overrides are reflected consistently.

### Frontend Tasks

- [ ] Show cell legends for not started, in progress, submitted, needs grading, returned, graded, published, passed, failed.
- [ ] Add quick drill-down from a cell into review or results context.
- [ ] Show when a cell value is hidden from students but visible to teachers.
- [ ] Improve gradebook filtering and summary explanations.

### QA Tasks

- [ ] Add golden tests comparing gradebook cells against fixture submission histories.
- [ ] Add regression tests for returned and republished flows.

### Acceptance Criteria

- [ ] Teachers trust that the gradebook reflects the authoritative ledger.
- [ ] Support can explain why a specific cell looks the way it does.

## Workstream 24 - Analytics And Assessment Insights

### Objective

- Move analytics beyond totals into actionable insight.

### Problems To Solve

- Teachers need to identify weak questions, risky cohorts, grading backlog, and timing problems.
- Production readiness includes analytics that are operationally useful, not just decorative.

### Deliverables

- Assessment overview dashboard.
- Item analysis dashboard.
- Submission timing dashboard.
- Grading throughput dashboard.
- Student-risk signals tied to assessment outcomes.

### Backend Tasks

- [ ] Add item-level correctness rates.
- [ ] Add item-level manual-review rates.
- [ ] Add item-level average score and omission rate.
- [ ] Add attempt distribution metrics.
- [ ] Add on-time versus late completion metrics.
- [ ] Add grading latency metrics.

### Frontend Tasks

- [ ] Build assessment analytics cards that connect to teacher decisions.
- [ ] Add item heatmaps for weak prompts or confusing questions.
- [ ] Add downloadable analytics exports.
- [ ] Add grade-release-aware views that avoid confusing hidden grades with missing grades.

### QA Tasks

- [ ] Add fixture-based analytics validation against known submission sets.
- [ ] Add visualization tests for empty and sparse datasets.

### Acceptance Criteria

- [ ] Teachers can identify which items or cohorts need intervention.
- [ ] Analytics numbers match gradebook and submission ledger expectations.

## Workstream 25 - Student Results, Feedback, And Timeline

### Objective

- Give students a coherent story about what happened to their work.

### Problems To Solve

- Students need more than a score.
- Students need status clarity.
- Students need visibility clarity.
- Students need revision clarity.

### Deliverables

- Submission timeline.
- Feedback summary.
- Item-level feedback rendering.
- Release-state messaging.
- Revision history.

### Backend Tasks

- [ ] Add a student-focused result projection endpoint if needed.
- [ ] Return release state reason.
- [ ] Return prior attempts summary.
- [ ] Return rubric and item feedback in a stable format.

### Frontend Tasks

- [ ] Show timeline events: started, saved, submitted, graded, published, returned, resubmitted.
- [ ] Show whether grades are hidden pending teacher release.
- [ ] Show teacher comments and rubric breakdowns clearly.
- [ ] Show which items were auto-graded and which were reviewed manually.

### QA Tasks

- [ ] Add tests for hidden-grade messages.
- [ ] Add tests for returned submission history.
- [ ] Add tests for item feedback rendering.

### Acceptance Criteria

- [ ] A student can understand the lifecycle of a submission from start to final resolution.
- [ ] A student can tell what to do next if work is returned.

## Workstream 26 - Notifications And Messaging

### Objective

- Keep users informed at the right moments without ambiguity.

### Problems To Solve

- High-value state changes currently rely too much on the user noticing them manually.
- Release and return events should be communicated clearly.

### Deliverables

- Event taxonomy for assessment notifications.
- In-app notifications.
- Optional email notifications.
- Teacher digest options.

### Backend Tasks

- [ ] Define notification events for published assessment, upcoming due date, submitted work, returned work, grade published, override granted, and extension granted.
- [ ] Route events through a stable notification publisher.
- [ ] Add deduplication and preference controls.

### Frontend Tasks

- [ ] Show event-specific in-app toasts and inbox entries.
- [ ] Link notifications to the exact relevant assessment or submission.
- [ ] Avoid spam by collapsing repetitive events.

### QA Tasks

- [ ] Add tests for notification generation on state transitions.
- [ ] Add tests for preference filtering.

### Acceptance Criteria

- [ ] Users are informed when meaningful assessment state changes affect them.
- [ ] Notification language matches product vocabulary.

## Workstream 27 - Permissions And Access Control

### Objective

- Make access control assessment-aware, override-aware, and explicit.

### Problems To Solve

- Course-level permissions exist.
- Assessment-specific access nuances are not yet fully elevated in the product.
- High-stakes flows need stronger access semantics.

### Deliverables

- Assessment-specific access policy model.
- Teacher-only and grader-only action checks.
- Student access exceptions for makeups, retakes, and whitelists.

### Backend Tasks

- [ ] Define assessment access policy concepts separate from general RBAC when needed.
- [ ] Enforce per-assessment student access in start and submit flows.
- [ ] Normalize whitelist and access-mode handling.
- [ ] Add support-friendly denial reason codes.

### Frontend Tasks

- [ ] Show explicit “why you cannot access this assessment” screens.
- [ ] Show teacher tooling for access exceptions where supported.
- [ ] Hide or disable actions based on authoritative capability payloads.

### QA Tasks

- [ ] Add tests for unauthorized student access.
- [ ] Add tests for grader-only actions.
- [ ] Add tests for whitelisted make-up exam access.

### Acceptance Criteria

- [ ] Access decisions are enforced consistently.
- [ ] Access denials are explainable.

## Workstream 28 - Audit Trail And Reconciliation

### Objective

- Make the system supportable when numbers or states are disputed.

### Problems To Solve

- Grades are sensitive.
- Assessment publication timing is sensitive.
- Teachers and students will dispute outcomes occasionally.

### Deliverables

- Audit log for lifecycle changes.
- Audit log for grading changes.
- Audit log for override changes.
- Reconciliation views for support and admins.

### Backend Tasks

- [ ] Emit structured audit events for create, update, publish, schedule, archive, save draft, submit, resubmit, grade, publish grade, return, extend deadline, and override updates.
- [ ] Add immutable actor, target, timestamp, and diff payload fields.
- [ ] Build internal support queries over the audit trail.

### Frontend Tasks

- [ ] Expose audit summaries in support/admin tools.
- [ ] Show last modified actor and time in relevant teacher surfaces where helpful.

### QA Tasks

- [ ] Add tests asserting audit events are emitted for key transitions.

### Acceptance Criteria

- [ ] Support can reconstruct how a submission and grade reached the current state.

## Workstream 29 - Accessibility Baseline

### Objective

- Ensure assessments are usable with assistive technologies and accessible interaction patterns.

### Problems To Solve

- Assessment flows are often more interactive than standard forms.
- Accessibility issues are especially damaging during timed work.

### Deliverables

- Keyboard-complete attempt and review flows.
- Screen-reader-friendly timers and status updates.
- Accessible item editors and response inputs.
- Reduced-motion and readable error patterns.

### Frontend Tasks

- [ ] Ensure all item types are operable by keyboard only.
- [ ] Ensure focus management works during dialogs, submissions, and conflict resolution.
- [ ] Add accessible live regions for save state, timer warnings, and submission results.
- [ ] Ensure color is never the only status indicator.
- [ ] Add accessible labels for policy and anti-cheat warnings.

### Backend Tasks

- [ ] Return structured error codes and readable messages that frontend can present accessibly.

### QA Tasks

- [ ] Add automated a11y checks for all assessment surfaces.
- [ ] Add manual keyboard and screen-reader smoke tests for each kind.

### Acceptance Criteria

- [ ] A student can complete supported assessments without requiring pointer-only interactions.

## Workstream 30 - Mobile And Low-Bandwidth UX

### Objective

- Make assessment experiences viable on smaller devices and unstable connections.

### Problems To Solve

- Not every student has a laptop.
- Network quality can be uneven.
- Long interactive forms fail badly under poor connectivity if not designed for it.

### Deliverables

- Mobile-responsive attempt layouts.
- Low-bandwidth autosave behavior.
- Connection status messaging.
- Graceful upload and run retry behavior.

### Frontend Tasks

- [ ] Audit each attempt surface on common mobile breakpoints.
- [ ] Collapse non-essential chrome during attempt mode on small screens.
- [ ] Add offline and reconnect banners.
- [ ] Ensure autosave retries do not block editing.
- [ ] Keep large file uploads resumable where possible.

### QA Tasks

- [ ] Add responsive screenshots for each kind.
- [ ] Add throttled-network tests.
- [ ] Add mobile browser smoke tests.

### Acceptance Criteria

- [ ] Students can finish supported mobile-safe assessments on constrained devices.
- [ ] The UI degrades clearly rather than breaking mysteriously.

## Workstream 31 - Localization And Copy Quality

### Objective

- Make assessment language precise, translatable, and consistent.

### Problems To Solve

- Assessment flows depend heavily on clear instructional text.
- Status and policy copy drift causes user confusion fast.

### Deliverables

- Canonical copy dictionary for assessment states.
- Consistent localization keys.
- Review of existing translated strings for assessment semantics.

### Frontend Tasks

- [ ] Remove hard-coded English strings from assessment shells where possible.
- [ ] Add localization coverage for state badges, policy messages, anti-cheat warnings, results explanations, and conflict messages.
- [ ] Review translated grading and assessment copy for accuracy and terminology consistency.

### QA Tasks

- [ ] Add missing-key tests for assessment namespaces.
- [ ] Add screenshot review in supported locales.

### Acceptance Criteria

- [ ] Assessment-specific copy is consistent across locales and surfaces.
- [ ] Teachers and students see the same product vocabulary regardless of entry path.

## Workstream 32 - Performance And Scalability

### Objective

- Make the system hold up during deadline spikes and large courses.

### Problems To Solve

- Assessment load is bursty.
- Deadlines and exams create concentrated traffic.
- Code execution intensifies backend load.

### Backend Tasks

- [ ] Identify top submission, review, and gradebook queries.
- [ ] Add indexes needed for review queue and gradebook at real scale.
- [ ] Optimize pagination queries for large activities.
- [ ] Add caching where safe for teacher dashboards and analytics.
- [ ] Load test submission spikes and grading queue loads.

### Frontend Tasks

- [ ] Tune query stale times for assessment and review surfaces intentionally.
- [ ] Avoid unnecessary invalidation storms after mutations.
- [ ] Virtualize long review queues and large gradebook tables if needed.

### QA Tasks

- [ ] Add performance budgets for key routes.
- [ ] Run load tests for simultaneous submits.
- [ ] Run soak tests for review and analytics queries.

### Acceptance Criteria

- [ ] Submission, review, and gradebook surfaces remain responsive under realistic peak traffic.

## Workstream 33 - Observability And SLOs

### Objective

- Make assessment workflows measurable and diagnosable.

### Problems To Solve

- Without observability, assessment incidents become anecdotal and slow to resolve.

### Deliverables

- Structured logs.
- Key metrics.
- Distributed tracing for critical paths.
- SLOs and alerts.

### Backend Tasks

- [ ] Add structured logging around start, save, submit, grade, publish, return, and bulk actions.
- [ ] Add request correlation IDs through assessment flows.
- [ ] Emit metrics for submit latency, save latency, queue fetch latency, grading latency, publish latency, judge failures, and conflict counts.
- [ ] Add alerts for elevated submission failures and grade mutation failures.

### Frontend Tasks

- [ ] Add client-side error capture for attempt and review failures.
- [ ] Add surface-specific performance instrumentation for shell loads and mutation completion times.

### QA Tasks

- [ ] Validate logs and metrics in staging before rollout.

### Acceptance Criteria

- [ ] An incident responder can identify where and why an assessment flow failed.

## Workstream 34 - Background Jobs And Recovery Paths

### Objective

- Ensure long-running or async work is safe, retryable, and observable.

### Problems To Solve

- Code execution, bulk actions, plagiarism checks, exports, and notifications are all potential async work.
- Production readiness requires recovery behavior, not just happy-path background execution.

### Deliverables

- Job definitions.
- Retry policies.
- Dead-letter strategy.
- Operator dashboards.

### Backend Tasks

- [ ] Inventory every async assessment-related task.
- [ ] Define retry and timeout semantics per task type.
- [ ] Add dead-letter handling for irrecoverable failures.
- [ ] Expose bulk-action and async-task status endpoints clearly.

### QA Tasks

- [ ] Inject worker failure scenarios.
- [ ] Validate idempotent retries for publish and extension actions.

### Acceptance Criteria

- [ ] Async failures do not silently disappear.
- [ ] Operators can inspect and retry failed work where appropriate.

## Workstream 35 - API Contracts And Generated Client Types

### Objective

- Make frontend and backend speak through explicit, versioned contracts.

### Problems To Solve

- Compatibility types indicate drift risk.
- Shells should not need to infer data shape from partial documents.

### Deliverables

- Hardened OpenAPI coverage.
- Generated types for assessment projections.
- Deprecated compatibility layer with removal plan.

### Backend Tasks

- [ ] Ensure assessment projection schemas are in OpenAPI.
- [ ] Ensure review detail and result detail schemas are in OpenAPI.
- [ ] Mark deprecated legacy endpoints and shapes clearly.

### Frontend Tasks

- [ ] Prefer generated types over manual compatibility types for new assessment work.
- [ ] Replace legacy imported grading aliases gradually.
- [ ] Collapse duplicated type definitions.

### QA Tasks

- [ ] Add schema snapshot tests for key endpoints.

### Acceptance Criteria

- [ ] Frontend assessment shells rely on generated or directly mirrored canonical contracts.

## Workstream 36 - Frontend Data Architecture Cleanup

### Objective

- Reduce hook sprawl and make data ownership obvious.

### Problems To Solve

- Attempt state is split between shell hooks, submission hooks, kind hooks, and local persistence hooks.
- Review state is split between generic grading hooks and assessment wrappers.

### Deliverables

- Clear hook ownership per surface.
- Query key discipline.
- Fewer duplicate fetches.
- More predictable invalidation.

### Frontend Tasks

- [ ] Create a dedicated assessment-query layer for canonical surfaces.
- [ ] Co-locate surface-specific queries with surface view models.
- [ ] Remove unnecessary cross-imports from old generic hooks where canonical hooks exist.
- [ ] Normalize invalidation on save, submit, grade, return, and publish.

### QA Tasks

- [ ] Add tests ensuring mutation flows invalidate only the intended queries.

### Acceptance Criteria

- [ ] Data loading paths are understandable and stable.
- [ ] Surface shells do not duplicate fetch orchestration unnecessarily.

## Workstream 37 - Backend Test Strategy

### Objective

- Create a real backend safety net for the canonical assessment engine.

### Test Layers

- Unit tests for validators and scoring helpers.
- Integration tests for authoring and attempt flows.
- Permission tests for protected actions.
- Migration tests for legacy parity and backfill.
- Property-based tests for grading and policy edge cases where valuable.

### Backend Tasks

- [ ] Add API integration tests for create, update, readiness, publish, schedule, archive.
- [ ] Add API integration tests for start, save draft, conflict, submit, resubmit.
- [ ] Add API integration tests for teacher grade save, publish, return, and bulk actions.
- [ ] Add policy override tests for effective due date and attempts.
- [ ] Add grade-release visibility tests.
- [ ] Add canonical item validation tests.
- [ ] Add analytics fixture tests.

### Acceptance Criteria

- [ ] Canonical workflows are covered end to end at the API boundary.
- [ ] Legacy parity risks are caught before deploy.

## Workstream 38 - Frontend Test Strategy

### Objective

- Create confidence in shell behavior, edge states, and interaction flows.

### Test Layers

- View-model tests.
- Hook tests.
- Component tests.
- Mutation-state tests.
- Accessibility checks.

### Frontend Tasks

- [ ] Add tests for `useAssessment` and attempt projection consumption.
- [ ] Add tests for `useAssessmentSubmission` conflict and error behavior.
- [ ] Add tests for action bar state rendering.
- [ ] Add tests for studio readiness issue rendering.
- [ ] Add tests for review filter behavior and detail rendering.
- [ ] Add tests for localization keys and fallback behavior.

### Acceptance Criteria

- [ ] Shared shells are covered against state combinations, not just happy paths.

## Workstream 39 - End-To-End And Non-Functional Testing

### Objective

- Test the system the way users actually experience it.

### Problems To Solve

- There is almost no end-to-end assessment coverage today.

### Test Areas

- Teacher authoring.
- Student attempt.
- Teacher grading.
- Student results.
- Bulk actions.
- Mobile flows.
- Performance smoke tests.

### QA Tasks

- [ ] Add Playwright journeys for assignment author-to-grade.
- [ ] Add Playwright journeys for exam start-resume-submit.
- [ ] Add Playwright journeys for quiz canonical shell once implemented.
- [ ] Add Playwright journeys for returned revision.
- [ ] Add throttled-network submit tests.
- [ ] Add multi-browser smoke tests for timed attempts.

### Acceptance Criteria

- [ ] Critical teacher and student journeys run in CI.

## Workstream 40 - Data Migration And Backfill

### Objective

- Retire legacy assessment data dependencies safely.

### Problems To Solve

- Legacy quiz attempts and other legacy shapes may still matter for reporting or history.
- Migration without validation will erode trust.

### Deliverables

- Inventory of legacy tables and routes.
- Backfill scripts.
- Parity reports.
- Rollback plan.

### Backend Tasks

- [ ] Identify all legacy assessment-related tables and adapters.
- [ ] Define canonical destination fields for every legacy record that still matters.
- [ ] Build dry-run backfill jobs.
- [ ] Build parity verification queries.
- [ ] Build a migration cutoff checklist.

### QA Tasks

- [ ] Validate backfilled counts, scores, statuses, and timestamps.
- [ ] Validate old report parity on sampled courses.

### Acceptance Criteria

- [ ] Legacy-dependent behavior is either removed or proven equivalent after migration.

## Workstream 41 - Feature Flags And Rollout Discipline

### Objective

- Deploy improvements safely without forcing a big-bang switch.

### Deliverables

- Surface-level flags.
- Kind-level flags.
- Cohort-level rollout rules.
- Kill switches.

### Backend Tasks

- [ ] Add flags for canonical quiz shell rollout.
- [ ] Add flags for new review shell features.
- [ ] Add flags for new analytics experiences.

### Frontend Tasks

- [ ] Guard incomplete surfaces behind flags.
- [ ] Provide explicit fallbacks when a flag is off.
- [ ] Ensure flagged code paths are testable.

### QA Tasks

- [ ] Test both on and off paths for each release flag.

### Acceptance Criteria

- [ ] New assessment capabilities can be rolled out gradually by course, kind, or environment.

## Workstream 42 - Documentation And Enablement

### Objective

- Make the new system learnable for engineers, QA, and support.

### Deliverables

- Updated architecture docs.
- Surface contracts.
- Runbooks.
- Admin and support guides.

### Tasks

- [ ] Expand the assessment documentation beyond the current high-level summary.
- [ ] Document surface contracts for studio, attempt, review, and results.
- [ ] Document grade release semantics clearly.
- [ ] Document override semantics clearly.
- [ ] Document migration milestones and deprecation deadlines.

### Acceptance Criteria

- [ ] A new engineer can understand the canonical assessment engine without reverse-engineering the repo history.

## Workstream 43 - Support Tooling And Incident Response

### Objective

- Give support and operations the tools needed to resolve assessment incidents quickly.

### Deliverables

- Support lookup tools.
- Submission diagnostic pages.
- Grade-state explanation tools.
- Audit and ledger summaries.

### Tasks

- [ ] Build internal support endpoints or admin pages for submission inspection.
- [ ] Show current submission state, version, grading version, release state, applied override, and audit history.
- [ ] Add replay-safe tools for diagnosing failed submits and failed bulk actions.
- [ ] Add export tools for incident investigation.

### Acceptance Criteria

- [ ] Support does not need ad hoc database spelunking for common assessment incidents.

## Workstream 44 - Post-Launch Operations And Continuous Improvement

### Objective

- Keep the assessment system healthy after the migration lands.

### Deliverables

- SLO review cadence.
- Incident postmortem templates.
- Quarterly cleanup cadence.
- Product feedback loop.

### Tasks

- [ ] Review assessment incident metrics weekly during rollout.
- [ ] Review assessment usability feedback monthly.
- [ ] Review deprecations and remove dead compatibility layers quarterly.
- [ ] Re-run load tests before major exam seasons.
- [ ] Audit stale feature flags and kill switches.

### Acceptance Criteria

- [ ] The assessment product does not slide back into a fragmented state after launch.

## Recommended Execution Roadmap

## Phase 0 - Stop The Bleeding

### Goals

- Eliminate obviously broken canonical paths.
- Instrument the current system.
- Lock down the riskiest inconsistencies.

### Tasks

- [ ] Audit and fix any supported route that still lands in a null kind module.
- [ ] Add telemetry for legacy versus canonical route usage.
- [ ] Add assessment-flow error logging.
- [ ] Add support alerts for elevated submission failures.
- [ ] Freeze creation of new legacy-only assessment paths.

### Exit Criteria

- [ ] No supported canonical route is obviously incomplete.
- [ ] Teams can observe current production pain.

## Phase 1 - Contract Convergence

### Goals

- Normalize vocabulary.
- Normalize policy.
- Normalize surface projections.

### Tasks

- [ ] Publish capability matrix.
- [ ] Implement canonical attempt and review projections.
- [ ] Replace guessed shell booleans with server truth.
- [ ] Normalize policy names and units.

### Exit Criteria

- [ ] Shared shells run on authoritative projection data.

## Phase 2 - Teacher Authoring Convergence

### Goals

- Make studio coherent across kinds.

### Tasks

- [ ] Align exam and assignment authoring on shared shell patterns.
- [ ] Complete or guard quiz authoring path.
- [ ] Expand readiness and inline validation.
- [ ] Improve item editing quality.

### Exit Criteria

- [ ] Teachers experience one stable authoring model.

## Phase 3 - Student Runtime Convergence

### Goals

- Make attempt, save, submit, and result flows uniform.

### Tasks

- [ ] Ship canonical start/resume flow.
- [ ] Ship conflict-resolution UX.
- [ ] Ship returned resubmission UX.
- [ ] Ship release-state messaging.
- [ ] Harden mobile and low-bandwidth behavior.

### Exit Criteria

- [ ] Students experience one stable attempt model.

## Phase 4 - Teacher Review And Grade Release

### Goals

- Productize grading and review.

### Tasks

- [ ] Upgrade queue and inspector.
- [ ] Ship stronger grade-state controls.
- [ ] Ship rubric workflows.
- [ ] Ship bulk action previews and async status.
- [ ] Ship grade release visibility cues.

### Exit Criteria

- [ ] Teachers can triage, grade, publish, and return work efficiently and safely.

## Phase 5 - Analytics, Support, And Operations

### Goals

- Make the system operable and explainable at scale.

### Tasks

- [ ] Ship item and cohort analytics.
- [ ] Ship support diagnostics.
- [ ] Ship audit views.
- [ ] Establish SLO dashboards and alerts.

### Exit Criteria

- [ ] Support and platform teams can diagnose real incidents without custom one-off work.

## Phase 6 - Migration Cutover And Legacy Removal

### Goals

- Remove transitional layers cleanly.

### Tasks

- [ ] Backfill and validate legacy data.
- [ ] Turn off old routes behind flags.
- [ ] Remove compatibility types from new paths.
- [ ] Delete dead legacy adapters and docs.

### Exit Criteria

- [ ] Canonical assessment engine is the only supported path for assessment creation and runtime.

## Priority Order

- Priority 1: eliminate obviously broken canonical paths.
- Priority 2: authoritative attempt and review projections.
- Priority 3: quiz migration decision and execution.
- Priority 4: review and release-state productization.
- Priority 5: tests, telemetry, and support tooling.
- Priority 6: analytics and long-tail UX polish.

## Risks And Mitigations

## Risk 1 - Endless Migration State

- Risk: the team keeps adding new assessment work without finishing convergence.
- Mitigation: require every new assessment change to declare whether it is canonical, legacy, or migration-only.

## Risk 2 - Silent Contract Drift

- Risk: frontend and backend evolve different assessment shapes.
- Mitigation: move more projections into generated contracts and contract tests.

## Risk 3 - Teacher Trust Erosion

- Risk: gradebook, review, and results disagree.
- Mitigation: golden fixtures, audit logs, ledger reconciliation, and explicit release-state UI.

## Risk 4 - Student Data Loss

- Risk: draft saves or submit flows fail under high-stakes use.
- Mitigation: stronger autosave, conflict UX, retry behavior, telemetry, and E2E tests.

## Risk 5 - Legacy Data Surprises

- Risk: old quiz or assessment history breaks after cutover.
- Mitigation: inventory, backfill, parity tests, dry-run reporting, and staged rollout.

## Teacher Authoring Checklist

- [ ] Create assessment from a course chapter.
- [ ] Select kind and default policy.
- [ ] Edit title and description.
- [ ] Add first item.
- [ ] Duplicate an item.
- [ ] Reorder items.
- [ ] Delete an item.
- [ ] Edit choice prompt.
- [ ] Edit choice options.
- [ ] Mark correct choice answers.
- [ ] Create multiple-choice item.
- [ ] Create true-false item.
- [ ] Create open-text item.
- [ ] Add rubric guidance to open-text item.
- [ ] Create file-upload item.
- [ ] Set file-count constraint.
- [ ] Set MIME constraints.
- [ ] Set file-size constraint.
- [ ] Create form item.
- [ ] Add form fields.
- [ ] Mark form fields required.
- [ ] Create matching item.
- [ ] Add matching pairs.
- [ ] Create code item.
- [ ] Set allowed languages.
- [ ] Add starter code.
- [ ] Add visible tests.
- [ ] Add hidden tests.
- [ ] Set memory limit.
- [ ] Set time limit.
- [ ] Set max score per item.
- [ ] See inline item validation.
- [ ] See assessment-level readiness validation.
- [ ] See publish blocker count.
- [ ] Fix publish blockers.
- [ ] Save draft.
- [ ] Schedule assessment.
- [ ] Publish assessment immediately.
- [ ] Archive assessment.
- [ ] Revert scheduled to draft.
- [ ] Revert published to draft where allowed.
- [ ] See lifecycle status clearly.
- [ ] See scheduled timestamp clearly.
- [ ] Edit due date.
- [ ] Edit max attempts.
- [ ] Edit time limit.
- [ ] Edit late policy.
- [ ] Edit anti-cheat policy.
- [ ] Edit grade release mode.
- [ ] Edit completion rule.
- [ ] See kind-specific allowed items.
- [ ] Prevent unsupported item kinds.
- [ ] Preview student view.
- [ ] Duplicate assessment to another chapter or course if supported.
- [ ] Import or export assessment definition if planned.

## Student Attempt Checklist

- [ ] Open an assessment link while authenticated.
- [ ] Get redirected to login when unauthenticated.
- [ ] See a clear start panel.
- [ ] See due date.
- [ ] See time limit.
- [ ] See attempt limit.
- [ ] See anti-cheat rules before starting.
- [ ] Start a first attempt.
- [ ] Resume an existing draft.
- [ ] Recognize that a draft already exists.
- [ ] Recover local unsaved answers after refresh.
- [ ] Understand local versus server save states.
- [ ] Edit a choice item.
- [ ] Edit an open-text item.
- [ ] Upload a file.
- [ ] Fill a form item.
- [ ] Answer a matching item.
- [ ] Write code and run tests.
- [ ] See run feedback.
- [ ] Continue across multiple items.
- [ ] Navigate between items by keyboard.
- [ ] See answered-count progress.
- [ ] See timer warnings.
- [ ] See save-state changes.
- [ ] Trigger autosave.
- [ ] Resolve save conflict after another tab changes the draft.
- [ ] Retry after transient save failure.
- [ ] Submit once.
- [ ] Prevent double submit.
- [ ] Understand submission success state.
- [ ] Understand hidden-grade state.
- [ ] View returned-for-revision instructions.
- [ ] Start resubmission from returned work.
- [ ] Compare previous feedback.
- [ ] Understand override-adjusted due date.
- [ ] Understand override-adjusted attempt count.
- [ ] Understand late penalty if applied.
- [ ] Understand why late penalty was waived if overridden.
- [ ] Understand why access is denied if not eligible.
- [ ] Use the flow on mobile.
- [ ] Use the flow on slow network.
- [ ] Use the flow with screen reader support.
- [ ] Recover after browser crash.
- [ ] Recover after losing network mid-edit.
- [ ] Recover after upload error.
- [ ] Recover after code-run failure.
- [ ] View published grade.
- [ ] View item feedback.
- [ ] View rubric feedback.
- [ ] View results timeline.

## Teacher Review Checklist

- [ ] Open course review queue.
- [ ] See needs-grading count.
- [ ] Filter by status.
- [ ] Filter by late submissions.
- [ ] Search by student.
- [ ] Sort by submission time.
- [ ] Sort by score.
- [ ] Sort by attempt number.
- [ ] Select a submission.
- [ ] Navigate with keyboard.
- [ ] See student identity summary.
- [ ] See attempt number.
- [ ] See late state.
- [ ] See applied penalty.
- [ ] See override badges.
- [ ] See anti-cheat badges.
- [ ] See item navigator.
- [ ] Inspect answers for each item.
- [ ] Inspect files and attachments.
- [ ] Inspect code results.
- [ ] Inspect rubric details.
- [ ] Compare with prior attempt.
- [ ] Compare returned revision.
- [ ] Enter item-level feedback.
- [ ] Enter overall feedback.
- [ ] Save as graded.
- [ ] Publish to student.
- [ ] Return for revision.
- [ ] Resolve concurrency conflict.
- [ ] Move to next submission.
- [ ] Move to previous submission.
- [ ] Bulk select submissions.
- [ ] Run batch grade.
- [ ] Publish grades in bulk.
- [ ] Extend deadline in bulk.
- [ ] Inspect bulk-action status.
- [ ] Export grading CSV.
- [ ] Drill from gradebook to review.
- [ ] Understand release state.
- [ ] Understand whether a grade is visible to student.
- [ ] Inspect audit summary.
- [ ] Diagnose why a grade changed.
- [ ] Identify whether a submission is safe to republish.
- [ ] Reopen returned work if policy allows.
- [ ] Use the queue on tablet layout.
- [ ] Use the queue with keyboard only.

## Release Readiness Checklist

- [ ] Canonical kind capability matrix published.
- [ ] All supported kinds have non-placeholder modules for required surfaces.
- [ ] Attempt shell uses authoritative capability payloads.
- [ ] Review shell uses authoritative projection payloads.
- [ ] Policy schema normalized.
- [ ] Override resolution unified.
- [ ] Release-state semantics visible in UI.
- [ ] Draft autosave conflict UX shipped.
- [ ] Returned submission UX shipped.
- [ ] Gradebook parity verified.
- [ ] Analytics parity verified.
- [ ] Legacy route inventory complete.
- [ ] Telemetry dashboards live.
- [ ] Alerts configured.
- [ ] Support runbook updated.
- [ ] QA matrix passing in CI.
- [ ] Load test baseline executed.
- [ ] Mobile smoke tests passed.
- [ ] Accessibility smoke tests passed.
- [ ] Localization review completed.

## Backend Integration Test Matrix

- [ ] Create assessment with valid payload.
- [ ] Reject assessment when chapter belongs to another course.
- [ ] Update assessment title and propagate to activity name.
- [ ] Update assessment policy.
- [ ] Read assessment by UUID.
- [ ] Read assessment by activity UUID.
- [ ] Fail read for unauthorized users.
- [ ] Add assessment item.
- [ ] Update assessment item.
- [ ] Reorder assessment items.
- [ ] Delete assessment item.
- [ ] Read readiness for empty assessment.
- [ ] Read readiness for invalid item body.
- [ ] Publish valid assessment.
- [ ] Reject publish when readiness fails.
- [ ] Schedule with valid future date.
- [ ] Reject schedule with past date.
- [ ] Archive assessment.
- [ ] Start first draft submission.
- [ ] Reuse existing draft when one exists.
- [ ] Save draft answers.
- [ ] Increment version on save.
- [ ] Reject save with stale If-Match.
- [ ] Submit with payload and version.
- [ ] Submit existing draft without payload.
- [ ] Reject submit when access is denied.
- [ ] Create resubmission draft from returned submission.
- [ ] Reject resubmission from non-returned submission.
- [ ] Apply late penalty according to policy.
- [ ] Waive late penalty when override applies.
- [ ] Enforce max attempts.
- [ ] Override max attempts when student override applies.
- [ ] Hide published grades correctly for batch-release activities before publish.
- [ ] Reveal grades after bulk publish.
- [ ] Save teacher grade with valid transition.
- [ ] Reject invalid teacher transition.
- [ ] Enforce teacher grading If-Match.
- [ ] Persist grading entry on grade save.
- [ ] Persist grading entry publish timestamp on publish.
- [ ] Recalculate activity progress on grade save.
- [ ] Recalculate course progress on grade save.
- [ ] Batch grade multiple submissions.
- [ ] Report per-submission batch failures.
- [ ] Extend deadlines through bulk action.
- [ ] Export grading CSV.
- [ ] Resolve submission stats correctly.
- [ ] Resolve submission list pagination correctly.
- [ ] Resolve search and sort correctly.
- [ ] Validate file upload answers.
- [ ] Reject wrong MIME type.
- [ ] Reject unfinalized upload.
- [ ] Grade canonical choice items deterministically.
- [ ] Grade canonical code items deterministically.
- [ ] Mark manual-review items correctly.

## Frontend Test Matrix

- [ ] `useAssessment` builds studio VM correctly.
- [ ] `useAssessment` builds attempt VM from authoritative payload.
- [ ] `useAssessment` handles unsupported kinds safely.
- [ ] `useAssessmentSubmission` loads draft and submissions.
- [ ] `useAssessmentSubmission` saves draft with If-Match.
- [ ] `useAssessmentSubmission` handles 409 conflict.
- [ ] `useAssessmentSubmission` handles submit success.
- [ ] `useAssessmentSubmission` handles submit failure.
- [ ] local persistence hook restores data.
- [ ] local persistence hook purges expired data.
- [ ] action bar renders save states correctly.
- [ ] action bar renders returned state correctly.
- [ ] studio workspace surfaces readiness issues.
- [ ] studio workspace schedules publication.
- [ ] studio workspace archives assessment.
- [ ] native item studio creates item.
- [ ] native item studio updates item.
- [ ] native item studio deletes item.
- [ ] exam attempt content registers shell controls.
- [ ] exam attempt content shows progress and timer.
- [ ] exam attempt content recovers answers.
- [ ] quiz canonical shell renders once implemented.
- [ ] review workspace filters submissions.
- [ ] review workspace selection remains stable on refresh.
- [ ] grade form reflects save states.
- [ ] submission inspector renders kind-specific review detail.
- [ ] gradebook command center renders cell states accurately.
- [ ] localization keys exist for assessment status and error messages.
- [ ] accessibility checks pass for core shell components.

## End-To-End Test Matrix

- [ ] Teacher creates assignment and publishes it.
- [ ] Student starts assignment and saves draft.
- [ ] Student submits assignment.
- [ ] Teacher grades assignment and publishes grade.
- [ ] Student sees published result.
- [ ] Teacher creates exam with timer and anti-cheat.
- [ ] Student starts exam and sees countdown.
- [ ] Student refreshes exam and recovers draft.
- [ ] Student submits exam.
- [ ] Teacher reviews and publishes exam grade.
- [ ] Student sees hidden grade before bulk publish when policy is batch.
- [ ] Teacher bulk publishes grades.
- [ ] Student sees grade after bulk publish.
- [ ] Teacher returns work for revision.
- [ ] Student resubmits returned work.
- [ ] Teacher compares revision and republishes.
- [ ] Teacher grants deadline extension to a student.
- [ ] Extended student sees new due date.
- [ ] Non-extended student does not.
- [ ] Teacher exports submissions CSV.
- [ ] Teacher uses gradebook to jump to review.
- [ ] Mobile attempt flow completes for supported mobile-safe kinds.
- [ ] Multi-tab save conflict is surfaced clearly.
- [ ] Slow-network submit path recovers correctly.

## Migration Validation Checklist

- [ ] Inventory all legacy assessment-related endpoints.
- [ ] Inventory all legacy assessment-related tables.
- [ ] Inventory all compatibility types in frontend.
- [ ] Instrument legacy usage.
- [ ] Confirm whether any route still dual-writes.
- [ ] Build backfill plan for any legacy data that must survive.
- [ ] Validate canonical and legacy counts match where expected.
- [ ] Validate canonical and legacy score calculations match where expected.
- [ ] Validate canonical and legacy timestamps are coherent.
- [ ] Validate analytics parity for migrated courses.
- [ ] Validate gradebook parity for migrated courses.
- [ ] Dry-run route cutover in staging.
- [ ] Run rollback drill for route cutover.
- [ ] Delete dead compatibility code only after parity is proven.

## Open Decisions Requiring Explicit Ownership

- Decide whether quiz is fully migrated in the immediate next milestone.
- Decide whether forms remain an item capability or become a first-class kind.
- Decide whether code challenge scoring should prioritize best submission, latest submission, or visible-test performance for interim feedback.
- Decide whether returned-to-published recalls are allowed for all kinds or only specific kinds.
- Decide whether certain assessment kinds are explicitly unsupported on mobile.
- Decide whether per-assessment access policies belong in policy, settings, or a new access model.
- Decide what level of anti-cheat evidence is teacher-visible.
- Decide whether plagiarism checks block publish, add review warnings, or stay informational only.

## Final Recommendation

- Do not treat the assessment system as a set of unrelated bug fixes.
- Treat it as a domain convergence program.
- The backend already provides a strong canonical center of gravity.
- The frontend should now be forced to converge on that center.
- The highest-risk near-term issue is not abstract architecture.
- The highest-risk near-term issue is presenting supported canonical routes for kinds that are still placeholders.
- Fix that immediately.
- Then converge surface projections and policy normalization.
- Then complete teacher review and student result clarity.
- Then remove legacy paths under flags and parity checks.

## Domain Invariants And Guardrails

### Assessment And Activity Invariants

- One gradeable activity should map to one canonical assessment row.
- Non-gradeable activities should not accidentally project into assessments.
- An assessment should never point at an activity from a different course than its chapter.
- Assessment UUIDs must remain stable forever.
- Activity UUIDs must remain stable forever.
- Assessment kind should be immutable once submissions exist unless a migration tool explicitly handles conversion.
- Assessment lifecycle transitions must remain explicit and auditable.
- Assessment lifecycle should be derivable from authoritative fields, not inferred ad hoc in the client.
- Activity publication booleans should never contradict assessment lifecycle.
- Any activity fields duplicated from assessment lifecycle must be treated as synchronized cache or eventually removed.

### Item Invariants

- Item UUIDs must be stable across reorders.
- Item UUIDs must survive title edits.
- Item UUIDs must survive prompt edits.
- Item UUIDs must survive score edits.
- Item order must be deterministic.
- Item order must not become sparse after delete unless intentionally normalized.
- Item bodies must validate against a discriminated union.
- Item answers must validate against a discriminated union.
- Item kind in answer must match item kind in authoring definition.
- Item max score must never be negative.
- Item max score should always be explicitly stored even when defaulting to zero.
- Unsupported item-kind combinations must be rejected by the API.
- Readiness rules must validate structural integrity of every item kind.

### Policy Invariants

- Policy must exist for every canonical assessment intended for grading.
- Policy must have one authoritative representation for attempts, time limits, late rules, release rules, and completion rules.
- Effective policy must be resolvable for a specific student without client-side reconstruction.
- Student override resolution must be deterministic.
- Student override precedence must be documented.
- Due date precedence must be documented.
- Late-penalty waiver precedence must be documented.
- Time-limit units must be consistent across API and UI.
- Max-attempt semantics must be consistent across API and UI.
- Grade-release mode must be consistent across API and UI.
- Completion-rule semantics must be consistent across API and UI.

### Submission Invariants

- A student should have at most one active DRAFT per assessment runtime context unless a deliberate multi-draft model is introduced.
- Submission UUIDs must remain stable forever.
- Submission version must increment on every material student mutation.
- Submission version must increment on every material teacher mutation.
- Submission status changes must follow an explicit state machine.
- Submission status must not be inferred from timestamps alone.
- Submission started timestamp should come from the server, not the client.
- Submission submitted timestamp should come from the server, not the client.
- Submission graded timestamp should come from the server, not the client.
- Submission metadata must be validated before persistence.
- Submission answers must not be accepted if they refer to nonexistent items.
- Submission answers must not be accepted if they contain mismatched item kinds.
- Submission file references must not be accepted if they do not belong to the current user.

### Grading Invariants

- GradingEntry must remain append-only.
- Submission final_score is a read cache, not the audit source of truth.
- Grading version must be preserved with each ledger entry.
- Published visibility must be derivable from grade-release mode and ledger state.
- Teachers must not be able to move a submission into an invalid status transition.
- Teacher edits must be guarded by optimistic concurrency where the UI supports collaborative risk.
- Manual-review items must remain marked as such until actually resolved.
- Rubric or item feedback snapshots should be persisted with the grading ledger when used.
- Penalties must be traceable separately from raw scores.
- Student-visible score must always be explainable from raw score, penalty, and release state.

### Progress Invariants

- ActivityProgress must be recalculated from canonical submission and grading data.
- CourseProgress must be recalculated from canonical activity progress data.
- Teacher-action-required must align with real grading needs.
- Returned status must not be flattened away in progress projections.
- Gradebook cells must be explainable from progress and submission history.

### Access And Security Invariants

- Read permissions for assessment authoring must be enforced server-side.
- Start permissions for student attempts must be enforced server-side.
- Save-draft permissions must be enforced server-side.
- Submit permissions must be enforced server-side.
- Review permissions must be enforced server-side.
- Grade permissions must be enforced server-side.
- Bulk-action permissions must be enforced server-side.
- Override-management permissions must be enforced server-side.
- Student access exceptions must not bypass audit logging.
- Support tooling must respect privilege boundaries.

### Observability Invariants

- Every start action should be traceable.
- Every save-draft action should be traceable.
- Every submit action should be traceable.
- Every grading mutation should be traceable.
- Every grade publish action should be traceable.
- Every return-for-revision action should be traceable.
- Every lifecycle transition should be traceable.
- Every override mutation should be traceable.
- Every bulk action should be traceable.
- Every worker retry for assessment tasks should be traceable.

### Product Invariants

- A supported assessment kind must have complete routes and UI modules for its required surfaces.
- A canonical route must not land on placeholder content for a supported feature.
- A teacher must always see why publishing is blocked.
- A student must always see why submission is blocked.
- A student must always see whether a grade is hidden or visible and why.
- A teacher must always see whether a score is graded or published and why.
- A returned submission must preserve revision context.
- A high-stakes timed assessment must never rely on a purely optimistic client-side timer.

## Detailed Backend Ticket Inventory

### Backend Foundations

- [ ] BE-001 Define one canonical assessment capability descriptor schema.
- [ ] BE-002 Expose capability descriptor from assessment detail APIs.
- [ ] BE-003 Version the capability descriptor schema.
- [ ] BE-004 Mark deprecated legacy assessment endpoints in OpenAPI.
- [ ] BE-005 Add canonical attempt projection builder.
- [ ] BE-006 Add canonical review projection builder.
- [ ] BE-007 Add canonical student results projection builder.
- [ ] BE-008 Add capability reason codes for denied actions.
- [ ] BE-009 Add shared serializer for effective policy.
- [ ] BE-010 Add shared serializer for release state.
- [ ] BE-011 Add shared serializer for override summary.
- [ ] BE-012 Add shared serializer for submission lineage.
- [ ] BE-013 Add shared serializer for audit summaries.
- [ ] BE-014 Add consistent pagination envelope for review APIs.
- [ ] BE-015 Add consistent filtering vocabulary across review APIs.
- [ ] BE-016 Add consistent sort vocabulary across review APIs.
- [ ] BE-017 Add structured API error codes for assessment mutations.
- [ ] BE-018 Add structured API error codes for policy violations.
- [ ] BE-019 Add structured API error codes for access denials.
- [ ] BE-020 Add structured API error codes for concurrency conflicts.

### Assessment Authoring

- [ ] BE-021 Enforce one canonical assessment row per gradeable activity.
- [ ] BE-022 Reject invalid activity-to-assessment projections.
- [ ] BE-023 Add server validation for unsupported kind changes after submissions exist.
- [ ] BE-024 Add assessment duplication service.
- [ ] BE-025 Add assessment export service.
- [ ] BE-026 Add assessment import validation service.
- [ ] BE-027 Expand readiness code taxonomy.
- [ ] BE-028 Add readiness validation for missing titles.
- [ ] BE-029 Add readiness validation for empty prompts.
- [ ] BE-030 Add readiness validation for empty answer options.
- [ ] BE-031 Add readiness validation for duplicate option IDs.
- [ ] BE-032 Add readiness validation for invalid true-false choice shapes.
- [ ] BE-033 Add readiness validation for empty matching pairs.
- [ ] BE-034 Add readiness validation for duplicate matching values.
- [ ] BE-035 Add readiness validation for invalid form field IDs.
- [ ] BE-036 Add readiness validation for duplicate form field IDs.
- [ ] BE-037 Add readiness validation for invalid file constraints.
- [ ] BE-038 Add readiness validation for missing code test cases.
- [ ] BE-039 Add readiness validation for invalid code test weights.
- [ ] BE-040 Add readiness validation for invalid item max scores.
- [ ] BE-041 Add readiness validation for kind-specific forbidden items.
- [ ] BE-042 Add readiness validation for invalid schedule and due-date combinations.
- [ ] BE-043 Add readiness validation for invalid time-limit and item-count combinations if product rules require it.
- [ ] BE-044 Add lifecycle audit events.
- [ ] BE-045 Add duplication audit events.
- [ ] BE-046 Add archive audit events.
- [ ] BE-047 Add import audit events.
- [ ] BE-048 Add export audit events.

### Policy And Overrides

- [ ] BE-049 Inventory all fields currently stored in settings_json.
- [ ] BE-050 Classify each settings_json field as policy, kind extension, item data, or derived data.
- [ ] BE-051 Normalize due date naming across APIs.
- [ ] BE-052 Normalize max attempt naming across APIs.
- [ ] BE-053 Normalize time limit naming and units across APIs.
- [ ] BE-054 Normalize grade release mode exposure across APIs.
- [ ] BE-055 Normalize completion rule exposure across APIs.
- [ ] BE-056 Normalize anti-cheat policy exposure across APIs.
- [ ] BE-057 Normalize whitelist access policy exposure across APIs.
- [ ] BE-058 Add one effective-policy resolver.
- [ ] BE-059 Ensure start flow uses effective-policy resolver.
- [ ] BE-060 Ensure save-draft flow uses effective-policy resolver.
- [ ] BE-061 Ensure submit flow uses effective-policy resolver.
- [ ] BE-062 Ensure review flow exposes effective policy context.
- [ ] BE-063 Add override CRUD endpoints if not already present elsewhere.
- [ ] BE-064 Add override audit events.
- [ ] BE-065 Add override expiration handling.
- [ ] BE-066 Add override conflict rules if multiple override mutations race.
- [ ] BE-067 Add validation for expired overrides.
- [ ] BE-068 Add validation for nonsensical override combinations.
- [ ] BE-069 Add support query to inspect effective policy for one student.
- [ ] BE-070 Add test fixtures for complex override scenarios.

### Student Attempt Runtime

- [ ] BE-071 Add canonical start/resume summary endpoint.
- [ ] BE-072 Return whether a reusable draft exists.
- [ ] BE-073 Return whether max attempts has been reached.
- [ ] BE-074 Return whether returned submission can spawn resubmission draft.
- [ ] BE-075 Return whether assessment is not yet open.
- [ ] BE-076 Return whether assessment is closed.
- [ ] BE-077 Return whether assessment is archived.
- [ ] BE-078 Return effective due date in start summary.
- [ ] BE-079 Return effective time limit in start summary.
- [ ] BE-080 Return access denial reason codes in start summary.
- [ ] BE-081 Add idempotency for submit endpoint where needed.
- [ ] BE-082 Add better submit conflict payloads.
- [ ] BE-083 Add submit audit events.
- [ ] BE-084 Add resubmit audit events.
- [ ] BE-085 Add draft-save audit events.
- [ ] BE-086 Add lineage link from returned submission to new draft.
- [ ] BE-087 Add prior-submission list to results and review projections.
- [ ] BE-088 Add revision diff metadata generation for structured answers.
- [ ] BE-089 Add revision diff metadata generation for text answers.
- [ ] BE-090 Add reconciliation helper for local-versus-server draft merges if server-assisted merge becomes desirable.

### File Upload And Media Safety

- [ ] BE-091 Add clearer file constraint error codes.
- [ ] BE-092 Add orphaned upload cleanup job.
- [ ] BE-093 Add upload reference audit events on submission.
- [ ] BE-094 Add support endpoint to inspect upload validation failures.
- [ ] BE-095 Add optional virus-scan integration hook.
- [ ] BE-096 Add optional media-processing failure telemetry.
- [ ] BE-097 Add limits dashboard for upload errors and storage pressure.
- [ ] BE-098 Add retry-safe upload attach semantics.

### Code Execution And Auto-Grading

- [ ] BE-099 Make canonical code item grading the preferred path.
- [ ] BE-100 Reduce reliance on legacy fallback grading paths over time.
- [ ] BE-101 Version code-grading strategy explicitly.
- [ ] BE-102 Persist which visible tests were shown to the student.
- [ ] BE-103 Persist which hidden tests influenced final score.
- [ ] BE-104 Emit code-run telemetry with latency and failure reasons.
- [ ] BE-105 Add judge backpressure metrics.
- [ ] BE-106 Add timeout classification for code runs.
- [ ] BE-107 Add memory-limit classification for code runs.
- [ ] BE-108 Add compile-error classification for code runs.
- [ ] BE-109 Add flaky-run detection metrics if external runner instability appears.
- [ ] BE-110 Add plagiarism-check result model to results projection once operational.
- [ ] BE-111 Define whether plagiarism checks are blocking, advisory, or review-only.

### Teacher Review And Grading

- [ ] BE-112 Add review projection that includes release state.
- [ ] BE-113 Add review projection that includes override context.
- [ ] BE-114 Add review projection that includes late-penalty details.
- [ ] BE-115 Add review projection that includes prior attempts.
- [ ] BE-116 Add review projection that includes revision lineage.
- [ ] BE-117 Add review projection that includes anti-cheat summary.
- [ ] BE-118 Add review projection that includes rubric snapshot if present.
- [ ] BE-119 Add queue filters for overridden submissions.
- [ ] BE-120 Add queue filters for violation-flagged submissions.
- [ ] BE-121 Add queue filters for returned submissions.
- [ ] BE-122 Add queue filters for hidden-versus-published grades.
- [ ] BE-123 Add queue sort by grading latency.
- [ ] BE-124 Add queue sort by lateness severity if useful.
- [ ] BE-125 Add review diff projection for text-based revisions.
- [ ] BE-126 Add review diff projection for structured answer revisions.
- [ ] BE-127 Add rubric criterion structures to grading payloads.
- [ ] BE-128 Add reusable rubric comment libraries if product wants them server-side.
- [ ] BE-129 Add support for item-level rubric criterion scoring.
- [ ] BE-130 Add explicit state transition reason fields in grading events.
- [ ] BE-131 Add grade mutation audit diff snapshots.
- [ ] BE-132 Add immutable actor identity to grade mutation events.
- [ ] BE-133 Add explicit publish timestamp in review projection.
- [ ] BE-134 Add explicit hidden-grade reason in review projection.
- [ ] BE-135 Add support endpoint for grade ledger reconciliation.
- [ ] BE-136 Add queue count summary endpoints with release-state breakdown.

### Gradebook And Analytics

- [ ] BE-137 Document gradebook projection algorithm in code comments or docs.
- [ ] BE-138 Add snapshot tests around gradebook projections.
- [ ] BE-139 Add release-aware gradebook state markers.
- [ ] BE-140 Add returned-aware gradebook state markers.
- [ ] BE-141 Add item-level analytics queries.
- [ ] BE-142 Add omission-rate metrics per item.
- [ ] BE-143 Add correctness-rate metrics per item.
- [ ] BE-144 Add manual-review-rate metrics per item.
- [ ] BE-145 Add average-score metrics per item.
- [ ] BE-146 Add attempt-distribution metrics per assessment.
- [ ] BE-147 Add submit-timing histogram metrics per assessment.
- [ ] BE-148 Add grading-latency metrics per assessment.
- [ ] BE-149 Add teacher backlog metrics by course and activity.
- [ ] BE-150 Add student-risk inputs driven by assessment outcomes.
- [ ] BE-151 Add analytics export endpoints.
- [ ] BE-152 Add analytics parity tests against sampled fixture data.

### Notifications, Audits, And Support

- [ ] BE-153 Define assessment notification event taxonomy.
- [ ] BE-154 Emit event for assessment publication.
- [ ] BE-155 Emit event for assessment scheduling.
- [ ] BE-156 Emit event for upcoming due reminders.
- [ ] BE-157 Emit event for submission received.
- [ ] BE-158 Emit event for submission returned.
- [ ] BE-159 Emit event for grade published.
- [ ] BE-160 Emit event for override granted.
- [ ] BE-161 Add deduplication keys for notification events.
- [ ] BE-162 Add support diagnostics endpoint for one submission summary.
- [ ] BE-163 Add support diagnostics endpoint for one assessment summary.
- [ ] BE-164 Add support diagnostics endpoint for one student effective policy summary.
- [ ] BE-165 Add support diagnostics endpoint for one gradebook cell explanation.
- [ ] BE-166 Add audit search filters by actor, course, assessment, submission, and event type.
- [ ] BE-167 Add export for audit trails during incident response.

### Observability And Operations

- [ ] BE-168 Add metrics for start-attempt success and failure counts.
- [ ] BE-169 Add metrics for save-draft latency and failure counts.
- [ ] BE-170 Add metrics for submit latency and failure counts.
- [ ] BE-171 Add metrics for review-queue latency.
- [ ] BE-172 Add metrics for grade-save latency.
- [ ] BE-173 Add metrics for grade-publish latency.
- [ ] BE-174 Add metrics for conflict frequency.
- [ ] BE-175 Add metrics for bulk-action failures.
- [ ] BE-176 Add metrics for upload validation failures.
- [ ] BE-177 Add metrics for code-run failures.
- [ ] BE-178 Add structured log context for assessment UUID.
- [ ] BE-179 Add structured log context for submission UUID.
- [ ] BE-180 Add structured log context for policy UUID.
- [ ] BE-181 Add tracing spans across submit pipeline.
- [ ] BE-182 Add tracing spans across grade-save pipeline.
- [ ] BE-183 Add alert for elevated submit failure ratio.
- [ ] BE-184 Add alert for elevated grading failure ratio.
- [ ] BE-185 Add alert for prolonged code-run queue backlog.
- [ ] BE-186 Add alert for stale bulk actions.

### Migration And Deprecation

- [ ] BE-187 Inventory all legacy quiz writes.
- [ ] BE-188 Inventory all legacy quiz reads.
- [ ] BE-189 Inventory all fallback grading paths.
- [ ] BE-190 Add legacy usage metrics by route.
- [ ] BE-191 Build canonical parity report for quiz histories.
- [ ] BE-192 Build canonical parity report for gradebook values.
- [ ] BE-193 Build canonical parity report for analytics values.
- [ ] BE-194 Add dry-run backfill command for legacy quiz attempts.
- [ ] BE-195 Add post-backfill verification command.
- [ ] BE-196 Add route-level feature flags for cutover.
- [ ] BE-197 Add route-level kill switch for rollback.
- [ ] BE-198 Mark removal date for each legacy adapter.
- [ ] BE-199 Delete dead fallback branches once parity is proven.
- [ ] BE-200 Update migration documentation after each deprecation milestone.

## Failure-Mode Handling Matrix

### Authoring Failures

- If item body validation fails, return precise field-level error codes.
- If policy validation fails, return policy-specific error codes.
- If readiness fails, distinguish blockers from advisories.
- If scheduling fails because the timestamp is in the past, return explicit schedule error.
- If publishing fails because policy is missing, return explicit policy-missing issue.
- If publishing fails because items are empty, return explicit assessment-empty issue.
- If publishing fails because item kinds are forbidden, return explicit kind-forbidden issue.

### Student Runtime Failures

- If start fails because access is denied, explain why.
- If start fails because the assessment is not open, explain when it opens.
- If start fails because max attempts is reached, explain current and max attempts.
- If save fails because of stale version, return latest submission payload.
- If save fails because of connectivity, preserve local work.
- If submit fails because of stale version, provide a merge-safe recovery path.
- If submit fails because uploads are not finalized, identify the offending upload.
- If submit fails because time expired, preserve audit and user-visible reason.
- If submit auto-triggers due to violation threshold, preserve audit and user-visible reason.
- If submit fails after server received the request but before client saw success, support idempotent recovery.

### Review Failures

- If teacher save fails because another grader changed the submission, return current version and conflict reason.
- If bulk grade partially fails, return per-row errors and keep successful rows committed.
- If publish grades partially fails, return per-row errors and an overall summary.
- If review detail load fails, preserve current queue context and allow retry.
- If kind-specific review detail fails, fall back to generic rendering with warning and telemetry.

### Operational Failures

- If code runner backlog spikes, degrade gracefully with clear student messaging.
- If notification worker fails, do not roll back core assessment state.
- If audit write fails, alert but do not silently swallow systemic loss.
- If analytics backfill fails, keep product flows working and mark dashboards stale.
- If legacy parity check fails during migration, halt cutover.

## Detailed Frontend Ticket Inventory

### Shared Shells And View Models

- [ ] FE-001 Replace placeholder attempt permission defaults in shared view-model construction.
- [ ] FE-002 Consume authoritative capability payloads in `useAssessment`.
- [ ] FE-003 Split studio, attempt, review, and result projections cleanly in domain types.
- [ ] FE-004 Add typed disabled-reason codes to shell state.
- [ ] FE-005 Add typed release-state variants to shell state.
- [ ] FE-006 Add typed override-summary variants to shell state.
- [ ] FE-007 Move shell-specific label formatting into shared domain helpers.
- [ ] FE-008 Remove shell assumptions that every attempt is editable.
- [ ] FE-009 Remove shell assumptions that every attempt is submittable.
- [ ] FE-010 Remove shell assumptions that release state starts hidden.
- [ ] FE-011 Add shared helper for kind badges and icons from capability descriptors.
- [ ] FE-012 Add shared helper for lifecycle badge variants.
- [ ] FE-013 Add shared helper for release-state badge variants.
- [ ] FE-014 Add shared helper for teacher-action-required badge variants.
- [ ] FE-015 Add stronger type coverage for returned submissions and resubmission flows.

### Query And Mutation Layer Cleanup

- [ ] FE-016 Create a canonical assessment query module for new projection endpoints.
- [ ] FE-017 Co-locate query options with assessment surface models.
- [ ] FE-018 Reduce dependence on compatibility exports from old grading types.
- [ ] FE-019 Normalize invalidation after draft save.
- [ ] FE-020 Normalize invalidation after submit.
- [ ] FE-021 Normalize invalidation after resubmit.
- [ ] FE-022 Normalize invalidation after grade save.
- [ ] FE-023 Normalize invalidation after grade publish.
- [ ] FE-024 Normalize invalidation after return for revision.
- [ ] FE-025 Normalize invalidation after bulk publish.
- [ ] FE-026 Normalize invalidation after deadline-extension actions.
- [ ] FE-027 Add optimistic UI only where rollback behavior is fully defined.
- [ ] FE-028 Avoid duplicate fetches between shell wrappers and kind modules.
- [ ] FE-029 Add dedicated query keys for assessment results detail.
- [ ] FE-030 Add dedicated query keys for effective policy projections.

### Studio Shell And Workspace

- [ ] FE-031 Show authoring surface title and breadcrumbs consistently for all kinds.
- [ ] FE-032 Show readiness issues grouped by assessment-level and item-level scope.
- [ ] FE-033 Make readiness issue list clickable to the relevant item editor.
- [ ] FE-034 Add separate presentation for blockers versus advisories.
- [ ] FE-035 Show lifecycle actions with clearer consequences.
- [ ] FE-036 Show schedule-time timezone hints.
- [ ] FE-037 Show archive consequences before confirm.
- [ ] FE-038 Add “unsaved changes” protection when leaving authoring.
- [ ] FE-039 Add authoring auto-save where appropriate if product wants it.
- [ ] FE-040 Add draft-state badge for studio edits if server support is introduced.
- [ ] FE-041 Add item duplication control.
- [ ] FE-042 Add bulk delete or batch reorder controls when item counts get large.
- [ ] FE-043 Add drag-and-drop reorder for item lists if supported by the design system.
- [ ] FE-044 Ensure authoring outline scroll position is preserved on refreshes.
- [ ] FE-045 Ensure selected item state survives optimistic updates and reorder operations.
- [ ] FE-046 Add empty-state guidance when no items exist.
- [ ] FE-047 Add contextual hints when only certain item kinds are allowed.
- [ ] FE-048 Add publish-ready preview banner once readiness passes.
- [ ] FE-049 Add kind-specific outline nouns consistently across kinds.
- [ ] FE-050 Add compact summary of total points and grading mode in the outline.
- [ ] FE-051 Add duplicate-assessment action if backend supports it.
- [ ] FE-052 Add import-assessment action if backend supports it.
- [ ] FE-053 Add export-assessment action if backend supports it.
- [ ] FE-054 Add inline policy summary rail that stays synced with the canonical policy payload.
- [ ] FE-055 Remove legacy authoring dead ends that bypass canonical item editing.

### Item Authoring Components

- [ ] FE-056 Improve choice item editor affordances for single versus multiple choice.
- [ ] FE-057 Improve true-false preset creation flow.
- [ ] FE-058 Add duplicate-choice option action.
- [ ] FE-059 Add better validation around empty option text.
- [ ] FE-060 Add better validation around no correct answer selected.
- [ ] FE-061 Add better validation around invalid multiple-answer configurations.
- [ ] FE-062 Improve open-text rubric editing affordances.
- [ ] FE-063 Add word-count guidance UI for open-text items.
- [ ] FE-064 Improve file-upload constraints editor with clearer hints.
- [ ] FE-065 Add MIME helper presets for common file types.
- [ ] FE-066 Add size helper presets for common assignment workflows.
- [ ] FE-067 Add form-field duplication and reorder controls.
- [ ] FE-068 Add form-field type-specific validation hints.
- [ ] FE-069 Add better matching-pair editing ergonomics.
- [ ] FE-070 Add code-test-case table with visible versus hidden test labels.
- [ ] FE-071 Add code starter-template presets by language.
- [ ] FE-072 Add item preview pane for each supported item kind.
- [ ] FE-073 Add consistent max-score editing control for all item types.
- [ ] FE-074 Add keyboard shortcuts for adding, duplicating, and deleting items safely.
- [ ] FE-075 Add analytics-friendly item labels if product wants stable teacher labels distinct from prompt text.

### Attempt Shell And Student Flow

- [ ] FE-076 Build a canonical start panel component for all kinds.
- [ ] FE-077 Build a canonical blocked-access component for all kinds.
- [ ] FE-078 Build a canonical closed-assessment component for all kinds.
- [ ] FE-079 Build a canonical returned-for-revision banner for all kinds.
- [ ] FE-080 Build a canonical hidden-grade banner for all kinds.
- [ ] FE-081 Build a canonical local-recovery dialog for all kinds.
- [ ] FE-082 Build a canonical conflict-resolution dialog for all kinds.
- [ ] FE-083 Show effective due date, attempts, and time limit from authoritative payloads.
- [ ] FE-084 Show effective override badges when present.
- [ ] FE-085 Show release-state explanations when results are not yet visible.
- [ ] FE-086 Show submission lineage when resubmitting returned work.
- [ ] FE-087 Show draft-age indicators if the product wants staleness hints.
- [ ] FE-088 Add “last server save” timestamp in attempt UX.
- [ ] FE-089 Add “pending local changes” indicator that is distinct from “saved to server.”
- [ ] FE-090 Add offline banner and reconnect messaging.
- [ ] FE-091 Add auto-save retry banner when background save fails.
- [ ] FE-092 Add clear retry affordance after transient save or submit failure.
- [ ] FE-093 Preserve local state through temporary query invalidations.
- [ ] FE-094 Clear local draft cache only after confirmed successful submit.
- [ ] FE-095 Support discard-local-draft action explicitly.
- [ ] FE-096 Support restore-server-version action explicitly.
- [ ] FE-097 Support compare-local-and-server-draft action if UX budget allows.
- [ ] FE-098 Ensure timer warnings work with screen readers.
- [ ] FE-099 Ensure focus mode does not break accessibility or keyboard flow.
- [ ] FE-100 Ensure fullscreen requirements degrade gracefully where unsupported.

### Quiz Attempt Completion

- [ ] FE-101 Replace quiz attempt passthrough with a real canonical attempt module.
- [ ] FE-102 Replace quiz author passthrough with a real canonical authoring module or remove from supported routes until ready.
- [ ] FE-103 Add quiz-specific attempt navigation if needed without forking shell conventions unnecessarily.
- [ ] FE-104 Ensure quiz uses canonical submission hook and projection payloads.
- [ ] FE-105 Ensure quiz renders item-level result feedback when released.
- [ ] FE-106 Ensure quiz review integrates with kind-specific detail where needed.
- [ ] FE-107 Ensure quiz supports the same save-state semantics as other kinds.
- [ ] FE-108 Ensure quiz supports hidden-grade and batch-release semantics.
- [ ] FE-109 Ensure quiz supports returned-for-revision only if product policy allows it.
- [ ] FE-110 Add quiz E2E path before declaring canonical quiz production-ready.

### Exam Attempt Improvements

- [ ] FE-111 Move remaining legacy exam navigation utilities fully under canonical module ownership.
- [ ] FE-112 Remove phase-marker legacy comments only after actual convergence is complete.
- [ ] FE-113 Ensure exam question ordering logic is deterministic and test-covered.
- [ ] FE-114 Ensure exam attempt intro screen uses authoritative policy and status data.
- [ ] FE-115 Ensure exam auto-submit messaging is explicit and non-alarming.
- [ ] FE-116 Ensure exam submit confirmation reflects unanswered count accurately.
- [ ] FE-117 Ensure exam recovery does not duplicate answers on repeated restore events.
- [ ] FE-118 Ensure exam mobile navigation remains usable for long assessments.
- [ ] FE-119 Ensure exam review detail renders answer correctness and manual-review needs clearly.
- [ ] FE-120 Ensure exam authoring converges on shared shell conventions.

### Assignment And General Item Attempt Improvements

- [ ] FE-121 Normalize assignment item rendering under the canonical attempt shell.
- [ ] FE-122 Ensure assignment items reuse shared answer-state helpers.
- [ ] FE-123 Ensure file-upload task state integrates with shell save-state accurately.
- [ ] FE-124 Ensure form answers serialize exactly once per item.
- [ ] FE-125 Ensure matching answers serialize deterministically.
- [ ] FE-126 Ensure open-text autosave does not thrash the network.
- [ ] FE-127 Ensure answer resets are explicit and recoverable.
- [ ] FE-128 Ensure progress summaries count answered items correctly for all item kinds.
- [ ] FE-129 Ensure returned assignment feedback is surfaced inline per item.
- [ ] FE-130 Ensure assignment resubmission uses revision-aware messaging.

### Review Workspace And Inspector

- [ ] FE-131 Add assessment-aware queue row badges for kind, release state, late status, and override status.
- [ ] FE-132 Add queue filter chips for overridden submissions.
- [ ] FE-133 Add queue filter chips for returned submissions.
- [ ] FE-134 Add queue filter chips for release-state distinctions.
- [ ] FE-135 Add queue filter chips for anti-cheat flags.
- [ ] FE-136 Add keyboard shortcut legend to review workspace.
- [ ] FE-137 Preserve selected submission while background refreshes occur.
- [ ] FE-138 Show stale-data warning when selected submission changes on the server.
- [ ] FE-139 Add prior-attempt history drawer.
- [ ] FE-140 Add revision diff UI.
- [ ] FE-141 Add item jump list in the inspector.
- [ ] FE-142 Add release-state summary panel in the inspector.
- [ ] FE-143 Add late-penalty explanation panel in the inspector.
- [ ] FE-144 Add override explanation panel in the inspector.
- [ ] FE-145 Add violation summary panel in the inspector.
- [ ] FE-146 Add audit summary panel in support/admin contexts.
- [ ] FE-147 Add rubric criterion editor if backend supports rubric detail payloads.
- [ ] FE-148 Add better empty-state handling when no submission matches current filters.
- [ ] FE-149 Add graceful fallback if kind-specific detail component fails to load.
- [ ] FE-150 Ensure batch actions clear or refresh selection appropriately.

### Grade Form And Release UX

- [ ] FE-151 Separate “save grade” and “publish grade” intents visually.
- [ ] FE-152 Show current release state directly in the grade form.
- [ ] FE-153 Show whether publishing now will make the grade student-visible immediately.
- [ ] FE-154 Show whether activity-level release mode is batch and requires separate bulk publish.
- [ ] FE-155 Add “return for revision” confirmation with clear copy.
- [ ] FE-156 Add unsaved item-feedback warning when navigating away.
- [ ] FE-157 Add stale-version warning for grading conflicts.
- [ ] FE-158 Add quick comments or reusable rubric snippets if product wants them.
- [ ] FE-159 Add per-item score totals that reconcile with overall score.
- [ ] FE-160 Add support for publishing many graded submissions with preview counts.

### Student Results And Feedback UI

- [ ] FE-161 Build a canonical results timeline component.
- [ ] FE-162 Build a canonical hidden-grade explanation component.
- [ ] FE-163 Build a canonical returned-feedback summary component.
- [ ] FE-164 Build a canonical rubric-feedback rendering component.
- [ ] FE-165 Build a canonical item-feedback rendering component.
- [ ] FE-166 Show score source and penalty explanation where relevant.
- [ ] FE-167 Show attempt history summary in results view.
- [ ] FE-168 Show compare-with-previous-attempt affordance if supported.
- [ ] FE-169 Ensure result view works consistently across kinds.
- [ ] FE-170 Ensure result view messaging stays aligned with release-state semantics.

### Gradebook And Analytics UI

- [ ] FE-171 Add cell legend for all gradebook states.
- [ ] FE-172 Add release-aware visual distinctions in gradebook.
- [ ] FE-173 Add returned-aware visual distinctions in gradebook.
- [ ] FE-174 Add direct drill-down from gradebook cell to review or history.
- [ ] FE-175 Add assessment analytics cards for item difficulty and grading backlog.
- [ ] FE-176 Add item heatmap or summary tables for weak items.
- [ ] FE-177 Add cohort timing insights for late submissions and rush submissions.
- [ ] FE-178 Add empty-state guidance for analytics with low volume data.
- [ ] FE-179 Add export affordances for analytics and backlog views.
- [ ] FE-180 Ensure analytics labels match canonical vocabulary.

### Accessibility, Localization, And Mobile

- [ ] FE-181 Audit every assessment shell component for focus order.
- [ ] FE-182 Add live-region announcements for save-state changes.
- [ ] FE-183 Add live-region announcements for timer thresholds.
- [ ] FE-184 Add live-region announcements for submit success and failure.
- [ ] FE-185 Remove hard-coded strings from assessment shells.
- [ ] FE-186 Normalize translations for status, release state, and policy explanations.
- [ ] FE-187 Review responsive layouts for attempt, review, and results surfaces.
- [ ] FE-188 Add reduced-motion friendly transitions where timers or warnings animate.
- [ ] FE-189 Ensure error banners are readable and non-jargony in all supported locales.
- [ ] FE-190 Ensure touch targets remain usable on smaller devices.

### Frontend Tooling And Test Harness

- [ ] FE-191 Add fixture builders for assessment projection payloads.
- [ ] FE-192 Add fixture builders for submission histories and release states.
- [ ] FE-193 Add network mocks for draft conflict scenarios.
- [ ] FE-194 Add network mocks for hidden-grade scenarios.
- [ ] FE-195 Add network mocks for returned revision scenarios.
- [ ] FE-196 Add component stories or equivalent visual fixtures for key shells.
- [ ] FE-197 Add screenshot baselines for major assessment states.
- [ ] FE-198 Add performance probes for long review queues.
- [ ] FE-199 Add a11y test helpers for assessment flows.
- [ ] FE-200 Remove dead compatibility imports once migrations land.

## Staging Signoff Scenario Inventory

### Authoring Signoff

- [ ] Create an assignment from scratch.
- [ ] Create an exam from scratch.
- [ ] Create a code challenge from scratch.
- [ ] Create a quiz from the canonical shell once implemented.
- [ ] Add at least one item of every supported item kind.
- [ ] Reorder items repeatedly and confirm order persistence.
- [ ] Duplicate items and confirm UUID regeneration rules are correct.
- [ ] Delete items and confirm readiness updates instantly.
- [ ] Save title and description changes.
- [ ] Save policy changes.
- [ ] Save lifecycle changes.
- [ ] Schedule publication for a future time.
- [ ] Publish immediately.
- [ ] Archive an assessment.
- [ ] Restore from scheduled to draft if allowed.
- [ ] Confirm invalid schedule timestamps are rejected clearly.
- [ ] Confirm readiness explains every blocker precisely.
- [ ] Confirm preview route works from authoring.
- [ ] Confirm authoring works in supported locales.
- [ ] Confirm authoring works on tablet-sized layouts.

### Student Attempt Signoff

- [ ] Start a fresh attempt with no prior submissions.
- [ ] Resume an existing draft.
- [ ] Confirm autosave moves state from unsaved to saved.
- [ ] Confirm local recovery dialog appears after refresh with unsynced work.
- [ ] Confirm conflict dialog appears after multi-tab edits.
- [ ] Confirm server version can be adopted after conflict.
- [ ] Confirm local version can be kept when appropriate.
- [ ] Confirm file uploads complete and validate.
- [ ] Confirm unfinished uploads block submit with clear messaging.
- [ ] Confirm code runs produce feedback.
- [ ] Confirm code-run failure messaging is clear.
- [ ] Confirm timer warnings appear.
- [ ] Confirm fullscreen gate works when enabled.
- [ ] Confirm violation threshold messaging works when anti-cheat is enabled.
- [ ] Confirm submit success transitions UI correctly.
- [ ] Confirm double-click submit does not create duplicate submissions.
- [ ] Confirm hidden-grade messaging appears when release mode requires it.
- [ ] Confirm returned-for-revision messaging appears when applicable.
- [ ] Confirm resubmission draft creation works.
- [ ] Confirm results timeline renders correctly after publish.
- [ ] Confirm mobile-safe attempt routes remain usable on small screens.
- [ ] Confirm screen-reader announcements occur for key state changes.

### Review Signoff

- [ ] Open the queue with many submissions.
- [ ] Filter to needs grading only.
- [ ] Filter to returned only.
- [ ] Filter to late only.
- [ ] Search by student name.
- [ ] Sort by submitted time.
- [ ] Sort by final score.
- [ ] Select a submission and navigate by keyboard.
- [ ] Inspect prior attempts.
- [ ] Inspect revision diffs.
- [ ] Save a grade without publishing.
- [ ] Publish a grade.
- [ ] Return a submission for revision.
- [ ] Handle a grading concurrency conflict.
- [ ] Batch grade multiple submissions.
- [ ] Bulk publish grades.
- [ ] Extend deadlines for selected students.
- [ ] Export grading CSV.
- [ ] Drill from gradebook to review.
- [ ] Confirm audit summaries are visible in support/admin contexts.

### Results, Gradebook, And Analytics Signoff

- [ ] Confirm student-visible results match teacher-published status.
- [ ] Confirm batch-release hidden states remain hidden before publish.
- [ ] Confirm gradebook cells match submission histories.
- [ ] Confirm returned work shows correct gradebook state.
- [ ] Confirm analytics totals match fixture expectations.
- [ ] Confirm item analytics render for supported item kinds.
- [ ] Confirm export files contain correct columns and values.
- [ ] Confirm override-adjusted due dates do not pollute unrelated students’ views.
- [ ] Confirm late penalties are reflected consistently in review, results, and analytics.
- [ ] Confirm release-state labels are consistent across all surfaces.

### Permission And Security Signoff

- [ ] Confirm unauthorized users cannot open authoring endpoints.
- [ ] Confirm unauthorized users cannot save drafts.
- [ ] Confirm unauthorized users cannot submit restricted assessments.
- [ ] Confirm unauthorized users cannot grade or publish.
- [ ] Confirm support tooling respects admin and support boundaries.
- [ ] Confirm whitelist-only assessments reject non-whitelisted students if that policy is enabled.
- [ ] Confirm override management is audited.
- [ ] Confirm file uploads cannot be hijacked across users.
- [ ] Confirm hidden grades are not exposed through the wrong endpoint.
- [ ] Confirm stale client assumptions cannot bypass backend checks.

## Launch-Day Runbook

### Before Enabling Flags

- [ ] Confirm database migrations are applied in staging and production-ready.
- [ ] Confirm parity reports are green.
- [ ] Confirm dashboards are populated.
- [ ] Confirm alerts are armed.
- [ ] Confirm rollback flags exist.
- [ ] Confirm support team has runbook access.
- [ ] Confirm QA final signoff is recorded.
- [ ] Confirm product owner signoff is recorded.
- [ ] Confirm design signoff is recorded.
- [ ] Confirm operations owner is assigned.

### During Initial Rollout

- [ ] Enable flags for internal users first.
- [ ] Verify authoring metrics.
- [ ] Verify draft-save metrics.
- [ ] Verify submit metrics.
- [ ] Verify grading metrics.
- [ ] Verify bulk publish metrics.
- [ ] Watch error logs continuously during the first rollout window.
- [ ] Watch support channels continuously during the first rollout window.
- [ ] Compare staging and production telemetry patterns.
- [ ] Halt rollout if critical route failure exceeds threshold.

### After Initial Rollout

- [ ] Review top errors after one hour.
- [ ] Review top errors after one day.
- [ ] Review grading backlog and hidden-grade incidents.
- [ ] Review draft conflict frequency.
- [ ] Review upload validation failures.
- [ ] Review code-run queue pressure.
- [ ] Review support tickets and classify them by root cause.
- [ ] Decide whether to widen rollout or hold.

## Product And Design Review Checklist

- [ ] The teacher can tell what kind of assessment they are editing.
- [ ] The teacher can tell whether it is publish-ready.
- [ ] The teacher can tell why it is not publish-ready.
- [ ] The teacher can tell whether students can currently access it.
- [ ] The student can tell whether they are starting fresh or resuming.
- [ ] The student can tell whether local work is only local or already saved to the server.
- [ ] The student can tell whether time limits and due dates are currently in force.
- [ ] The student can tell whether a grade is hidden and why.
- [ ] The teacher can tell whether a grade is merely saved or actually visible.
- [ ] The review queue communicates urgency and priority.
- [ ] The results page communicates next action when work is returned.
- [ ] Accessibility language is precise and non-punitive.
- [ ] Anti-cheat warnings are clear without being theatrical.
- [ ] Error messages explain what the user can do next.
- [ ] There are no unsupported routes that look supported.
- [ ] There are no duplicated control clusters that disagree with each other.
- [ ] Mobile layouts preserve the core task before secondary chrome.
- [ ] Long assessments remain navigable without cognitive overload.
- [ ] Revision history is understandable without support intervention.
- [ ] Grade release concepts are understandable without reading documentation.

## Legacy Deprecation Done Definition

- [ ] Legacy route usage is below the agreed threshold.
- [ ] Canonical route parity is proven in staging.
- [ ] Canonical route parity is sampled in production.
- [ ] Support has no unresolved critical incidents tied to the new route.
- [ ] Product has signed off on canonical UX completeness.
- [ ] QA has signed off on the canonical journey matrix.
- [ ] Compatibility types are no longer imported by new assessment surfaces.
- [ ] Fallback legacy grading paths are either removed or isolated behind explicit maintenance boundaries.
- [ ] Docs no longer describe the deprecated path as current.
- [ ] Rollback instructions remain available for one deprecation window after cutover.

## Success Metrics Dashboard Definition

- [ ] Track draft-save success rate.
- [ ] Track draft-save latency p50.
- [ ] Track draft-save latency p95.
- [ ] Track submit success rate.
- [ ] Track submit latency p50.
- [ ] Track submit latency p95.
- [ ] Track grading-save success rate.
- [ ] Track grading-save latency p95.
- [ ] Track grade-publish success rate.
- [ ] Track hidden-grade confusion tickets.
- [ ] Track returned-resubmission completion rate.
- [ ] Track review queue throughput by teacher.
- [ ] Track review backlog age.
- [ ] Track code-run queue latency.
- [ ] Track upload validation failure rate.
- [ ] Track draft conflict frequency.
- [ ] Track mobile attempt completion rate for supported kinds.
- [ ] Track accessibility regression count in CI.
- [ ] Track legacy route usage over time.
- [ ] Track parity-check failure counts during migration windows.

## Kind-Specific Acceptance Gates

### Assignment Acceptance Gate

- [ ] Assignment authoring uses canonical item studio only.
- [ ] Assignment authoring supports allowed item kinds without dead links.
- [ ] Assignment authoring shows readiness blockers precisely.
- [ ] Assignment preview reflects canonical attempt rendering.
- [ ] Assignment attempt uses canonical attempt shell.
- [ ] Assignment attempt supports draft save and recovery.
- [ ] Assignment attempt supports file uploads reliably.
- [ ] Assignment attempt supports open-text revisions reliably.
- [ ] Assignment review shows submitted work clearly.
- [ ] Assignment review supports item-level feedback.
- [ ] Assignment review supports return for revision.
- [ ] Assignment results show rubric and feedback clearly where applicable.
- [ ] Assignment gradebook cells align with review outcomes.
- [ ] Assignment analytics show grading backlog and completion outcomes.
- [ ] Assignment mobile layout is acceptable for supported assignment types.

### Exam Acceptance Gate

- [ ] Exam authoring uses canonical or intentionally supported exam-specific modules within the canonical shell.
- [ ] Exam authoring validates timer and anti-cheat policy combinations.
- [ ] Exam attempt intro screen reflects authoritative effective policy.
- [ ] Exam attempt supports timed progress and warnings.
- [ ] Exam attempt supports autosave and recovery.
- [ ] Exam attempt supports multi-question navigation without state loss.
- [ ] Exam attempt auto-submit paths are auditable and understandable.
- [ ] Exam attempt handles fullscreen requirements gracefully.
- [ ] Exam review renders question detail clearly.
- [ ] Exam review supports publish and return semantics correctly.
- [ ] Exam results messaging distinguishes hidden versus visible grades.
- [ ] Exam grade release behavior matches policy and ledger state.
- [ ] Exam analytics support timing and omission analysis.
- [ ] Exam support runbook includes timed-attempt incident handling.
- [ ] Exam load tests cover likely peak concurrency.

### Quiz Acceptance Gate

- [ ] Quiz has a real canonical authoring module or is explicitly excluded from the canonical authoring surface.
- [ ] Quiz has a real canonical attempt module or is explicitly excluded from the canonical attempt route.
- [ ] Quiz no longer relies on placeholder passthroughs in supported production paths.
- [ ] Quiz uses canonical submission storage as the source of truth.
- [ ] Quiz release-state behavior matches other kinds.
- [ ] Quiz review integrates with canonical grading and detail rendering.
- [ ] Quiz analytics derive from canonical submission history.
- [ ] Quiz legacy parity is proven before deprecation.
- [ ] Quiz migration has rollback instructions.
- [ ] Quiz end-to-end tests pass before canonical rollout.
- [ ] Quiz localization and accessibility are reviewed.
- [ ] Quiz mobile rendering is tested if mobile is supported.
- [ ] Quiz support docs describe canonical versus deprecated paths clearly.
- [ ] Quiz gradebook cells reconcile with canonical data.
- [ ] Quiz hidden-grade behavior is clear to students and teachers.

### Code Challenge Acceptance Gate

- [ ] Code challenge authoring supports canonical code items and test authoring.
- [ ] Code challenge authoring clearly distinguishes visible and hidden tests.
- [ ] Code challenge authoring validates language constraints and limits.
- [ ] Code challenge attempt supports run feedback separate from final grading.
- [ ] Code challenge attempt handles runner failures gracefully.
- [ ] Code challenge attempt stores and surfaces latest run state accurately.
- [ ] Code challenge submission pipeline is idempotent enough for retry-safe user experience.
- [ ] Code challenge review shows source, run summaries, and final grading clearly.
- [ ] Code challenge results explain why visible runs may differ from final score if hidden tests apply.
- [ ] Code challenge analytics capture runtime failures and difficulty indicators.
- [ ] Code challenge operations dashboards cover runner queue health.
- [ ] Code challenge support runbook covers judge outages and degraded mode.
- [ ] Code challenge plagiarism handling is defined as advisory or blocking.
- [ ] Code challenge mobile policy is explicit if mobile is unsupported.
- [ ] Code challenge load tests reflect real concurrency expectations.

## Data Integrity And Reconciliation Checklist

- [ ] Verify every assessment row points to a valid activity row.
- [ ] Verify every canonical assessment kind maps to an allowed activity type.
- [ ] Verify every assessment with submissions has a policy row.
- [ ] Verify every assessment item references a valid assessment row.
- [ ] Verify item order is unique within each assessment.
- [ ] Verify item UUIDs are unique globally.
- [ ] Verify every submission references a valid activity row.
- [ ] Verify every submission references a valid user row.
- [ ] Verify every non-draft submission has submitted_at populated.
- [ ] Verify every graded or published submission has graded_at populated.
- [ ] Verify every published submission has at least one grading ledger entry.
- [ ] Verify every returned submission has a teacher mutation trail.
- [ ] Verify every late submission has an explainable late-penalty state.
- [ ] Verify every override row references a valid policy and user.
- [ ] Verify every override row has consistent expiration semantics.
- [ ] Verify every activity progress row points to valid best/latest submissions when populated.
- [ ] Verify every gradebook cell can be reproduced from canonical progress and submissions.
- [ ] Verify analytics counts reconcile with submission ledger counts.
- [ ] Verify legacy parity samples before deleting any compatibility path.
- [ ] Verify sampled production records after rollout to detect silent drift.

## Support Incident Triage Prompts

### Student-Facing Incidents

- Did the student fail to start the assessment, fail to save, fail to submit, or fail to view results?
- What assessment UUID and activity UUID were involved?
- Which kind was involved?
- What was the submission UUID if one exists?
- Was the student on mobile or desktop?
- Was the student on a slow or unstable network?
- Was there a timer or anti-cheat policy enabled?
- Was the issue a single occurrence or reproducible?
- Did the student have an override?
- Was the assessment in draft, scheduled, published, or archived at the time?

### Teacher-Facing Incidents

- Did the teacher fail in authoring, publishing, review, grading, or grade release?
- Did the teacher see a concurrency conflict?
- Did a batch action partially fail?
- Did gradebook values disagree with review values?
- Did analytics values disagree with gradebook values?
- Was the teacher using a canonical or legacy route?
- Was the course recently migrated or flagged onto new flows?
- Is there an audit trail entry for the operation?
- Is there a bulk-action record for the operation?
- Is there a parity-check anomaly for the course?

### Operational Incidents

- Is the issue isolated to one assessment, one course, one kind, or all assessment traffic?
- Are submit failures elevated globally?
- Are draft-save failures elevated globally?
- Are code-run queues degraded?
- Are upload failures elevated?
- Are notification workers failing?
- Are audit events still flowing?
- Are feature flags in the expected state?
- Was there a recent deployment or migration?
- Should rollout be paused or rolled back immediately?

## Security And Privacy Checklist

- [ ] Student submissions are only accessible to the submitting student and authorized reviewers.
- [ ] Hidden grades are not exposed through teacher projection leaks into student endpoints.
- [ ] Upload references cannot be attached across users.
- [ ] Override management is restricted and audited.
- [ ] Review exports do not expose unnecessary personal data.
- [ ] Analytics exports respect viewer permissions.
- [ ] Support diagnostics are role-restricted.
- [ ] Timed assessments do not trust client clocks for authoritative timing.
- [ ] Anti-cheat event handling does not expose sensitive implementation details unnecessarily.
- [ ] Audit logs avoid leaking secrets or private student content outside authorized contexts.

## Endpoint Rationalization Checklist

### Authoring Endpoints

- [ ] Confirm `POST /assessments` remains the only canonical create endpoint for gradeable assessments.
- [ ] Confirm `GET /assessments/activity/{activity_uuid}` remains the canonical lookup for activity-bound assessment detail.
- [ ] Confirm `GET /assessments/{assessment_uuid}` remains canonical for direct assessment detail.
- [ ] Confirm `PATCH /assessments/{assessment_uuid}` remains canonical for assessment metadata updates.
- [ ] Confirm `POST /assessments/{assessment_uuid}/lifecycle` remains canonical for lifecycle transitions.
- [ ] Confirm `GET /assessments/{assessment_uuid}/readiness` remains canonical for publish readiness.
- [ ] Confirm item CRUD stays under the canonical assessment router.
- [ ] Remove or document any alternate authoring path that still writes equivalent data elsewhere.

### Attempt Endpoints

- [ ] Confirm `POST /assessments/{assessment_uuid}/start` is the preferred canonical start path for new UI.
- [ ] Confirm `GET /assessments/{assessment_uuid}/draft` is the preferred canonical draft-read path for new UI.
- [ ] Confirm `PATCH /assessments/{assessment_uuid}/draft` is the preferred canonical draft-save path for new UI.
- [ ] Confirm `POST /assessments/{assessment_uuid}/submit` is the preferred canonical submit path for new UI.
- [ ] Confirm `GET /assessments/{assessment_uuid}/me` is the preferred canonical personal submission list path for new UI.
- [ ] Decide how long the older grading submit endpoints remain officially supported.
- [ ] Add deprecation messaging for legacy submit endpoints if the canonical assessment path replaces them fully.

### Review Endpoints

- [ ] Confirm teacher submission listing remains under canonical grading review APIs unless a more assessment-native wrapper endpoint is introduced.
- [ ] Confirm teacher grade save remains under canonical grading review APIs.
- [ ] Confirm bulk publish remains under canonical grading review APIs.
- [ ] Confirm deadline extension remains under canonical grading review APIs.
- [ ] Add or document any missing assessment-native review projections if frontend shells need them.

### Results And Analytics Endpoints

- [ ] Confirm student results data comes from canonical submission and grade-release logic.
- [ ] Confirm gradebook comes from canonical progress and submissions.
- [ ] Confirm analytics comes from canonical submission history, not legacy side tables, once migration is complete.
- [ ] Mark any legacy analytics endpoints that read legacy assessment tables as transitional.

## Fixture Catalog Checklist

- [ ] One pristine draft submission fixture per supported kind.
- [ ] One published-grade fixture per supported kind.
- [ ] One hidden-grade fixture per supported kind.
- [ ] One returned-for-revision fixture per supported kind.
- [ ] One late submission fixture with penalty applied.
- [ ] One late submission fixture with penalty waived by override.
- [ ] One max-attempt-blocked fixture.
- [ ] One scheduled-not-yet-open fixture.
- [ ] One archived-assessment fixture.
- [ ] One multi-tab draft conflict fixture.
- [ ] One batch grading partial-failure fixture.
- [ ] One bulk publish fixture.
- [ ] One override-granted fixture.
- [ ] One invalid-upload fixture.
- [ ] One code-run-timeout fixture.
- [ ] One code-run-compile-error fixture.
- [ ] One analytics-heavy cohort fixture.
- [ ] One mixed-status gradebook fixture.
- [ ] One migrated legacy-quiz parity fixture.
- [ ] One support-incident replay fixture.

## Alert Threshold And Response Guide

- [ ] Alert if submit success rate drops below the agreed floor over a short rolling window.
- [ ] Alert if draft-save failures spike above baseline.
- [ ] Alert if grading save failures spike above baseline.
- [ ] Alert if bulk publish failures occur on repeated runs.
- [ ] Alert if code-run queue latency crosses the agreed threshold.
- [ ] Alert if upload validation failures spike unusually after deploy.
- [ ] Alert if conflict frequency spikes unusually after deploy.
- [ ] Alert if hidden-grade support tickets spike after a release.
- [ ] Alert if review queue latency degrades sharply.
- [ ] Alert if analytics parity checks fail during migration windows.
- [ ] Define who responds first to submit failures.
- [ ] Define who responds first to grade ledger discrepancies.
- [ ] Define who responds first to code-run degradation.
- [ ] Define who responds first to batch-action failures.
- [ ] Define who approves rollout pause or rollback.

## Surface-Level Definition Of Done

### Studio Surface Done Definition

- [ ] Shared shell uses authoritative data only.
- [ ] No supported kind lands in placeholder authoring UI.
- [ ] Readiness covers kind-specific blockers.
- [ ] Lifecycle actions are explicit and test-covered.
- [ ] Policy editing is normalized.

### Attempt Surface Done Definition

- [ ] Shared shell uses authoritative capability data only.
- [ ] Save, submit, and recovery behavior are standardized.
- [ ] Returned-for-revision flow is supported where product policy allows.
- [ ] Hidden-grade messaging is standardized.
- [ ] Mobile and accessibility baselines pass.

### Review Surface Done Definition

- [ ] Queue, inspector, and grade form align on state and release semantics.
- [ ] Concurrency conflicts are surfaced clearly.
- [ ] Prior attempts and revisions are accessible.
- [ ] Bulk actions are safe and observable.
- [ ] Audit context is available where needed.

### Results Surface Done Definition

- [ ] Students can understand outcome, visibility, and next actions.
- [ ] Item-level and rubric feedback are visible when released.
- [ ] Revision history is accessible when relevant.
- [ ] Hidden-grade state is never ambiguous.
- [ ] Result rendering is consistent across kinds.

## Regression Watchlist

- [ ] Watch for route regressions where canonical assessment pages start rendering placeholders again.
- [ ] Watch for draft-save conflicts increasing after frontend query refactors.
- [ ] Watch for gradebook state labels diverging from review state labels.
- [ ] Watch for readiness blockers that are only visible in API payloads and not in UI.
- [ ] Watch for mobile layout regressions after shell chrome changes.
- [ ] Watch for translation regressions in assessment-specific copy.
- [ ] Watch for stale policy values cached in authoring or attempt surfaces.
- [ ] Watch for release-state regressions where hidden grades become visible too early.
- [ ] Watch for release-state regressions where published grades remain hidden too long.
- [ ] Watch for returned submissions not spawning correct resubmission drafts.
- [ ] Watch for item-order regressions after reorder and delete operations.
- [ ] Watch for upload orphaning after submission failures.
- [ ] Watch for code-run latency regressions after runner configuration changes.
- [ ] Watch for queue filter regressions after review workspace rewrites.
- [ ] Watch for audit events silently dropping after mutation refactors.
- [ ] Watch for analytics totals drifting after migration checkpoints.
- [ ] Watch for override application regressions when policy schema changes.
- [ ] Watch for stale local recovery dialogs appearing after a successful submit.
- [ ] Watch for duplicate notifications on publish or return events.
- [ ] Watch for accessibility regressions in dialogs, timers, and action bars.

## Stakeholder Review Questionnaire

### Product Questions

- [ ] Is every supported assessment kind clearly defined as a preset over shared primitives?
- [ ] Is there any kind still marketed or routed as supported while only partially implemented?
- [ ] Are return-for-revision semantics intentionally available for all supported kinds or only some?
- [ ] Are grade release semantics understandable enough for teachers without extra training?
- [ ] Are hidden-grade semantics understandable enough for students without support intervention?
- [ ] Are mobile support expectations explicit by kind?
- [ ] Are anti-cheat policies explicit enough without being punitive or confusing?
- [ ] Are override workflows sufficient for real teaching scenarios like makeup exams and deadline extensions?
- [ ] Are analytics outputs actionable enough to influence teaching decisions?
- [ ] Is any remaining legacy behavior still product-visible in a way that should be hidden or retired?

### Design Questions

- [ ] Does the studio surface feel like one product across kinds?
- [ ] Does the attempt surface feel like one product across kinds?
- [ ] Does the review surface feel like one product across kinds?
- [ ] Are save, graded, published, returned, and hidden states visually distinct enough?
- [ ] Are timelines and revision histories understandable at a glance?
- [ ] Are empty states and blocked states helpful rather than generic?
- [ ] Are warning states calibrated correctly for severity?
- [ ] Is focus mode useful without obscuring critical status information?
- [ ] Are queue density and readability balanced well for graders?
- [ ] Are long assessments navigable without overwhelming the user?

### Engineering Questions

- [ ] Is there now one canonical domain model per concept?
- [ ] Are old adapters clearly marked transitional or deleted?
- [ ] Are authoritative projection payloads sufficient to simplify shells?
- [ ] Are version conflicts observable and test-covered?
- [ ] Are high-value mutations audited and traced?
- [ ] Are route-level feature flags sufficient for safe rollout and rollback?
- [ ] Are parity checks automated enough to prevent silent migration drift?
- [ ] Are generated or mirrored contracts reducing type duplication?
- [ ] Is query invalidation disciplined enough to avoid stale UI and refetch storms?
- [ ] Is the operational alert surface strong enough for peak periods?

### QA Questions

- [ ] Does the automated test matrix cover authoring, attempt, review, results, gradebook, and analytics?
- [ ] Are edge states tested, not just happy paths?
- [ ] Are concurrency and offline-ish flows tested explicitly?
- [ ] Are migration parity checks part of release criteria?
- [ ] Are accessibility checks part of CI for core assessment shells?
- [ ] Are throttled-network and multi-browser checks included where risk is highest?
- [ ] Are hidden-grade and batch-release flows tested thoroughly?
- [ ] Are returned revision flows tested thoroughly?
- [ ] Are override scenarios tested thoroughly?
- [ ] Is there a standing regression watchlist tied to recent releases?

### Support And Operations Questions

- [ ] Can support explain why a student cannot access an assessment?
- [ ] Can support explain why a student cannot submit?
- [ ] Can support explain why a grade is hidden?
- [ ] Can support explain how a score was produced?
- [ ] Can support inspect the most recent authoritative submission state quickly?
- [ ] Can support inspect override and release context quickly?
- [ ] Can operations detect assessment degradation before users flood support?
- [ ] Can operations pause or roll back a risky rollout safely?
- [ ] Can operations inspect failed bulk actions and retry safely?
- [ ] Can operations distinguish runner failures, upload failures, and API failures quickly?

## Immediate Next 20 Actions

- [ ] Confirm whether quiz remains exposed on canonical routes in production today.
- [ ] If yes, either complete the quiz module or gate the route immediately.
- [ ] Add authoritative attempt projection payload design doc.
- [ ] Add authoritative review projection payload design doc.
- [ ] Normalize policy field naming decisions.
- [ ] Open tickets for readiness taxonomy expansion.
- [ ] Open tickets for release-state UI exposure.
- [ ] Open tickets for returned-submission UX completion.
- [ ] Open tickets for review queue modernization.
- [ ] Open tickets for grade form publish/save separation.
- [ ] Open tickets for gradebook reconciliation tests.
- [ ] Open tickets for analytics parity validation.
- [ ] Open tickets for backend integration tests.
- [ ] Open tickets for frontend shell tests.
- [ ] Open tickets for end-to-end author-to-result flows.
- [ ] Add production telemetry for canonical versus legacy route usage.
- [ ] Add support dashboard stub for submission diagnostics.
- [ ] Add rollout flags for canonical quiz and review improvements.
- [ ] Schedule migration inventory review for legacy assessment paths.
- [ ] Assign owners and dates to the first two roadmap phases.
