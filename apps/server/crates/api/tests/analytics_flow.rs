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
    app.publish_course(&course_id).await;
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
    policy_patch: serde_json::Value,
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
    for (key, value) in policy_patch.as_object().into_iter().flatten() {
        policy[key] = value.clone();
    }
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
    submit_attempt_answering(app, learner, assessment_id, choice_id, essay_id, "a").await
}

/// Start + submit choosing `selected` («a» is the correct option).
async fn submit_attempt_answering(
    app: &TestApp,
    learner: &MintedSession,
    assessment_id: &str,
    choice_id: &str,
    essay_id: &str,
    selected: &str,
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
                choice_id: { "kind": "choice", "selected": [selected] },
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
    let (quiz_id, choice_id, essay_id) =
        quiz_with_essay(&app, &teacher, &chapter_id, serde_json::json!({})).await;
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
    assert_eq!(
        bad.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        bad.text()
    );
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
    // Codes + params, no prose (DECISIONS "Pass-6 contract gaps"): every
    // alert / forecast / anomaly / insight / data-quality issue carries a
    // `code` from the `AnalyticsCode` enum and an object of `params`.
    let backlog_forecast = find_row(&body["forecasts"], "kind", "grading_backlog_7d")
        .expect("the 7-day backlog forecast is always emitted");
    assert_eq!(backlog_forecast["code"], "grading_backlog_7d");
    assert_eq!(
        backlog_forecast["params"]["count"], 1,
        "bob's pending submission"
    );
    for list in ["alerts", "forecasts", "anomalies", "insights"] {
        for item in body[list].as_array().unwrap() {
            assert!(item["code"].is_string(), "{list}: {item}");
            assert!(item["params"].is_object(), "{list}: {item}");
            for prose in ["title", "body", "prediction", "detail"] {
                assert!(
                    item.get(prose).is_none(),
                    "{list} carries `{prose}`: {item}"
                );
            }
        }
    }
    let issues = body["data_quality"]["issues"].as_array().unwrap();
    let missing = find_row(
        &body["data_quality"]["issues"],
        "id",
        "missing-event-sources",
    )
    .expect("exam/code sources have no data in this fixture");
    assert_eq!(missing["code"], "missing_event_sources");
    assert!(
        missing["params"]["sources"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("exam_attempts")),
        "{missing}"
    );
    assert!(issues.iter().all(|i| i.get("detail").is_none()));

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
    // Audit rows and item rows are structured, not English summaries.
    for event in adetail.json()["audit_history"].as_array().unwrap() {
        assert!(event.get("summary").is_none(), "{event}");
        assert!(event["final_score"].is_number() || event["final_score"].is_null());
    }
    for item in adetail.json()["item_analytics"].as_array().unwrap() {
        assert!(item["note"].is_null() || item["note"].is_string(), "{item}");
        assert!(
            item["accuracy_pct"].is_null() || item["accuracy_pct"].is_number(),
            "{item}"
        );
    }
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
    assert_eq!(unknown_metric.status, StatusCode::UNPROCESSABLE_ENTITY);

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
    // UX-114: BOM + Russian by default, enum cells localized too.
    assert!(
        lines[0].starts_with("\u{feff}ID учащегося,Логин,"),
        "{text}"
    );
    assert!(lines[1].contains("bob"), "{text}");
    assert!(lines[1].contains(",Тест,"), "{text}");
    assert!(lines[1].contains(",На проверке,"), "{text}");
    for name in ["at-risk", "course-progress", "assessment-outcomes"] {
        let res = app
            .get_as(
                &teacher,
                &format!("/api/v2/analytics/teacher/exports/{name}.csv"),
            )
            .await;
        assert_eq!(res.status, StatusCode::OK, "{name}: {}", res.text());
        assert!(res.text().starts_with("\u{feff}"), "{name}");
        assert!(res.text().contains("\r\n"), "{name}");
    }
    let kk = app
        .send(
            Request::builder()
                .method("GET")
                .uri("/api/v2/analytics/teacher/exports/course-progress.csv")
                .header(header::COOKIE, &teacher.cookie)
                .header(header::ACCEPT_LANGUAGE, "kk-KZ,ru;q=0.8")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    let kk_text = kk.text();
    assert!(kk_text.starts_with("\u{feff}Курс ID,Курс,"), "{kk_text}");
    assert!(
        kk_text
            .lines()
            .skip(1)
            .all(|l| l.ends_with(",Иә") || l.ends_with(",Жоқ")),
        "{kk_text}"
    );
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

/// BUG-119 / BUG-120: unknown ids and blank names are 422s, never FK/CHECK 500s.
#[sqlx::test(migrations = "../../migrations")]
async fn unknown_learner_and_blank_view_name_are_validation_errors(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, _) = public_course(&app, &teacher, "Analytics 101").await;

    let ghost = app
        .post_as(
            &teacher,
            "/api/v2/analytics/teacher/interventions",
            &serde_json::json!({
                "user_id": uuid::Uuid::now_v7(), "course_id": course_id,
                "intervention_type": "message_sent"
            }),
        )
        .await;
    assert_eq!(
        ghost.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        ghost.text()
    );
    assert_eq!(ghost.json()["field_errors"][0]["field"], "user_id");
    assert_eq!(ghost.json()["field_errors"][0]["code"], "unknown");

    let blank = app
        .post_as(
            &teacher,
            "/api/v2/analytics/teacher/saved-views",
            &serde_json::json!({ "name": "   ", "view_type": "  ", "query": {} }),
        )
        .await;
    assert_eq!(
        blank.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        blank.text()
    );
    let fields: Vec<_> = blank.json()["field_errors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| {
            (
                e["field"].as_str().unwrap().to_owned(),
                e["code"] == "required",
            )
        })
        .collect();
    assert_eq!(
        fields,
        [("name".to_owned(), true), ("view_type".to_owned(), true)]
    );
}

