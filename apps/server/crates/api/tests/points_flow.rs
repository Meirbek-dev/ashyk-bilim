//! REWRITE 5.8 item 10, *points as the record*: a grade is points of the attempt's version, its percentage derived
//! by one rule (two decimals, half away from zero) that Rust and Postgres share. The auto-grader, a teacher's item
//! scores and override, the journal, the learner's view and the gradebook carry the points beside the percentage.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::float_cmp
)]

use ab_domain::grading::score::{percent_of_points, points_of_percent};
use ab_testkit::{MintedSession, TestApp};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use serde_json::json;
use sqlx::PgPool;

#[ab_testdb::test]
async fn the_percent_rule_is_the_databases(pool: PgPool) {
    // Every hundredth of a point on the maxima that make x.xx5 percentages (8, 32, 400), thirds (3, 7) and a big one.
    let mut points = vec![];
    let mut maxima = vec![];
    for max in [1_i64, 3, 7, 8, 32, 400, 1234] {
        for cents in (0..=max * 100).step_by(if max > 100 { 7 } else { 1 }) {
            points.push(format!("{}.{:02}", cents / 100, cents % 100));
            maxima.push(max.to_string());
        }
    }
    let rows: Vec<(String, String, f64, f64)> = sqlx::query_as(
        "SELECT p::text, m::text, percent_of_points(p, m)::float8, points_of_percent(percent_of_points(p, m), m)::float8
         FROM unnest($1::text[]::numeric[], $2::text[]::numeric[]) AS t(p, m)",
    )
    .bind(&points)
    .bind(&maxima)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(rows.len(), points.len());
    for (p, m, sql_percent, sql_back) in rows {
        let (p, m): (f64, f64) = (p.parse().unwrap(), m.parse().unwrap());
        let percent = percent_of_points(p, m);
        assert_eq!(percent, sql_percent, "percent_of_points({p}, {m})");
        assert_eq!(
            points_of_percent(percent, m),
            sql_back,
            "points_of_percent({percent}, {m})"
        );
    }
    let zero: f64 = sqlx::query_scalar("SELECT percent_of_points(0, 0)::float8")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((zero, percent_of_points(0.0, 0.0)), (0.0, 0.0));
}

async fn session(app: &TestApp, name: &str, roles: &[&str], permissions: &[&str]) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), roles)
        .await;
    app.mint_session_for(user, permissions).await
}

fn send(
    who: &MintedSession,
    method: &str,
    uri: &str,
    if_match: Option<&str>,
    body: &serde_json::Value,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &who.cookie);
    if let Some(version) = if_match {
        builder = builder.header(header::IF_MATCH, version);
    }
    builder.body(Body::from(body.to_string())).unwrap()
}

