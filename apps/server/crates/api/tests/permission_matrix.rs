//! Gate 9b: every route of the OpenAPI document x every kind of caller.
//!
//! One seeded world (`seed-e2e`'s course with every activity type, made
//! private and opened to a group) and seven callers: anonymous, a signed-in
//! outsider, an enrolled peer, the enrolled learner who owns the work
//! (submission, file attempt, post, certificate, notification), an
//! instructor of other courses, the course owner and a platform admin.
//!
//! [`MATRIX`] states who may get a 2xx from each operation, with the
//! world's real ids in the path:
//! - a `GET` is sent as every caller and the set answering 2xx must be
//!   exactly the listed one (a broader set is a leak, a narrower one a
//!   wrong row);
//! - a write is sent only as the callers outside the set, which must be
//!   refused (401/403/404) before the body is read: never a 2xx, never a
//!   422 that validated the body for someone who may not write there
//!   (UX-311). Writes go last, deletes very last.
//!
//! A route missing from [`MATRIX`] fails the test until it is classified.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::collections::BTreeMap;
use std::time::Duration;

use ab_testkit::{MintedSession, TestApp};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use serde_json::{Value, json};
use sqlx::PgPool;
use wiremock::matchers::{method, path};
use wiremock::{Mock, ResponseTemplate};

/// Callers, as bits.
const ANON: u8 = 1;
const OUT: u8 = 1 << 1;
const PEER: u8 = 1 << 2;
const LRN: u8 = 1 << 3;
const INS: u8 = 1 << 4;
const OWN: u8 = 1 << 5;
const ADM: u8 = 1 << 6;
const CALLERS: [(u8, &str); 7] = [
    (ANON, "anonymous"),
    (OUT, "outsider"),
    (PEER, "peer"),
    (LRN, "learner"),
    (INS, "instructor"),
    (OWN, "owner"),
    (ADM, "admin"),
];

/// Anyone, signed in or not.
const ALL: u8 = ANON | SIGNED;
/// Any signed-in account (self-service on the caller's own data).
const SIGNED: u8 = OUT | PEER | LRN | INS | OWN | ADM;
/// Who sees the private course: its group members, staff and admins.
const MEMBER: u8 = PEER | LRN | OWN | ADM;
/// The learner's own work, its course staff and admins.
const SUBJECT: u8 = LRN | OWN | ADM;
/// Course staff.
const STAFF: u8 = OWN | ADM;
/// Holders of teacher grants (their own scope).
const TEACHER: u8 = INS | OWN | ADM;
/// Nobody: the ids name nothing in this world (AI runs, sessions, …), or
/// the GET answers no one here (no open draft).
const NONE: u8 = 0;