/// BUG-121: `cohort_ids` need usergroup read + existing groups;
/// `teacher_user_id` is refused (not ignored) under the assigned scope.
#[sqlx::test(migrations = "../../migrations")]
async fn cohort_and_teacher_filters_are_gated(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let carol = instructor(&app, "carol").await;
    public_course(&app, &teacher, "Analytics 101").await;

    let other_teacher = app
        .get_as(
            &teacher,
            &format!(
                "/api/v2/analytics/teacher/overview?teacher_user_id={}",
                carol.user_id
            ),
        )
        .await;
    assert_eq!(
        other_teacher.status,
        StatusCode::FORBIDDEN,
        "{}",
        other_teacher.text()
    );
    // UX-096: the refused filter is named for the client.
    assert_eq!(other_teacher.json()["details"]["filter"], "teacher_user_id");

    let ghost_cohort = uuid::Uuid::now_v7();
    let no_usergroup_read = app
        .get_as(
            &teacher,
            &format!("/api/v2/analytics/teacher/overview?cohort_ids={ghost_cohort}"),
        )
        .await;
    assert_eq!(
        no_usergroup_read.status,
        StatusCode::FORBIDDEN,
        "{}",
        no_usergroup_read.text()
    );

    let reader = app
        .mint_session_for(
            teacher.user_id,
            &["analytics:read:assigned", "usergroup:read:platform"],
        )
        .await;
    let unknown = app
        .get_as(
            &reader,
            &format!("/api/v2/analytics/teacher/overview?cohort_ids={ghost_cohort}"),
        )
        .await;
    assert_eq!(
        unknown.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        unknown.text()
    );
    assert_eq!(unknown.json()["field_errors"][0]["field"], "cohort_ids");
    assert_eq!(unknown.json()["field_errors"][0]["code"], "unknown");
}

