# Exam Rewrite Progress

## Phase 0 - Product and Technical Inventory

Status: completed.

What changed:

- Added `docs/EXAM_REWRITE_INVENTORY.md` with the route, component, API, policy, runtime, workflow, test, localization, and duplicate-field inventory required before contract work.
- Added the canonical plan path `docs/EXAM_REWRITE_PLAN.md` from the existing rewrite plan so implementation has the user-specified source of truth.

Tests and checks:

- `vp install` completed with no dependency changes.
- Fixed the root Vite+ check/test configuration enough for this rewrite work: removed the invalid oxlint rule entry and made root `vp test` run the existing web unit tests instead of importing Playwright E2E specs.
- Fixed the one real unit failure revealed by the runner fix: `ReviewBulkActionBar` now passes a localized deadline picker placeholder instead of relying on the shared calendar's Russian default.
- `vp check vite.config.ts docs/EXAM_REWRITE_PLAN.md docs/EXAM_REWRITE_INVENTORY.md docs/EXAM_REWRITE_PROGRESS.md apps/web/src/features/grading/review/components/ReviewBulkActionBar.tsx apps/web/src/tests/grading/review-controls.test.tsx apps/web/src/messages/en-US.json apps/web/src/messages/ru-RU.json apps/web/src/messages/kk-KZ.json` passed with no warnings, lint errors, or type errors.
- `vp test apps/web/src/tests/grading/review-controls.test.tsx` passed: 6 tests.
- `vp test` passed: 44 files, 364 tests.
- Full unscoped `vp check` still reports pre-existing formatting issues in 264 unrelated files, mostly skill/docs/plan artifacts. Those were not reformatted to avoid unrelated churn.

Assumptions and deviations:

- Integrity controls are treated as deterrents-only, not real proctoring.
- Exams and quizzes remain limited to existing `CHOICE` and `MATCHING` item support.
- Time-limit overrides appear in DTOs but are not applied in the inspected effective policy path; Phase 1 must either wire them or remove them from the canonical contract.

## Phase 1 - Canonical Contracts and Policy Source of Truth

Status: completed.

What changed:

- Added `docs/adr/ADR-001-canonical-assessment-policy-workspace.md` for the canonical assessment policy and workspace contract decision.
- Added `AssessmentCanonicalPolicy`, `AssessmentIntegrityPolicy`, and `AssessmentDeliveryPolicy` DTOs and exposed `canonical_policy` on assessment policy and effective attempt policy responses.
- Centralized assessment kind defaults in `apps/api/src/services/assessments/policy_defaults.py` and wired assessment creation plus both preset service exports to the shared source.
- Updated the legacy assessment settings endpoint to prefer canonical `AssessmentPolicy` for assessment-backed activities and return the older settings shape as an adapter.
- Normalized readiness responses with `severity`, `area`, `view`, `field`, `why`, `blocker_count`, `warning_count`, and `contract_version`.
- Updated frontend policy/studio adapters to consume `canonical_policy` first and use raw JSON fields only as legacy fallback.
- Regenerated `apps/api/openapi.json` and `apps/web/src/lib/api/generated/schema.ts`.

Tests and checks:

- `uv run --project apps/api python -m pytest src/tests/test_assessment_authoring_lifecycle.py src/tests/test_assessment_new_endpoints_api.py` passed: 34 tests.
- `uv run ruff check src/db/assessment_contracts.py src/db/assessments.py src/db/courses/activities.py src/services/assessments/_shared.py src/services/assessments/core.py src/services/assessments/policy_defaults.py src/services/assessments/policy_service.py src/services/assessments/review_service.py src/services/assessments/settings.py src/tests/test_assessment_authoring_lifecycle.py src/tests/test_assessment_new_endpoints_api.py` passed.
- `vp test` passed: 44 files, 364 tests.
- `bun run generate:contracts` was rerun and a before/after hash check confirmed `apps/api/openapi.json` and `apps/web/src/lib/api/generated/schema.ts` are stable.
- `vp check docs/adr/ADR-001-canonical-assessment-policy-workspace.md docs/EXAM_REWRITE_PROGRESS.md apps/web/src/features/assessments/domain/policy.ts apps/web/src/features/assessments/studio/utils.ts` passed.
- The generated contract files are left in generator output format; running `vp check` directly on generated files reports formatting churn that conflicts with `generate:contracts`.
- Added coverage for EXAM preset defaults, canonical create defaults, canonical policy update reflection, legacy settings compatibility, readiness metadata, and non-silent rejection of unsupported time-limit overrides.