/// `(method, OpenAPI path, who may get a 2xx)`.
const MATRIX: &[(&str, &str, u8)] = &[
    ("DELETE", "/api/v2/activities/{activity_id}", STAFF),
    ("GET", "/api/v2/activities/{activity_id}", MEMBER),
    ("PATCH", "/api/v2/activities/{activity_id}", STAFF),
    ("GET", "/api/v2/activities/{activity_id}/assessment", MEMBER),
    ("GET", "/api/v2/activities/{activity_id}/blocks", MEMBER),
    ("POST", "/api/v2/activities/{activity_id}/blocks", STAFF),
    (
        "GET",
        "/api/v2/activities/{activity_id}/file-submission",
        MEMBER,
    ),
    ("POST", "/api/v2/activities/{activity_id}/move", STAFF),
    ("GET", "/api/v2/ai/admin/evals", ADM),
    ("GET", "/api/v2/ai/admin/runs", ADM),
    ("GET", "/api/v2/ai/admin/runs/{run_id}", ADM),
    ("GET", "/api/v2/ai/admin/settings", ADM),
    ("PUT", "/api/v2/ai/admin/settings/features/{key}", ADM),
    // A course the caller cannot see answers "unavailable: course-not-found",
    // exactly like an unknown id - no data, no existence signal.
    ("GET", "/api/v2/ai/capabilities/scope/{course_id}", SIGNED),
    // docs/AI-FIRST.md: pre-grading is for whoever grades the course (`Action::Grade`), metrics and
    // settings for its teachers; no draft exists in this world, so a draft id or a work without one
    // answers no one. Approval is gated by the activity, then each item by its own draft.
    (
        "POST",
        "/api/v2/ai/grading/activities/{activity_id}/drafts/queue",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/ai/grading/activities/{activity_id}/drafts",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/ai/grading/activities/{activity_id}/consistency",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/ai/grading/drafts/subject/{subject_id}",
        NONE,
    ),
    (
        "POST",
        "/api/v2/ai/grading/activities/{activity_id}/drafts/approve",
        STAFF,
    ),
    ("POST", "/api/v2/ai/grading/drafts/{draft_id}/discard", NONE),
    ("GET", "/api/v2/ai/grading/{course_id}/metrics", STAFF),
    ("GET", "/api/v2/ai/grading/{course_id}/settings", STAFF),
    ("PUT", "/api/v2/ai/grading/{course_id}/settings", STAFF),
    // Search answers whoever sees the course (learners: published material only); the index is staff's.
    ("POST", "/api/v2/ai/retrieval/{course_id}/search", MEMBER),
    ("GET", "/api/v2/ai/retrieval/{course_id}/status", STAFF),
    ("POST", "/api/v2/ai/retrieval/{course_id}/reindex", STAFF),
    (
        "POST",
        "/api/v2/ai/course-analysis/{analysis_id}/findings/review",
        NONE,
    ),
    (
        "POST",
        "/api/v2/ai/course-analysis/{analysis_id}/publish",
        NONE,
    ),
    (
        "POST",
        "/api/v2/ai/course-analysis/{course_id}/analyze",
        STAFF,
    ),
    (
        "POST",
        "/api/v2/ai/course-analysis/{course_id}/analyze/queue",
        STAFF,
    ),
    // Staff see the latest draft; members only a published report (none here).
    (
        "GET",
        "/api/v2/ai/course-analysis/{course_id}/latest",
        MEMBER,
    ),
    (
        "POST",
        "/api/v2/ai/lecture-authoring/reviews/{review_id}/dismiss",
        NONE,
    ),
    (
        "POST",
        "/api/v2/ai/lecture-authoring/{course_id}/critique",
        STAFF,
    ),
    (
        "POST",
        "/api/v2/ai/lecture-authoring/{course_id}/critique/queue",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/ai/lecture-authoring/{course_id}/reviews",
        STAFF,
    ),
    ("POST", "/api/v2/ai/qa/{course_id}/chat", MEMBER),
    ("GET", "/api/v2/ai/qa/{course_id}/threads", MEMBER),
    (
        "DELETE",
        "/api/v2/ai/qa/{course_id}/threads/{thread_id}",
        NONE,
    ),
    ("GET", "/api/v2/ai/qa/{course_id}/threads/{thread_id}", NONE),
    ("GET", "/api/v2/ai/remediation/sessions/{session_id}", NONE),
    (
        "POST",
        "/api/v2/ai/remediation/sessions/{session_id}/complete",
        NONE,
    ),
    // Not course-scoped: the learner and platform admins.
    ("GET", "/api/v2/ai/remediation/student/{user_id}", LRN | ADM),
    (
        "POST",
        "/api/v2/ai/remediation/{submission_id}/generate",
        SUBJECT,
    ),
    (
        "POST",
        "/api/v2/ai/remediation/{submission_id}/generate/queue",
        SUBJECT,
    ),
    (
        "GET",
        "/api/v2/ai/remediation/{submission_id}/latest",
        SUBJECT,
    ),
    ("GET", "/api/v2/ai/runs/{run_id}", LRN | ADM),
    ("GET", "/api/v2/ai/runs/{run_id}/artifacts", LRN | ADM),
    ("POST", "/api/v2/ai/runs/{run_id}/cancel", LRN | ADM),
    ("GET", "/api/v2/ai/runs/{run_id}/events", LRN | ADM),
    ("POST", "/api/v2/ai/runs/{run_id}/stream", LRN | ADM),
    ("POST", "/api/v2/ai/study/{course_id}/ask", MEMBER),
    ("POST", "/api/v2/ai/study/{course_id}/ask/queue", MEMBER),
    (
        "POST",
        "/api/v2/ai/submission-analysis/{submission_id}/analyze",
        SUBJECT,
    ),
    (
        "POST",
        "/api/v2/ai/submission-analysis/{submission_id}/analyze/queue",
        SUBJECT,
    ),
    (
        "GET",
        "/api/v2/ai/submission-analysis/{submission_id}/latest",
        SUBJECT,
    ),
    ("GET", "/api/v2/ai/usage", ADM),
    ("GET", "/api/v2/analytics/admin/overview", ADM),
    ("GET", "/api/v2/analytics/teacher/assessments", TEACHER),
    (
        "GET",
        "/api/v2/analytics/teacher/assessments/{assessment_type}/{assessment_id}",
        STAFF,
    ),
    ("GET", "/api/v2/analytics/teacher/courses", TEACHER),
    (
        "GET",
        "/api/v2/analytics/teacher/courses/{course_id}",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/analytics/teacher/drill-through/{metric}",
        TEACHER,
    ),
    (
        "GET",
        "/api/v2/analytics/teacher/exports/assessment-outcomes.csv",
        TEACHER,
    ),
    (
        "GET",
        "/api/v2/analytics/teacher/exports/at-risk.csv",
        TEACHER,
    ),
    (
        "GET",
        "/api/v2/analytics/teacher/exports/course-progress.csv",
        TEACHER,
    ),
    (
        "GET",
        "/api/v2/analytics/teacher/exports/grading-backlog.csv",
        TEACHER,
    ),
    ("GET", "/api/v2/analytics/teacher/interventions", TEACHER),
    ("POST", "/api/v2/analytics/teacher/interventions", STAFF),
    (
        "PATCH",
        "/api/v2/analytics/teacher/interventions/{intervention_id}",
        STAFF,
    ),
    ("GET", "/api/v2/analytics/teacher/learners/at-risk", TEACHER),
    ("GET", "/api/v2/analytics/teacher/overview", TEACHER),
    ("GET", "/api/v2/analytics/teacher/saved-views", TEACHER),
    ("POST", "/api/v2/analytics/teacher/saved-views", TEACHER),
    (
        "DELETE",
        "/api/v2/analytics/teacher/saved-views/{view_id}",
        OWN,
    ),
    ("DELETE", "/api/v2/assessment-items/{item_id}", STAFF),
    ("PATCH", "/api/v2/assessment-items/{item_id}", STAFF),
    (
        "POST",
        "/api/v2/assessment-items/{item_id}/reference-check",
        STAFF,
    ),
    ("GET", "/api/v2/assessment-items/{item_id}/runs", MEMBER),
    ("POST", "/api/v2/assessment-items/{item_id}/runs", MEMBER),
    ("POST", "/api/v2/assessments", STAFF),
    ("GET", "/api/v2/assessments/{assessment_id}", MEMBER),
    ("PATCH", "/api/v2/assessments/{assessment_id}", STAFF),
    ("GET", "/api/v2/assessments/{assessment_id}/access", STAFF),
    ("PUT", "/api/v2/assessments/{assessment_id}/access", STAFF),
    (
        "GET",
        "/api/v2/assessments/{assessment_id}/attempt-state",
        MEMBER,
    ),
    ("GET", "/api/v2/assessments/{assessment_id}/audit", STAFF),
    (
        "POST",
        "/api/v2/assessments/{assessment_id}/deadline-extensions",
        STAFF,
    ),
    (
        "POST",
        "/api/v2/assessments/{assessment_id}/duplicate",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/assessments/{assessment_id}/item-analytics",
        STAFF,
    ),
    ("POST", "/api/v2/assessments/{assessment_id}/items", STAFF),
    (
        "POST",
        "/api/v2/assessments/{assessment_id}/items/reorder",
        STAFF,
    ),
    (
        "POST",
        "/api/v2/assessments/{assessment_id}/lifecycle",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/assessments/{assessment_id}/overrides",
        STAFF,
    ),
    (
        "DELETE",
        "/api/v2/assessments/{assessment_id}/overrides/{user_id}",
        STAFF,
    ),
    (
        "POST",
        "/api/v2/assessments/{assessment_id}/overrides/{user_id}",
        STAFF,
    ),
    (
        "PUT",
        "/api/v2/assessments/{assessment_id}/overrides/{user_id}",
        STAFF,
    ),
    ("PUT", "/api/v2/assessments/{assessment_id}/policy", STAFF),
    (
        "POST",
        "/api/v2/assessments/{assessment_id}/publish-grades",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/assessments/{assessment_id}/readiness",
        STAFF,
    ),
    (
        "POST",
        "/api/v2/assessments/{assessment_id}/reference-check",
        STAFF,
    ),
    (
        "POST",
        "/api/v2/assessments/{assessment_id}/return-grades",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/assessments/{assessment_id}/submissions",
        STAFF,
    ),
    (
        "POST",
        "/api/v2/assessments/{assessment_id}/submissions",
        MEMBER,
    ),
    (
        "GET",
        "/api/v2/assessments/{assessment_id}/submissions/draft",
        NONE,
    ),
    (
        "GET",
        "/api/v2/assessments/{assessment_id}/submissions/export",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/assessments/{assessment_id}/submissions/me",
        MEMBER,
    ),
    (
        "GET",
        "/api/v2/assessments/{assessment_id}/submissions/stats",
        STAFF,
    ),
    ("POST", "/api/v2/auth/email", SIGNED),
    ("POST", "/api/v2/auth/email/confirm", SIGNED),
    ("GET", "/api/v2/auth/google", ALL),
    ("GET", "/api/v2/auth/google/callback", ALL),
    ("POST", "/api/v2/auth/login", ALL),
    ("POST", "/api/v2/auth/logout", SIGNED),
    ("DELETE", "/api/v2/auth/mfa/totp", SIGNED),
    ("POST", "/api/v2/auth/mfa/totp", SIGNED),
    ("POST", "/api/v2/auth/mfa/totp/verify", SIGNED),
    ("POST", "/api/v2/auth/password", SIGNED),
    ("POST", "/api/v2/auth/password-reset", ALL),
    ("POST", "/api/v2/auth/password-reset/confirm", ALL),
    ("POST", "/api/v2/auth/register", ALL),
    ("GET", "/api/v2/auth/session", SIGNED),
    ("GET", "/api/v2/auth/sessions", SIGNED),
    // The learner's own session handle.
    ("DELETE", "/api/v2/auth/sessions/{handle}", LRN),
    ("POST", "/api/v2/auth/verify-email", ALL),
    ("POST", "/api/v2/auth/verify-email/resend", ALL),
    ("DELETE", "/api/v2/blocks/{block_id}", STAFF),
    ("GET", "/api/v2/blocks/{block_id}", MEMBER),
    ("GET", "/api/v2/bulk-actions/{bulk_action_id}", NONE),
    // Public verification of an issued certificate.
    ("GET", "/api/v2/certificates/{code}", ALL),
    ("GET", "/api/v2/certificates/{code}/pdf", ALL),
    ("POST", "/api/v2/certifications", STAFF),
    ("DELETE", "/api/v2/certifications/{certification_id}", STAFF),
    ("GET", "/api/v2/certifications/{certification_id}", STAFF),
    ("PATCH", "/api/v2/certifications/{certification_id}", STAFF),
    (
        "GET",
        "/api/v2/certifications/{certification_id}/preview.pdf",
        STAFF,
    ),
    ("DELETE", "/api/v2/chapters/{chapter_id}", STAFF),
    ("PATCH", "/api/v2/chapters/{chapter_id}", STAFF),
    ("POST", "/api/v2/chapters/{chapter_id}/activities", STAFF),
    ("POST", "/api/v2/chapters/{chapter_id}/move", STAFF),
    ("GET", "/api/v2/code-runs/{run_id}", SUBJECT),
    ("GET", "/api/v2/code/languages", SIGNED),
    ("GET", "/api/v2/code/runner", SIGNED),
    ("GET", "/api/v2/collections", ALL),
    ("POST", "/api/v2/collections", TEACHER),
    ("DELETE", "/api/v2/collections/{collection_id}", STAFF),
    // A private collection: its creator and admins.
    ("GET", "/api/v2/collections/{collection_id}", STAFF),
    ("PATCH", "/api/v2/collections/{collection_id}", STAFF),
    ("DELETE", "/api/v2/course-updates/{update_id}", STAFF),
    ("PATCH", "/api/v2/course-updates/{update_id}", STAFF),
    ("GET", "/api/v2/courses", ALL),
    ("POST", "/api/v2/courses", TEACHER),
    ("DELETE", "/api/v2/courses/{course_id}", STAFF),
    ("GET", "/api/v2/courses/{course_id}", MEMBER),
    ("PATCH", "/api/v2/courses/{course_id}", STAFF),
    ("GET", "/api/v2/courses/{course_id}/archive-preview", STAFF),
    ("GET", "/api/v2/courses/{course_id}/deletion-preview", STAFF),
    ("GET", "/api/v2/courses/{course_id}/assessments", MEMBER),
    // The caller's own certificates in a course they belong to (an admin is
    // no member: 403, BUG-276).
    (
        "GET",
        "/api/v2/courses/{course_id}/certificates/me",
        PEER | LRN | OWN,
    ),
    ("GET", "/api/v2/courses/{course_id}/certifications", STAFF),
    ("POST", "/api/v2/courses/{course_id}/chapters", STAFF),
    // The authors' roster is shown to whoever sees the course.
    // The concept graph: members read the approved graph, staff curate it; the world has no concept,
    // tag or mastery row, so those ids answer no one.
    ("GET", "/api/v2/courses/{course_id}/concepts", MEMBER),
    ("POST", "/api/v2/courses/{course_id}/concepts", STAFF),
    ("POST", "/api/v2/courses/{course_id}/concepts/review", STAFF),
    (
        "POST",
        "/api/v2/courses/{course_id}/concepts/suggest",
        STAFF,
    ),
    (
        "PATCH",
        "/api/v2/courses/{course_id}/concepts/{concept_id}",
        NONE,
    ),
    (
        "DELETE",
        "/api/v2/courses/{course_id}/concepts/{concept_id}",
        NONE,
    ),
    (
        "PUT",
        "/api/v2/courses/{course_id}/concepts/{concept_id}/prerequisites",
        NONE,
    ),
    ("POST", "/api/v2/courses/{course_id}/concept-tags", STAFF),
    (
        "PATCH",
        "/api/v2/courses/{course_id}/concept-tags/{tag_id}",
        NONE,
    ),
    (
        "DELETE",
        "/api/v2/courses/{course_id}/concept-tags/{tag_id}",
        NONE,
    ),
    ("GET", "/api/v2/courses/{course_id}/mastery", STAFF),
    ("GET", "/api/v2/courses/{course_id}/mastery/me", MEMBER),
    (
        "GET",
        "/api/v2/courses/{course_id}/mastery/learners/{user_id}",
        NONE,
    ),
    ("GET", "/api/v2/courses/{course_id}/contributors", MEMBER),
    ("POST", "/api/v2/courses/{course_id}/contributors", STAFF),
    (
        "POST",
        "/api/v2/courses/{course_id}/contributors/apply",
        MEMBER,
    ),
    (
        "GET",
        "/api/v2/courses/{course_id}/contributors/page",
        MEMBER,
    ),
    (
        "DELETE",
        "/api/v2/courses/{course_id}/contributors/{user_id}",
        STAFF,
    ),
    (
        "PATCH",
        "/api/v2/courses/{course_id}/contributors/{user_id}",
        STAFF,
    ),
    ("GET", "/api/v2/courses/{course_id}/curriculum", MEMBER),
    ("GET", "/api/v2/courses/{course_id}/discussions", MEMBER),
    ("POST", "/api/v2/courses/{course_id}/discussions", MEMBER),
    ("POST", "/api/v2/courses/{course_id}/duplicate", STAFF),
    ("GET", "/api/v2/courses/{course_id}/gradebook", STAFF),
    ("GET", "/api/v2/courses/{course_id}/gradebook/export", STAFF),
    ("GET", "/api/v2/courses/{course_id}/grading/events", STAFF),
    ("GET", "/api/v2/courses/{course_id}/groups", STAFF),
    ("GET", "/api/v2/courses/{course_id}/learner-state", MEMBER),
    ("GET", "/api/v2/courses/{course_id}/learners", STAFF),
    ("POST", "/api/v2/courses/{course_id}/learners", STAFF),
    (
        "DELETE",
        "/api/v2/courses/{course_id}/learners/{user_id}",
        STAFF,
    ),
    ("POST", "/api/v2/courses/{course_id}/lifecycle", STAFF),
    ("GET", "/api/v2/courses/{course_id}/readiness", STAFF),
    ("GET", "/api/v2/courses/{course_id}/updates", MEMBER),
    ("POST", "/api/v2/courses/{course_id}/updates", STAFF),
    ("GET", "/api/v2/courses/{course_id}/updates/page", MEMBER),
    ("GET", "/api/v2/courses/{course_id}/usergroups", STAFF),
    ("DELETE", "/api/v2/discussions/{discussion_id}", SUBJECT),
    ("GET", "/api/v2/discussions/{discussion_id}", MEMBER),
    ("PATCH", "/api/v2/discussions/{discussion_id}", SUBJECT),
    ("PUT", "/api/v2/discussions/{discussion_id}/dislike", MEMBER),
    ("PUT", "/api/v2/discussions/{discussion_id}/like", MEMBER),
    ("GET", "/api/v2/discussions/{discussion_id}/replies", MEMBER),
    // Anonymous: an empty list.
    ("GET", "/api/v2/enrollments", ALL),
    ("DELETE", "/api/v2/enrollments/{course_id}", MEMBER),
    ("POST", "/api/v2/enrollments/{course_id}", MEMBER),
    (
        "GET",
        "/api/v2/file-submission-attempts/{attempt_id}",
        SUBJECT,
    ),
    (
        "PATCH",
        "/api/v2/file-submission-attempts/{attempt_id}/grade",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/file-submission-attempts/{attempt_id}/grading-history",
        SUBJECT,
    ),
    (
        "GET",
        "/api/v2/file-submission-files/{file_id}/url",
        SUBJECT,
    ),
    ("POST", "/api/v2/file-submissions", STAFF),
    (
        "GET",
        "/api/v2/file-submissions/{file_submission_id}",
        MEMBER,
    ),
    (
        "PATCH",
        "/api/v2/file-submissions/{file_submission_id}",
        STAFF,
    ),
    (
        "POST",
        "/api/v2/file-submissions/{file_submission_id}/deadline-extensions",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/file-submissions/{file_submission_id}/draft",
        NONE,
    ),
    (
        "PATCH",
        "/api/v2/file-submissions/{file_submission_id}/draft",
        MEMBER,
    ),
    (
        "POST",
        "/api/v2/file-submissions/{file_submission_id}/draft",
        MEMBER,
    ),
    (
        "GET",
        "/api/v2/file-submissions/{file_submission_id}/me",
        MEMBER,
    ),
    (
        "POST",
        "/api/v2/file-submissions/{file_submission_id}/publish",
        STAFF,
    ),
    (
        "POST",
        "/api/v2/file-submissions/{file_submission_id}/publish-grades",
        STAFF,
    ),
    (
        "POST",
        "/api/v2/file-submissions/{file_submission_id}/return-grades",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/file-submissions/{file_submission_id}/submissions",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/file-submissions/{file_submission_id}/submissions/export",
        STAFF,
    ),
    (
        "GET",
        "/api/v2/file-submissions/{file_submission_id}/submissions/stats",
        STAFF,
    ),
    (
        "POST",
        "/api/v2/file-submissions/{file_submission_id}/submit",
        MEMBER,
    ),
    (
        "POST",
        "/api/v2/file-submissions/{file_submission_id}/unpublish",
        STAFF,
    ),
    ("GET", "/api/v2/gamification", SIGNED),
    ("GET", "/api/v2/gamification/config", ADM),
    ("PUT", "/api/v2/gamification/config", ADM),
    ("GET", "/api/v2/gamification/leaderboard", SIGNED),
    ("PATCH", "/api/v2/gamification/preferences", SIGNED),
    ("GET", "/api/v2/gamification/rank", SIGNED),
    ("POST", "/api/v2/gamification/streaks/{kind}", SIGNED),
    ("POST", "/api/v2/gamification/xp", ADM),
    ("GET", "/api/v2/gamification/xp/history", SIGNED),
    // Groups: the instructor role holds `usergroup:read:platform` (it links
    // groups to its own courses); learners see none.
    ("GET", "/api/v2/groups", TEACHER),
    ("POST", "/api/v2/groups", TEACHER),
    ("DELETE", "/api/v2/groups/{group_id}", STAFF),
    ("GET", "/api/v2/groups/{group_id}", TEACHER),
    ("PATCH", "/api/v2/groups/{group_id}", STAFF),
    ("DELETE", "/api/v2/groups/{group_id}/courses", STAFF),
    ("GET", "/api/v2/groups/{group_id}/courses", TEACHER),
    ("POST", "/api/v2/groups/{group_id}/courses", STAFF),
    ("DELETE", "/api/v2/groups/{group_id}/members", STAFF),
    ("GET", "/api/v2/groups/{group_id}/members", TEACHER),
    ("POST", "/api/v2/groups/{group_id}/members", STAFF),
    ("GET", "/api/v2/groups/{group_id}/members/page", TEACHER),
    ("GET", "/api/v2/health", ALL),
    ("GET", "/api/v2/health/ready", ALL),
    ("GET", "/api/v2/me/agenda", SIGNED),
    ("GET", "/api/v2/me/certificates", SIGNED),
    ("GET", "/api/v2/me/certificates/page", SIGNED),
    ("GET", "/api/v2/me/events", SIGNED),
    ("GET", "/api/v2/me/notification-preferences", SIGNED),
    ("PUT", "/api/v2/me/notification-preferences", SIGNED),
    ("GET", "/api/v2/me/notifications", SIGNED),
    ("POST", "/api/v2/me/notifications/read-all", SIGNED),
    ("GET", "/api/v2/me/notifications/unread-count", SIGNED),
    // The learner's own notification.
    (
        "POST",
        "/api/v2/me/notifications/{notification_id}/read",
        LRN,
    ),
    ("GET", "/api/v2/platform", ALL),
    ("PATCH", "/api/v2/platform", ADM),
    (
        "DELETE",
        "/api/v2/progress/activities/{activity_id}",
        MEMBER,
    ),
    ("POST", "/api/v2/progress/activities/{activity_id}", MEMBER),
    ("GET", "/api/v2/rbac/roles", ADM),
    ("POST", "/api/v2/rbac/roles", ADM),
    ("DELETE", "/api/v2/rbac/roles/{slug}", ADM),
    ("GET", "/api/v2/rbac/roles/{slug}", ADM),
    ("PATCH", "/api/v2/rbac/roles/{slug}", ADM),
    ("PUT", "/api/v2/rbac/roles/{slug}/permissions", ADM),
    ("GET", "/api/v2/search", ALL),
    // The learner's own view; staff read it through review/grading-history.
    ("GET", "/api/v2/submissions/{submission_id}", LRN),
    ("PATCH", "/api/v2/submissions/{submission_id}/draft", LRN),
    ("GET", "/api/v2/submissions/{submission_id}/events", SUBJECT),
    ("GET", "/api/v2/submissions/{submission_id}/feedback", LRN),
    ("PATCH", "/api/v2/submissions/{submission_id}/grade", STAFF),
    (
        "GET",
        "/api/v2/submissions/{submission_id}/grading-history",
        STAFF,
    ),
    ("GET", "/api/v2/submissions/{submission_id}/review", STAFF),
    ("POST", "/api/v2/submissions/{submission_id}/submit", LRN),
    (
        "POST",
        "/api/v2/submissions/{submission_id}/violations",
        LRN,
    ),
    ("GET", "/api/v2/trail", ALL),
    ("DELETE", "/api/v2/trail/activities/{activity_id}", MEMBER),
    ("POST", "/api/v2/trail/activities/{activity_id}", MEMBER),
    ("DELETE", "/api/v2/trail/courses/{course_id}", MEMBER),
    ("POST", "/api/v2/trail/courses/{course_id}", MEMBER),
    ("POST", "/api/v2/uploads", SIGNED),
    // The learner's own (file-submission) upload.
    // Its creator (303 to storage); staff use file-submission-files/{id}/url.
    ("GET", "/api/v2/uploads/{upload_id}/download", LRN),
    ("POST", "/api/v2/uploads/{upload_id}/finalize", LRN),
    ("DELETE", "/api/v2/uploads/{upload_id}/multipart", LRN),
    ("POST", "/api/v2/uploads/{upload_id}/multipart", LRN),
    ("GET", "/api/v2/usergroups", TEACHER),
    ("POST", "/api/v2/usergroups", TEACHER),
    ("DELETE", "/api/v2/usergroups/{usergroup_id}", STAFF),
    ("GET", "/api/v2/usergroups/{usergroup_id}", TEACHER),
    ("PATCH", "/api/v2/usergroups/{usergroup_id}", STAFF),
    ("DELETE", "/api/v2/usergroups/{usergroup_id}/courses", STAFF),
    ("GET", "/api/v2/usergroups/{usergroup_id}/courses", TEACHER),
    ("POST", "/api/v2/usergroups/{usergroup_id}/courses", STAFF),
    ("DELETE", "/api/v2/usergroups/{usergroup_id}/members", STAFF),
    ("GET", "/api/v2/usergroups/{usergroup_id}/members", TEACHER),
    ("POST", "/api/v2/usergroups/{usergroup_id}/members", STAFF),
    (
        "GET",
        "/api/v2/usergroups/{usergroup_id}/members/page",
        TEACHER,
    ),
    ("GET", "/api/v2/users", ADM),
    ("POST", "/api/v2/users", ADM),
    ("GET", "/api/v2/users/by-id/{user_id}", ALL),
    ("GET", "/api/v2/users/by-id/{user_id}/admin", ADM),
    ("GET", "/api/v2/users/me", SIGNED),
    ("PATCH", "/api/v2/users/me", SIGNED),
    ("POST", "/api/v2/users/me/deletion", SIGNED),
    ("POST", "/api/v2/users/{user_id}/roles", ADM),
    ("DELETE", "/api/v2/users/{user_id}/roles/{slug}", ADM),
    ("PATCH", "/api/v2/users/{user_id}/status", ADM),
    ("GET", "/api/v2/users/{username}", ALL),
    ("GET", "/api/v2/users/{username}/courses", ALL),
    ("GET", "/api/v2/users/{username}/certificates", ALL),
    ("GET", "/api/v2/utils/link-preview", NONE),
    ("GET", "/api/v2/work", SIGNED),
];