/// BUG-145: course editors are never at-risk learners of their own course;
/// `sort_by`/`sort_order` apply to the at-risk list; an unknown
/// `teacher_user_id` is a 422; `POST interventions` honours
/// `Idempotency-Key`. Plus the out-of-scope course on list-interventions /
/// drill-through (404) and exports (403).
#[sqlx::test(migrations = "../../migrations")]
async fn at_risk_scope_sort_and_intervention_idempotency(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let carol = instructor(&app, "carol").await;
    let (course_id, _) = public_course(&app, &teacher, "Analytics 101").await;
    let (other_course, _) = public_course(&app, &carol, "Other course").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;

    // Progress rows straight into the table: the teacher enrolled in his
    // own course, alice at 0 % (score 30), bob at 40 % (score 18).
    let course_uuid = uuid::Uuid::parse_str(&course_id).unwrap();
    for (user, pct) in [
        (teacher.user_id, 0.0),
        (alice.user_id, 0.0),
        (bob.user_id, 40.0),
    ] {
        sqlx::query(
            "INSERT INTO course_progress (course_id, user_id, progress_pct) VALUES ($1, $2, $3)",
        )
        .bind(course_uuid)
        .bind(user.0)
        .bind(pct)
        .execute(&pool)
        .await
        .unwrap();
    }

    let at_risk = app
        .get_as(&teacher, "/api/v2/analytics/teacher/learners/at-risk")
        .await;
    assert_eq!(at_risk.status, StatusCode::OK, "{}", at_risk.text());
    let ids = |body: &serde_json::Value| -> Vec<String> {
        body["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| r["user_id"].as_str().unwrap().to_owned())
            .collect()
    };
    assert_eq!(
        ids(&at_risk.json()),
        [alice.user_id.to_string(), bob.user_id.to_string()],
        "worst first, the editor excluded: {}",
        at_risk.text()
    );
    let ascending = app
        .get_as(
            &teacher,
            "/api/v2/analytics/teacher/learners/at-risk?sort_by=risk&sort_order=asc",
        )
        .await;
    assert_eq!(
        ids(&ascending.json()),
        [bob.user_id.to_string(), alice.user_id.to_string()]
    );
    let by_name = app
        .get_as(
            &teacher,
            "/api/v2/analytics/teacher/learners/at-risk?sort_by=name&sort_order=desc",
        )
        .await;
    assert_eq!(
        ids(&by_name.json()),
        [bob.user_id.to_string(), alice.user_id.to_string()]
    );

    // Unknown inspected teacher under platform scope.
    let platform = app
        .mint_session_for(teacher.user_id, &["analytics:read:platform"])
        .await;
    let ghost = app
        .get_as(
            &platform,
            &format!(
                "/api/v2/analytics/teacher/overview?teacher_user_id={}",
                uuid::Uuid::now_v7()
            ),
        )
        .await;
    assert_eq!(
        ghost.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        ghost.text()
    );
    assert_eq!(ghost.json()["field_errors"][0]["field"], "teacher_user_id");
    assert_eq!(ghost.json()["field_errors"][0]["code"], "unknown");

    // Idempotent intervention creation.
    let body = serde_json::json!({
        "user_id": alice.user_id, "course_id": course_id,
        "intervention_type": "message_sent", "notes": "pinged"
    });
    let post_key = |body: serde_json::Value, key: &'static str| {
        let app = &app;
        let teacher = &teacher;
        async move {
            app.send(
                Request::builder()
                    .method("POST")
                    .uri("/api/v2/analytics/teacher/interventions")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::COOKIE, &teacher.cookie)
                    .header("idempotency-key", key)
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
        }
    };
    let post = |body: serde_json::Value| post_key(body, "retry-1");
    let first = post(body.clone()).await;
    assert_eq!(first.status, StatusCode::CREATED, "{}", first.text());
    let replay = post(body.clone()).await;
    assert_eq!(replay.status, StatusCode::CREATED, "{}", replay.text());
    assert_eq!(replay.json()["id"], first.json()["id"]);
    let list = app
        .get_as(&teacher, "/api/v2/analytics/teacher/interventions")
        .await;
    assert_eq!(list.json()["total"], 1, "{}", list.text());
    // BUG-195: four concurrent identical requests reserve the key once —
    // one row, four identical 201 replies.
    let race = tokio::join!(
        post_key(body.clone(), "race-1"),
        post_key(body.clone(), "race-1"),
        post_key(body.clone(), "race-1"),
        post_key(body.clone(), "race-1"),
    );
    let raced: [_; 4] = race.into();
    for r in &raced {
        assert_eq!(r.status, StatusCode::CREATED, "{}", r.text());
        assert_eq!(r.json()["id"], raced[0].json()["id"], "{}", r.text());
    }
    let list = app
        .get_as(&teacher, "/api/v2/analytics/teacher/interventions")
        .await;
    assert_eq!(list.json()["total"], 2, "{}", list.text());
    let reused = post(serde_json::json!({
        "user_id": bob.user_id, "course_id": course_id,
        "intervention_type": "message_sent"
    }))
    .await;
    assert_eq!(
        reused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        reused.text()
    );
    assert_eq!(reused.json()["field_errors"][0]["code"], "reused");

    // A course outside the scope: 404 on the narrowing filters, 403 on the
    // explicit course_ids filter of an export.
    let foreign_list = app
        .get_as(
            &teacher,
            &format!("/api/v2/analytics/teacher/interventions?course_id={other_course}"),
        )
        .await;
    assert_eq!(
        foreign_list.status,
        StatusCode::NOT_FOUND,
        "{}",
        foreign_list.text()
    );
    let foreign_drill = app
        .get_as(
            &teacher,
            &format!(
                "/api/v2/analytics/teacher/drill-through/active_learners?course_id={other_course}"
            ),
        )
        .await;
    assert_eq!(
        foreign_drill.status,
        StatusCode::NOT_FOUND,
        "{}",
        foreign_drill.text()
    );
    let foreign_export = app
        .get_as(
            &teacher,
            &format!("/api/v2/analytics/teacher/exports/at-risk.csv?course_ids={other_course}"),
        )
        .await;
    assert_eq!(
        foreign_export.status,
        StatusCode::FORBIDDEN,
        "{}",
        foreign_export.text()
    );
}

