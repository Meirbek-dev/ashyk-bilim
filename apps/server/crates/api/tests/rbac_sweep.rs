//! RBAC sweep (slice 0.11): every mutating operation in the OpenAPI document
//! must be explicitly security-classified, and permission-gated operations
//! must reject a session that holds zero grants.
//!
//! Adding a mutating endpoint without adding it to exactly one list below
//! fails this suite - that forced classification IS the review.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::TestApp;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use sqlx::PgPool;

/// No session required at all.
const PUBLIC: &[(&str, &str)] = &[
    ("POST", "/api/v2/auth/login"),
    ("POST", "/api/v2/auth/register"),
    ("POST", "/api/v2/auth/verify-email"),
    ("POST", "/api/v2/auth/verify-email/resend"),
    ("POST", "/api/v2/auth/password-reset"),
    ("POST", "/api/v2/auth/password-reset/confirm"),
];

/// Requires a live session, but no specific permission (self-service).
const AUTH_ONLY: &[(&str, &str)] = &[
    ("POST", "/api/v2/auth/logout"),
    ("POST", "/api/v2/auth/password"),
    ("DELETE", "/api/v2/auth/sessions/{handle}"),
    ("POST", "/api/v2/auth/mfa/totp"),
    ("POST", "/api/v2/auth/mfa/totp/verify"),
    ("DELETE", "/api/v2/auth/mfa/totp"),
    // Ownership checked internally (created_by == actor).
    ("POST", "/api/v2/uploads/{upload_id}/finalize"),
    // Gamification self-service: streak touch and preferences.
    ("POST", "/api/v2/gamification/streaks/{kind}"),
    ("PATCH", "/api/v2/gamification/preferences"),
    // Any signed-in user may apply on an open course (visibility → 404).
    ("POST", "/api/v2/courses/{course_id}/contributors/apply"),
    // Notifications: the caller's own rows only (others' ids are 404).
    ("POST", "/api/v2/me/notifications/{notification_id}/read"),
    ("POST", "/api/v2/me/notifications/read-all"),
    ("PUT", "/api/v2/me/notification-preferences"),
];

