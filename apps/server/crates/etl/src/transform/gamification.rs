//! Trail transforms. Gamification itself is zeroed at cutover (DECISIONS
//! "Gamification is zeroed at cutover"): no ledger, totals, levels or
//! streaks are migrated, so nothing here touches XP.

use crate::transform::common::snake;

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

    #[test]
    fn trail_run_statuses() {
        assert_eq!(trail_run_status("STATUS_IN_PROGRESS"), "in_progress");
        assert_eq!(trail_run_status("STATUS_COMPLETED"), "completed");
        assert_eq!(trail_run_status("STATUS_PAUSED"), "paused");
    }
}