#[ab_testdb::test]
#[allow(
    clippy::too_many_lines,
    reason = "one attempt from hand-in to the gradebook"
)]
async fn a_grade_is_points_of_the_version(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = session(
        &app,
        "teacher",
        &["instructor"],
        &[
            "course:create:platform",
            "course:read:all",
            "course:update:own",
            "assessment:*:own",
        ],
    )
    .await;
    let bob = session(
        &app,
        "bob",
        &["user"],
        &["assessment:submit:assigned", "assessment:read:assigned"],
    )
    .await;
    let course = app
        .post_as(&teacher, "/api/v2/courses", &json!({ "name": "Points" }))
        .await;
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    app.publish_course(&course_id).await;
    let chapter = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &json!({ "name": "Week 1" }),
        )
        .await;
    let chapter_id = chapter.json()["id"].as_str().unwrap().to_owned();
    let quiz = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Quiz" }),
        )
        .await;
    let id = quiz.json()["id"].as_str().unwrap().to_owned();
    // A 1-point choice and a 2-point essay: the attempt is out of 3 points.
    let choice = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &json!({
                "title": "Q1", "max_score": 1,
                "body": { "kind": "choice", "prompt": "Q1",
                          "options": [{ "id": "a", "text": "yes", "is_correct": true },
                                      { "id": "b", "text": "no", "is_correct": false }] }
            }),
        )
        .await;
    let choice_id = choice.json()["id"].as_str().unwrap().to_owned();
    let essay = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &json!({ "title": "Essay", "max_score": 2, "body": { "kind": "open_text", "prompt": "Why?" } }),
        )
        .await;
    let essay_id = essay.json()["id"].as_str().unwrap().to_owned();
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let draft = app
        .post_as(
            &bob,
            &format!("/api/v2/assessments/{id}/submissions"),
            &json!({}),
        )
        .await;
    let sub = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            &bob,
            &format!("/api/v2/submissions/{sub}/submit"),
            &json!({ "answers": {
                &choice_id: { "kind": "choice", "selected": ["a"] },
                &essay_id: { "kind": "open_text", "text": "Because." },
            } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());

    // The auto-grader: the choice's 1 point of 3, the essay waiting.
    let review = app
        .get_as(&teacher, &format!("/api/v2/submissions/{sub}/review"))
        .await;
    let review = review.json();
    assert_eq!(review["max_points"], 3.0, "{review}");
    assert_eq!(review["auto_points"], 1.0, "{review}");
    assert_eq!(review["auto_score"], 33.33, "{review}");
    let items = review["grading"]["items"].as_array().unwrap();
    assert_eq!(
        items
            .iter()
            .map(|i| (
                i["score"].as_f64().unwrap(),
                i["max_score"].as_f64().unwrap()
            ))
            .collect::<Vec<_>>(),
        [(1.0, 1.0), (0.0, 2.0)],
        "items in their own points"
    );
    let queue = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/submissions"))
        .await;
    assert_eq!(
        queue.json()["items"][0]["max_points"],
        3.0,
        "{}",
        queue.text()
    );

    // The essay's half point: 1.5 of 3, 50 %.
    let graded = app
        .send(send(
            &teacher,
            "PATCH",
            &format!("/api/v2/submissions/{sub}/grade"),
            Some(review["version"].to_string().as_str()),
            &json!({ "action": "save", "item_grades": [{ "item_id": essay_id, "score": 0.5 }] }),
        ))
        .await;
    assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
    let graded = graded.json();
    assert_eq!(
        (
            graded["final_points"].as_f64(),
            graded["final_score"].as_f64()
        ),
        (Some(1.5), Some(50.0))
    );
    assert!(graded["score_override"].is_null(), "{graded}");

    // An override is points of the 3: above them is refused, 2.21 is 73.67 %.
    let above = app
        .send(send(
            &teacher,
            "PATCH",
            &format!("/api/v2/submissions/{sub}/grade"),
            Some(graded["version"].to_string().as_str()),
            &json!({ "action": "publish", "final_points": 3.5 }),
        ))
        .await;
    assert_eq!(
        above.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        above.text()
    );
    let overridden = app
        .send(send(
            &teacher,
            "PATCH",
            &format!("/api/v2/submissions/{sub}/grade"),
            Some(graded["version"].to_string().as_str()),
            &json!({ "action": "publish", "final_points": 2.21 }),
        ))
        .await;
    assert_eq!(overridden.status, StatusCode::OK, "{}", overridden.text());
    let overridden = overridden.json();
    assert_eq!(overridden["final_points"], 2.21, "{overridden}");
    assert_eq!(overridden["final_score"], 73.67, "{overridden}");
    assert_eq!(overridden["score_override"], 2.21, "{overridden}");
    assert_eq!(
        overridden["grading"]["score_override"], 2.21,
        "{overridden}"
    );
    let stored: (f64, f64) = sqlx::query_as(
        "SELECT final_points::float8, final_score::float8 FROM submissions WHERE id = $1::uuid",
    )
    .bind(&sub)
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(stored, (2.21, 73.67), "the response is the stored grade");

    // The journal keeps both: points of record and the derived percentages.
    let history = app
        .get_as(
            &teacher,
            &format!("/api/v2/submissions/{sub}/grading-history"),
        )
        .await;
    assert_eq!(history.status, StatusCode::OK, "{}", history.text());
    let latest = &history.json()[0];
    assert_eq!(latest["max_points"], 3.0, "{latest}");
    assert_eq!(latest["raw_points"], 2.21, "{latest}");
    assert_eq!(latest["final_points"], 2.21, "{latest}");
    assert_eq!(latest["raw_score"], 73.67, "{latest}");

    // The learner reads the released grade in points too.
    let mine = app
        .get_as(&bob, &format!("/api/v2/submissions/{sub}"))
        .await;
    let mine = mine.json();
    assert_eq!(
        (
            mine["final_points"].as_f64(),
            mine["max_points"].as_f64(),
            mine["final_score"].as_f64()
        ),
        (Some(2.21), Some(3.0), Some(73.67)),
        "{mine}"
    );

    // The gradebook cell: the percentage and the points it comes from.
    let book = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/gradebook"))
        .await;
    assert_eq!(book.status, StatusCode::OK, "{}", book.text());
    let cell = &book.json()["cells"][0];
    assert_eq!(
        (
            cell["final_points"].as_f64(),
            cell["max_points"].as_f64(),
            cell["final_score"].as_f64()
        ),
        (Some(2.21), Some(3.0), Some(73.67)),
        "{cell}"
    );

    // Dropping the override derives the items again: 1.5 points.
    let dropped = app
        .send(send(
            &teacher,
            "PATCH",
            &format!("/api/v2/submissions/{sub}/grade"),
            Some(overridden["version"].to_string().as_str()),
            &json!({ "action": "publish", "final_points": null }),
        ))
        .await;
    assert_eq!(dropped.status, StatusCode::OK, "{}", dropped.text());
    assert_eq!(dropped.json()["final_points"], 1.5, "{}", dropped.text());
    assert!(
        dropped.json()["score_override"].is_null(),
        "{}",
        dropped.text()
    );
}