/// BUG-157: an intervention targets a learner enrolled in the course (422
/// `user_id`/`not-in-course` otherwise); rows are attributed to the acting
/// user even when an admin inspects another teacher via `teacher_user_id`;
/// the idempotent replay is gated by the analytics scope. Plus an unknown
/// `sort_by` is a 422 instead of a silent default order.
#[sqlx::test(migrations = "../../migrations")]
async fn interventions_need_enrolled_learners_and_belong_to_the_actor(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, _) = public_course(&app, &teacher, "Analytics 101").await;
    let alice = learner(&app, "alice").await;
    let outsider = learner(&app, "outsider").await;
    sqlx::query(
        "INSERT INTO course_progress (course_id, user_id, progress_pct) VALUES ($1, $2, $3)",
    )
    .bind(uuid::Uuid::parse_str(&course_id).unwrap())
    .bind(alice.user_id.0)
    .bind(0.0)
    .execute(&pool)
    .await
    .unwrap();

    let not_enrolled = app
        .post_as(
            &teacher,
            "/api/v2/analytics/teacher/interventions",
            &serde_json::json!({
                "user_id": outsider.user_id, "course_id": course_id,
                "intervention_type": "message_sent"
            }),
        )
        .await;
    assert_eq!(
        not_enrolled.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        not_enrolled.text()
    );
    assert_eq!(not_enrolled.json()["field_errors"][0]["field"], "user_id");
    assert_eq!(
        not_enrolled.json()["field_errors"][0]["code"],
        "not-in-course"
    );

    // An admin inspecting the teacher writes rows as themself.
    let boss = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app
        .mint_session_for(boss, &["analytics:read:platform"])
        .await;
    let as_admin = app
        .post_as(
            &admin,
            &format!(
                "/api/v2/analytics/teacher/interventions?teacher_user_id={}",
                teacher.user_id
            ),
            &serde_json::json!({
                "user_id": alice.user_id, "course_id": course_id,
                "intervention_type": "message_sent"
            }),
        )
        .await;
    assert_eq!(as_admin.status, StatusCode::CREATED, "{}", as_admin.text());
    assert_eq!(as_admin.json()["teacher_user_id"], boss.to_string());
    let teachers = app
        .get_as(&teacher, "/api/v2/analytics/teacher/interventions")
        .await;
    assert_eq!(teachers.json()["total"], 0, "{}", teachers.text());

    // Replay under the same key needs the analytics grant.
    let body = serde_json::json!({
        "user_id": alice.user_id, "course_id": course_id,
        "intervention_type": "message_sent"
    });
    let post = |session: &MintedSession| {
        let app = &app;
        let cookie = session.cookie.clone();
        let body = body.to_string();
        async move {
            app.send(
                Request::builder()
                    .method("POST")
                    .uri("/api/v2/analytics/teacher/interventions")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::COOKIE, cookie)
                    .header("idempotency-key", "retry-2")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
        }
    };
    let first = post(&teacher).await;
    assert_eq!(first.status, StatusCode::CREATED, "{}", first.text());
    let revoked = app.mint_session_for(teacher.user_id, &[]).await;
    let replay = post(&revoked).await;
    assert_eq!(replay.status, StatusCode::FORBIDDEN, "{}", replay.text());

    let bad_sort = app
        .get_as(
            &teacher,
            "/api/v2/analytics/teacher/learners/at-risk?sort_by=health",
        )
        .await;
    assert_eq!(
        bad_sort.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        bad_sort.text()
    );
    assert_eq!(bad_sort.json()["field_errors"][0]["field"], "sort_by");
    let bad_course_sort = app
        .get_as(&teacher, "/api/v2/analytics/teacher/courses?sort_by=risky")
        .await;
    assert_eq!(bad_course_sort.status, StatusCode::UNPROCESSABLE_ENTITY);
}

