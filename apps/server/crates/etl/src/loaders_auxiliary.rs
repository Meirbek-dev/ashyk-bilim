use ab_core::{Error, Result};
use serde_json::{Map, Value};

use crate::ctx::Ctx;
use crate::{legacy, transform};

pub async fn analytics(ctx: &mut Ctx) -> Result<()> {
    require_empty(ctx, &["analytics_saved_view", "teacher_intervention"]).await
}

pub async fn ai(ctx: &mut Ctx) -> Result<()> {
    load_ai_threads(ctx).await?;
    load_ai_qa_messages(ctx).await?;
    // Runs and their event streams are runtime telemetry: every legacy run in
    // the 2026-09-25 restore is stuck in `running` with no answer, and v2 does
    // not resume foreign runs. The conversation itself moves with the threads
    // and messages above.
    for table in ["ai_run", "ai_event"] {
        let n = legacy::count(&ctx.source, table).await?;
        ctx.report
            .source(table, u64::try_from(n).unwrap_or_default());
        ctx.report.wrote(table, 0);
        if n > 0 {
            ctx.note(format!(
                "{table}: {n} legacy run row(s) not migrated (runtime telemetry)"
            ));
        }
    }
    require_empty(
        ctx,
        &[
            "ai_artifact",
            "ai_evidence",
            "ai_approval",
            "ai_eval_result",
            "ai_submission_analysis",
            "ai_course_analysis",
            "ai_lecture_review",
            "ai_remediation_session",
            "ai_student_memory",
        ],
    )
    .await
}

async fn load_ai_threads(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::ai_threads(&ctx.source, ctx.limit).await?;
    ctx.source("ai_thread", rows.len());
    for row in &rows {
        let id = ctx.idmap.mint(
            "ai_thread",
            row.id,
            Some(&row.thread_uuid),
            legacy::micros(row.created_at),
        );
        let role = transform::submissions::lower_in(
            &row.role,
            &["student", "teacher", "author", "admin"],
            "student",
        );
        let retention = transform::submissions::lower_in(
            &row.retention_class,
            &["transient", "generated_ai", "educational_record", "audit"],
            "generated_ai",
        );
        sqlx::query(
            "INSERT INTO ai_threads (id,user_id,role,course_id,activity_id,title,retention_class,created_at,updated_at)              VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE(to_timestamp($8),now()),COALESCE(to_timestamp($9),now()))              ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,updated_at=EXCLUDED.updated_at",
        )
        .bind(id)
        .bind(row.user_id.and_then(|v| ctx.idmap.get("user", v)))
        .bind(role)
        .bind(row.course_id.and_then(|v| ctx.idmap.get("course", v)))
        .bind(row.activity_id.and_then(|v| ctx.idmap.get("activity", v)))
        .bind(&row.title)
        .bind(retention)
        .bind(row.created_at)
        .bind(row.updated_at)
        .execute(&mut *ctx.tx)
        .await?;
    }
    ctx.wrote("ai_thread", rows.len());
    Ok(())
}

async fn load_ai_qa_messages(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::ai_qa_messages(&ctx.source, ctx.limit).await?;
    ctx.source("ai_qa_message", rows.len());
    let mut written = 0;
    for row in rows {
        let (Some(thread_id), Some(course_id)) = (
            ctx.idmap.get("ai_thread", row.thread_id),
            ctx.idmap.get("course", row.course_id),
        ) else {
            ctx.drop_row("ai_qa_message", row.id, "orphan thread or course");
            continue;
        };
        let id = ctx.idmap.mint(
            "ai_qa_message",
            row.id,
            Some(&row.message_uuid),
            legacy::micros(row.created_at),
        );
        let role = transform::submissions::lower_in(&row.role, &["user", "assistant"], "user");
        let confidence = row.confidence.as_deref().and_then(|c| {
            ["low", "medium", "high"]
                .into_iter()
                .find(|allowed| allowed.eq_ignore_ascii_case(c))
        });
        // client_turn_id is left NULL: no v2 run exists to reattach a retry to.
        sqlx::query(
            "INSERT INTO ai_qa_messages (id,thread_id,course_id,user_id,role,content,confidence,created_at)              VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE(to_timestamp($8),now()))              ON CONFLICT (id) DO UPDATE SET content=EXCLUDED.content,confidence=EXCLUDED.confidence",
        )
        .bind(id)
        .bind(thread_id)
        .bind(course_id)
        .bind(row.user_id.and_then(|v| ctx.idmap.get("user", v)))
        .bind(role)
        .bind(&row.content)
        .bind(confidence)
        .bind(row.created_at)
        .execute(&mut *ctx.tx)
        .await?;
        written += 1;
    }
    ctx.wrote("ai_qa_message", written);
    Ok(())
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

/// Gamification is zeroed at cutover (DECISIONS "Gamification is zeroed at
/// cutover", Q-2026-09-06-1 c): no XP, levels, streaks or ledger rows are
/// migrated. Every legacy profile becomes a fresh zeroed row that keeps only
/// the user's preferences; the legacy ledger is counted and left behind.
pub async fn gamification(ctx: &mut Ctx) -> Result<()> {
    let ledger = legacy::count(&ctx.source, "xp_transactions").await?;
    ctx.report
        .source("xp_transactions", u64::try_from(ledger).unwrap_or_default());
    ctx.wrote("xp_transactions", 0);
    ctx.note(format!(
        "gamification zeroed at cutover: {ledger} legacy XP transaction(s) not migrated"
    ));

    let profiles = legacy::gamification_profiles(&ctx.source, ctx.limit).await?;
    ctx.source("gamification_profiles", profiles.len());
    let mut profile_written = 0;
    for profile in profiles {
        let Some(user_id) = ctx.idmap.get("user", profile.user_id) else {
            ctx.drop_row("gamification_profile", profile.id, "orphan user");
            continue;
        };
        let id = ctx.idmap.mint(
            "gamification_profile",
            profile.id,
            None,
            legacy::micros(profile.created_at),
        );
        sqlx::query("INSERT INTO gamification_profiles (id,user_id,preferences,created_at) VALUES ($1,$2,$3,COALESCE(to_timestamp($4),now())) ON CONFLICT (user_id) DO UPDATE SET preferences=EXCLUDED.preferences")
            .bind(id).bind(user_id)
            .bind(profile.preferences.unwrap_or_else(|| Value::Object(Map::new())))
            .bind(profile.created_at).execute(&mut *ctx.tx).await?;
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
