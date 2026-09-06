//! Analytics end to end (legacy `routers/analytics.py`).
//!
//! Port contract exercised here:
//! - scope: `analytics:read:assigned` sees the courses the caller created;
//!   a learner is 403, anonymous 401; a course outside the scope is 404 on
//!   the detail routes and 403 when requested through `course_ids`;
//!   `/admin/overview` needs `analytics:read:platform`;
//! - dashboards compute live numbers from submissions and progress: the
//!   ungraded (pending) submission counts as backlog and puts its learner at
//!   risk (`grading_block`), the fully passed learner is not at risk;
//! - the rollup job writes the five daily tables and the risk snapshots for
//!   every course and is idempotent; a date range backfills one row set per
//!   day;
//! - the event log captures submit / publish / activity-completed;
//! - interventions record the latest snapshot risk score, default to
//!   `completed`, validate the type, and 404 outside the scope; saved views
//!   upsert by (type, name) and delete is owner-only;
//! - drill-through: `pass_rate` demands an assessment (422); `backlog`
//!   lists the pending submission;
//! - CSV exports need `analytics:export:*`, are RFC 4180 with CRLF, and set
//!   `Content-Disposition`;
//! - malformed filters are 422 field errors.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use sqlx::PgPool;

async fn instructor(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["instructor"])
        .await;
    app.mint_session_for(
        user,
        &[
            "course:create:platform",
            "course:read:all",
            "course:update:own",
            "assessment:*:own",
            "analytics:read:assigned",
            "analytics:export:assigned",
        ],
    )
    .await
}

async fn learner(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["user"])
        .await;
    app.mint_session_for(
        user,
        &[
            "assessment:submit:assigned",
            "assessment:read:assigned",
            "trail:read:all",
            "trail:submit:assigned",
        ],
    )
    .await
}

/// Public course + chapter; returns (course_id, chapter_id).
async fn public_course(app: &TestApp, teacher: &MintedSession, name: &str) -> (String, String) {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": name }),
        )
        .await;
    assert_eq!(course.status, StatusCode::CREATED, "{}", course.text());
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
        teacher,
        &format!("/api/v2/courses/{course_id}/lifecycle"),
        &serde_json::json!({ "action": "publish" }),
    )
    .await;
    let chapter = app
        .post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "Week 1" }),
        )
        .await;
    (course_id, chapter.json()["id"].as_str().unwrap().to_owned())
}

