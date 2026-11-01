//! Plans of the hot queries (schema review item 50).
//!
//! Each case is a query the server runs on most page loads, read from the
//! committed `.sqlx` cache (the exact text the binary sends), planned with
//! `EXPLAIN (GENERIC_PLAN)` over a fixture shaped like production (3 000
//! accounts, 60 courses of 20 activities, two enrolments per learner, ~60 000
//! progress rows, 30 000 notifications) after `ANALYZE`. A case fails when its
//! large table is read by a sequential scan or the index that serves it is no
//! longer used: a dropped or reshaped index, a predicate an index cannot serve,
//! or a rewrite that defeats the planner shows up here, not as a slow page.
//!
//! A case finds its query by text fragments; when a rewrite changes them the test
//! names the case. Update the fragments with the query, and the expectations only
//! with a reason.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::Path;

use serde_json::Value;
use sqlx::{PgPool, Row};

struct Case {
    name: &'static str,
    /// Every fragment occurs in exactly one cached query.
    fragments: &'static [&'static str],
    /// Large tables this query must not read with a sequential scan.
    no_seq_scan: &'static [&'static str],
    /// Indexes the plan uses.
    indexes: &'static [&'static str],
}

const CASES: &[Case] = &[
    Case {
        name: "leaderboard page",
        fragments: &[
            "FROM gamification_profiles p JOIN users u",
            "LIMIT $1 OFFSET $2",
        ],
        no_seq_scan: &["gamification_profiles", "users"],
        indexes: &["gamification_profiles_board_idx"],
    },
    Case {
        name: "notifications list",
        fragments: &["FROM notifications", "($3::uuid IS NULL OR id < $3)"],
        no_seq_scan: &["notifications"],
        indexes: &["notifications_user_idx"],
    },
    Case {
        name: "unread notifications count",
        fragments: &["FROM notifications WHERE user_id = $1 AND read_at IS NULL"],
        no_seq_scan: &["notifications"],
        indexes: &["notifications_unread_idx"],
    },
    Case {
        name: "teacher review queue",
        fragments: &["FROM activity_progress p", "THEN p.teacher_action_required"],
        // Known cost (REWRITE §5.6 "Review queue member test"): the member test becomes a hashed scan of every
        // `trail_runs` row with `is_course_staff` per row; it goes with the enrolments table.
        no_seq_scan: &["activity_progress", "users"],
        indexes: &["activity_progress_course_user_idx"],
    },
    Case {
        name: "learner course progress",
        fragments: &[
            "FROM activity_progress",
            "WHERE course_id = $1 AND user_id = $2",
            "activity_id IN (SELECT id FROM activities WHERE published)",
        ],
        no_seq_scan: &["activity_progress"],
        indexes: &["activity_progress_course_user_idx"],
    },
    // The `/search` course query and the `q` filter of the course/collection listings are built at run
    // time (pg_trgm terms, REWRITE §5.6 n11), so they are not in the cache:
    // `schema_review::course_search_walks_the_trigram_index` and
    // `schema_review::listing_filters_walk_the_trigram_indexes` check their plans on 10 000 rows.
];

const FIXTURE: &str = r"
INSERT INTO users (zitadel_user_id, username, email)
SELECT 'plan-' || g, 'plan-' || g, 'plan-' || g || '@plans.test' FROM generate_series(1, 3000) g;

INSERT INTO courses (name, description, creator_id, public)
SELECT 'Course ' || g || ' algebra', 'Course ' || g, u.id, g % 4 <> 0
FROM generate_series(1, 60) g JOIN users u ON u.username = 'plan-' || g;

INSERT INTO chapters (course_id, name, position)
SELECT c.id, 'Chapter ' || n, n FROM courses c, generate_series(1, 4) n;

INSERT INTO activities (chapter_id, course_id, name, activity_type, activity_sub_type, position, published)
SELECT ch.id, ch.course_id, 'Activity ' || n, 'dynamic', 'dynamic_page', n, n <> 5
FROM chapters ch, generate_series(1, 5) n;

