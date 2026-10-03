# Phase 9 removals (stage 2 contract step)

Everything the server keeps only for the old web (`apps/web`) and deletes at
the contract step (MODERNIZATION-STAGE-2 §2, gate G-07), once the new web is
live and the rollback window has closed. One row per removal; `target` is an
`operationId`, a `Schema.field`, a behaviour or a setting; `replacement` is
what the new web uses instead (`-` = nothing, just delete). Deprecated
operations are also marked in `openapi.v2.json` (`deprecated: true` +
`x-replaced-by`, from `ab_api::RENAMED`), which G-07 skips.

Started by L-6 (2026-10-04); every later lane appends here.

| kind | target | replacement | source |
| --- | --- | --- | --- |
| operation | `get_trail` | `list_enrollments` | S-10 (`RENAMED`) |
| operation | `add_course` | `enroll` | S-10 |
| operation | `remove_course` | `leave_course` | S-10 |
| operation | `add_activity` | `complete_activity` | S-10 |
| operation | `remove_activity` | `uncomplete_activity` | S-10 |
| operation | `create_usergroup` | `create_group` | S-10 |
| operation | `list_usergroups` | `list_groups` | S-10 |
| operation | `get_usergroup` | `get_group` | S-10 |
| operation | `update_usergroup` | `update_group` | S-10 |
| operation | `delete_usergroup` | `delete_group` | S-10 |
| operation | `list_usergroup_members` | `list_group_members` | S-10 |
| operation | `list_usergroup_members_page` | `list_group_members_page` | S-10 |
| operation | `add_usergroup_members` | `add_group_members` | S-10 |
| operation | `remove_usergroup_members` | `remove_group_members` | S-10 |
| operation | `list_usergroup_courses` | `list_group_courses` | S-10 |
| operation | `add_usergroup_courses` | `add_group_courses` | S-10 |
| operation | `remove_usergroup_courses` | `remove_group_courses` | S-10 |
| operation | `usergroups_for_course` | `groups_for_course` | S-10 |
| operation | `languages` (`GET /code/languages`, 503 without Judge0) | `runner` (`GET /code/runner`) | L-6 (`RENAMED`) |
| operation | `reference_check` (`POST /assessments/{id}/reference-check`) | `reference_check_item` | L-6 (`RENAMED`) |
| operation | `submission_events` (`GET /submissions/{id}/events`) | `GET /me/events` (`submission.updated`) | L-4 |
| operation | `course_grading_events` (`GET /courses/{id}/grading/events`) | `GET /me/events` (`grading.updated`) | L-4 |
| operation | `list_course_updates` (bare array) | `.../updates/page` | L-3 |
| operation | `list_contributors` (bare array) | `.../contributors/page` | L-3 |
| operation | `list_usergroup_members`, `list_group_members` (bare arrays) | `.../members/page` | L-3 |
| operation | `my_certificates` (bare array) | `/me/certificates/page` | L-3 |
| operation | `study_ask` | `-` (no web consumer, S-6.3) | G-07 |
| operation | `analyze_course` | `queue_course_analysis` | G-07 |
| operation | `analyze_submission` | `-` (queue variant) | G-07 |
| operation | `generate_remediation` | `-` (queue variant) | G-07 |
| operation | `critique_lecture` | `-` (queue variant) | G-07 |
| operation | `get_ai_run` | `-` (run state comes over the run stream) | G-07 |
| operation | `run_events` | `admin_run_detail` (carries the journal) | G-07 |
| operation | `remediation_session` | `-` | G-07 |
| param | leaderboard `offset` | `cursor` | L-3 |
| field | `NextAction.href`, `NextAction.label` | `course_id` / `activity_id` + client routes | L-3 |
| field | `AttemptState.can_start`, `AttemptState.can_continue` | `allowed_actions` | L-3 |
| field | `Collection.can_delete` | `allowed_actions` | L-3 |
| field | `Discussion.can_update`, `.can_delete`, `.can_moderate` | `allowed_actions` | L-3 |
| field | `Usergroup.can_write` | `allowed_actions` | L-3 |
| field | `CoursePermissions.can_discover`, `.can_access`, `.can_enroll` | `allowed_actions` on the course / learner state | L-3 |
| field | `Profile.locale` (legacy `ru-RU` form) | `Profile.language` | L-5 (D-03) |
| behaviour | 204 on role assign/unassign, user status, members, role writes without `Prefer` | always `return=representation` | L-3 |
| behaviour | 409 for a stale submission draft without `If-Match` | 412 with `If-Match` required | L-3 |
| behaviour | `GET /code/languages` 503 when Judge0 is unset | `runner_configured: false` | L-6 |
| behaviour | camelCase gamification preference keys accepted on write | snake_case only; then rewrite stored `user_profiles` gamification preferences to snake_case (the leaderboard SQL reads them) | L-5 |
| behaviour | `quiz` / `exam` accepted as activity kinds | `assessment` | L-5 |
| setting | `AB__SERVER__WEB_LINKS=legacy` (old URL map incl. `/ru`/`/kz`/`/en` prefixes, `kz` for Kazakh) | `v2` becomes the only map; drop the switch | L-5 (S-11) |
| data | D-01 `--after-cutover` (the one `url` embed) | run `ashyq admin migrate-editor-docs --after-cutover` | L-5 |
