use std::collections::HashMap;

use ab_core::{Error, Result};
use serde_json::{Map, Value};

use crate::ctx::Ctx;
use crate::transform::gamification::{LedgerInput, SourceCheck};
use crate::{legacy, transform};

pub async fn analytics(ctx: &mut Ctx) -> Result<()> {
    require_empty(ctx, &["analytics_saved_view", "teacher_intervention"]).await
}

pub async fn ai(ctx: &mut Ctx) -> Result<()> {
    require_empty(
        ctx,
        &[
            "ai_thread",
            "ai_run",
            "ai_event",
            "ai_artifact",
            "ai_evidence",
            "ai_approval",
            "ai_eval_result",
            "ai_qa_message",
            "ai_submission_analysis",
            "ai_course_analysis",
            "ai_lecture_review",
            "ai_remediation_session",
            "ai_student_memory",
        ],
    )
    .await
}

pub async fn require_empty(ctx: &mut Ctx, tables: &[&str]) -> Result<()> {
    for table in tables {
        let count = legacy::count(&ctx.source, table).await?;
        ctx.report
            .source(table, u64::try_from(count).unwrap_or_default());
        if count > 0 {
            return Err(Error::config(format!(
                "legacy table {table} has {count} row(s), but this backup was expected to have none"
            )));
        }
        ctx.report.wrote(table, 0);
    }
    Ok(())
}