INSERT INTO trails (user_id)
SELECT id FROM users WHERE substr(username, 6)::int BETWEEN 1001 AND 2500;

INSERT INTO trail_runs (trail_id, course_id, user_id)
SELECT t.id, c.id, t.user_id
FROM trails t
JOIN users u ON u.id = t.user_id
JOIN LATERAL (SELECT id FROM courses ORDER BY id
              OFFSET substr(u.username, 6)::int % 59 LIMIT 2) c ON true;

INSERT INTO activity_progress (course_id, activity_id, user_id, state, teacher_action_required)
SELECT r.course_id, a.id, r.user_id,
       CASE WHEN a.position % 3 = 0 THEN 'completed' ELSE 'not_started' END,
       a.position = 4 AND substr(u.username, 6)::int % 10 = 0
FROM trail_runs r
JOIN users u ON u.id = r.user_id
JOIN activities a ON a.course_id = r.course_id;

INSERT INTO notifications (user_id, kind, payload, read_at)
SELECT u.id, 'grade_published', '{}'::jsonb, CASE WHEN n % 3 = 0 THEN NULL ELSE now() END
FROM users u, generate_series(1, 20) n
WHERE substr(u.username, 6)::int BETWEEN 1001 AND 2500;

INSERT INTO gamification_profiles (user_id, total_xp)
SELECT id, (substr(username, 6)::int * 37) % 5000 FROM users WHERE username LIKE 'plan-%';

ANALYZE;
";

fn cached_queries() -> Vec<String> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.sqlx");
    let mut queries = Vec::new();
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_some_and(|e| e == "json") {
            let doc: Value =
                serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
            queries.push(doc["query"].as_str().unwrap().to_owned());
        }
    }
    queries
}

/// `(node type, relation, index)` of every node of a plan.
fn nodes(plan: &Value, out: &mut Vec<(String, String, String)>) {
    let text = |key: &str| plan[key].as_str().unwrap_or_default().to_owned();
    out.push((text("Node Type"), text("Relation Name"), text("Index Name")));
    for child in plan["Plans"].as_array().into_iter().flatten() {
        nodes(child, out);
    }
}

#[ab_testdb::test]
async fn hot_queries_keep_their_index_plans(pool: PgPool) {
    sqlx::raw_sql(FIXTURE).execute(&pool).await.unwrap();
    let queries = cached_queries();
    let mut broken = Vec::new();
    for case in CASES {
        let matching: Vec<&String> = queries
            .iter()
            .filter(|q| case.fragments.iter().all(|f| q.contains(f)))
            .collect();
        let [sql] = matching.as_slice() else {
            broken.push(format!(
                "{}: {} cached queries contain {:?}; update the fragments",
                case.name,
                matching.len(),
                case.fragments
            ));
            continue;
        };
        // The simple protocol: the query's `$n` stay placeholders of the generic plan.
        let row = sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
            "EXPLAIN (GENERIC_PLAN, FORMAT JSON) {sql}"
        )))
        .fetch_one(&pool)
        .await
        .unwrap_or_else(|e| panic!("{}: EXPLAIN failed: {e}", case.name));
        let doc: Value = row.get(0);
        let explain = doc.to_string();
        let mut plan = Vec::new();
        nodes(&doc[0]["Plan"], &mut plan);
        for table in case.no_seq_scan {
            if plan
                .iter()
                .any(|(node, rel, _)| node == "Seq Scan" && rel == table)
            {
                broken.push(format!(
                    "{}: sequential scan of {table}\n{explain}",
                    case.name
                ));
            }
        }
        for index in case.indexes {
            if !plan.iter().any(|(_, _, used)| used == index) {
                broken.push(format!(
                    "{}: {index} is no longer used\n{explain}",
                    case.name
                ));
            }
        }
    }
    assert!(broken.is_empty(), "{}", broken.join("\n\n"));
}
