//! Tests from DOT spreadsheets (docs/XLSX-TEST-IMPORT.md): upload, preview
//! with issues, commit into a new test, idempotent replay, pictures, the
//! question bank in a learner's attempt, export round-trip, access.
//! Every workbook here is synthetic, written by `ab_xlsx::write`.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::print_stdout
)]

use ab_testkit::{MintedSession, TestApp};
use ab_xlsx::{DotKind, DotOption, DotQuestion, DotTest, Image, ParseOptions};
use axum::http::{StatusCode, header};
use base64::Engine as _;
use serde_json::{Value, json};
use sqlx::PgPool;

const XLSX: &str = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PNG_1X1: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

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
            "file:create:own",
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
        &["assessment:submit:assigned", "assessment:read:assigned"],
    )
    .await
}

/// Published course + chapter; returns (course_id, chapter_id).
async fn course(app: &TestApp, teacher: &MintedSession) -> (String, String) {
    let course = app
        .post_as(teacher, "/api/v2/courses", &json!({ "name": "Java" }))
        .await;
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    app.publish_course(&course_id).await;
    let chapter = app
        .post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &json!({ "name": "Exam" }),
        )
        .await;
    (course_id, chapter.json()["id"].as_str().unwrap().to_owned())
}

fn opt(text: &str) -> DotOption {
    DotOption {
        text: text.to_owned(),
        image: None,
    }
}

fn question(text: &str, kind: DotKind) -> DotQuestion {
    DotQuestion {
        row: 0,
        text: text.to_owned(),
        images: vec![],
        level: 0,
        kind,
    }
}

/// Five questions of every DOT type, one picture; 3 attempts, 10 minutes,
/// 3 questions drawn per attempt.
fn workbook() -> Vec<u8> {
    let png = base64::engine::general_purpose::STANDARD
        .decode(PNG_1X1)
        .unwrap();
    let mut pictured = question(
        "Which type holds whole numbers?",
        DotKind::Single {
            options: vec![opt("int"), opt("String"), opt("boolean")],
            correct: 0,
        },
    );
    pictured.images = vec![0];
    let test = DotTest {
        title: "Synthetic exam".into(),
        attempts: 3,
        time_minutes: 10,
        limit: 3,
        leveling: false,
        questions: vec![
            pictured,
            question(
                "Pick the primitive types",
                DotKind::Multiple {
                    options: vec![opt("int"), opt("Integer"), opt("char")],
                    correct: vec![0, 2],
                },
            ),
            question("2 + 2 =", DotKind::Short { answer: "4".into() }),
            question(
                "Match the literal to its type",
                DotKind::Matching {
                    left: vec![opt("1"), opt("'a'")],
                    right: vec![opt("int"), opt("char")],
                    pairs: vec![Some(0), Some(1)],
                },
            ),
            question("Explain garbage collection", DotKind::Essay),
        ],
        images: vec![Image {
            sha256: [7; 32],
            bytes: png,
            mime: "image/png",
            width: 1,
            height: 1,
        }],
    };
    ab_xlsx::write(&test, &[]).unwrap()
}