Assumptions and deviations:

- Per-student time-limit override is not persisted by the current `student_policy_override` table. Phase 1 now rejects non-null `time_limit_override_seconds` with 422 instead of silently accepting it; Phase 5 will introduce the accommodations model.

## Phase 2 - Workspace Shell

Status: completed.

What changed:

- Added `AssessmentWorkspaceProvider` behind the existing `NativeItemStudioProvider` registry slot.
- Added workspace URL state for `view`, selected `item`, and selected `issue`; legacy `tab` query params are read and normalized to `view`.
- Added a global save ledger with persistent summary state, retry callbacks, an `aria-live` save-status region, and a `beforeunload` guard while dirty/saving/error states exist.
- Added `AssessmentWorkspaceShell` with a persistent navigator, main work area, save status bar, and readiness rail.
- Routed the existing setup, builder, access, results, and publish screens through the new shell for feature parity.
- Readiness issues now retain backend navigation metadata and issue clicks switch to the target view and item.
- Reorder failures now roll back the optimistic local order and show a persistent error path instead of being silently swallowed.

Tests and checks:

- `vp test apps/web/src/tests/assessments/workspace-state.test.ts` passed: 5 tests.
- `vp check apps/web/src/features/assessments/studio/context.tsx apps/web/src/features/assessments/studio/components/NativeItemAuthor.tsx apps/web/src/features/assessments/studio/studioTypes.ts apps/web/src/features/assessments/studio/utils.ts apps/web/src/features/assessments/studio/workspace/AssessmentWorkspaceShell.tsx apps/web/src/features/assessments/studio/workspace/saveLedger.ts apps/web/src/features/assessments/studio/workspace/urlState.ts apps/web/src/tests/assessments/workspace-state.test.ts apps/web/src/messages/en-US.json apps/web/src/messages/ru-RU.json apps/web/src/messages/kk-KZ.json` passed.
- `vp test` passed: 45 files, 369 tests.

Assumptions and deviations:

- Phase 2 intentionally hosts the existing screens inside the new workspace shell instead of redesigning their internals; the detailed builder/policy/audience/result redesigns remain scoped to Phases 3-7.

## Phase 3 - Question Builder Redesign

Status: completed.

What changed:

- Added `builderUtils.ts` for canonical builder behaviors: keyboard reorder ordering, large-outline windowing, issue focus targets, and metadata list normalization.
- Reworked the builder outline with compact bulk actions for applying points, difficulty, and tags across all questions.
- Added explicit up/down keyboard reorder buttons to each outline item while preserving the existing drag-and-drop path.
- Added outline windowing for large item lists so the builder stays responsive without changing the full persisted order.
- Wired selected readiness issues to focus the matching builder target: title, points, or item content.
- Moved rich answer feedback for choice and matching items from the narrow inspector into the main canvas.
- Added a live item preview for choice, matching, form, and open-text items.
- Reworked the inspector into compact contextual metadata: points, difficulty, estimated time, tags, and outcome IDs.
- Tightened create, duplicate, delete, and bulk-save async paths so failed responses surface response messages and unexpected failures are logged.
- Added localized strings for the new builder and inspector controls in English, Russian, and Kazakh.

Tests and checks:

- `vp test apps/web/src/tests/assessments/builder-utils.test.ts` passed: 5 tests.
- `vp check apps/web/src/features/assessments/studio/tabs/BuilderCanvasTab.tsx apps/web/src/features/assessments/studio/tabs/QuestionInspectorPanel.tsx apps/web/src/features/assessments/studio/tabs/builderUtils.ts apps/web/src/tests/assessments/builder-utils.test.ts apps/web/src/messages/en-US.json apps/web/src/messages/ru-RU.json apps/web/src/messages/kk-KZ.json` passed.
- `vp test` passed: 46 files, 374 tests.
- Started the web app with `vp run dev:web`; `http://localhost:3000/ru` and `http://localhost:3000/ru/dash/courses` both returned HTTP 200.

Assumptions and deviations:

