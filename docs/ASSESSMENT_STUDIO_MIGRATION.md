# Assessment Studio Migration Guide

## Rollout Flags

- `NEXT_PUBLIC_ASSESSMENT_REWRITE=on` enables the rewritten studio for every course. This is the default.
- `NEXT_PUBLIC_ASSESSMENT_REWRITE=off` keeps assessments readable through the studio fallback and preserves the student preview route.
- `NEXT_PUBLIC_ASSESSMENT_REWRITE=course-allowlist` enables the rewrite only for course IDs listed in `NEXT_PUBLIC_ASSESSMENT_REWRITE_COURSES`.
- `NEXT_PUBLIC_ASSESSMENT_REWRITE_COURSES=math,science` accepts comma-separated course UUIDs with or without the `course_` prefix.

## Existing Exams

Existing exams remain readable because the rewrite consumes the current canonical assessment endpoints:

- Assessment detail and items: `GET /assessments/activity/{activity_uuid}`.
- Policy: `assessment_policy.canonical_policy`, with legacy settings fallback.
- Audience: `GET /assessments/{assessment_uuid}/access`.
- Results and operations: existing submissions, stats, item analytics, grade publish, and CSV export endpoints.

If the rewrite is disabled, the fallback screen shows the assessment title, lifecycle state, and student preview link. It intentionally does not provide editing controls.

## Migration Checklist

- Confirm generated frontend API types match `apps/api/openapi.json`.
- Run `vp test` and the assessment API tests before enabling the flag in a new environment.
- Enable `course-allowlist` for pilot courses before switching the default to `on`.
- Keep the old activity and assessment UUIDs unchanged. The rewrite does not require data migration for existing items, policies, submissions, or overrides.
- Review high-stakes exams after rollout because publish/schedule now requires at least one successful preview.

## Rollback

Set `NEXT_PUBLIC_ASSESSMENT_REWRITE=off` and redeploy the web app. Existing student attempts, grading, and published assessment routes remain backed by the same API contracts.