pub async fn gamification(ctx: &mut Ctx) -> Result<()> {
    let profiles = legacy::gamification_profiles(&ctx.source, ctx.limit).await?;
    ctx.source("gamification_profiles", profiles.len());
    let by_user: HashMap<i32, legacy::GamificationProfile> = profiles
        .into_iter()
        .map(|profile| (profile.user_id, profile))
        .collect();
    let transactions = legacy::xp_transactions(&ctx.source, ctx.limit).await?;
    ctx.source("xp_transactions", transactions.len());
    let mut input = Vec::new();
    for row in transactions {
        let Some(user_id) = ctx.idmap.get("user", row.user_id) else {
            ctx.drop_row("xp_transaction", row.id, "orphan user");
            continue;
        };
        let Some(source) = transform::gamification::source(&row.source) else {
            ctx.drop_row("xp_transaction", row.id, "unsupported source");
            continue;
        };
        let created_at = row.created_at.unwrap_or_default();
        let check = match source {
            "login_bonus" => SourceCheck::Verified(transform::gamification::login_day(created_at)),
            "admin_award" | "streak_bonus" => SourceCheck::Unkeyed,
            "course_completion" => resolve_source(ctx, "course", row.source_id.as_deref()),
            "activity_completion" => resolve_source(ctx, "activity", row.source_id.as_deref()),
            "quiz_completion"
            | "exam_completion"
            | "code_challenge_completion"
            | "code_challenge_perfect"
            | "code_challenge_first_solve" => {
                resolve_source(ctx, "assessment", row.source_id.as_deref())
            }
            _ => SourceCheck::Unverifiable("unknown source mapping".into()),
        };
        input.push(LedgerInput {
            legacy_id: row.id,
            user_id,
            amount: row.amount,
            source,
            check,
            reason: row.reason,
            idempotency_key: row.idempotency_key,
            created_at,
        });
    }
    let recomputed = transform::gamification::recompute(input);
    for (legacy_id, reason) in &recomputed.dropped {
        ctx.drop_row("xp_transaction", legacy_id, reason);
    }
    for row in &recomputed.rows {
        let id = ctx.idmap.mint(
            "xp_transaction",
            row.legacy_id,
            None,
            legacy::micros(Some(row.created_at)),
        );
        sqlx::query("INSERT INTO xp_transactions (id,user_id,amount,source,source_id,reason,previous_level,triggered_level_up,idempotency_key,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE(to_timestamp($10),now())) ON CONFLICT (id) DO NOTHING")
            .bind(id).bind(row.user_id).bind(row.amount).bind(row.source).bind(&row.source_id)
            .bind(&row.reason).bind(row.previous_level).bind(row.triggered_level_up)
            .bind(&row.idempotency_key).bind(row.created_at).execute(&mut *ctx.tx).await?;
    }
    ctx.wrote("xp_transactions", recomputed.rows.len());

    let mut profile_written = 0;
    for (legacy_user_id, profile) in by_user {
        let Some(user_id) = ctx.idmap.get("user", legacy_user_id) else {
            ctx.drop_row("gamification_profile", profile.id, "orphan user");
            continue;
        };
        let totals = recomputed.totals.get(&user_id).cloned().unwrap_or_default();
        let id = ctx.idmap.mint(
            "gamification_profile",
            profile.id,
            None,
            legacy::micros(profile.created_at),
        );
        sqlx::query("INSERT INTO gamification_profiles (id,user_id,total_xp,level,daily_xp_earned,login_streak,learning_streak,longest_login_streak,longest_learning_streak,total_activities_completed,total_courses_completed,last_xp_award_at,last_login_at,last_learning_at,preferences,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,to_timestamp($12),to_timestamp($13),to_timestamp($14),$15,COALESCE(to_timestamp($16),now()),COALESCE(to_timestamp($17),now())) ON CONFLICT (user_id) DO UPDATE SET total_xp=EXCLUDED.total_xp,level=EXCLUDED.level,daily_xp_earned=EXCLUDED.daily_xp_earned,login_streak=EXCLUDED.login_streak,learning_streak=EXCLUDED.learning_streak,longest_login_streak=EXCLUDED.longest_login_streak,longest_learning_streak=EXCLUDED.longest_learning_streak,total_activities_completed=EXCLUDED.total_activities_completed,total_courses_completed=EXCLUDED.total_courses_completed,last_xp_award_at=EXCLUDED.last_xp_award_at,last_login_at=EXCLUDED.last_login_at,last_learning_at=EXCLUDED.last_learning_at,preferences=EXCLUDED.preferences,updated_at=EXCLUDED.updated_at")
            .bind(id).bind(user_id).bind(totals.total_xp.max(0)).bind(totals.level.max(1))
            .bind(profile.daily_xp_earned.max(0)).bind(profile.login_streak.max(0)).bind(profile.learning_streak.max(0))
            .bind(profile.longest_login_streak.max(0)).bind(profile.longest_learning_streak.max(0))
            .bind(totals.activities_completed.max(0)).bind(totals.courses_completed.max(0))
            .bind(profile.last_xp_award_date).bind(profile.last_login_date).bind(profile.last_learning_date)
            .bind(profile.preferences.unwrap_or_else(|| Value::Object(Map::new())))
            .bind(profile.created_at).bind(profile.updated_at).execute(&mut *ctx.tx).await?;
        profile_written += 1;
    }
    ctx.wrote("gamification_profiles", profile_written);
    if let Some(config) = legacy::gamification_config(&ctx.source).await? {
        sqlx::query("UPDATE gamification_config SET daily_xp_limit=$1,rewards=$2 WHERE id=1")
            .bind(config.daily_xp_limit.filter(|value| *value > 0))
            .bind(config.rewards.unwrap_or_else(|| Value::Object(Map::new())))
            .execute(&mut *ctx.tx)
            .await?;
    }
    Ok(())
}

fn resolve_source(ctx: &Ctx, entity: &str, source_id: Option<&str>) -> SourceCheck {
    let Some(source_id) = source_id else {
        return SourceCheck::Unverifiable("missing source id".into());
    };
    let resolved = ctx
        .idmap
        .get(entity, source_id)
        .or_else(|| ctx.idmap.get_by_uuid(entity, source_id));
    resolved.map_or_else(
        || SourceCheck::Unverifiable(format!("{entity} {source_id} not migrated")),
        |id| SourceCheck::Verified(id.to_string()),
    )
}