/// A published lesson activity.
async fn lesson(app: &TestApp, teacher: &MintedSession, chapter_id: &str, name: &str) -> String {
    let created = app
        .post_as(
            teacher,
            &format!("/api/v2/chapters/{chapter_id}/activities"),
            &serde_json::json!({ "name": name, "activity_type": "dynamic",
                                  "activity_sub_type": "dynamic_page" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let published = app
        .patch_as(
            teacher,
            &format!("/api/v2/activities/{id}"),
            &serde_json::json!({ "published": true }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    id
}

/// Published quiz with a choice + essay item, batch grade release.
/// Returns (assessment_id, choice_item_id, essay_item_id).
async fn quiz_with_essay(
    app: &TestApp,
    teacher: &MintedSession,
    chapter_id: &str,
) -> (String, String, String) {
    let created = app
        .post_as(
            teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Quiz" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let choice = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &serde_json::json!({
                "title": "Q1", "max_score": 10,
                "body": { "kind": "choice", "prompt": "Q1",
                          "options": [{ "id": "a", "text": "yes", "is_correct": true },
                                      { "id": "b", "text": "no", "is_correct": false }] }
            }),
        )
        .await;
    let choice_id = choice.json()["id"].as_str().unwrap().to_owned();
    let essay = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &serde_json::json!({
                "title": "Essay", "max_score": 10,
                "body": { "kind": "open_text", "prompt": "Why?" }
            }),
        )
        .await;
    let essay_id = essay.json()["id"].as_str().unwrap().to_owned();
    let mut policy = created.json()["policy"].clone();
    policy["grade_release_mode"] = serde_json::json!("batch");
    let policy_res = app
        .send(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/policy"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &teacher.cookie)
                .body(Body::from(policy.to_string()))
                .unwrap(),
        )
        .await;
    assert_eq!(policy_res.status, StatusCode::OK, "{}", policy_res.text());
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    (id, choice_id, essay_id)
}

/// Start + submit with the choice answered correctly and an essay text.
async fn submit_attempt(
    app: &TestApp,
    learner: &MintedSession,
    assessment_id: &str,
    choice_id: &str,
    essay_id: &str,
) -> String {
    let draft = app
        .post_as(
            learner,
            &format!("/api/v2/assessments/{assessment_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            learner,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": {
                choice_id: { "kind": "choice", "selected": ["a"] },
                essay_id: { "kind": "open_text", "text": "Because." },
            } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(submitted.json()["status"], "pending");
    sub_id
}

async fn grade_and_publish(
    app: &TestApp,
    teacher: &MintedSession,
    assessment_id: &str,
    submission_id: &str,
    essay_id: &str,
) {
    let saved = app
        .send(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v2/submissions/{submission_id}/grade"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &teacher.cookie)
                .header(header::IF_MATCH, "\"1\"")
                .body(Body::from(
                    serde_json::json!({
                        "action": "save", "feedback": "nice work",
                        "item_grades": [{ "item_id": essay_id, "score": 8, "feedback": "good" }],
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    let released = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{assessment_id}/publish-grades"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(released.status, StatusCode::OK, "{}", released.text());
    assert_eq!(released.json()["published_count"], 1);
}

async fn event_count(pool: &PgPool, event_type: &str) -> i64 {
    sqlx::query_scalar::<_, i64>("SELECT count(*) FROM analytics_events WHERE event_type = $1")
        .bind(event_type)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn table_count(pool: &PgPool, table: &str) -> i64 {
    let sql = match table {
        "daily_course_metrics" => "SELECT count(*) FROM daily_course_metrics",
        "daily_teacher_metrics" => "SELECT count(*) FROM daily_teacher_metrics",
        "learner_risk_snapshots" => "SELECT count(*) FROM learner_risk_snapshots",
        other => panic!("unknown table {other}"),
    };
    sqlx::query_scalar::<_, i64>(sql)
        .fetch_one(pool)
        .await
        .unwrap()
}

fn find_row<'a>(
    items: &'a serde_json::Value,
    key: &str,
    value: &str,
) -> Option<&'a serde_json::Value> {
    items.as_array().unwrap().iter().find(|r| r[key] == value)
}

#[sqlx::test(migrations = "../../migrations")]
async fn dashboards_rollups_interventions_views_and_exports(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let carol = instructor(&app, "carol").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Analytics 101").await;
    let (other_course, _) = public_course(&app, &carol, "Other course").await;
    let lesson_id = lesson(&app, &teacher, &chapter_id, "Intro").await;
    let (quiz_id, choice_id, essay_id) = quiz_with_essay(&app, &teacher, &chapter_id).await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;

    // Alice finishes everything; Bob submits and waits for a grade.
    let step = app
        .post_as(
            &alice,
            &format!("/api/v2/trail/activities/{lesson_id}"),
            &serde_json::json!({}),
        )
        .await;
    assert!(step.status.is_success(), "{}", step.text());
    let alice_sub = submit_attempt(&app, &alice, &quiz_id, &choice_id, &essay_id).await;
    grade_and_publish(&app, &teacher, &quiz_id, &alice_sub, &essay_id).await;
    submit_attempt(&app, &bob, &quiz_id, &choice_id, &essay_id).await;

    // ── Event capture ───────────────────────────────────────────────────
    assert_eq!(event_count(&pool, "submission.submitted").await, 2);
    assert_eq!(event_count(&pool, "submission.graded").await, 1);
    assert!(event_count(&pool, "submission.published").await >= 1);
    assert!(event_count(&pool, "activity.completed").await >= 1);

    // ── Access ──────────────────────────────────────────────────────────
    let anon = app.get("/api/v2/analytics/teacher/overview").await;
    assert_eq!(anon.status, StatusCode::UNAUTHORIZED);
    let forbidden = app
        .get_as(&alice, "/api/v2/analytics/teacher/overview")
        .await;
    assert_eq!(
        forbidden.status,
        StatusCode::FORBIDDEN,
        "{}",
        forbidden.text()
    );
    let bad = app
        .get_as(
            &teacher,
            "/api/v2/analytics/teacher/overview?window=3d&page_size=abc",
        )
        .await;
    assert_eq!(bad.status, StatusCode::BAD_REQUEST, "{}", bad.text());
    let bad = app
        .get_as(
            &teacher,
            "/api/v2/analytics/teacher/overview?window=3d&timezone=Mars/Olympus",
        )
        .await;
    assert_eq!(
        bad.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        bad.text()
    );
    let fields: Vec<_> = bad.json()["field_errors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["field"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(fields, ["window", "timezone"]);
    let outside = app
        .get_as(
            &teacher,
            &format!("/api/v2/analytics/teacher/overview?course_ids={other_course}"),
        )
        .await;
    assert_eq!(outside.status, StatusCode::FORBIDDEN, "{}", outside.text());

    // ── Teacher overview (live numbers) ─────────────────────────────────
    let overview = app
        .get_as(&teacher, "/api/v2/analytics/teacher/overview")
        .await;
    assert_eq!(overview.status, StatusCode::OK, "{}", overview.text());
    let body = overview.json();
    assert_eq!(body["window"], "28d");
    assert_eq!(body["course_total"], 1);
    assert_eq!(body["assessment_total"], 1);
    assert_eq!(body["summary"]["ungraded_submissions"]["value"], 1.0);
    assert_eq!(body["summary"]["active_learners"]["value"], 2.0);
    assert_eq!(body["at_risk_total"], 1);
    let bob_row = find_row(
        &body["at_risk_preview"],
        "user_id",
        &bob.user_id.to_string(),
    )
    .expect("bob is at risk");
    assert!(
        bob_row["reason_codes"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("grading_block")),
        "{bob_row}"
    );
    assert_eq!(bob_row["open_grading_blocks"], 1);
    // 0.3 * (100 - 0) + 4 = 34: below the medium line, so "low" and, with no
    // earlier snapshot, "stable" (legacy only says newly_at_risk from medium).
    assert_eq!(bob_row["risk_score"], 34.0);
    assert_eq!(bob_row["risk_level"], "low");
    assert_eq!(bob_row["risk_trend"], "stable");
    assert_eq!(bob_row["recommended_action"], "review_submissions_first");
    assert!(
        find_row(
            &body["at_risk_preview"],
            "user_id",
            &alice.user_id.to_string()
        )
        .is_none()
    );
    assert_eq!(body["intervention_summary"]["total"], 0);

    // ── Courses ─────────────────────────────────────────────────────────
    let courses = app
        .get_as(&teacher, "/api/v2/analytics/teacher/courses")
        .await;
    assert_eq!(courses.status, StatusCode::OK, "{}", courses.text());
    assert_eq!(courses.json()["total"], 1);
    let row = &courses.json()["items"][0];
    assert_eq!(row["course_id"], course_id);
    assert_eq!(row["ungraded_submissions"], 1);
    // Course counters only count medium/high (legacy); the low-scored
    // learner still appears in the at-risk list because he has reason codes.
    assert_eq!(row["at_risk_learners"], 0);
    assert_eq!(row["active_learners_7d"], 2);
    assert_eq!(
        courses.json()["course_options"].as_array().unwrap().len(),
        1
    );

    let detail = app
        .get_as(
            &teacher,
            &format!("/api/v2/analytics/teacher/courses/{course_id}"),
        )
        .await;
    assert_eq!(detail.status, StatusCode::OK, "{}", detail.text());
    assert_eq!(detail.json()["course"]["id"], course_id);
    assert_eq!(detail.json()["summary"]["enrolled_learners"], 2);
    assert_eq!(detail.json()["summary"]["ungraded_submissions"], 1);
    assert_eq!(detail.json()["summary"]["at_risk_learners"], 0);
    assert_eq!(
        detail.json()["at_risk_learners"].as_array().unwrap().len(),
        1
    );
    let foreign = app
        .get_as(
            &teacher,
            &format!("/api/v2/analytics/teacher/courses/{other_course}"),
        )
        .await;
    assert_eq!(foreign.status, StatusCode::NOT_FOUND, "{}", foreign.text());

    // ── Assessments ─────────────────────────────────────────────────────
    let assessments = app
        .get_as(&teacher, "/api/v2/analytics/teacher/assessments")
        .await;
    assert_eq!(assessments.status, StatusCode::OK, "{}", assessments.text());
    assert_eq!(assessments.json()["total"], 1);
    let arow = &assessments.json()["items"][0];
    assert_eq!(arow["assessment_id"], quiz_id);
    assert_eq!(arow["assessment_type"], "quiz");
    assert_eq!(arow["submission_rate"], 100.0);
    let adetail = app
        .get_as(
            &teacher,
            &format!("/api/v2/analytics/teacher/assessments/quiz/{quiz_id}"),
        )
        .await;
    assert_eq!(adetail.status, StatusCode::OK, "{}", adetail.text());
    assert_eq!(adetail.json()["learner_rows"].as_array().unwrap().len(), 2);
    let wrong_kind = app
        .get_as(
            &teacher,
            &format!("/api/v2/analytics/teacher/assessments/exam/{quiz_id}"),
        )
        .await;
    assert_eq!(wrong_kind.status, StatusCode::NOT_FOUND);
    let carol_view = app
        .get_as(
            &carol,
            &format!("/api/v2/analytics/teacher/assessments/quiz/{quiz_id}"),
        )
        .await;
    assert_eq!(carol_view.status, StatusCode::NOT_FOUND);

    // ── At-risk list ────────────────────────────────────────────────────
    let at_risk = app
        .get_as(&teacher, "/api/v2/analytics/teacher/learners/at-risk")
        .await;
    assert_eq!(at_risk.status, StatusCode::OK, "{}", at_risk.text());
    assert_eq!(at_risk.json()["total"], 1);
    assert_eq!(
        at_risk.json()["items"][0]["user_id"],
        bob.user_id.to_string()
    );
    assert_eq!(at_risk.json()["items"][0]["intervention_count"], 0);

    // ── Rollups (job body), idempotent ──────────────────────────────────
    let service = ab_domain::analytics::AnalyticsService::new(pool.clone());
    let first = service.run_rollup(None).await.unwrap();
    assert_eq!(first.course_rows, 2, "{first:?}");
    assert_eq!(first.progress_rows, 2);
    assert_eq!(first.risk_rows, 1);
    assert_eq!(first.assessment_rows, 1);
    // teacher + carol + the platform aggregate
    assert_eq!(first.teacher_rows, 3);
    assert_eq!(first.engagement_rows, 2);
    let second = service.run_rollup(None).await.unwrap();
    assert_eq!(second, first);
    assert_eq!(table_count(&pool, "daily_course_metrics").await, 2);
    assert_eq!(table_count(&pool, "learner_risk_snapshots").await, 1);
    assert_eq!(table_count(&pool, "daily_teacher_metrics").await, 3);
    let platform_row = sqlx::query_scalar::<_, i32>(
        "SELECT managed_course_count FROM daily_teacher_metrics WHERE teacher_user_id IS NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(platform_row, 2);
    let range = service
        .run_rollup_range("2026-01-01", "2026-01-03")
        .await
        .unwrap();
    assert_eq!(range.len(), 3);
    assert_eq!(table_count(&pool, "daily_course_metrics").await, 8);
    assert!(
        service
            .run_rollup_range("2026-01-03", "2026-01-01")
            .await
            .is_err()
    );
    assert!(service.run_rollup(Some("yesterday")).await.is_err());

    // The dashboard still answers with a rollup baseline in place.
    let again = app
        .get_as(&teacher, "/api/v2/analytics/teacher/overview")
        .await;
    assert_eq!(again.status, StatusCode::OK, "{}", again.text());
    assert_eq!(again.json()["at_risk_total"], 1);

    // ── Interventions ───────────────────────────────────────────────────
    let created = app
        .post_as(
            &teacher,
            "/api/v2/analytics/teacher/interventions",
            &serde_json::json!({
                "user_id": bob.user_id, "course_id": course_id,
                "intervention_type": "message_sent", "notes": "pinged"
            }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    assert_eq!(created.json()["status"], "completed");
    assert_eq!(
        created.json()["teacher_user_id"],
        teacher.user_id.to_string()
    );
    assert!(
        created.json()["risk_score_before"].is_number(),
        "{}",
        created.text()
    );
    assert!(created.json()["risk_score_after"].is_null());
    assert!(created.json()["resolved_at_unix"].is_null());
    let invalid = app
        .post_as(
            &teacher,
            "/api/v2/analytics/teacher/interventions",
            &serde_json::json!({
                "user_id": bob.user_id, "course_id": course_id,
                "intervention_type": "hug", "status": "done"
            }),
        )
        .await;
    assert_eq!(
        invalid.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        invalid.text()
    );
    let outside = app
        .post_as(
            &teacher,
            "/api/v2/analytics/teacher/interventions",
            &serde_json::json!({
                "user_id": bob.user_id, "course_id": other_course,
                "intervention_type": "message_sent"
            }),
        )
        .await;
    assert_eq!(outside.status, StatusCode::NOT_FOUND, "{}", outside.text());
    let list = app
        .get_as(&teacher, "/api/v2/analytics/teacher/interventions")
        .await;
    assert_eq!(list.status, StatusCode::OK, "{}", list.text());
    assert_eq!(list.json()["total"], 1);
    let narrowed = app
        .get_as(
            &teacher,
            &format!(
                "/api/v2/analytics/teacher/interventions?user_id={}",
                alice.user_id
            ),
        )
        .await;
    assert_eq!(narrowed.json()["total"], 0);
    let carols = app
        .get_as(&carol, "/api/v2/analytics/teacher/interventions")
        .await;
    assert_eq!(carols.json()["total"], 0);
    let at_risk = app
        .get_as(&teacher, "/api/v2/analytics/teacher/learners/at-risk")
        .await;
    assert_eq!(at_risk.json()["items"][0]["intervention_count"], 1);

    // ── Saved views ─────────────────────────────────────────────────────
    let saved = app
        .post_as(
            &teacher,
            "/api/v2/analytics/teacher/saved-views",
            &serde_json::json!({ "name": "Mine", "query": { "window": "7d" } }),
        )
        .await;
    assert_eq!(saved.status, StatusCode::CREATED, "{}", saved.text());
    assert_eq!(saved.json()["view_type"], "overview");
    let view_id = saved.json()["id"].as_str().unwrap().to_owned();
    let upserted = app
        .post_as(
            &teacher,
            "/api/v2/analytics/teacher/saved-views",
            &serde_json::json!({ "name": "Mine", "query": { "window": "90d" } }),
        )
        .await;
    assert_eq!(upserted.status, StatusCode::CREATED, "{}", upserted.text());
    assert_eq!(upserted.json()["id"], view_id);
    assert_eq!(upserted.json()["query"]["window"], "90d");
    let views = app
        .get_as(&teacher, "/api/v2/analytics/teacher/saved-views")
        .await;
    assert_eq!(views.json()["total"], 1);
    let not_hers = app
        .delete_as(
            &carol,
            &format!("/api/v2/analytics/teacher/saved-views/{view_id}"),
        )
        .await;
    assert_eq!(not_hers.status, StatusCode::NOT_FOUND);
    let deleted = app
        .delete_as(
            &teacher,
            &format!("/api/v2/analytics/teacher/saved-views/{view_id}"),
        )
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let gone = app
        .delete_as(
            &teacher,
            &format!("/api/v2/analytics/teacher/saved-views/{view_id}"),
        )
        .await;
    assert_eq!(gone.status, StatusCode::NOT_FOUND);

    // ── Drill-through ───────────────────────────────────────────────────
    let active = app
        .get_as(
            &teacher,
            "/api/v2/analytics/teacher/drill-through/active_learners",
        )
        .await;
    assert_eq!(active.status, StatusCode::OK, "{}", active.text());
    assert_eq!(active.json()["metric"], "active_learners");
    assert_eq!(active.json()["total"], 2);
    let backlog = app
        .get_as(&teacher, "/api/v2/analytics/teacher/drill-through/backlog")
        .await;
    assert_eq!(backlog.status, StatusCode::OK, "{}", backlog.text());
    assert_eq!(backlog.json()["total"], 1);
    let no_assessment = app
        .get_as(
            &teacher,
            "/api/v2/analytics/teacher/drill-through/pass_rate",
        )
        .await;
    assert_eq!(no_assessment.status, StatusCode::UNPROCESSABLE_ENTITY);
    let pass_rate = app
        .get_as(
            &teacher,
            &format!(
                "/api/v2/analytics/teacher/drill-through/pass_rate?assessment_type=quiz&assessment_id={quiz_id}"
            ),
        )
        .await;
    assert_eq!(pass_rate.status, StatusCode::OK, "{}", pass_rate.text());
    assert_eq!(pass_rate.json()["total"], 2);
    assert!(
        pass_rate.json()["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["passed"] == true),
        "{}",
        pass_rate.text()
    );
    let unknown_metric = app
        .get_as(&teacher, "/api/v2/analytics/teacher/drill-through/churn")
        .await;
    assert_eq!(unknown_metric.status, StatusCode::BAD_REQUEST);

    // ── CSV exports ─────────────────────────────────────────────────────
    let csv = app
        .get_as(
            &teacher,
            "/api/v2/analytics/teacher/exports/grading-backlog.csv",
        )
        .await;
    assert_eq!(csv.status, StatusCode::OK, "{}", csv.text());
    assert!(csv.content_type().starts_with("text/csv"));
    assert_eq!(
        csv.headers[header::CONTENT_DISPOSITION].to_str().unwrap(),
        "attachment; filename=\"teacher-grading-backlog.csv\""
    );
    let text = csv.text();
    let lines: Vec<&str> = text.split("\r\n").filter(|l| !l.is_empty()).collect();
    assert_eq!(lines.len(), 2, "header + the pending submission: {text}");
    assert!(lines[1].contains("bob"), "{text}");
    for name in ["at-risk", "course-progress", "assessment-outcomes"] {
        let res = app
            .get_as(
                &teacher,
                &format!("/api/v2/analytics/teacher/exports/{name}.csv"),
            )
            .await;
        assert_eq!(res.status, StatusCode::OK, "{name}: {}", res.text());
        assert!(res.text().contains("\r\n"), "{name}");
    }
    let no_export = app.mint_session(&["analytics:read:assigned"]).await;
    let refused = app
        .get_as(&no_export, "/api/v2/analytics/teacher/exports/at-risk.csv")
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);

    // ── Admin overview ──────────────────────────────────────────────────
    let not_admin = app
        .get_as(&teacher, "/api/v2/analytics/admin/overview")
        .await;
    assert_eq!(
        not_admin.status,
        StatusCode::FORBIDDEN,
        "{}",
        not_admin.text()
    );
    let admin = app
        .mint_session(&["analytics:read:platform", "course:read:all"])
        .await;
    let admin_view = app.get_as(&admin, "/api/v2/analytics/admin/overview").await;
    assert_eq!(admin_view.status, StatusCode::OK, "{}", admin_view.text());
    assert_eq!(
        admin_view.json()["course_health_ranking"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    // Platform scope sees every course, and may inspect one teacher.
    let all_courses = app
        .get_as(&admin, "/api/v2/analytics/teacher/courses")
        .await;
    assert_eq!(all_courses.json()["total"], 2);
    let carols_only = app
        .get_as(
            &admin,
            &format!(
                "/api/v2/analytics/teacher/courses?teacher_user_id={}",
                carol.user_id
            ),
        )
        .await;
    assert_eq!(carols_only.json()["total"], 1);
    assert_eq!(carols_only.json()["items"][0]["course_id"], other_course);
}