/// Requires specific grants: a zero-grant session must NOT reach a 2xx.
const PERMISSION_GATED: &[(&str, &str)] = &[
    ("DELETE", "/api/v2/courses/{course_id}/learners/{user_id}"),
    ("PATCH", "/api/v2/users/me"),
    ("POST", "/api/v2/users/{user_id}/roles"),
    ("DELETE", "/api/v2/users/{user_id}/roles/{slug}"),
    ("POST", "/api/v2/uploads"),
    ("POST", "/api/v2/courses"),
    ("PATCH", "/api/v2/courses/{course_id}"),
    ("POST", "/api/v2/courses/{course_id}/lifecycle"),
    ("DELETE", "/api/v2/courses/{course_id}"),
    // Contributor roster: creator / active maintainer / course:manage:platform.
    ("POST", "/api/v2/courses/{course_id}/contributors"),
    (
        "PATCH",
        "/api/v2/courses/{course_id}/contributors/{user_id}",
    ),
    (
        "DELETE",
        "/api/v2/courses/{course_id}/contributors/{user_id}",
    ),
    // Curriculum authoring inherits course write access (creator+own or
    // platform update); zero-grant probes 404 on the unknown course.
    ("POST", "/api/v2/courses/{course_id}/chapters"),
    ("PATCH", "/api/v2/chapters/{chapter_id}"),
    ("DELETE", "/api/v2/chapters/{chapter_id}"),
    ("POST", "/api/v2/chapters/{chapter_id}/move"),
    ("POST", "/api/v2/chapters/{chapter_id}/activities"),
    ("PATCH", "/api/v2/activities/{activity_id}"),
    ("DELETE", "/api/v2/activities/{activity_id}"),
    ("POST", "/api/v2/activities/{activity_id}/move"),
    ("POST", "/api/v2/activities/{activity_id}/blocks"),
    ("DELETE", "/api/v2/blocks/{block_id}"),
    // Course announcements follow course write access.
    ("POST", "/api/v2/courses/{course_id}/updates"),
    ("PATCH", "/api/v2/course-updates/{update_id}"),
    ("DELETE", "/api/v2/course-updates/{update_id}"),
    ("POST", "/api/v2/collections"),
    ("PATCH", "/api/v2/collections/{collection_id}"),
    ("DELETE", "/api/v2/collections/{collection_id}"),
    ("PATCH", "/api/v2/platform"),
    // Admin user management (platform:manage:platform).
    ("POST", "/api/v2/users"),
    ("PATCH", "/api/v2/users/{user_id}/status"),
    // Usergroups (usergroup:create/manage:platform; creator-own writes).
    ("POST", "/api/v2/usergroups"),
    ("PATCH", "/api/v2/usergroups/{usergroup_id}"),
    ("DELETE", "/api/v2/usergroups/{usergroup_id}"),
    ("POST", "/api/v2/usergroups/{usergroup_id}/members"),
    ("DELETE", "/api/v2/usergroups/{usergroup_id}/members"),
    ("POST", "/api/v2/usergroups/{usergroup_id}/courses"),
    ("DELETE", "/api/v2/usergroups/{usergroup_id}/courses"),
    // Assessment authoring (assessment:author / publish; platform or creator-own).
    ("POST", "/api/v2/assessments"),
    ("PATCH", "/api/v2/assessments/{assessment_id}"),
    ("PUT", "/api/v2/assessments/{assessment_id}/policy"),
    ("POST", "/api/v2/assessments/{assessment_id}/lifecycle"),
    ("POST", "/api/v2/assessments/{assessment_id}/duplicate"),
    ("POST", "/api/v2/assessments/{assessment_id}/items"),
    ("POST", "/api/v2/assessments/{assessment_id}/items/reorder"),
    ("PATCH", "/api/v2/assessment-items/{item_id}"),
    ("DELETE", "/api/v2/assessment-items/{item_id}"),
    ("PUT", "/api/v2/assessments/{assessment_id}/access"),
    (
        "POST",
        "/api/v2/assessments/{assessment_id}/overrides/{user_id}",
    ),
    (
        "PUT",
        "/api/v2/assessments/{assessment_id}/overrides/{user_id}",
    ),
    (
        "DELETE",
        "/api/v2/assessments/{assessment_id}/overrides/{user_id}",
    ),
    // Learner attempts: submit access (course + allowlist +
    // assessment:submit:assigned) on start; ownership on the rest, where a
    // zero-grant probe 404s on the unknown submission.
    ("POST", "/api/v2/assessments/{assessment_id}/submissions"),
    ("PATCH", "/api/v2/submissions/{submission_id}/draft"),
    ("POST", "/api/v2/submissions/{submission_id}/violations"),
    ("POST", "/api/v2/submissions/{submission_id}/submit"),
    // Code runs: submit access on the item's assessment (zero-grant probes
    // 404 on the unknown item); reference checks are author-only.
    ("POST", "/api/v2/assessment-items/{item_id}/runs"),
    (
        "POST",
        "/api/v2/assessments/{assessment_id}/reference-check",
    ),
    // Teacher grading (assessment:grade platform / course creator own).
    ("PATCH", "/api/v2/submissions/{submission_id}/grade"),
    ("POST", "/api/v2/assessments/{assessment_id}/publish-grades"),
    (
        "POST",
        "/api/v2/assessments/{assessment_id}/deadline-extensions",
    ),
    // File submissions: authoring (assessment:author own/platform), learner
    // attempts (submit access), grading (assessment:grade); zero-grant probes
    // 404 on the unknown activity/attempt.
    ("POST", "/api/v2/file-submissions"),
    ("PATCH", "/api/v2/file-submissions/{file_submission_id}"),
    (
        "POST",
        "/api/v2/file-submissions/{file_submission_id}/publish",
    ),
    (
        "POST",
        "/api/v2/file-submissions/{file_submission_id}/draft",
    ),
    (
        "PATCH",
        "/api/v2/file-submissions/{file_submission_id}/draft",
    ),
    (
        "POST",
        "/api/v2/file-submissions/{file_submission_id}/submit",
    ),
    (
        "PATCH",
        "/api/v2/file-submission-attempts/{attempt_id}/grade",
    ),
    // Trail writes need trail:submit:assigned / trail:update:own / trail:create:own.
    ("POST", "/api/v2/trail/courses/{course_id}"),
    ("DELETE", "/api/v2/trail/courses/{course_id}"),
    ("POST", "/api/v2/trail/activities/{activity_id}"),
    ("DELETE", "/api/v2/trail/activities/{activity_id}"),
    // Discussions: discussion:create / update|delete (own or moderate) / read for toggles.
    ("POST", "/api/v2/courses/{course_id}/discussions"),
    ("PATCH", "/api/v2/discussions/{discussion_id}"),
    ("DELETE", "/api/v2/discussions/{discussion_id}"),
    ("PUT", "/api/v2/discussions/{discussion_id}/like"),
    ("PUT", "/api/v2/discussions/{discussion_id}/dislike"),
    // Certification templates: certificate:create/update/delete (platform or course creator).
    ("POST", "/api/v2/certifications"),
    ("PATCH", "/api/v2/certifications/{certification_id}"),
    ("DELETE", "/api/v2/certifications/{certification_id}"),
    // Gamification admin: platform:manage:platform.
    ("POST", "/api/v2/gamification/xp"),
    ("PUT", "/api/v2/gamification/config"),
    // Analytics writes: analytics:read:{assigned,platform,all} + course scope.
    ("POST", "/api/v2/analytics/teacher/interventions"),
    ("POST", "/api/v2/analytics/teacher/saved-views"),
    ("DELETE", "/api/v2/analytics/teacher/saved-views/{view_id}"),
    // AI (P8): every agent entry point gates on course visibility + the
    // feature's access rule (learner course access, course write access,
    // submission owner/teacher); runs, threads and sessions are owner-scoped.
    // Zero-grant probes 404 on unknown ids or 422 on the empty body.
    ("POST", "/api/v2/ai/qa/{course_id}/chat"),
    ("DELETE", "/api/v2/ai/qa/{course_id}/threads/{thread_id}"),
    ("POST", "/api/v2/ai/study/{course_id}/ask"),
    ("POST", "/api/v2/ai/study/{course_id}/ask/queue"),
    (
        "POST",
        "/api/v2/ai/submission-analysis/{submission_id}/analyze",
    ),
    (
        "POST",
        "/api/v2/ai/submission-analysis/{submission_id}/analyze/queue",
    ),
    ("POST", "/api/v2/ai/course-analysis/{course_id}/analyze"),
    (
        "POST",
        "/api/v2/ai/course-analysis/{course_id}/analyze/queue",
    ),
    ("POST", "/api/v2/ai/course-analysis/{analysis_id}/publish"),
    (
        "POST",
        "/api/v2/ai/course-analysis/{analysis_id}/findings/review",
    ),
    ("POST", "/api/v2/ai/lecture-authoring/{course_id}/critique"),
    (
        "POST",
        "/api/v2/ai/lecture-authoring/{course_id}/critique/queue",
    ),
    (
        "POST",
        "/api/v2/ai/lecture-authoring/reviews/{review_id}/dismiss",
    ),
    ("POST", "/api/v2/ai/remediation/{submission_id}/generate"),
    (
        "POST",
        "/api/v2/ai/remediation/{submission_id}/generate/queue",
    ),
    (
        "POST",
        "/api/v2/ai/remediation/sessions/{session_id}/complete",
    ),
    ("POST", "/api/v2/ai/runs/{run_id}/cancel"),
    ("POST", "/api/v2/ai/runs/{run_id}/stream"),
    // Custom-role administration (role:manage:platform).
    ("POST", "/api/v2/rbac/roles"),
    ("PATCH", "/api/v2/rbac/roles/{slug}"),
    ("DELETE", "/api/v2/rbac/roles/{slug}"),
    ("PUT", "/api/v2/rbac/roles/{slug}/permissions"),
];