/// UX-106: `teacher_user_id` is read-only — an admin inspecting a teacher
/// neither saves nor deletes that teacher's views; `GET interventions`
/// honours `page`/`page_size`; a `reporter` roster row does not put the
/// course into the reporter's analytics scope; `""` and `"   "` answer the
/// same 422 `required`.
#[sqlx::test(migrations = "../../migrations")]
async fn impersonation_is_read_only_interventions_page_and_reporters_are_out(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, _) = public_course(&app, &teacher, "Analytics 101").await;
    let alice = learner(&app, "alice").await;
    sqlx::query(
        "INSERT INTO course_progress (course_id, user_id, progress_pct) VALUES ($1, $2, $3)",
    )
    .bind(uuid::Uuid::parse_str(&course_id).unwrap())
    .bind(alice.user_id.0)
    .bind(0.0)
    .execute(&pool)
    .await
    .unwrap();

    let saved = app
        .post_as(
            &teacher,
            "/api/v2/analytics/teacher/saved-views",
            &serde_json::json!({ "name": "Mine", "view_type": "watchlist", "query": {} }),
        )
        .await;
    assert_eq!(saved.status, StatusCode::CREATED, "{}", saved.text());
    let view_id = saved.json()["id"].as_str().unwrap().to_owned();
    let boss = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app
        .mint_session_for(boss, &["analytics:read:platform"])
        .await;
    let as_teacher = format!("?teacher_user_id={}", teacher.user_id);
    let not_theirs = app
        .delete_as(
            &admin,
            &format!("/api/v2/analytics/teacher/saved-views/{view_id}{as_teacher}"),
        )
        .await;
    assert_eq!(
        not_theirs.status,
        StatusCode::NOT_FOUND,
        "{}",
        not_theirs.text()
    );
    let admins_own = app
        .post_as(
            &admin,
            &format!("/api/v2/analytics/teacher/saved-views{as_teacher}"),
            &serde_json::json!({ "name": "Boss view", "query": {} }),
        )
        .await;
    assert_eq!(
        admins_own.status,
        StatusCode::CREATED,
        "{}",
        admins_own.text()
    );
    assert_eq!(admins_own.json()["teacher_user_id"], boss.to_string());
    let teachers = app
        .get_as(&teacher, "/api/v2/analytics/teacher/saved-views")
        .await;
    assert_eq!(teachers.json()["total"], 1, "{}", teachers.text());

    for empty in ["", "   "] {
        let blank = app
            .post_as(
                &teacher,
                "/api/v2/analytics/teacher/saved-views",
                &serde_json::json!({ "name": empty, "query": {} }),
            )
            .await;
        assert_eq!(blank.status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(blank.json()["field_errors"][0]["field"], "name");
        assert_eq!(
            blank.json()["field_errors"][0]["code"],
            "required",
            "{empty:?}: {}",
            blank.text()
        );
    }

    for kind in ["message_sent", "meeting_scheduled"] {
        let created = app
            .post_as(
                &teacher,
                "/api/v2/analytics/teacher/interventions",
                &serde_json::json!({
                    "user_id": alice.user_id, "course_id": course_id, "intervention_type": kind
                }),
            )
            .await;
        assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    }
    let second_page = app
        .get_as(
            &teacher,
            "/api/v2/analytics/teacher/interventions?page=2&page_size=1",
        )
        .await;
    assert_eq!(second_page.status, StatusCode::OK, "{}", second_page.text());
    let body = second_page.json();
    assert_eq!(body["total"], 2);
    assert_eq!(body["page"], 2);
    assert_eq!(body["page_size"], 1);
    assert_eq!(body["items"].as_array().unwrap().len(), 1);
    assert_eq!(body["items"][0]["intervention_type"], "message_sent");

    // A reporter reads the course but it is not in their analytics scope.
    let reporter = instructor(&app, "reporter").await;
    let added = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/contributors"),
            &serde_json::json!({ "username": "reporter", "role": "reporter" }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    let reporters_courses = app
        .get_as(&reporter, "/api/v2/analytics/teacher/courses")
        .await;
    assert_eq!(
        reporters_courses.status,
        StatusCode::OK,
        "{}",
        reporters_courses.text()
    );
    assert_eq!(reporters_courses.json()["total"], 0);
    let teachers_courses = app
        .get_as(&teacher, "/api/v2/analytics/teacher/courses")
        .await;
    assert_eq!(teachers_courses.json()["total"], 1);
}

fn grade(session: &MintedSession, id: &str, body: &serde_json::Value) -> Request<Body> {
    Request::builder()
        .method("PATCH")
        .uri(format!("/api/v2/submissions/{id}/grade"))
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &session.cookie)
        .header(header::IF_MATCH, "\"1\"")
        .body(Body::from(body.to_string()))
        .unwrap()
}

