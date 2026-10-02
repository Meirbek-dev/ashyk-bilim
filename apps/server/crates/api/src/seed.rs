//! `ashyq admin seed-e2e` (S-03): the web end-to-end fixtures.
//!
//! The fixed accounts and course the suites run against. Idempotent - accounts are found by
//! username, the course by its owner and name; a re-run only fills what is
//! missing. Everything goes through the domain services the API uses, so the
//! data is what a teacher would have built by hand.
//!
//! Refuses `AB__ENVIRONMENT=production` (`Config::environment`, the switch
//! that also turns on secure cookies and the CORS allowlist check).

use ab_core::assessments::{AssessmentKind, GradingType, Lifecycle};
use ab_core::id::{ActivityId, CourseId, UserId};
use ab_core::permission::PermissionSet;
use ab_core::{Error, ErrorCode, Result};
use ab_domain::assessments::items::ItemBody;
use ab_domain::assessments::service::{
    AssessmentDetail, CreateAssessment, ItemChanges, ItemMetadataInput,
};
use ab_domain::catalog::courses::ListParams;
use ab_domain::catalog::curriculum::ActivityChanges;
use ab_domain::files::submissions::ConfigPatch;
use ab_domain::identity::{Actor, NewAccount};
use secrecy::SecretString;
use serde::Serialize;

use crate::state::AppState;

/// `(key, username, email, extra roles)`; every account also holds `user`.
pub const ACCOUNTS: [(&str, &str, &str, &[&str]); 4] = [
    ("admin", "e2e-admin", "admin@e2e.test", &["admin"]),
    (
        "teacher",
        "e2e-teacher",
        "teacher@e2e.test",
        &["instructor"],
    ),
    ("student1", "e2e-student1", "student1@e2e.test", &[]),
    ("student2", "e2e-student2", "student2@e2e.test", &[]),
];
pub const COURSE_NAME: &str = "E2E seed course";

/// What was seeded - printed as JSON (never the password).
#[derive(Debug, Serialize)]
pub struct SeedReport {
    pub accounts: Vec<SeededAccount>,
    pub course: SeededCourse,
}

#[derive(Debug, Serialize)]
pub struct SeededAccount {
    pub key: &'static str,
    pub username: &'static str,
    pub email: &'static str,
    pub user_id: UserId,
}

#[derive(Debug, Serialize)]
pub struct SeededCourse {
    pub id: CourseId,
    pub name: &'static str,
    pub owner: &'static str,
    pub enrolled: Vec<&'static str>,
    pub activities: Vec<SeededActivity>,
}

#[derive(Debug, Serialize)]
pub struct SeededActivity {
    pub activity_type: String,
    pub id: ActivityId,
    pub name: String,
}

/// The process itself acting as platform admin (account creation only).
fn system_actor() -> Result<Actor> {
    Ok(Actor {
        permissions: PermissionSet::parse(["*:*:*"])?,
        permission_strings: vec!["*:*:*".into()],
        ..Actor::anonymous()
    })
}

pub async fn seed_e2e(state: &AppState, password: &SecretString) -> Result<SeedReport> {
    if state.config.environment.is_production() {
        return Err(Error::forbidden(
            "seed-e2e refuses to run with AB__ENVIRONMENT=production",
        ));
    }
    let system = system_actor()?;
    let mut accounts = Vec::new();
    for (key, username, email, roles) in ACCOUNTS {
        let user_id = ensure_account(state, &system, username, email, roles, password).await?;
        accounts.push(SeededAccount {
            key,
            username,
            email,
            user_id,
        });
    }
    let id_of = |key: &str| {
        accounts
            .iter()
            .find(|a| a.key == key)
            .map(|a| a.user_id)
            .ok_or_else(|| Error::app(ErrorCode::Internal, format!("seed account {key} missing")))
    };
    let teacher = Actor::current(&state.pool, id_of("teacher")?).await?;
    let course_id = ensure_course(state, &teacher).await?;
    let student = Actor::current(&state.pool, id_of("student1")?).await?;
    state.trail.add_course(&student, course_id).await?;
    let activities = ab_db::catalog::list_activities(&state.pool, course_id)
        .await?
        .into_iter()
        .map(|a| SeededActivity {
            activity_type: a.activity_type,
            id: a.id,
            name: a.name,
        })
        .collect();
    Ok(SeedReport {
        accounts,
        course: SeededCourse {
            id: course_id,
            name: COURSE_NAME,
            owner: "teacher",
            enrolled: vec!["student1"],
            activities,
        },
    })
}

async fn ensure_account(
    state: &AppState,
    system: &Actor,
    username: &str,
    email: &str,
    roles: &[&str],
    password: &SecretString,
) -> Result<UserId> {
    let roles: Vec<String> = roles.iter().map(ToString::to_string).collect();
    let Some(user_id) = ab_db::identity::find_user_id_by_username(&state.pool, username).await?
    else {
        let (first_name, last_name) = username.split_once('-').unwrap_or((username, "user"));
        let created = state
            .identity
            .admin_create_user(
                system,
                NewAccount {
                    username: username.to_owned(),
                    email: email.to_owned(),
                    password: Some(password.clone()),
                    first_name: first_name.to_uppercase(),
                    last_name: last_name.to_owned(),
                    organization: "E2E".to_owned(),
                    ip: None,
                    user_agent: Some("ashyq admin seed-e2e".to_owned()),
                    language: None,
                },
                &roles,
            )
            .await?;
        return Ok(created.id);
    };
    // Existing account: only the missing roles (the password is left as it
    // was set on first creation - `just dev-reset` to change it).
    let (held, _) = ab_db::identity::load_user_grants(&state.pool, user_id).await?;
    for role in roles.iter().filter(|r| !held.contains(r)) {
        state.rbac.assign_role(system, user_id, role).await?;
    }
    Ok(user_id)
}