pub async fn trail(ctx: &mut Ctx) -> Result<()> {
    let trails = legacy::trails(&ctx.source, ctx.limit).await?;
    ctx.source("trail", trails.len());
    let mut written = 0;
    for row in trails {
        let Some(user_id) = row.user_id.and_then(|value| ctx.idmap.get("user", value)) else {
            ctx.drop_row("trail", row.id, "orphan user");
            continue;
        };
        let id = ctx.idmap.mint(
            "trail",
            row.id,
            Some(&row.trail_uuid),
            legacy::micros(row.creation_date),
        );
        sqlx::query("INSERT INTO trails (id,legacy_uuid,user_id,created_at,updated_at) VALUES ($1,$2,$3,COALESCE(to_timestamp($4),now()),COALESCE(to_timestamp($5),now())) ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id,updated_at=EXCLUDED.updated_at")
            .bind(id).bind(&row.trail_uuid).bind(user_id).bind(row.creation_date).bind(row.update_date)
            .execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("trail", written);
    let runs = legacy::trail_runs(&ctx.source, ctx.limit).await?;
    ctx.source("trailrun", runs.len());
    let mut runs_written = 0;
    for row in runs {
        let (Some(trail_id), Some(course_id), Some(user_id)) = (
            row.trail_id.and_then(|value| ctx.idmap.get("trail", value)),
            row.course_id
                .and_then(|value| ctx.idmap.get("course", value)),
            row.user_id.and_then(|value| ctx.idmap.get("user", value)),
        ) else {
            ctx.drop_row("trailrun", row.id, "orphan trail, course, or user");
            continue;
        };
        let id = ctx
            .idmap
            .mint("trailrun", row.id, None, legacy::micros(row.creation_date));
        sqlx::query("INSERT INTO trail_runs (id,trail_id,course_id,user_id,status,data,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,COALESCE(to_timestamp($7),now()),COALESCE(to_timestamp($8),now())) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,data=EXCLUDED.data,updated_at=EXCLUDED.updated_at")
            .bind(id).bind(trail_id).bind(course_id).bind(user_id)
            .bind(transform::gamification::trail_run_status(&row.status))
            .bind(row.data.unwrap_or_else(|| Value::Object(Map::new())))
            .bind(row.creation_date).bind(row.update_date).execute(&mut *ctx.tx).await?;
        runs_written += 1;
    }
    ctx.wrote("trailrun", runs_written);
    let steps = legacy::trail_steps(&ctx.source, ctx.limit).await?;
    ctx.source("trailstep", steps.len());
    let mut steps_written = 0;
    for row in steps {
        let (Some(trail_run_id), Some(trail_id), Some(activity_id), Some(course_id), Some(user_id)) = (
            row.trailrun_id
                .and_then(|value| ctx.idmap.get("trailrun", value)),
            row.trail_id.and_then(|value| ctx.idmap.get("trail", value)),
            row.activity_id
                .and_then(|value| ctx.idmap.get("activity", value)),
            row.course_id
                .and_then(|value| ctx.idmap.get("course", value)),
            row.user_id.and_then(|value| ctx.idmap.get("user", value)),
        ) else {
            ctx.drop_row(
                "trailstep",
                row.id,
                "orphan trail run, trail, activity, course, or user",
            );
            continue;
        };
        let id = ctx
            .idmap
            .mint("trailstep", row.id, None, legacy::micros(row.creation_date));
        sqlx::query("INSERT INTO trail_steps (id,trail_run_id,trail_id,activity_id,course_id,user_id,complete,teacher_verified,grade,data,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE(to_timestamp($11),now()),COALESCE(to_timestamp($12),now())) ON CONFLICT (id) DO UPDATE SET complete=EXCLUDED.complete,teacher_verified=EXCLUDED.teacher_verified,grade=EXCLUDED.grade,data=EXCLUDED.data,updated_at=EXCLUDED.updated_at")
            .bind(id).bind(trail_run_id).bind(trail_id).bind(activity_id).bind(course_id).bind(user_id)
            .bind(row.complete).bind(row.teacher_verified).bind(row.grade.unwrap_or_default())
            .bind(row.data.unwrap_or_else(|| Value::Object(Map::new())))
            .bind(row.creation_date).bind(row.update_date).execute(&mut *ctx.tx).await?;
        steps_written += 1;
    }
    ctx.wrote("trailstep", steps_written);
    Ok(())
}
