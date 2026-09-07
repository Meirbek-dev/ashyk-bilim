use std::collections::HashMap;

use ab_core::{Error, Result};
use serde_json::{Map, Value};

use crate::ctx::Ctx;
use crate::{legacy, transform};

pub async fn run(ctx: &mut Ctx) -> Result<()> {
    let policies = legacy::assessment_policies(&ctx.source, ctx.limit).await?;
    ctx.source("assessment_policy", policies.len());
    let policies: HashMap<i32, legacy::AssessmentPolicy> =
        policies.into_iter().map(|row| (row.id, row)).collect();
    let activities = legacy::activities(&ctx.source, ctx.limit).await?;
    let activity_settings: HashMap<i32, Map<String, Value>> = activities
        .into_iter()
        .map(|row| {
            let settings = row
                .settings
                .and_then(|value| value.as_object().cloned())
                .unwrap_or_default();
            (row.id, settings)
        })
        .collect();
    let assessments = legacy::assessments(&ctx.source, ctx.limit).await?;
    ctx.source("assessment", assessments.len());
    let mut written = 0;
    for row in assessments {
        let Some(activity_id) = ctx.idmap.get("activity", row.activity_id) else {
            ctx.drop_row("assessment", row.id, "orphan activity");
            continue;
        };
        let course_id: uuid::Uuid =
            sqlx::query_scalar("SELECT course_id FROM activities WHERE id=$1")
                .bind(activity_id)
                .fetch_one(&mut *ctx.tx)
                .await?;
        let policy = row.policy_id.and_then(|id| policies.get(&id));
        let empty_settings = Map::new();
        let folded = transform::assessments::fold(
            &row,
            policy,
            activity_settings
                .get(&row.activity_id)
                .unwrap_or(&empty_settings),
        );
        for note in &folded.notes {
            ctx.note(format!("assessment {}: {note}", row.id));
        }
        for key in &folded.dropped_setting_keys {
            ctx.drop_row(
                "assessment_policy_field",
                format!("{}:{key}", row.id),
                "unmapped settings key",
            );
        }
        let access_mode = "all_course_learners";
        let id = ctx.idmap.mint(
            "assessment",
            row.id,
            Some(&row.assessment_uuid),
            legacy::micros(row.created_at),
        );
        sqlx::query(
            "INSERT INTO assessments (id,legacy_uuid,activity_id,course_id,kind,title,description,lifecycle,scheduled_at,published_at,archived_at,weight,grading_type,content_version,policy_version,grading_mode,grade_release_mode,completion_rule,passing_score,max_attempts,time_limit_seconds,due_at,allow_late,late_policy_kind,late_penalty_percent_per_day,late_penalty_max_days,late_cutoff_at,required,review_visibility,randomize_questions,randomize_options,partial_credit,negative_marking_percent,grace_period_minutes,copy_paste_protection,tab_switch_detection,devtools_detection,right_click_disabled,fullscreen_required,violation_threshold,access_mode,attempt_penalty_percent,created_at,updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9),to_timestamp($10),to_timestamp($11),$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,to_timestamp($22),$23,$24,$25,$26,to_timestamp($27),$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,COALESCE(to_timestamp($43),now()),COALESCE(to_timestamp($44),now())) \
             ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,lifecycle=EXCLUDED.lifecycle,policy_version=EXCLUDED.policy_version,updated_at=EXCLUDED.updated_at",
        )
        .bind(id).bind(&row.assessment_uuid).bind(activity_id).bind(course_id)
        .bind(&folded.kind).bind(&row.title).bind(&row.description).bind(&folded.lifecycle)
        .bind(row.scheduled_at).bind(row.published_at).bind(row.archived_at).bind(row.weight.max(0.0))
        .bind(&folded.grading_type).bind(row.content_version.max(1)).bind(folded.policy_version)
        .bind(&folded.grading_mode).bind(&folded.grade_release_mode).bind(&folded.completion_rule)
        .bind(folded.passing_score).bind(folded.max_attempts).bind(folded.time_limit_seconds)
        .bind(folded.due_at).bind(folded.allow_late).bind(folded.late.kind)
        .bind(folded.late.percent_per_day).bind(folded.late.max_days).bind(folded.late.cutoff_at)
        .bind(folded.required).bind(folded.review_visibility).bind(folded.randomize_questions)
        .bind(folded.randomize_options).bind(folded.partial_credit).bind(folded.negative_marking_percent)
        .bind(folded.grace_period_minutes).bind(folded.copy_paste_protection).bind(folded.tab_switch_detection)
        .bind(folded.devtools_detection).bind(folded.right_click_disabled).bind(folded.fullscreen_required)
        .bind(folded.violation_threshold).bind(access_mode).bind(folded.attempt_penalty_percent)
        .bind(row.created_at).bind(row.updated_at)
        .execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("assessment", written);
    ctx.wrote("assessment_policy", written.min(policies.len()));
    load_items(ctx).await
}

async fn load_items(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::assessment_items(&ctx.source, ctx.limit).await?;
    ctx.source("assessment_item", rows.len());
    let mut written = 0;
    for row in rows {
        let Some(assessment_id) = ctx.idmap.get("assessment", row.assessment_id) else {
            ctx.drop_row("assessment_item", row.id, "orphan assessment");
            continue;
        };
        let Some(kind) = transform::assessments::item_kind(&row.kind) else {
            ctx.drop_row("assessment_item", row.id, "unsupported item kind");
            continue;
        };
        let body = transform::assessments::item_body(kind, row.body_json.as_ref())
            .map_err(|message| Error::config(format!("assessment item {}: {message}", row.id)))?;
        let metadata = transform::assessments::item_metadata(row.metadata_json.as_ref());
        let id = ctx.idmap.mint(
            "assessment_item",
            row.id,
            Some(&row.item_uuid),
            legacy::micros(row.created_at),
        );
        sqlx::query(
            "INSERT INTO assessment_items (id,legacy_uuid,assessment_id,position,kind,title,body,max_score,section_label,difficulty,tags,outcome_ids,estimated_minutes,created_at,updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE(to_timestamp($14),now()),COALESCE(to_timestamp($15),now())) \
             ON CONFLICT (id) DO UPDATE SET position=EXCLUDED.position,title=EXCLUDED.title,body=EXCLUDED.body,max_score=EXCLUDED.max_score,section_label=EXCLUDED.section_label,difficulty=EXCLUDED.difficulty,tags=EXCLUDED.tags,outcome_ids=EXCLUDED.outcome_ids,estimated_minutes=EXCLUDED.estimated_minutes,updated_at=EXCLUDED.updated_at",
        )
        .bind(id).bind(&row.item_uuid).bind(assessment_id).bind(row.order.max(1)).bind(kind)
        .bind(&row.title).bind(body).bind(row.max_score.max(0.0)).bind(metadata.section_label)
        .bind(metadata.difficulty).bind(metadata.tags).bind(metadata.outcome_ids).bind(metadata.estimated_minutes)
        .bind(row.created_at).bind(row.updated_at).execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("assessment_item", written);
    Ok(())
}