/// The teacher's course, built and published on the first run.
async fn ensure_course(state: &AppState, teacher: &Actor) -> Result<CourseId> {
    let params = ListParams {
        mine: true,
        q: Some(COURSE_NAME),
        sort: "updated",
        preset: "all",
    };
    let (found, _) = state.courses.list(teacher, &params, None, 100).await?;
    let existing = found
        .into_iter()
        .find(|c| c.name == COURSE_NAME && c.creator_id == Some(teacher.user_id));
    let course = if let Some(course) = existing {
        course
    } else {
        let course = state
            .courses
            .create(
                teacher,
                COURSE_NAME,
                "Fixture course for the web end-to-end suites.",
                "One activity of every type.",
                vec!["e2e".into()],
            )
            .await?;
        build_content(state, teacher, course.id).await?;
        course
    };
    if !course.public {
        ab_domain::catalog::readiness::set_course_public(
            &state.assessments,
            teacher,
            course.id,
            true,
        )
        .await?;
    }
    Ok(course.id)
}

fn item_body(value: serde_json::Value) -> Result<ItemBody> {
    serde_json::from_value(value).map_err(|e| Error::internal("seed item body", e))
}

fn choice() -> Result<ItemBody> {
    item_body(serde_json::json!({
        "kind": "choice", "prompt": "2 + 2 = ?",
        "options": [
            { "id": "a", "text": "4", "is_correct": true },
            { "id": "b", "text": "5", "is_correct": false }
        ]
    }))
}

async fn build_content(state: &AppState, teacher: &Actor, course_id: CourseId) -> Result<()> {
    let chapter = state
        .curriculum
        .add_chapter(teacher, course_id, "Chapter 1", "Every activity type.")
        .await?;
    let paragraph = |text: &str| {
        serde_json::json!({ "type": "doc", "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": text }] }
        ] })
    };
    for (name, activity_type, sub_type, content) in [
        (
            "Dynamic page",
            "dynamic",
            "dynamic_page",
            paragraph("Welcome to the E2E course."),
        ),
        (
            "Video",
            "video",
            "video_youtube",
            serde_json::json!({ "uri": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
        ),
        (
            "Document",
            "document",
            "document_pdf",
            serde_json::json!({}),
        ),
    ] {
        let activity = state
            .curriculum
            .add_activity(teacher, chapter.id, name, activity_type, sub_type)
            .await?;
        state
            .curriculum
            .update_activity(
                teacher,
                activity.id,
                ActivityChanges {
                    name: None,
                    published: Some(true),
                    type_pair: None,
                    content: Some(&content),
                    details: None,
                    settings: None,
                    expected_version: None,
                },
            )
            .await?;
    }

    let files = state
        .file_submissions
        .create(
            teacher,
            chapter.id,
            "File submission",
            ConfigPatch {
                instructions: Some("Upload any PDF.".into()),
                ..ConfigPatch::default()
            },
        )
        .await?;
    state
        .file_submissions
        .publish(teacher, files.row.id)
        .await?;

    build_assessments(state, teacher, chapter.id).await
}

/// Quiz, exam and code challenge, each published.
async fn build_assessments(
    state: &AppState,
    teacher: &Actor,
    chapter_id: ab_core::id::ChapterId,
) -> Result<()> {
    for (kind, title) in [
        (AssessmentKind::Quiz, "Quiz"),
        (AssessmentKind::Exam, "Exam"),
        (AssessmentKind::CodeChallenge, "Code challenge"),
    ] {
        let detail = state
            .assessments
            .create(
                teacher,
                CreateAssessment {
                    chapter_id,
                    kind,
                    title,
                    description: "",
                    weight: 1.0,
                    grading_type: GradingType::Percentage,
                    policy: None,
                },
            )
            .await?;
        fill_items(state, teacher, kind, &detail).await?;
        state
            .assessments
            .transition(
                teacher,
                detail.assessment.id,
                Lifecycle::Published,
                None,
                None,
            )
            .await?;
    }
    Ok(())
}

/// Quiz / exam: one choice item. Code challenge: its default item made
/// gradable (Python 3, two tests, a reference solution).
async fn fill_items(
    state: &AppState,
    teacher: &Actor,
    kind: AssessmentKind,
    detail: &AssessmentDetail,
) -> Result<()> {
    if kind != AssessmentKind::CodeChallenge {
        state
            .assessments
            .add_item(
                teacher,
                detail.assessment.id,
                "2 + 2",
                choice()?,
                10.0,
                ItemMetadataInput::default(),
            )
            .await?;
        return Ok(());
    }
    let item = detail.items.first().ok_or_else(|| {
        Error::app(
            ErrorCode::Internal,
            "code challenge created without its item",
        )
    })?;
    let body = item_body(serde_json::json!({
        "kind": "code", "prompt": "Print n squared.", "languages": [71],
        "reference_solutions": { "71": "print(int(input()) ** 2)" },
        "time_limit_seconds": 2,
        "tests": [
            { "id": "t1", "input": "2", "expected_output": "4", "is_visible": true, "weight": 1 },
            { "id": "t2", "input": "3", "expected_output": "9", "is_visible": false, "weight": 1 }
        ]
    }))?;
    state
        .assessments
        .update_item(
            teacher,
            item.id,
            ItemChanges {
                title: Some("Square".into()),
                body: Some(body),
                max_score: None,
                metadata: None,
            },
        )
        .await?;
    Ok(())
}
