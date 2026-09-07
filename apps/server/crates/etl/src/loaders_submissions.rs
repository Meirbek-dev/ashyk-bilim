use ab_core::Result;
use serde_json::{Map, Value};

use crate::ctx::Ctx;
use crate::{legacy, transform};

pub async fn run(ctx: &mut Ctx) -> Result<()> {
    load_submissions(ctx).await?;
    load_grading(ctx).await?;
    load_code_runs(ctx).await?;
    load_code_run_cases(ctx).await?;
    crate::loaders_auxiliary::require_empty(
        ctx,
        &[
            "item_feedback",
            "bulk_action",
            "file_submission_activity",
            "file_submission_attempt",
            "file_submission_attempt_file",
            "upload",
        ],
    )
    .await
}

async fn load_submissions(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::submissions(&ctx.source, ctx.limit).await?;
    ctx.source("submission", rows.len());
    let mut written = 0;
    for row in rows {
        let Some(activity_id) = ctx.idmap.get("activity", row.activity_id) else {
            ctx.drop_row("submission", row.id, "orphan activity");
            continue;
        };
        let Some((assessment_id, course_id)) = sqlx::query_as::<_, (uuid::Uuid, uuid::Uuid)>(
            "SELECT id, course_id FROM assessments WHERE activity_id=$1",
        )
        .bind(activity_id)
        .fetch_optional(&mut *ctx.tx)
        .await?
        else {
            ctx.drop_row("submission", row.id, "activity has no assessment");
            continue;
        };
        let Some(user_id) = ctx.idmap.get("user", row.user_id) else {
            ctx.drop_row("submission", row.id, "orphan user");
            continue;
        };
        let Some(status) = transform::submissions::status(&row.status) else {
            ctx.drop_row("submission", row.id, "unsupported status");
            continue;
        };
        let answers = transform::submissions::answers(row.answers_json.as_ref(), |legacy_uuid| {
            ctx.idmap.get_by_uuid("assessment_item", legacy_uuid)
        });
        let grading = transform::submissions::breakdown(row.grading_json.as_ref(), |legacy_uuid| {
            ctx.idmap.get_by_uuid("assessment_item", legacy_uuid)
        });
        for unresolved in answers.unresolved.iter().chain(grading.unresolved.iter()) {
            ctx.drop_row(
                "submission_item_value",
                format!("{}:{unresolved}", row.id),
                "unresolved assessment item",
            );
        }
        let metadata = transform::submissions::metadata(row.metadata_json.as_ref());
        for key in &metadata.dropped_keys {
            ctx.drop_row(
                "submission_metadata_field",
                format!("{}:{key}", row.id),
                "superseded or unsupported metadata",
            );
        }
        let items_snapshot =
            transform::submissions::items_snapshot(row.items_snapshot.as_ref(), |legacy_uuid| {
                ctx.idmap.get_by_uuid("assessment_item", legacy_uuid)
            });
        let policy_snapshot = transform::submissions::policy_snapshot(row.policy_snapshot.as_ref());
        let id = ctx.idmap.mint(
            "submission",
            row.id,
            Some(&row.submission_uuid),
            legacy::micros(row.created_at),
        );
        sqlx::query(
            "INSERT INTO submissions (id,legacy_uuid,assessment_id,course_id,user_id,status,attempt_number,answers,grading,auto_score,final_score,is_late,late_penalty_pct,violation_count,violations,auto_submit_reason,auto_submitted_at,auto_submit_attempts,duration_seconds,started_at,submitted_at,graded_at,version,draft_version,grading_version,content_version,policy_version,items_snapshot,policy_snapshot,created_at,updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,to_timestamp($17),0,$18,to_timestamp($19),to_timestamp($20),to_timestamp($21),$22,$23,$24,$25,$26,$27,$28,COALESCE(to_timestamp($29),now()),COALESCE(to_timestamp($30),now())) \
             ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,answers=EXCLUDED.answers,grading=EXCLUDED.grading,auto_score=EXCLUDED.auto_score,final_score=EXCLUDED.final_score,graded_at=EXCLUDED.graded_at,version=EXCLUDED.version,draft_version=EXCLUDED.draft_version,updated_at=EXCLUDED.updated_at",
        )
        .bind(id).bind(&row.submission_uuid).bind(assessment_id).bind(course_id).bind(user_id)
        .bind(status).bind(row.attempt_number.max(1)).bind(answers.value).bind(grading.value)
        .bind(row.auto_score).bind(row.final_score).bind(row.is_late).bind(row.late_penalty_pct.clamp(0.0, 100.0))
        .bind(metadata.violation_count).bind(metadata.violations).bind(metadata.auto_submit_reason)
        .bind(metadata.auto_submitted_at).bind(metadata.duration_seconds).bind(row.started_at).bind(row.submitted_at)
        .bind(row.graded_at).bind(i64::from(row.version.max(1))).bind(i64::from(row.draft_version.max(1)))
        .bind(row.grading_version.max(1)).bind(row.content_version.max(1)).bind(row.policy_version.max(1))
        .bind(items_snapshot).bind(policy_snapshot).bind(row.created_at).bind(row.updated_at)
        .execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("submission", written);
    Ok(())
}

async fn load_grading(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::grading_entries(&ctx.source, ctx.limit).await?;
    ctx.source("grading_entry", rows.len());
    let mut written = 0;
    for row in rows {
        let Some(submission_id) = ctx.idmap.get("submission", row.submission_id) else {
            ctx.drop_row("grading_entry", row.id, "orphan submission");
            continue;
        };
        let raw = transform::submissions::breakdown(row.raw_breakdown.as_ref(), |legacy_uuid| {
            ctx.idmap.get_by_uuid("assessment_item", legacy_uuid)
        });
        let effective =
            transform::submissions::breakdown(row.effective_breakdown.as_ref(), |legacy_uuid| {
                ctx.idmap.get_by_uuid("assessment_item", legacy_uuid)
            });
        let id = ctx.idmap.mint(
            "grading_entry",
            row.id,
            Some(&row.entry_uuid),
            legacy::micros(row.created_at),
        );
        sqlx::query("INSERT INTO grading_entries (id,legacy_uuid,submission_id,graded_by,raw_score,penalty_pct,final_score,raw_breakdown,effective_breakdown,overall_feedback,grading_version,published_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,to_timestamp($12),COALESCE(to_timestamp($13),now())) ON CONFLICT (id) DO NOTHING")
            .bind(id).bind(&row.entry_uuid).bind(submission_id)
            .bind(row.graded_by.and_then(|value| ctx.idmap.get("user", value)))
            .bind(row.raw_score).bind(row.penalty_pct.clamp(0.0,100.0)).bind(row.final_score)
            .bind(raw.value).bind(effective.value).bind(&row.overall_feedback).bind(row.grading_version.max(1))
            .bind(row.published_at).bind(row.created_at).execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("grading_entry", written);
    Ok(())
}

async fn load_code_runs(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::code_runs(&ctx.source, ctx.limit).await?;
    ctx.source("code_run", rows.len());
    let mut written = 0;
    for row in rows {
        let Some(assessment_id) = ctx.idmap.get_by_uuid("assessment", &row.assessment_uuid) else {
            ctx.drop_row("code_run", row.id, "orphan assessment");
            continue;
        };
        let Some(item_id) = ctx.idmap.get_by_uuid("assessment_item", &row.item_uuid) else {
            ctx.drop_row("code_run", row.id, "orphan assessment item");
            continue;
        };
        let Some(user_id) = ctx.idmap.get("user", row.user_id) else {
            ctx.drop_row("code_run", row.id, "orphan user");
            continue;
        };
        let (Some(purpose), Some(status)) = (
            transform::submissions::run_purpose(&row.purpose),
            transform::submissions::run_status(&row.status),
        ) else {
            ctx.drop_row("code_run", row.id, "unsupported purpose or status");
            continue;
        };
        let submission_id = row
            .submission_uuid
            .as_deref()
            .and_then(|value| ctx.idmap.get_by_uuid("submission", value));
        let id = ctx.idmap.mint(
            "code_run",
            row.id,
            Some(&row.run_uuid),
            legacy::micros(row.created_at),
        );
        sqlx::query("INSERT INTO code_runs (id,legacy_uuid,assessment_id,item_id,submission_id,user_id,purpose,status,language_id,source_sha256,stdin_sha256,idempotency_key,passed,total,score,error_message,started_at,finished_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,to_timestamp($17),to_timestamp($18),COALESCE(to_timestamp($19),now())) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,passed=EXCLUDED.passed,total=EXCLUDED.total,score=EXCLUDED.score,error_message=EXCLUDED.error_message,finished_at=EXCLUDED.finished_at")
            .bind(id).bind(&row.run_uuid).bind(assessment_id).bind(item_id).bind(submission_id).bind(user_id)
            .bind(purpose).bind(status).bind(row.language_id).bind(&row.source_sha256).bind(&row.stdin_sha256)
            .bind(&row.idempotency_key).bind(row.passed.max(0)).bind(row.total.max(0)).bind(row.score)
            .bind(&row.error_message).bind(row.started_at).bind(row.finished_at).bind(row.created_at)
            .execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("code_run", written);
    Ok(())
}

async fn load_code_run_cases(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::code_run_cases(&ctx.source, ctx.limit).await?;
    ctx.source("code_run_case", rows.len());
    let mut written = 0;
    let mut positions = std::collections::HashMap::<String, i32>::new();
    for row in rows {
        let Some(run_id) = ctx.idmap.get_by_uuid("code_run", &row.run_uuid) else {
            ctx.drop_row("code_run_case", row.id, "orphan code run");
            continue;
        };
        let position = positions.entry(row.run_uuid.clone()).or_default();
        *position += 1;
        let id = ctx.idmap.mint("code_run_case", row.id, None, None);
        sqlx::query("INSERT INTO code_run_cases (id,run_id,position,test_id,judge0_token,stdin,expected_output,description,weight,is_visible,status_id,status_description,passed,stdout,stderr,compile_output,message,time_seconds,memory_kb) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT (id) DO UPDATE SET status_id=EXCLUDED.status_id,status_description=EXCLUDED.status_description,passed=EXCLUDED.passed,stdout=EXCLUDED.stdout,stderr=EXCLUDED.stderr,compile_output=EXCLUDED.compile_output,message=EXCLUDED.message,time_seconds=EXCLUDED.time_seconds,memory_kb=EXCLUDED.memory_kb")
            .bind(id).bind(run_id).bind(*position).bind(&row.test_id).bind(&row.judge0_token).bind(&row.stdin)
            .bind(&row.expected_output).bind(&row.description).bind(row.weight).bind(row.is_visible).bind(row.status_id)
            .bind(&row.status_description).bind(row.passed).bind(&row.stdout).bind(&row.stderr).bind(&row.compile_output)
            .bind(&row.message).bind(row.time_seconds).bind(row.memory_kb).execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("code_run_case", written);
    Ok(())
}

#[allow(dead_code)]
fn empty_object() -> Value {
    Value::Object(Map::new())
}
