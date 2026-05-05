# Assessment Capability Matrix

This matrix documents the current canonical assessment surface coverage after the Phase 0 and Phase 1 convergence fixes.

| Kind | Studio Surface | Attempt Surface | Review Surface | Current Authoring Scope | Projection Source |
| --- | --- | --- | --- | --- | --- |
| Assignment | Shared native-item studio shell | Shared canonical item attempt shell | Generic grading review workspace | `CHOICE`, `OPEN_TEXT`, `FILE_UPLOAD`, `FORM`, `MATCHING` | `AssessmentRead` + `attempt_projection` + `review_projection` |
| Exam | Exam-specific authoring flow | Exam-specific canonical attempt flow | Generic grading review workspace with exam review detail | Exam author flow | `AssessmentRead` + `attempt_projection` + `review_projection` |
| Quiz | Shared native-item studio shell | Shared canonical item attempt shell | Generic grading review workspace | `CHOICE`, `MATCHING` only | `AssessmentRead` + `attempt_projection` + `review_projection` |
| Code Challenge | Code-challenge-specific authoring flow | Code-challenge-specific attempt flow | Generic grading review workspace | Code item flow | `AssessmentRead` + `attempt_projection` + `review_projection` |

## Rules

- Supported canonical routes must resolve to a non-null kind module for studio, attempt, and review.
- Quiz authoring is intentionally limited to canonical auto-gradable item kinds until richer grading support lands.
- Shared shells must consume backend-owned projection data instead of inferring student capabilities in the browser.
- Any new assessment path should extend the canonical projections instead of introducing a surface-specific state contract.

## Operational Notes

- Legacy activity URLs for assessable activities should redirect to the canonical assessment route.
- Canonical route visits and legacy redirects are logged with the `ASSESSMENT_FLOW_ROUTE` marker.
- Client-side assessment load, draft-save, submit, and review-kind load failures are reported through the existing `/api/log-error` endpoint.
