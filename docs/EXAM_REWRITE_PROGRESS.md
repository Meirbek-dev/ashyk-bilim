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