/// An `assessment-import` upload of `bytes`, finalized; returns its id.
async fn upload_xlsx(app: &TestApp, who: &MintedSession, bytes: &[u8]) -> String {
    let created = app
        .post_as(
            who,
            "/api/v2/uploads",
            &json!({ "purpose": "assessment-import", "mime": XLSX, "size_bytes": bytes.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let put = reqwest::Client::new()
        .put(created.json()["put_url"].as_str().unwrap())
        .header("content-type", XLSX)
        .header("if-none-match", "*")
        .body(bytes.to_vec())
        .send()
        .await
        .unwrap();
    assert!(put.status().is_success(), "{}", put.status());
    let fin = app
        .post_as(who, &format!("/api/v2/uploads/{id}/finalize"), &json!({}))
        .await;
    assert_eq!(fin.status, StatusCode::OK, "{}", fin.text());
    id
}

fn codes(import: &Value) -> Vec<String> {
    import["issues"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["code"].as_str().unwrap().to_owned())
        .collect()
}

#[ab_testdb::test]
async fn dot_workbook_becomes_a_test_with_a_question_bank(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let stranger = instructor(&app, "stranger").await;
    let (course_id, chapter_id) = course(&app, &teacher).await;
    let upload = upload_xlsx(&app, &teacher, &workbook()).await;

    // Someone else's course: refused before the body is read.
    let refused = app
        .post_as(
            &stranger,
            &format!("/api/v2/courses/{course_id}/assessment-imports"),
            &json!({ "upload_id": upload, "file_name": "exam.xlsx" }),
        )
        .await;
    assert!(
        matches!(
            refused.status,
            StatusCode::FORBIDDEN | StatusCode::NOT_FOUND
        ),
        "{}",
        refused.status
    );

    // Preview: every type, the picture, the settings row.
    let created = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/assessment-imports"),
            &json!({ "upload_id": upload, "file_name": "Экзамен.xlsx" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let import = created.json();
    let import_id = import["id"].as_str().unwrap().to_owned();
    assert_eq!(import["status"], "ready", "{:?}", codes(&import));
    assert_eq!(import["file_name"], "Экзамен.xlsx");
    let summary = &import["summary"];
    assert_eq!(summary["questions"], 5);
    assert_eq!(summary["single"], 1);
    assert_eq!(summary["multiple"], 1);
    assert_eq!(summary["short"], 1);
    assert_eq!(summary["matching"], 1);
    assert_eq!(summary["essay"], 1);
    assert_eq!(summary["images"], 1);
    assert_eq!(summary["errors"], 0);
    assert!(codes(&import).contains(&"manual_grading".to_owned()));
    let settings = &import["settings"];
    assert_eq!(settings["title"], "Synthetic exam");
    assert_eq!(settings["max_attempts"], 3);
    assert_eq!(settings["time_limit_seconds"], 600);
    assert_eq!(settings["draw_count"], 3);
    let items = import["items"].as_array().unwrap();
    assert_eq!(items[0]["row"], 2);
    let picture = items[0]["body"]["media"][0]["upload_id"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(items[2]["body"]["short_answer"], true);
    assert_eq!(items[2]["body"]["accepted_answers"][0], "4");

    // The picture is served to the import's author only.
    let media = format!("/api/v2/assessment-imports/{import_id}/media/{picture}");
    let shown = app.get_as(&teacher, &media).await;
    assert_eq!(shown.status, StatusCode::SEE_OTHER);
    assert_eq!(shown.headers[header::CACHE_CONTROL], "private, max-age=240");
    assert_ne!(
        app.get_as(&stranger, &media).await.status,
        StatusCode::SEE_OTHER
    );
    assert_ne!(
        app.get_as(
            &stranger,
            &format!("/api/v2/assessment-imports/{import_id}")
        )
        .await
        .status,
        StatusCode::OK
    );

    // Re-reading with the other `\n` mode keeps the import usable.
    let reread = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessment-imports/{import_id}"),
            &json!({ "unescape_newlines": false }),
        )
        .await;
    assert_eq!(reread.status, StatusCode::OK, "{}", reread.text());
    assert_eq!(reread.json()["status"], "ready");
    assert_eq!(reread.json()["unescape_newlines"], false);
    assert_eq!(
        reread.json()["items"][0]["body"]["media"][0]["upload_id"],
        picture.as_str()
    );

    // Commit: a new draft exam with the file's settings and every question.
    let commit = json!({ "target": { "mode": "new", "chapter_id": chapter_id } });
    let commit_path = format!("/api/v2/assessment-imports/{import_id}/commit");
    let committed = app.post_as(&teacher, &commit_path, &commit).await;
    assert_eq!(committed.status, StatusCode::OK, "{}", committed.text());
    assert_eq!(committed.json()["status"], "committed");
    let assessment_id = committed.json()["result"]["assessment_id"]
        .as_str()
        .unwrap()
        .to_owned();
    // Replaying it creates nothing new.
    let replay = app.post_as(&teacher, &commit_path, &commit).await;
    assert_eq!(replay.status, StatusCode::OK);
    assert_eq!(
        replay.json()["result"]["assessment_id"],
        assessment_id.as_str()
    );
    let detail = app
        .get_as(&teacher, &format!("/api/v2/assessments/{assessment_id}"))
        .await;
    let detail = detail.json();
    assert_eq!(detail["title"], "Synthetic exam");
    assert_eq!(detail["kind"], "exam");
    assert_eq!(detail["items"].as_array().unwrap().len(), 5);
    assert_eq!(detail["items"][0]["source"]["file"], "Экзамен.xlsx");
    assert_eq!(detail["items"][0]["source"]["row"], 2);
    assert_eq!(detail["policy"]["max_attempts"], 3);
    assert_eq!(detail["policy"]["time_limit_seconds"], 600);
    assert_eq!(detail["policy"]["draw_count"], 3);

    // The committed test's picture is readable through the test.
    let test_media = format!("/api/v2/assessments/{assessment_id}/media/{picture}");
    assert_eq!(
        app.get_as(&teacher, &test_media).await.status,
        StatusCode::SEE_OTHER
    );

    // Export: the same questions come back from the workbook.
    let exported = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{assessment_id}/export"),
        )
        .await;
    assert_eq!(exported.status, StatusCode::OK, "{}", exported.text());
    assert_eq!(exported.content_type(), XLSX);
    let parsed = ab_xlsx::parse(exported.bytes(), ParseOptions::default());
    assert!(!parsed.has_errors(), "{:?}", parsed.issues);
    let test = parsed.test.unwrap();
    assert_eq!(test.questions.len(), 5);
    assert_eq!(test.limit, 3);
    assert_eq!(test.images.len(), 1);
    assert_ne!(
        app.get_as(
            &stranger,
            &format!("/api/v2/assessments/{assessment_id}/export")
        )
        .await
        .status,
        StatusCode::OK
    );

    // Publish; a learner's attempt draws 3 of the 5 and sees only those.
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{assessment_id}/lifecycle"),
            &json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let alice = learner(&app, "alice").await;
    let before = app
        .get_as(&alice, &format!("/api/v2/assessments/{assessment_id}"))
        .await;
    assert_eq!(before.status, StatusCode::OK, "{}", before.text());
    assert!(before.json()["items"].as_array().unwrap().is_empty());
    let started = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{assessment_id}/submissions"),
            &json!({}),
        )
        .await;
    assert_eq!(started.status, StatusCode::CREATED, "{}", started.text());
    let draft = started.json();
    assert_eq!(draft["total_items"], 3);
    let drawn: Vec<&str> = draft["item_ids"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(drawn.len(), 3);
    let seen = app
        .get_as(&alice, &format!("/api/v2/assessments/{assessment_id}"))
        .await;
    let mut seen: Vec<String> = seen.json()["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["id"].as_str().unwrap().to_owned())
        .collect();
    seen.sort();
    let mut expected: Vec<String> = drawn.iter().map(|s| (*s).to_owned()).collect();
    expected.sort();
    assert_eq!(seen, expected);
}

#[ab_testdb::test]
async fn a_broken_workbook_is_invalid_and_cannot_be_committed(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = course(&app, &teacher).await;
    // A zip that is not a workbook.
    let upload = upload_xlsx(&app, &teacher, b"PK\x03\x04 not really a workbook").await;
    let created = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/assessment-imports"),
            &json!({ "upload_id": upload, "file_name": "broken.xlsx" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let import = created.json();
    assert_eq!(import["status"], "invalid");
    assert!(codes(&import).contains(&"file_unreadable".to_owned()));
    let import_id = import["id"].as_str().unwrap();
    let commit = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessment-imports/{import_id}/commit"),
            &json!({ "target": { "mode": "new", "chapter_id": chapter_id } }),
        )
        .await;
    assert_eq!(commit.status, StatusCode::CONFLICT, "{}", commit.text());
    assert_eq!(commit.json()["code"], "assessment-import-invalid");
    // Discarded: gone.
    let discarded = app
        .delete_as(&teacher, &format!("/api/v2/assessment-imports/{import_id}"))
        .await;
    assert_eq!(discarded.status, StatusCode::NO_CONTENT);
    assert_eq!(
        app.get_as(&teacher, &format!("/api/v2/assessment-imports/{import_id}"))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
}

/// Acceptance on a real DOT file kept outside the repository (it may be a
/// real exam: nothing of it is printed beyond counts and issue codes):
/// `DOT_SAMPLE_XLSX=<path> cargo test -p ab-api --test assessment_imports_flow -- --ignored`.
#[ab_testdb::test]
#[ignore = "needs DOT_SAMPLE_XLSX"]
async fn a_real_dot_file_imports_and_exports(pool: PgPool) {
    let path = std::env::var("DOT_SAMPLE_XLSX").expect("DOT_SAMPLE_XLSX");
    let bytes = std::fs::read(path).unwrap();
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = course(&app, &teacher).await;
    let upload = upload_xlsx(&app, &teacher, &bytes).await;
    let created = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/assessment-imports"),
            &json!({ "upload_id": upload, "file_name": "sample.xlsx" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED);
    let import = created.json();
    println!("status {} summary {}", import["status"], import["summary"]);
    println!("issues {:?}", codes(&import));
    assert_eq!(import["status"], "ready");
    let import_id = import["id"].as_str().unwrap();
    let committed = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessment-imports/{import_id}/commit"),
            &json!({ "target": { "mode": "new", "chapter_id": chapter_id } }),
        )
        .await;
    assert_eq!(committed.status, StatusCode::OK);
    let assessment_id = committed.json()["result"]["assessment_id"]
        .as_str()
        .unwrap()
        .to_owned();
    let detail = app
        .get_as(&teacher, &format!("/api/v2/assessments/{assessment_id}"))
        .await
        .json();
    let items = detail["items"].as_array().unwrap();
    assert_eq!(
        items.len(),
        usize::try_from(import["summary"]["questions"].as_u64().unwrap()).unwrap()
    );
    println!("policy {}", detail["policy"]);
    let readiness = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{assessment_id}/readiness"),
        )
        .await
        .json();
    println!("readiness {readiness}");
    // Every picture of the test is served.
    for item in items {
        for media in item["body"]["media"].as_array().into_iter().flatten() {
            let id = media["upload_id"].as_str().unwrap();
            let shown = app
                .get_as(
                    &teacher,
                    &format!("/api/v2/assessments/{assessment_id}/media/{id}"),
                )
                .await;
            assert_eq!(shown.status, StatusCode::SEE_OTHER);
        }
    }
    // Round trip: the export reads back to the same questions.
    let exported = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{assessment_id}/export"),
        )
        .await;
    assert_eq!(exported.status, StatusCode::OK);
    let original = ab_xlsx::parse(&bytes, ParseOptions::default())
        .test
        .unwrap();
    let again = ab_xlsx::parse(exported.bytes(), ParseOptions::default());
    assert!(!again.has_errors(), "{:?}", again.issues);
    let again = again.test.unwrap();
    assert_eq!(again.questions.len(), original.questions.len());
    for (a, b) in original.questions.iter().zip(&again.questions) {
        assert_eq!(a.text, b.text, "row {}", a.row);
        assert_eq!(a.kind, b.kind, "row {}", a.row);
        assert_eq!(a.images.len(), b.images.len(), "row {}", a.row);
    }
    assert_eq!(again.images.len(), original.images.len());
    assert_eq!(
        (again.attempts, again.time_minutes, again.limit),
        (original.attempts, original.time_minutes, original.limit)
    );
    println!(
        "round trip ok: {} questions, {} pictures",
        again.questions.len(),
        again.images.len()
    );
}