const MUTATING: &[&str] = &["post", "put", "patch", "delete"];

fn classified(method: &str, path: &str) -> bool {
    let entry = (method, path);
    PUBLIC.contains(&entry) || AUTH_ONLY.contains(&entry) || PERMISSION_GATED.contains(&entry)
}

/// Substitute path params with plausible junk.
fn concretize(path: &str) -> String {
    let mut out = String::new();
    for segment in path.split('/') {
        if segment.is_empty() {
            continue;
        }
        out.push('/');
        if segment.starts_with('{') {
            out.push_str("00000000-0000-7000-8000-000000000000");
        } else {
            out.push_str(segment);
        }
    }
    out
}

#[sqlx::test(migrations = "../../migrations")]
async fn every_mutating_operation_is_classified_and_gated(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let doc = ab_api::openapi_doc();
    let doc = serde_json::to_value(&doc).unwrap();
    let paths = doc["paths"].as_object().expect("openapi paths");

    let mut unclassified = Vec::new();
    for (path, ops) in paths {
        for (method, _op) in ops.as_object().expect("operations") {
            if !MUTATING.contains(&method.as_str()) {
                continue;
            }
            let method_upper = method.to_uppercase();
            if !classified(&method_upper, path) {
                unclassified.push(format!("{method_upper} {path}"));
            }
        }
    }
    assert!(
        unclassified.is_empty(),
        "unclassified mutating operations (add each to PUBLIC / AUTH_ONLY / \
         PERMISSION_GATED in rbac_sweep.rs after reviewing its checks):\n{}",
        unclassified.join("\n")
    );

    // Zero-grant probe: permission-gated operations must never answer 2xx.
    let powerless = app.mint_session(&[]).await;
    for (method, path) in PERMISSION_GATED {
        let res = app
            .send(
                Request::builder()
                    .method(*method)
                    .uri(concretize(path))
                    .header(header::COOKIE, &powerless.cookie)
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await;
        assert!(
            !res.status.is_success(),
            "{method} {path} answered {} to a zero-grant session",
            res.status
        );
    }

    // Auth-only operations must at least demand a session.
    for (method, path) in AUTH_ONLY {
        let res = app
            .send(
                Request::builder()
                    .method(*method)
                    .uri(concretize(path))
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await;
        assert_eq!(
            res.status,
            StatusCode::UNAUTHORIZED,
            "{method} {path} must require a session"
        );
    }
}

/// UX-311 (UX-301 sibling): a write checks the caller's permission - and
/// the existence of the resource it names - before it reads the body, so a
/// learner gets 403 (404 for a resource they cannot see) whatever they send:
/// never a 422 that validates the body (or lists the accepted fields) for
/// someone who may not write there at all. Every mutating operation with a
/// request body is probed straight from the OpenAPI document, so a new
/// route is covered the day it lands.
///
/// The exceptions are the writes a learner may make (their own profile,
/// uploads) and the public / self-service auth routes, whose body IS theirs
/// to get wrong.
const LEARNER_MAY_WRITE: &[(&str, &str)] =
    &[("PATCH", "/api/v2/users/me"), ("POST", "/api/v2/uploads")];

#[sqlx::test(migrations = "../../migrations")]
async fn a_learner_is_refused_before_the_body_is_read(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    // The seeded learner role's own grants.
    let grants: Vec<String> = sqlx::query_scalar(
        "SELECT rp.permission FROM role_permissions rp JOIN roles r ON r.id = rp.role_id \
         WHERE r.slug = 'user'",
    )
    .fetch_all(&app.pool)
    .await
    .unwrap();
    let grants: Vec<&str> = grants.iter().map(String::as_str).collect();
    let learner = app.mint_session(&grants).await;
    let doc = serde_json::to_value(ab_api::openapi_doc()).unwrap();
    let mut probed = 0;
    let mut failures = Vec::new();
    for (path, ops) in doc["paths"].as_object().expect("openapi paths") {
        for (method, op) in ops.as_object().expect("operations") {
            let method = method.to_uppercase();
            let entry = (method.as_str(), path.as_str());
            if !MUTATING.contains(&method.to_lowercase().as_str())
                || op.get("requestBody").is_none()
                || PUBLIC.contains(&entry)
                || AUTH_ONLY.contains(&entry)
                || LEARNER_MAY_WRITE.contains(&entry)
            {
                continue;
            }
            probed += 1;
            for body in [r#"{"__bogus": 1, "name": ""}"#, "not json"] {
                let res = app
                    .send(
                        Request::builder()
                            .method(method.as_str())
                            .uri(concretize(path))
                            .header(header::COOKIE, &learner.cookie)
                            .header(header::CONTENT_TYPE, "application/json")
                            .body(Body::from(body))
                            .unwrap(),
                    )
                    .await;
                // 404: the probe ids name nothing, and an unknown resource
                // is decided before the body too.
                if res.status == StatusCode::UNPROCESSABLE_ENTITY
                    || res.status.is_success()
                    || res.text().contains("expected")
                {
                    failures.push(format!(
                        "{method} {path} with {body}: {} {}",
                        res.status,
                        res.text()
                    ));
                }
            }
        }
    }
    assert!(
        failures.is_empty(),
        "writes that read the body before the permission check:\n{}",
        failures.join("\n")
    );
    assert!(probed > 60, "only {probed} body-taking writes found");
}
