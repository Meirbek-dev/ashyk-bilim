//! Gamification transforms (MIGRATION §2.7, QUESTIONS Q-2026-09-06-1
//! default (b)): the XP ledger is recomputed from verifiable sources —
//! a row survives only when its source can be tied to a real, migrated
//! activity / course / submission (or is a server-derived daily login
//! bonus); profile totals and levels are rebuilt from the surviving ledger.

use std::collections::BTreeMap;

use ab_domain::gamification::level_for;

use crate::transform::common::snake;

/// Legacy `xpsource` → v2 `xp_transactions.source`; `ASSIGNMENT_SUBMISSION`
/// belonged to the dead assignment system and has no v2 source.
#[must_use]
pub fn source(raw: &str) -> Option<&'static str> {
    match snake(raw, None).as_str() {
        "activity_completion" => Some("activity_completion"),
        "course_completion" => Some("course_completion"),
        "login_bonus" => Some("login_bonus"),
        "quiz_completion" => Some("quiz_completion"),
        "exam_completion" => Some("exam_completion"),
        "streak_bonus" => Some("streak_bonus"),
        "admin_award" => Some("admin_award"),
        "code_challenge_completion" => Some("code_challenge_completion"),
        "code_challenge_perfect" => Some("code_challenge_perfect"),
        "code_challenge_first_solve" => Some("code_challenge_first_solve"),
        _ => None,
    }
}

/// What the runner could establish about a legacy ledger row's source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceCheck {
    /// Verified; carries the v2 `source_id` (uuid string or epoch day).
    Verified(String),
    /// Server-derived without a source id (admin award).
    Unkeyed,
    /// Nothing in v2 vouches for it.
    Unverifiable(String),
}

