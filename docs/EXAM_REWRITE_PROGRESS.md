# Exam Rewrite Progress

## Phase 0 - Product and Technical Inventory

Status: inventory complete; phase gate blocked by existing repository check/test configuration.

What changed:

- Added `docs/EXAM_REWRITE_INVENTORY.md` with the route, component, API, policy, runtime, workflow, test, localization, and duplicate-field inventory required before contract work.
- Added the canonical plan path `docs/EXAM_REWRITE_PLAN.md` from the existing rewrite plan so implementation has the user-specified source of truth.

Tests and checks:

- `vp install` completed with no dependency changes.
- `vp check` failed before useful analysis because the repository currently has broad formatting issues across existing files.
- Scoped `vp check docs/EXAM_REWRITE_PLAN.md docs/EXAM_REWRITE_INVENTORY.md docs/EXAM_REWRITE_PROGRESS.md` initially found formatting issues in the Phase 0 docs.
- Scoped `vp check --fix docs/EXAM_REWRITE_PLAN.md docs/EXAM_REWRITE_INVENTORY.md docs/EXAM_REWRITE_PROGRESS.md` formatted only these docs, then failed to start lint because the current oxlint configuration references missing rule `eslint/prefer-named-capture-group`.
- Re-running the scoped check confirmed all three Phase 0 docs are formatted, but lint still cannot start for the same oxlint rule configuration error.
- `vp test` failed in the existing test harness before Phase 0 docs were relevant: Vitest imports Playwright E2E files, many `@/...` aliases fail to resolve, and `apps/web/src/tests/ui/next-image.test.tsx` runs without `document`.
- Phase 1 has not started because the user-specified phase gate requires checks/tests to pass.

Assumptions and deviations:

- Integrity controls are treated as deterrents-only, not real proctoring.
- Exams and quizzes remain limited to existing `CHOICE` and `MATCHING` item support.
- Time-limit overrides appear in DTOs but are not applied in the inspected effective policy path; Phase 1 must either wire them or remove them from the canonical contract.
