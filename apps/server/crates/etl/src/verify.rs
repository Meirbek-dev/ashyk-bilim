//! Verification checks run before the target transaction commits.

use ab_core::Result;

use crate::ctx::Ctx;
use crate::report::{DomainReport, Verification};

pub async fn run(ctx: &mut Ctx, reports: &[DomainReport]) -> Result<Verification> {
    let mut verification = Verification::default();
    for domain in reports {
        for (table, counts) in &domain.tables {
            let accounted = counts.written <= counts.source;
            verification.push(
                &format!("{}.{}.accounting", domain.domain, table),
                accounted,
                format!("source={} written={}", counts.source, counts.written),
            );
        }
    }
    let orphan_checks = [
        (
            "fk.chapters.course",
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM chapters c WHERE NOT EXISTS (SELECT 1 FROM courses p WHERE p.id=c.course_id)")
                .fetch_one(&mut *ctx.tx).await?,
        ),
        (
            "fk.activities.chapter",
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM activities a WHERE NOT EXISTS (SELECT 1 FROM chapters c WHERE c.id=a.chapter_id)")
                .fetch_one(&mut *ctx.tx).await?,
        ),
        (
            "fk.assessments.activity",
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM assessments a WHERE NOT EXISTS (SELECT 1 FROM activities x WHERE x.id=a.activity_id)")
                .fetch_one(&mut *ctx.tx).await?,
        ),
        (
            "fk.submissions.assessment",
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM submissions s WHERE NOT EXISTS (SELECT 1 FROM assessments a WHERE a.id=s.assessment_id)")
                .fetch_one(&mut *ctx.tx).await?,
        ),
        (
            "fk.submissions.user",
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM submissions s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=s.user_id)")
                .fetch_one(&mut *ctx.tx).await?,
        ),
    ];
    for (name, count) in orphan_checks {
        verification.push(name, count == 0, format!("{count} orphan row(s)"));
    }
    let mapped: i64 = sqlx::query_scalar("SELECT count(*) FROM etl_id_map")
        .fetch_one(&mut *ctx.tx)
        .await?;
    verification.push(
        "id-map.non-empty",
        mapped > 0,
        format!("{mapped} mapping(s)"),
    );
    Ok(verification)
}