- Bulk operations apply to all questions in the current assessment. The plan did not define a multi-select contract, so Phase 3 avoids adding an unplanned selection model.
- Authenticated manual studio interaction was not performed because this thread has no attached authenticated browser session or known seeded studio record. The route-level app smoke check passed.

## Phase 4 - Policy And Integrity Redesign

Status: completed.

What changed:

- Reworked the policy editor around student-facing consequences: time, attempts, result release, and integrity controls are summarized before the detailed fields.
- Replaced the two result-review toggles with a single release policy control: hidden, score-only, or full review.
- Added inline warnings for risky combinations: strict integrity controls without accommodations, one-violation auto-submit, very short timers, and high pass thresholds combined with negative marking.
- Renamed the editor copy from anti-cheat/proctoring language to integrity deterrent controls.
- Added accessibility accommodation guidance without adding a non-canonical exception field; individual exceptions remain scoped to the Phase 5 accommodations model.
- Extended the shared runtime `PolicyView` with `reviewVisibility`, `resultReviewAllowed`, and `correctAnswersVisible`, preferring `canonical_policy.review_visibility` before legacy settings.
- Added result-release policy messaging to the attempt entry screen so runtime consumes and explains the same policy contract.
- Added localized policy and runtime copy in English, Russian, and Kazakh.

Tests and checks:

- `vp test apps/web/src/tests/assessments/policy-redesign.test.ts` passed: 4 tests.
- `vp check apps/web/src/features/assessments/domain/policy.ts apps/web/src/features/assessments/studio/tabs/GeneralSettingsTab.tsx apps/web/src/features/assessments/studio/tabs/policyWarnings.ts apps/web/src/features/assessments/shell/AttemptEntryCard.tsx apps/web/src/tests/assessments/policy-redesign.test.ts apps/web/src/messages/en-US.json apps/web/src/messages/ru-RU.json apps/web/src/messages/kk-KZ.json` passed.
- `vp test` passed: 47 files, 378 tests.

Assumptions and deviations:

- Accessibility exceptions are surfaced as warnings and guidance in Phase 4 instead of a new persisted policy field because the plan assigns individual overrides/accommodations to Phase 5.

## Phase 5 - Audience Builder And Accommodations

Status: completed.

What changed:

- Reworked the access tab into a three-column audience operations surface: access mode and preview, server-searchable learners/groups, selected-audience drawer, and individual accommodations.
- Replaced local-only filtering with backend `q` and `limit` query parameters on eligible learner and eligible group endpoints.
- Added recoverable access-save and accommodation-save error states with retry actions and assertive live-region announcements.
- Added effective audience preview, loaded-window exclusion counts, group expansion summaries, selected user/group removal, and visible accommodation badges.
- Surfaced existing student policy override APIs in the instructor UI for selected learners: attempt limit, custom due date, late-penalty waiver, and internal note.
- Added typed access-builder helpers for search URL construction, preview counts, and loaded-window exclusion math.
- Regenerated `apps/api/openapi.json` and `apps/web/src/lib/api/generated/schema.ts` for the new eligible-audience query parameters.
- Added localized access-builder and accommodation copy in English, Russian, and Kazakh.

Tests and checks:

- `vp test apps/web/src/tests/assessments/access-builder-utils.test.ts` passed: 3 tests.
- `uv run --project apps/api python -m pytest apps/api/src/tests/test_assessment_access_api.py` passed: 4 tests.
- `uv run --project apps/api ruff check apps/api/src/routers/assessments/unified.py apps/api/src/services/assessments/access_service.py apps/api/src/tests/test_assessment_access_api.py` passed.
- `vp check apps/web/src/features/assessments/studio/tabs/AccessManagementTab.tsx apps/web/src/features/assessments/studio/tabs/accessBuilderUtils.ts apps/web/src/tests/assessments/access-builder-utils.test.ts apps/web/src/messages/en-US.json apps/web/src/messages/ru-RU.json apps/web/src/messages/kk-KZ.json` passed.
- `vp test` passed: 48 files, 381 tests.

Assumptions and deviations:

- The current access contract has allowlists, not a separate persisted exclusion list. Phase 5 models exclusions as learners omitted from restricted access and shows the loaded-window exclusion count before save.
- Student policy overrides are individual-only in the existing API. Group rows can expand and be included in the audience preview, but accommodations apply only to explicitly selected learners.