/// BUG-194: analytics score the grade of record only — a returned (60) or
/// saved-unreleased (100) retake never outranks the published 30 in the
/// assessment summary, the learner rows, the pass-rate drill-through or
/// the outcomes CSV (the BUG-187 `GradeKey` rule).
#[sqlx::test(migrations = "../../migrations")]
async fn analytics_score_only_the_released_grade_of_record(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher, "Grade of record").await;
    let (quiz_id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "max_attempts": 3, "passing_score": 50 }),
    )
    .await;
    let bob = learner(&app, "bob").await;
    let first = submit_attempt(&app, &bob, &quiz_id, &choice_id, &essay_id).await;
    // The retakes miss Q1: their items must not reach the question tallies.
    let second = submit_attempt_answering(&app, &bob, &quiz_id, &choice_id, &essay_id, "b").await;
    let third = submit_attempt_answering(&app, &bob, &quiz_id, &choice_id, &essay_id, "b").await;
    for (sub, body) in [
        (
            &first,
            serde_json::json!({ "action": "publish", "final_score": 30 }),
        ),
        (
            &second,
            serde_json::json!({ "action": "return", "final_score": 60 }),
        ),
        (
            &third,
            serde_json::json!({ "action": "save", "final_score": 100 }),
        ),
    ] {
        let graded = app.send(grade(&teacher, sub, &body)).await;
        assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
    }

    let detail = app
        .get_as(
            &teacher,
            &format!("/api/v2/analytics/teacher/assessments/quiz/{quiz_id}"),
        )
        .await;
    assert_eq!(detail.status, StatusCode::OK, "{}", detail.text());
    let body = detail.json();
    assert_eq!(body["summary"]["pass_rate"], 0.0, "{}", body["summary"]);
    assert_eq!(body["summary"]["median_score"], 30.0, "{}", body["summary"]);
    let row = &body["learner_rows"][0];
    assert_eq!(row["attempts"], 3, "{row}");
    assert_eq!(row["best_score"], 30.0, "{row}");
    assert_eq!(row["last_score"], 30.0, "{row}");
    // UX-138: the row's status is the grade of record's, and the saved
    // (unreleased) retake is flagged like the gradebook cell.
    assert_eq!(row["status"], "published", "{row}");
    assert_eq!(row["pending_attempt"], 3, "{row}");
    // UX-142: question tallies and item populations count the grade-of-record
    // attempts only — Q1 is 1/1 correct, not 1/3.
    let q1 = body["question_breakdown"]
        .as_array()
        .unwrap()
        .iter()
        .find(|q| q["question_id"] == choice_id)
        .expect("Q1 row");
    assert_eq!(q1["accuracy_pct"], 100.0, "{q1}");
    let q1_item = body["item_analytics"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["item_key"] == choice_id)
        .expect("Q1 item");
    assert_eq!(q1_item["population_count"], 1, "{q1_item}");
    assert_eq!(q1_item["impacted_count"], 0, "{q1_item}");
    // UX-144: the essay was published under an override without being
    // scored — no outcome, so it is neither a «critical» question nor an
    // impacted item.
    assert!(
        body["question_breakdown"]
            .as_array()
            .unwrap()
            .iter()
            .all(|q| q["question_id"] != essay_id),
        "{}",
        body["question_breakdown"]
    );
    assert!(
        body["item_analytics"]
            .as_array()
            .unwrap()
            .iter()
            .all(|i| i["item_key"] != essay_id),
        "{}",
        body["item_analytics"]
    );
    // UX-144: the studio Results item-analytics count the same population —
    // the published attempt only, not the returned / saved retakes, and the
    // unscored essay has no responses.
    let studio = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{quiz_id}/item-analytics"),
        )
        .await;
    assert_eq!(studio.status, StatusCode::OK, "{}", studio.text());
    let studio = studio.json();
    let choice = studio
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["item_id"] == choice_id)
        .expect("Q1 studio row");
    assert_eq!(choice["response_count"], 1, "{choice}");
    assert_eq!(choice["correct_pct"], 100.0, "{choice}");
    let essay = studio
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["item_id"] == essay_id)
        .expect("essay studio row");
    assert_eq!(essay["response_count"], 0, "{essay}");
    assert!(essay["avg_score_pct"].is_null(), "{essay}");

    let pass_rate = app
        .get_as(
            &teacher,
            &format!(
                "/api/v2/analytics/teacher/drill-through/pass_rate?assessment_type=quiz&assessment_id={quiz_id}"
            ),
        )
        .await;
    let item = &pass_rate.json()["items"][0];
    assert_eq!(item["best_score"], 30.0, "{item}");
    assert_eq!(item["passed"], false, "{item}");

    let csv = app
        .get_as(
            &teacher,
            "/api/v2/analytics/teacher/exports/assessment-outcomes.csv",
        )
        .await;
    assert_eq!(csv.status, StatusCode::OK, "{}", csv.text());
    let text = csv.text();
    let line = text.lines().nth(1).unwrap();
    // …,submission_rate,pass_rate,median_score,difficulty,signals
    assert!(line.contains(",0,30,"), "{line}");
    // UX-135: the «Сигналы» cell is the watchlist label, not the wire code.
    assert!(line.ends_with(",Низкая точность"), "{line}");

    // BUG-196: a learner-controlled cell that starts a formula is defused
    // in every export (one `csv_field`).
    sqlx::query("UPDATE users SET username = $1 WHERE id = $2")
        .bind("=HYPERLINK(\"http://evil\",\"x\") +1-1")
        .bind(bob.user_id.0)
        .execute(&pool)
        .await
        .unwrap();
    let progress = app
        .get_as(
            &teacher,
            "/api/v2/analytics/teacher/exports/course-progress.csv",
        )
        .await;
    let text = progress.text();
    assert!(
        text.contains(",\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\") +1-1\","),
        "{text}"
    );
    assert!(!text.contains(",=HYPERLINK"), "{text}");
}

