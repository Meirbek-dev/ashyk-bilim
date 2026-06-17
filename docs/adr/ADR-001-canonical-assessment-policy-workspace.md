# ADR-001: Canonical Assessment Policy and Workspace Contracts

Date: 2026-06-18

Status: accepted for Phase 1.

## Context

The exam rewrite plan requires one authoritative policy contract before the
authoring workspace can be rebuilt. The previous implementation exposed policy
through several overlapping shapes:

- `AssessmentPolicy` columns for attempts, timing, grading, release, and late
  policy.
- `AssessmentPolicy.settings_json` for review visibility, randomization,
  partial credit, and other authoring-only fields.
- `AssessmentPolicy.anti_cheat_json` for deterrent controls.
- `Activity.settings` as a legacy settings payload that could override the
  canonical assessment policy in read paths.
- Frontend adapters that re-derived policy state from raw JSON aliases.

That split made defaults drift between services and made the UI responsible for
guessing effective state.

## Decision

Add an additive `canonical_policy` DTO to assessment policy responses and
effective attempt policy responses. The legacy fields remain for compatibility,
but frontend and new workspace code must prefer `canonical_policy`.

The canonical contract contains:

- Attempts and timing: `max_attempts`, `time_limit_seconds`, `due_at`,
  `allow_late`, `late_policy`.
- Grading and release: `grade_release_mode`, `grading_mode`,
  `completion_rule`, `passing_score`, `review_visibility`.
- Delivery: `randomize_questions`, `randomize_options`, `partial_credit`,
  `negative_marking_percent`.
- Integrity: deterrent-only controls for copy/paste, tab switching, devtools,
  right click, fullscreen, and violation threshold.

Policy presets are centralized in
`apps/api/src/services/assessments/policy_defaults.py`. Assessment creation and
both preset service exports use that module.

The legacy settings endpoint now acts as a compatibility adapter. For
assessment-backed activities it reads canonical assessment policy first and
returns the old settings shape only as an adapter response.

Readiness issues are now normalized into a structured contract with severity,
area, field, target view, and counts. Existing issue codes and messages remain
compatible.

## Assumptions

- Integrity controls are deterrents only, not real proctoring.
- Phase 1 does not add new item kinds.
- Per-student time-limit override is not persisted by the current table. Until
  Phase 5 introduces the accommodations model, the API rejects non-null
  `time_limit_override_seconds` with 422 instead of accepting and discarding it.

## Consequences

- Workspace UI can render policy and readiness from a single DTO instead of
  raw JSON aliases.
- OpenAPI and generated TypeScript contracts expose the canonical policy and
  richer readiness fields.
- Existing legacy callers can keep using old fields while migration proceeds.
- Phase 2 can build `AssessmentWorkspaceProvider` around canonical policy,
  readiness, save state, and URL state without duplicating policy derivation.