/// v2 login-bonus `source_id`: the UTC day number of the award
/// (`gamification::hooks::login`).
#[must_use]
pub fn login_day(created_at_epoch: f64) -> String {
    // Epoch seconds fit i64 by a wide margin; the truncation is the intent.
    #[allow(clippy::cast_possible_truncation)]
    let secs = created_at_epoch.floor() as i64;
    secs.div_euclid(86_400).to_string()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LedgerInput {
    pub legacy_id: i32,
    pub user_id: uuid::Uuid,
    pub amount: i32,
    pub source: &'static str,
    pub check: SourceCheck,
    pub reason: Option<String>,
    pub idempotency_key: Option<String>,
    pub created_at: f64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LedgerRow {
    pub legacy_id: i32,
    pub user_id: uuid::Uuid,
    pub amount: i32,
    pub source: &'static str,
    pub source_id: Option<String>,
    pub reason: Option<String>,
    pub idempotency_key: Option<String>,
    pub previous_level: i32,
    pub triggered_level_up: bool,
    pub created_at: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ProfileTotals {
    pub total_xp: i32,
    pub level: i32,
    pub activities_completed: i32,
    pub courses_completed: i32,
    pub last_award_at: Option<i64>,
}

#[derive(Debug, Default)]
pub struct Recomputed {
    pub rows: Vec<LedgerRow>,
    pub totals: BTreeMap<uuid::Uuid, ProfileTotals>,
    /// (legacy id, reason) for every row not carried.
    pub dropped: Vec<(i32, String)>,
}

/// Replay the ledger in time order, keeping verified rows, recomputing
/// `previous_level` / `triggered_level_up` with the v2 curve and
/// accumulating per-user totals. Duplicate `(user, source, source_id)` and
/// duplicate idempotency keys collapse to the first occurrence.
#[must_use]
pub fn recompute(mut input: Vec<LedgerInput>) -> Recomputed {
    input.sort_by(|a, b| {
        a.created_at
            .partial_cmp(&b.created_at)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.legacy_id.cmp(&b.legacy_id))
    });
    let mut out = Recomputed::default();
    let mut seen_keys: std::collections::HashSet<(uuid::Uuid, &'static str, String)> =
        std::collections::HashSet::new();
    let mut seen_idem: std::collections::HashSet<String> = std::collections::HashSet::new();
    for row in input {
        if row.amount <= 0 {
            out.dropped.push((row.legacy_id, "non-positive amount".into()));
            continue;
        }
        let source_id = match row.check {
            SourceCheck::Verified(id) => Some(id),
            SourceCheck::Unkeyed => None,
            SourceCheck::Unverifiable(why) => {
                out.dropped.push((row.legacy_id, format!("unverifiable source: {why}")));
                continue;
            }
        };
        if let Some(id) = &source_id
            && !seen_keys.insert((row.user_id, row.source, id.clone()))
        {
            out.dropped
                .push((row.legacy_id, "duplicate (user, source, source_id)".into()));
            continue;
        }
        if let Some(k) = &row.idempotency_key
            && !seen_idem.insert(k.clone())
        {
            out.dropped.push((row.legacy_id, "duplicate idempotency_key".into()));
            continue;
        }
        let totals = out.totals.entry(row.user_id).or_default();
        let previous_level = level_for(totals.total_xp);
        totals.total_xp = totals.total_xp.saturating_add(row.amount);
        totals.level = level_for(totals.total_xp);
        match row.source {
            "activity_completion" => totals.activities_completed += 1,
            "course_completion" => totals.courses_completed += 1,
            _ => {}
        }
        // Epoch seconds fit i64; truncation intended.
        #[allow(clippy::cast_possible_truncation)]
        let at = row.created_at.floor() as i64;
        totals.last_award_at = Some(totals.last_award_at.map_or(at, |prev| prev.max(at)));
        out.rows.push(LedgerRow {
            legacy_id: row.legacy_id,
            user_id: row.user_id,
            amount: row.amount,
            source: row.source,
            source_id,
            reason: row.reason,
            idempotency_key: row.idempotency_key,
            previous_level,
            triggered_level_up: totals.level > previous_level,
            created_at: row.created_at,
        });
    }
    out
}

/// Legacy `trailrun.status` (`STATUS_*`) → v2.
#[must_use]
pub fn trail_run_status(raw: &str) -> &'static str {
    match snake(raw, Some("STATUS_")).as_str() {
        "completed" => "completed",
        "paused" => "paused",
        "cancelled" => "cancelled",
        _ => "in_progress",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: i32, user: uuid::Uuid, amount: i32, source: &'static str, check: SourceCheck, at: f64) -> LedgerInput {
        LedgerInput {
            legacy_id: id,
            user_id: user,
            amount,
            source,
            check,
            reason: None,
            idempotency_key: Some(format!("k{id}")),
            created_at: at,
        }
    }

    #[test]
    fn recompute_keeps_verified_rows_and_rebuilds_levels() {
        let u = uuid::Uuid::now_v7();
        let rows = vec![
            row(3, u, 25, "activity_completion", SourceCheck::Verified("a1".into()), 30.0),
            row(1, u, 50, "exam_completion", SourceCheck::Unverifiable("old exam attempt".into()), 10.0),
            row(2, u, 200, "course_completion", SourceCheck::Verified("c1".into()), 20.0),
            row(4, u, 25, "activity_completion", SourceCheck::Verified("a1".into()), 40.0),
            row(5, u, 0, "login_bonus", SourceCheck::Verified("20000".into()), 50.0),
            row(6, u, 10, "admin_award", SourceCheck::Unkeyed, 60.0),
        ];
        let r = recompute(rows);
        assert_eq!(r.rows.iter().map(|r| r.legacy_id).collect::<Vec<_>>(), vec![2, 3, 6]);
        assert_eq!(r.dropped.len(), 3);
        assert!(r.dropped.iter().any(|(id, why)| *id == 1 && why.contains("unverifiable")));
        assert!(r.dropped.iter().any(|(id, why)| *id == 4 && why.contains("duplicate (user")));
        assert!(r.dropped.iter().any(|(id, _)| *id == 5));
        let t = &r.totals[&u];
        assert_eq!(t.total_xp, 235);
        assert_eq!(t.level, level_for(235));
        assert_eq!(t.activities_completed, 1);
        assert_eq!(t.courses_completed, 1);
        assert_eq!(t.last_award_at, Some(60));
        // 200 XP crosses level 1 → 3 (curve: 50(l-1)^2 + 50(l-1)); the first
        // row starts at level 1 and reports the level-up.
        assert_eq!(r.rows[0].previous_level, 1);
        assert!(r.rows[0].triggered_level_up);
        assert_eq!(r.rows[1].previous_level, level_for(200));
        assert!(r.rows[2].source_id.is_none());
    }

    #[test]
    fn sources_and_days() {
        assert_eq!(source("ACTIVITY_COMPLETION"), Some("activity_completion"));
        assert_eq!(source("ASSIGNMENT_SUBMISSION"), None);
        assert_eq!(login_day(86_400.0 * 3.0 + 5.0), "3");
        assert_eq!(trail_run_status("STATUS_IN_PROGRESS"), "in_progress");
        assert_eq!(trail_run_status("STATUS_COMPLETED"), "completed");
    }
}