/// UX-142: a code-challenge attempt that is graded but not released is not
/// an outcome — `repeated_failures` appears only once the failing score is
/// published.
#[sqlx::test(migrations = "../../migrations")]
async fn at_risk_code_challenge_outcome_is_the_released_score(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Algorithms").await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "code_challenge", "title": "Square" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let code_id = uuid::Uuid::parse_str(created.json()["id"].as_str().unwrap()).unwrap();
    let bob = learner(&app, "bob").await;
    let course_uuid = uuid::Uuid::parse_str(&course_id).unwrap();
    sqlx::query(
        "INSERT INTO course_progress (course_id, user_id, progress_pct) VALUES ($1, $2, 100)",
    )
    .bind(course_uuid)
    .bind(bob.user_id.0)
    .execute(&pool)
    .await
    .unwrap();
    let submission_id: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO submissions (assessment_id, course_id, user_id, status, attempt_number, final_score,          submitted_at, graded_at) VALUES ($1, $2, $3, 'graded', 1, 10, now(), now()) RETURNING id",
    )
    .bind(code_id)
    .bind(course_uuid)
    .bind(bob.user_id.0)
    .fetch_one(&pool)
    .await
    .unwrap();

    let reasons = |body: serde_json::Value| -> Vec<serde_json::Value> {
        find_row(&body["items"], "user_id", &bob.user_id.to_string())
            .map(|row| row["reason_codes"].as_array().unwrap().clone())
            .unwrap_or_default()
    };
    let held = app
        .get_as(&teacher, "/api/v2/analytics/teacher/learners/at-risk")
        .await;
    assert_eq!(held.status, StatusCode::OK, "{}", held.text());
    assert!(
        !reasons(held.json()).contains(&serde_json::json!("repeated_failures")),
        "{}",
        held.text()
    );

    sqlx::query("UPDATE submissions SET status = 'published' WHERE id = $1")
        .bind(submission_id)
        .execute(&pool)
        .await
        .unwrap();
    let released = app
        .get_as(&teacher, "/api/v2/analytics/teacher/learners/at-risk")
        .await;
    assert!(
        reasons(released.json()).contains(&serde_json::json!("repeated_failures")),
        "{}",
        released.text()
    );
}