/// Required query strings.
const QUERIES: &[(&str, &str)] = &[
    ("/api/v2/search", "q=E2E"),
    ("/api/v2/utils/link-preview", "url=http://10.0.0.1:9/"),
];

/// Writes whose body names the resource: a valid body, so the probe meets
/// the real gate (`$course`, `$chapter`, `$learner` are this world's ids).
/// Everything else gets `{}` - its gate comes before the body (UX-311).
const BODIES: &[(&str, &str, &str)] = &[
    (
        "POST",
        "/api/v2/analytics/teacher/interventions",
        r#"{"course_id":"$course","user_id":"$learner","intervention_type":"message_sent"}"#,
    ),
    (
        "POST",
        "/api/v2/certifications",
        r#"{"course_id":"$course"}"#,
    ),
    (
        "POST",
        "/api/v2/assessments",
        r#"{"chapter_id":"$chapter","kind":"quiz","title":"Probe"}"#,
    ),
    (
        "POST",
        "/api/v2/file-submissions",
        r#"{"chapter_id":"$chapter","title":"Probe"}"#,
    ),
    ("POST", "/api/v2/courses", r#"{"name":"Probe"}"#),
    ("POST", "/api/v2/collections", r#"{"name":"Probe"}"#),
    ("POST", "/api/v2/groups", r#"{"name":"Probe"}"#),
    ("POST", "/api/v2/usergroups", r#"{"name":"Probe"}"#),
    (
        "POST",
        "/api/v2/analytics/teacher/saved-views",
        r#"{"name":"Probe"}"#,
    ),
];

const JUNK: &str = "00000000-0000-7000-8000-000000000000";

/// The world's ids, by path parameter (and, where one name means several
/// things, by route).
struct World {
    ids: BTreeMap<&'static str, String>,
    sessions: BTreeMap<u8, MintedSession>,
}

impl World {
    fn id(&self, key: &str) -> String {
        self.ids
            .get(key)
            .cloned()
            .unwrap_or_else(|| JUNK.to_owned())
    }

    fn body(&self, method: &str, path: &str) -> String {
        BODIES
            .iter()
            .find(|(m, p, _)| *m == method && *p == path)
            .map_or_else(
                || "{}".to_owned(),
                |(_, _, body)| {
                    body.replace("$course", &self.id("course_id"))
                        .replace("$chapter", &self.id("chapter_id"))
                        .replace("$learner", &self.id("user_id"))
                },
            )
    }

    /// The concrete URI of `path` (OpenAPI template) in this world.
    fn uri(&self, path: &str) -> String {
        let activity = if path.ends_with("/assessment") {
            "quiz_activity"
        } else if path.ends_with("/file-submission") {
            "file_activity"
        } else {
            "dynamic_activity"
        };
        let item = if path.contains("/runs") || path.contains("reference-check") {
            "code_item"
        } else {
            "quiz_item"
        };
        let mut uri = String::new();
        for segment in path.split('/').filter(|s| !s.is_empty()) {
            uri.push('/');
            let value = match segment {
                "{run_id}" if path.starts_with("/api/v2/ai/") => self.id("ai_run_id"),
                "{activity_id}" => self.id(activity),
                "{item_id}" => self.id(item),
                "{assessment_type}" => "quiz".to_owned(),
                "{kind}" => "learning".to_owned(),
                "{metric}" => "active_learners".to_owned(),
                "{key}" => "course_qa".to_owned(),
                "{slug}" => "user".to_owned(),
                s if s.starts_with('{') => self.id(s.trim_matches(|c| c == '{' || c == '}')),
                s => s.to_owned(),
            };
            uri.push_str(&value);
        }
        if let Some((_, query)) = QUERIES.iter().find(|(p, _)| *p == path) {
            uri.push('?');
            uri.push_str(query);
        }
        uri
    }
}

async fn send(
    app: &TestApp,
    method: &str,
    uri: &str,
    who: Option<&MintedSession>,
    body: String,
) -> StatusCode {
    let mut request = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(session) = who {
        request = request.header(header::COOKIE, &session.cookie);
    }
    let body = if method == "GET" {
        Body::empty()
    } else {
        Body::from(body)
    };
    // Only headers are needed, including for SSE. A hung handler must fail, never masquerade as 200.
    tokio::time::timeout(
        Duration::from_secs(10),
        app.status(request.body(body).unwrap()),
    )
    .await
    .expect("permission probe did not produce HTTP headers within 10s")
}

async fn mount_zitadel(app: &TestApp) {
    for username in [
        "e2e-admin",
        "e2e-teacher",
        "e2e-student1",
        "e2e-student2",
        "e2e-learner-001",
    ] {
        Mock::given(method("POST"))
            .and(path("/v2/users/human"))
            .and(wiremock::matchers::body_partial_json(
                json!({ "username": username }),
            ))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({
                "userId": format!("z-{username}"), "details": {}
            })))
            .mount(&app.zitadel)
            .await;
    }
}

async fn session_of(app: &TestApp, user: ab_core::id::UserId) -> MintedSession {
    let (_, grants) = ab_db::identity::load_user_grants(&app.pool, user)
        .await
        .unwrap();
    let grants: Vec<&str> = grants.iter().map(String::as_str).collect();
    app.mint_session_for(user, &grants).await
}

async fn user_id(app: &TestApp, username: &str) -> ab_core::id::UserId {
    ab_db::identity::find_user_id_by_username(&app.pool, username)
        .await
        .unwrap()
        .unwrap()
}

fn ok(res: &ab_testkit::TestResponse, what: &str) -> Value {
    assert!(
        res.status.is_success(),
        "{what}: {} {}",
        res.status,
        res.text()
    );
    if res.text().is_empty() {
        Value::Null
    } else {
        res.json()
    }
}

/// seed-e2e's course made private and opened to a group; the learner's
/// work in it.
#[allow(clippy::too_many_lines)] // one linear fixture script: splitting it only scatters the ids
async fn world(app: &TestApp) -> World {
    mount_zitadel(app).await;
    ab_testkit::gojudge::FakeJudge::mount(&app.runner, |_, _| {
        ab_testkit::gojudge::CaseVerdict::accepted("4")
    })
    .await;
    let password = secrecy::SecretString::from("seed-pass-123");
    let report = serde_json::to_value(
        ab_api::seed::seed_e2e(&app.state, &password, 1)
            .await
            .unwrap(),
    )
    .unwrap();
    let course = report["course"]["id"].as_str().unwrap().to_owned();
    let activity = |kind: &str| {
        report["course"]["activities"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a["activity_type"] == kind)
            .map(|a| a["id"].as_str().unwrap().to_owned())
            .unwrap()
    };
    let mut ids: BTreeMap<&'static str, String> = BTreeMap::new();
    ids.insert("course_id", course.clone());
    for (key, kind) in [
        ("dynamic_activity", "dynamic"),
        ("document_activity", "document"),
        ("quiz_activity", "quiz"),
        ("file_activity", "file_submission"),
        ("code_activity", "code_challenge"),
    ] {
        ids.insert(key, activity(kind));
    }

    let instructor = app
        .create_user(
            "r-instructor",
            "r-instructor@example.com",
            &["user", "instructor"],
        )
        .await;
    let mut sessions = BTreeMap::new();
    for (bit, user) in [
        (OUT, user_id(app, "e2e-student2").await),
        (PEER, user_id(app, "e2e-learner-001").await),
        (LRN, user_id(app, "e2e-student1").await),
        (INS, instructor),
        (OWN, user_id(app, "e2e-teacher").await),
        (ADM, user_id(app, "e2e-admin").await),
    ] {
        sessions.insert(bit, session_of(app, user).await);
    }
    let s = |bit: u8| sessions.get(&bit).unwrap().clone();
    let (owner, learner, peer) = (s(OWN), s(LRN), s(PEER));
    ids.insert("user_id", learner.user_id.0.to_string());
    ids.insert("username", "e2e-student1".to_owned());

    // Private, reachable through a group holding the learner and the peer.
    sqlx::query("UPDATE courses SET public = false WHERE id = $1::uuid")
        .bind(&course)
        .execute(&app.pool)
        .await
        .unwrap();
    let group = ok(
        &app.post_as(&owner, "/api/v2/groups", &json!({ "name": "R cohort" }))
            .await,
        "group",
    )["id"]
        .as_str()
        .unwrap()
        .to_owned();
    ok(
        &app.post_as(
            &owner,
            &format!("/api/v2/groups/{group}/members"),
            &json!({ "user_ids": [learner.user_id, peer.user_id] }),
        )
        .await,
        "group members",
    );
    ok(
        &app.post_as(
            &owner,
            &format!("/api/v2/groups/{group}/courses"),
            &json!({ "course_ids": [course] }),
        )
        .await,
        "group course",
    );
    ids.insert("group_id", group.clone());
    ids.insert("usergroup_id", group);
    ok(
        &app.post_as(&peer, &format!("/api/v2/enrollments/{course}"), &json!({}))
            .await,
        "peer enrols",
    );

    // Structure: chapter, assessments, items, file task, a block.
    let curriculum = ok(
        &app.get_as(&owner, &format!("/api/v2/courses/{course}/curriculum"))
            .await,
        "curriculum",
    );
    let chapter = curriculum["chapters"][0]["id"].as_str().unwrap().to_owned();
    ids.insert("chapter_id", chapter);
    let mut assessment_of = BTreeMap::new();
    for key in ["quiz_activity", "code_activity"] {
        let activity = &ids[key];
        let found = ok(
            &app.get_as(&owner, &format!("/api/v2/activities/{activity}/assessment"))
                .await,
            "assessment",
        );
        let id = found["id"].as_str().unwrap().to_owned();
        let detail = ok(
            &app.get_as(&owner, &format!("/api/v2/assessments/{id}"))
                .await,
            "detail",
        );
        assessment_of.insert(
            key,
            (id, detail["items"][0]["id"].as_str().unwrap().to_owned()),
        );
    }
    let (quiz_id, quiz_item) = assessment_of["quiz_activity"].clone();
    ids.insert("assessment_id", quiz_id.clone());
    ids.insert("quiz_item", quiz_item);
    ids.insert("code_item", assessment_of["code_activity"].1.clone());
    let file_activity = ids["file_activity"].clone();
    let file_task = ok(
        &app.get_as(
            &owner,
            &format!("/api/v2/activities/{file_activity}/file-submission"),
        )
        .await,
        "file task",
    )["id"]
        .as_str()
        .unwrap()
        .to_owned();
    ids.insert("file_submission_id", file_task.clone());
    // An image block on the dynamic page.
    let image = finalized_upload(app, &owner, "block-image", "image/png", PNG.to_vec()).await;
    let dynamic = ids["dynamic_activity"].clone();
    let block = ok(
        &app.post_as(
            &owner,
            &format!("/api/v2/activities/{dynamic}/blocks"),
            &json!({ "block_type": "image", "upload_id": image }),
        )
        .await,
        "block",
    );
    ids.insert("block_id", block["id"].as_str().unwrap().to_owned());

    // The learner's work: a submitted quiz, a handed-in file, a post.
    let draft = ok(
        &app.post_as(
            &learner,
            &format!("/api/v2/assessments/{quiz_id}/submissions"),
            &json!({}),
        )
        .await,
        "quiz start",
    );
    let submission = draft["id"].as_str().unwrap().to_owned();
    ok(
        &app.post_as(
            &learner,
            &format!("/api/v2/submissions/{submission}/submit"),
            &json!({ "answers": {} }),
        )
        .await,
        "quiz submit",
    );
    ids.insert("submission_id", submission);
    let attempt = ok(
        &app.post_as(
            &learner,
            &format!("/api/v2/file-submissions/{file_task}/draft"),
            &json!({}),
        )
        .await,
        "file draft",
    )["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let upload = finalized_upload(
        app,
        &learner,
        "file-submission",
        "application/pdf",
        b"%PDF-1.4
%%EOF
"
        .to_vec(),
    )
    .await;
    let saved = ok(
        &app.patch_as(
            &learner,
            &format!("/api/v2/file-submissions/{file_task}/draft"),
            &json!({ "files": [{ "upload_id": upload, "display_name": "work.pdf" }] }),
        )
        .await,
        "file draft save",
    );
    let submitted = app
        .send(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v2/file-submissions/{file_task}/submit"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &learner.cookie)
                .header(header::IF_MATCH, saved["version"].to_string())
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await;
    ok(&submitted, "file submit");
    let attempt_detail = ok(
        &app.get_as(
            &learner,
            &format!("/api/v2/file-submission-attempts/{attempt}"),
        )
        .await,
        "attempt",
    );
    ids.insert("attempt_id", attempt);
    ids.insert("upload_id", upload);
    if let Some(file) = attempt_detail["files"].get(0) {
        ids.insert("file_id", file["id"].as_str().unwrap().to_owned());
    }
    let code_item = ids["code_item"].clone();
    let run = ok(
        &app.post_as(
            &learner,
            &format!("/api/v2/assessment-items/{code_item}/runs"),
            &json!({ "language_id": 71, "source": "print(4)" }),
        )
        .await,
        "code run",
    );
    ids.insert("run_id", run["id"].as_str().unwrap().to_owned());
    // A real learner-owned AI run: a missing id cannot prove ownership enforcement.
    let ai_run = ok(
        &app.post_as(
            &learner,
            &format!("/api/v2/ai/study/{course}/ask/queue"),
            &json!({ "question": "Explain the first lesson", "language": "en" }),
        )
        .await,
        "learner AI run",
    );
    ids.insert("ai_run_id", ai_run["id"].as_str().unwrap().to_owned());
    let post = ok(
        &app.post_as(
            &learner,
            &format!("/api/v2/courses/{course}/discussions"),
            &json!({ "content": "Hello" }),
        )
        .await,
        "post",
    );
    ids.insert("discussion_id", post["id"].as_str().unwrap().to_owned());

    // Staff things: an announcement, a certification issued to the learner,
    // a collection, an intervention and a saved view.
    let update = ok(
        &app.post_as(
            &owner,
            &format!("/api/v2/courses/{course}/updates"),
            &json!({ "title": "News", "content": "Week 2 is out." }),
        )
        .await,
        "course update",
    );
    ids.insert("update_id", update["id"].as_str().unwrap().to_owned());
    let certification = ok(
        &app.post_as(
            &owner,
            "/api/v2/certifications",
            &json!({ "course_id": course }),
        )
        .await,
        "certification",
    )["id"]
        .as_str()
        .unwrap()
        .to_owned();
    sqlx::query(
        "INSERT INTO certificate_users (certification_id, user_id, verify_code) \
         VALUES ($1::uuid, $2, 'R-MATRIX-CODE')",
    )
    .bind(&certification)
    .bind(learner.user_id.0)
    .execute(&app.pool)
    .await
    .unwrap();
    ids.insert("certification_id", certification);
    ids.insert("code", "R-MATRIX-CODE".to_owned());
    let collection = ok(
        &app.post_as(
            &owner,
            "/api/v2/collections",
            &json!({ "name": "R shelf", "public": false, "courses": [course] }),
        )
        .await,
        "collection",
    );
    ids.insert(
        "collection_id",
        collection["id"].as_str().unwrap().to_owned(),
    );
    let intervention = ok(
        &app.post_as(
            &owner,
            "/api/v2/analytics/teacher/interventions",
            &json!({ "course_id": course, "user_id": learner.user_id, "intervention_type": "message_sent" }),
        )
        .await,
        "intervention",
    );
    ids.insert(
        "intervention_id",
        intervention["id"].as_str().unwrap().to_owned(),
    );
    let view = ok(
        &app.post_as(
            &owner,
            "/api/v2/analytics/teacher/saved-views",
            &json!({ "name": "Mine" }),
        )
        .await,
        "saved view",
    );
    ids.insert("view_id", view["id"].as_str().unwrap().to_owned());
    let notification: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO notifications (user_id, kind, payload) VALUES ($1, 'course_update', '{}') RETURNING id",
    )
    .bind(learner.user_id.0)
    .fetch_one(&app.pool)
    .await
    .unwrap();
    ids.insert("notification_id", notification.to_string());
    let handles = ok(
        &app.get_as(&learner, "/api/v2/auth/sessions").await,
        "sessions",
    );
    let handle = handles["items"]
        .get(0)
        .or_else(|| handles.get(0))
        .and_then(|s| s["handle"].as_str())
        .unwrap()
        .to_owned();
    ids.insert("handle", handle);

    World { ids, sessions }
}

/// A 1x1 PNG.
const PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0xDA, 0x63, 0x64, 0x60, 0xF8, 0x5F,
    0x0F, 0x00, 0x02, 0x87, 0x01, 0x80, 0xEB, 0x47, 0xBA, 0x92, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

/// The browser's part of an upload: create, PUT to storage, finalize.
async fn finalized_upload(
    app: &TestApp,
    who: &MintedSession,
    purpose: &str,
    mime: &str,
    payload: Vec<u8>,
) -> String {
    let created = ok(
        &app.post_as(
            who,
            "/api/v2/uploads",
            &json!({ "purpose": purpose, "mime": mime, "size_bytes": payload.len() }),
        )
        .await,
        "upload",
    );
    let put = reqwest::Client::new()
        .put(created["put_url"].as_str().unwrap())
        .header("content-type", mime)
        .header("if-none-match", "*")
        .body(payload)
        .send()
        .await
        .unwrap();
    assert!(put.status().is_success(), "presigned PUT: {}", put.status());
    let id = created["id"].as_str().unwrap().to_owned();
    ok(
        &app.post_as(who, &format!("/api/v2/uploads/{id}/finalize"), &json!({}))
            .await,
        "finalize",
    );
    id
}

fn names(mask: u8) -> String {
    let list: Vec<&str> = CALLERS
        .iter()
        .filter(|(bit, _)| mask & bit != 0)
        .map(|(_, name)| *name)
        .collect();
    if list.is_empty() {
        "nobody".to_owned()
    } else {
        list.join("+")
    }
}

#[ab_testdb::test]
async fn every_route_answers_only_the_callers_it_should(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let doc = ab_api::openapi_doc();

    // 1. Every operation is classified, and no row is stale.
    let mut operations = Vec::new();
    for (path, ops) in doc["paths"].as_object().unwrap() {
        for method in ops.as_object().unwrap().keys() {
            operations.push((method.to_uppercase(), path.clone()));
        }
    }
    let missing: Vec<String> = operations
        .iter()
        .filter(|(m, p)| !MATRIX.iter().any(|(mm, pp, _)| mm == m && pp == p))
        .map(|(m, p)| format!("(\"{m}\", \"{p}\", ?),"))
        .collect();
    assert!(
        missing.is_empty(),
        "routes missing from MATRIX in permission_matrix.rs (state who may get a 2xx):\n{}",
        missing.join("\n")
    );
    let stale: Vec<String> = MATRIX
        .iter()
        .filter(|(m, p, _)| !operations.iter().any(|(mm, pp)| mm == m && pp == p))
        .map(|(m, p, _)| format!("{m} {p}"))
        .collect();
    assert!(
        stale.is_empty(),
        "MATRIX rows without a route:\n{}",
        stale.join("\n")
    );

    let world = world(&app).await;
    let mut failures = Vec::new();

    // 2. Reads: the callers answering 2xx are exactly the listed ones.
    for (method, path, allowed) in MATRIX.iter().filter(|(m, _, _)| *m == "GET") {
        let uri = world.uri(path);
        let mut answered = 0u8;
        let mut statuses = Vec::new();
        for (bit, name) in CALLERS {
            let status = send(&app, method, &uri, world.sessions.get(&bit), String::new()).await;
            statuses.push(format!("{name}={}", status.as_u16()));
            // The link-preview probe deliberately names a private URL: signed-in callers reach its SSRF validator.
            let denied = if *path == "/api/v2/utils/link-preview" && bit != ANON {
                status == StatusCode::UNPROCESSABLE_ENTITY
            } else {
                matches!(status.as_u16(), 401 | 403 | 404)
            };
            if allowed & bit == 0 && !denied {
                failures.push(format!(
                    "GET {path}: refused {name} got {status}, expected 401/403/404"
                ));
            }
            // A redirect to the resource (a download's 303) grants it too.
            if status.is_success() || status.is_redirection() {
                answered |= bit;
            }
        }
        let expected = *allowed;
        if answered != expected {
            failures.push(format!(
                "GET {path}: 2xx for {} - listed {} ({})",
                names(answered),
                names(expected),
                statuses.join(" ")
            ));
        }
    }

    // 3. Writes, refused callers only; deletes last.
    let writes = MATRIX
        .iter()
        .filter(|(m, _, _)| *m != "GET" && *m != "DELETE");
    let deletes = MATRIX.iter().filter(|(m, _, _)| *m == "DELETE");
    for (method, path, allowed) in writes.chain(deletes) {
        let uri = world.uri(path);
        for (bit, name) in CALLERS {
            if allowed & bit != 0 {
                continue;
            }
            let status = send(
                &app,
                method,
                &uri,
                world.sessions.get(&bit),
                world.body(method, path),
            )
            .await;
            if !matches!(status.as_u16(), 401 | 403 | 404) {
                failures.push(format!("{method} {path}: {name} got {status}"));
            }
        }
    }
    assert!(
        failures.is_empty(),
        "{} permission matrix violation(s) - a wrong row, or a leak to fix in the domain service:\n{}",
        failures.len(),
        failures.join("\n")
    );
}
