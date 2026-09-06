//! The in-memory analytics context (legacy `services/analytics/queries.py`).
//!
//! One load per request for the scoped courses, then every read model is
//! pure arithmetic over it. Progress rows stay unbounded (they are the
//! denominator for enrolment, completion and risk); submissions and log
//! events may be bounded to the comparison window.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use ab_core::Result;
use ab_core::assessments::{
    ActivityProgressState, AssessmentKind, Lifecycle, SubmissionStatus,
};
use ab_core::id::{ActivityId, AssessmentId, CourseId, TrailRunId, UserId, UsergroupId};
use ab_db::analytics::{
    ActivityInfoRow, AssessmentInfoRow, CertificateInfoRow, ChapterInfoRow, CourseInfoRow,
    CourseProgressInfoRow, EventInfoRow, ProgressInfoRow, SubmissionInfoRow, TrailRunInfoRow,
    UserInfoRow,
};
use sqlx::PgPool;

use super::filters::{AnalyticsFilters, DAY_SECS};

// ── Numeric helpers (legacy queries.py) ─────────────────────────────────────

pub fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// Python `round(x, digits)`: correctly rounded on the exact binary value
/// (ties to even), so `round(2.675, 2) == 2.67` and `round(0.35, 1) == 0.3`
/// exactly as CPython answers. Rust's fixed-precision formatting is the
/// same correctly-rounded conversion, so format-then-parse is the faithful
/// emulation.
#[must_use]
pub fn round_to(x: f64, digits: u32) -> f64 {
    if !x.is_finite() {
        return x;
    }
    let precision = usize::try_from(digits).unwrap_or(0);
    format!("{x:.precision$}").parse().unwrap_or(x)
}

/// `YYYY-MM-DD` of the UTC day containing `ts`.
#[must_use]
pub fn utc_date(ts: i64) -> String {
    jiff::Timestamp::from_second(ts).map_or_else(
        |_| "1970-01-01".to_owned(),
        |t| t.to_zoned(jiff::tz::TimeZone::UTC).date().to_string(),
    )
}

/// Epoch seconds of UTC midnight for a `YYYY-MM-DD` date, if valid.
#[must_use]
pub fn utc_date_start(date: &str) -> Option<i64> {
    date.parse::<jiff::civil::Date>()
        .ok()
        .and_then(|d| d.to_zoned(jiff::tz::TimeZone::UTC).ok())
        .map(|z| z.timestamp().as_second())
}

#[must_use]
pub fn round1(x: f64) -> f64 {
    round_to(x, 1)
}

#[must_use]
pub fn round2(x: f64) -> f64 {
    round_to(x, 2)
}

#[must_use]
pub fn count(n: usize) -> f64 {
    f64::from(u32::try_from(n).unwrap_or(u32::MAX))
}

#[must_use]
pub fn count_i64(n: usize) -> i64 {
    i64::try_from(n).unwrap_or(i64::MAX)
}

/// `numerator / denominator * 100` rounded to one decimal; `None` for a zero
/// denominator.
#[must_use]
pub fn safe_pct(numerator: f64, denominator: f64) -> Option<f64> {
    if denominator == 0.0 {
        None
    } else {
        Some(round1(numerator / denominator * 100.0))
    }
}

#[must_use]
pub fn safe_pct_counts(numerator: usize, denominator: usize) -> Option<f64> {
    safe_pct(count(numerator), count(denominator))
}

/// Linear-interpolation percentile (legacy `percentile`), rounded to 2.
#[must_use]
pub fn percentile(values: &[f64], target: f64) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let mut ordered = values.to_vec();
    ordered.sort_by(f64::total_cmp);
    if ordered.len() == 1 {
        return Some(round2(ordered[0]));
    }
    let rank = count(ordered.len() - 1) * target;
    let lower = rank.floor();
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let lower_idx = lower.max(0.0) as usize;
    let upper_idx = (lower_idx + 1).min(ordered.len() - 1);
    let weight = rank - lower;
    Some(round2(
        ordered[lower_idx].mul_add(1.0 - weight, ordered[upper_idx] * weight),
    ))
}

/// `statistics.median` rounded to 2 decimals.
#[must_use]
pub fn median_or_none(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let mut ordered = values.to_vec();
    ordered.sort_by(f64::total_cmp);
    let mid = ordered.len() / 2;
    let median = if ordered.len() % 2 == 0 {
        f64::midpoint(ordered[mid - 1], ordered[mid])
    } else {
        ordered[mid]
    };
    Some(round2(median))
}

#[must_use]
pub fn mean(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        None
    } else {
        Some(values.iter().sum::<f64>() / count(values.len()))
    }
}

/// Hours from `start` to `end`, rounded to 2; `None` when unordered.
#[must_use]
pub fn hours_between(start: Option<i64>, end: Option<i64>) -> Option<f64> {
    let (start, end) = (start?, end?);
    if end < start {
        return None;
    }
    #[allow(clippy::cast_precision_loss)]
    Some(round2((end - start) as f64 / 3600.0))
}

/// Whole days from `earlier` to `later` (Python `timedelta.days` semantics).
#[must_use]
pub const fn days_between(earlier: i64, later: i64) -> i64 {
    (later - earlier).div_euclid(DAY_SECS)
}

// ── Context ─────────────────────────────────────────────────────────────────

/// Where an activity signal came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EventSource {
    ActivityProgress,
    Quiz,
    Exam,
    CodeChallenge,
    Discussion,
    Completion,
    Graded,
}

impl EventSource {
    #[must_use]
    pub const fn is_submission(self) -> bool {
        matches!(self, Self::Quiz | Self::Exam | Self::CodeChallenge)
    }

    #[must_use]
    pub const fn for_kind(kind: AssessmentKind) -> Self {
        match kind {
            AssessmentKind::Quiz => Self::Quiz,
            AssessmentKind::Exam => Self::Exam,
            AssessmentKind::CodeChallenge => Self::CodeChallenge,
        }
    }
}

/// One learner signal at one instant (legacy `ActivityEvent`).
#[derive(Debug, Clone, Copy)]
pub struct ActivityEvent {
    pub user_id: UserId,
    pub course_id: CourseId,
    pub ts: i64,
    pub source: EventSource,
    pub assessment_id: Option<AssessmentId>,
    pub activity_id: Option<ActivityId>,
}

/// One learner's standing in one course (legacy `ProgressSnapshot`).
#[derive(Debug, Clone, Copy)]
pub struct ProgressSnapshot {
    pub course_id: CourseId,
    pub user_id: UserId,
    pub completed_steps: i64,
    pub total_steps: i64,
    pub progress_pct: f64,
    pub is_completed: bool,
    pub has_certificate: bool,
    pub last_activity_at: Option<i64>,
    pub trail_run_id: Option<TrailRunId>,
}

pub type SnapshotKey = (CourseId, UserId);

#[derive(Debug, Clone, Default)]
pub struct AnalyticsContext {
    pub generated_at: i64,
    pub courses: BTreeMap<CourseId, CourseInfoRow>,
    pub chapters: Vec<ChapterInfoRow>,
    pub activities: BTreeMap<ActivityId, ActivityInfoRow>,
    pub assessments: Vec<AssessmentInfoRow>,
    pub submissions: Vec<SubmissionInfoRow>,
    pub activity_progress: Vec<ProgressInfoRow>,
    pub course_progress: Vec<CourseProgressInfoRow>,
    pub trail_runs: Vec<TrailRunInfoRow>,
    pub certificates: Vec<CertificateInfoRow>,
    pub events: Vec<EventInfoRow>,
    pub users: HashMap<UserId, UserInfoRow>,
    pub usergroup_names: BTreeMap<UsergroupId, String>,
    pub cohorts_by_user: HashMap<UserId, BTreeSet<UsergroupId>>,
}

impl AnalyticsContext {
    /// Load everything for the courses; `since` bounds submissions and log
    /// events (epoch seconds), progress stays unbounded.
    pub async fn load(pool: &PgPool, course_ids: &[CourseId], since: Option<i64>) -> Result<Self> {
        let generated_at = now_unix();
        if course_ids.is_empty() {
            return Ok(Self {
                generated_at,
                ..Self::default()
            });
        }
        let courses = ab_db::analytics::list_courses(pool, course_ids).await?;
        let chapters = ab_db::analytics::list_chapters(pool, course_ids).await?;
        let activities = ab_db::analytics::list_activities(pool, course_ids).await?;
        let assessments = ab_db::analytics::list_assessments(pool, course_ids).await?;
        let submissions = ab_db::analytics::list_submissions(pool, course_ids, since).await?;
        let activity_progress = ab_db::analytics::list_activity_progress(pool, course_ids).await?;
        let course_progress = ab_db::analytics::list_course_progress(pool, course_ids).await?;
        let trail_runs = ab_db::analytics::list_trail_runs(pool, course_ids).await?;
        let certificates = ab_db::analytics::list_certificates(pool, course_ids).await?;
        let events = ab_db::analytics::list_events(pool, course_ids, since).await?;

        let mut user_ids: BTreeSet<UserId> = BTreeSet::new();
        user_ids.extend(trail_runs.iter().map(|r| r.user_id));
        user_ids.extend(activity_progress.iter().map(|r| r.user_id));
        user_ids.extend(course_progress.iter().map(|r| r.user_id));
        user_ids.extend(submissions.iter().map(|r| r.user_id));
        user_ids.extend(certificates.iter().map(|r| r.user_id));
        user_ids.extend(courses.iter().filter_map(|c| c.creator_id));
        let user_ids: Vec<UserId> = user_ids.into_iter().collect();
        let users = ab_db::analytics::list_users(pool, &user_ids).await?;
        let memberships = ab_db::analytics::list_memberships(pool, &user_ids).await?;

        let mut usergroup_names = BTreeMap::new();
        let mut cohorts_by_user: HashMap<UserId, BTreeSet<UsergroupId>> = HashMap::new();
        for m in memberships {
            usergroup_names.insert(m.usergroup_id, m.usergroup_name);
            cohorts_by_user
                .entry(m.user_id)
                .or_default()
                .insert(m.usergroup_id);
        }

        Ok(Self {
            generated_at,
            courses: courses.into_iter().map(|c| (c.id, c)).collect(),
            chapters,
            activities: activities.into_iter().map(|a| (a.id, a)).collect(),
            assessments,
            submissions,
            activity_progress,
            course_progress,
            trail_runs,
            certificates,
            events,
            users: users.into_iter().map(|u| (u.id, u)).collect(),
            usergroup_names,
            cohorts_by_user,
        })
    }

    #[must_use]
    pub fn assessment(&self, id: AssessmentId) -> Option<&AssessmentInfoRow> {
        self.assessments.iter().find(|a| a.id == id)
    }

    #[must_use]
    pub fn assessment_by_activity(&self, activity_id: ActivityId) -> Option<&AssessmentInfoRow> {
        self.assessments.iter().find(|a| a.activity_id == activity_id)
    }

    /// Legacy `display_name`: display name, else username, else a placeholder.
    #[must_use]
    pub fn display_name(&self, user_id: UserId) -> String {
        self.users.get(&user_id).map_or_else(
            || "(unknown user)".to_owned(),
            |u| {
                let name = u.display_name.trim();
                if name.is_empty() {
                    u.username.clone()
                } else {
                    name.to_owned()
                }
            },
        )
    }

    #[must_use]
    pub fn username(&self, user_id: UserId) -> String {
        self.users
            .get(&user_id)
            .map_or_else(|| "(unknown user)".to_owned(), |u| u.username.clone())
    }

    #[must_use]
    pub fn course_name(&self, course_id: CourseId) -> String {
        self.courses
            .get(&course_id)
            .map_or_else(|| format!("(deleted course {course_id})"), |c| c.name.clone())
    }

    /// Legacy `cohort_user_ids`: `None` = no cohort filter; an empty set when
    /// the requested cohorts are unknown here (never fall back to everyone).
    #[must_use]
    pub fn cohort_user_ids(&self, cohort_ids: &[UsergroupId]) -> Option<HashSet<UserId>> {
        if cohort_ids.is_empty() {
            return None;
        }
        let known: BTreeSet<UsergroupId> = cohort_ids
            .iter()
            .copied()
            .filter(|c| self.usergroup_names.contains_key(c))
            .collect();
        if known.is_empty() {
            return Some(HashSet::new());
        }
        Some(
            self.cohorts_by_user
                .iter()
                .filter(|(_, groups)| !groups.is_disjoint(&known))
                .map(|(user, _)| *user)
                .collect(),
        )
    }

    /// Cohort names of a user, optionally restricted to the filter set.
    #[must_use]
    pub fn cohort_names_for_user(
        &self,
        user_id: UserId,
        cohort_ids: Option<&[UsergroupId]>,
    ) -> Vec<String> {
        let Some(groups) = self.cohorts_by_user.get(&user_id) else {
            return Vec::new();
        };
        groups
            .iter()
            .filter(|g| cohort_ids.is_none_or(|ids| ids.contains(g)))
            .filter_map(|g| self.usergroup_names.get(g).cloned())
            .collect()
    }

    /// Legacy `course_last_content_update`: newest course/activity update.
    #[must_use]
    pub fn course_last_content_update(&self, course_id: CourseId) -> Option<i64> {
        let course_ts = self.courses.get(&course_id).map(|c| c.updated_at);
        let activity_ts = self
            .activities
            .values()
            .filter(|a| a.course_id == course_id)
            .map(|a| a.updated_at)
            .max();
        course_ts.into_iter().chain(activity_ts).max()
    }

    /// Published assessments of one kind in a course.
    pub fn published_assessments(
        &self,
        course_id: CourseId,
        kind: AssessmentKind,
    ) -> impl Iterator<Item = &AssessmentInfoRow> {
        self.assessments.iter().filter(move |a| {
            a.course_id == course_id && a.kind == kind && a.lifecycle == Lifecycle::Published
        })
    }

    /// Activities of a course in curriculum order (chapter position, then
    /// activity position).
    #[must_use]
    pub fn ordered_activities(&self, course_id: CourseId) -> Vec<&ActivityInfoRow> {
        let chapter_order: HashMap<_, _> = self
            .chapters
            .iter()
            .filter(|c| c.course_id == course_id)
            .map(|c| (c.id, c.position))
            .collect();
        let mut items: Vec<&ActivityInfoRow> = self
            .activities
            .values()
            .filter(|a| a.course_id == course_id)
            .collect();
        items.sort_by_key(|a| {
            (
                chapter_order.get(&a.chapter_id).copied().unwrap_or(0),
                a.position,
                a.id,
            )
        });
        items
    }
}

// ── Submission helpers (legacy `manual_assessment_*`) ───────────────────────

#[must_use]
pub const fn is_graded(s: &SubmissionInfoRow) -> bool {
    matches!(
        s.status,
        SubmissionStatus::Graded | SubmissionStatus::Published
    )
}

#[must_use]
pub const fn is_reviewable(s: &SubmissionInfoRow) -> bool {
    matches!(s.status, SubmissionStatus::Pending)
}

/// Final score, else the auto score once graded.
#[must_use]
pub fn score_of(s: &SubmissionInfoRow) -> Option<f64> {
    s.final_score
        .or_else(|| if is_graded(s) { s.auto_score } else { None })
}

#[must_use]
pub fn submitted_at(s: &SubmissionInfoRow) -> i64 {
    s.submitted_at.unwrap_or(s.updated_at)
}

#[must_use]
pub fn graded_at(s: &SubmissionInfoRow) -> Option<i64> {
    if is_graded(s) {
        Some(s.graded_at.unwrap_or(s.updated_at))
    } else {
        None
    }
}

#[must_use]
pub fn progress_completed(p: &ProgressInfoRow) -> bool {
    p.completed_at.is_some()
        || matches!(
            p.state,
            ActivityProgressState::Completed | ActivityProgressState::Passed
        )
}

fn allowed(user_id: UserId, allowed: Option<&HashSet<UserId>>) -> bool {
    allowed.is_none_or(|set| set.contains(&user_id))
}

/// Legacy `build_activity_events`, plus the discussion / completion rows of
/// the event log (the legacy log was never written).
#[must_use]
pub fn build_activity_events(
    ctx: &AnalyticsContext,
    allowed_users: Option<&HashSet<UserId>>,
) -> Vec<ActivityEvent> {
    let mut events = Vec::new();
    for p in &ctx.activity_progress {
        if !allowed(p.user_id, allowed_users) {
            continue;
        }
        let Some(ts) = p
            .last_activity_at
            .or(p.submitted_at)
            .or(p.graded_at)
            .or(p.completed_at)
            .or(p.started_at)
        else {
            continue;
        };
        events.push(ActivityEvent {
            user_id: p.user_id,
            course_id: p.course_id,
            ts,
            source: EventSource::ActivityProgress,
            assessment_id: None,
            activity_id: Some(p.activity_id),
        });
    }
    for s in &ctx.submissions {
        if !allowed(s.user_id, allowed_users) {
            continue;
        }
        let Some(assessment) = ctx.assessment(s.assessment_id) else {
            continue;
        };
        events.push(ActivityEvent {
            user_id: s.user_id,
            course_id: s.course_id,
            ts: submitted_at(s),
            source: EventSource::for_kind(assessment.kind),
            assessment_id: Some(assessment.id),
            activity_id: Some(assessment.activity_id),
        });
    }
    for e in &ctx.events {
        let (Some(user_id), Some(course_id)) = (e.user_id, e.course_id) else {
            continue;
        };
        if !allowed(user_id, allowed_users) {
            continue;
        }
        let source = match e.event_type.as_str() {
            "discussion.posted" => EventSource::Discussion,
            "activity.completed" => EventSource::ActivityProgress,
            _ => continue,
        };
        events.push(ActivityEvent {
            user_id,
            course_id,
            ts: e.occurred_at,
            source,
            assessment_id: e.assessment_id,
            activity_id: e.activity_id,
        });
    }
    events
}

/// Legacy `progress_snapshots`: one row per (course, learner) seen in
/// activity/course progress, trail runs or certificates.
#[must_use]
pub fn progress_snapshots(
    ctx: &AnalyticsContext,
    allowed_users: Option<&HashSet<UserId>>,
) -> BTreeMap<SnapshotKey, ProgressSnapshot> {
    let mut activity_rows: HashMap<SnapshotKey, Vec<&ProgressInfoRow>> = HashMap::new();
    for p in &ctx.activity_progress {
        if allowed(p.user_id, allowed_users) {
            activity_rows
                .entry((p.course_id, p.user_id))
                .or_default()
                .push(p);
        }
    }
    let mut course_rows: HashMap<SnapshotKey, &CourseProgressInfoRow> = HashMap::new();
    for c in &ctx.course_progress {
        if allowed(c.user_id, allowed_users) {
            course_rows.insert((c.course_id, c.user_id), c);
        }
    }
    let mut trail_runs: HashMap<SnapshotKey, TrailRunId> = HashMap::new();
    for r in &ctx.trail_runs {
        if allowed(r.user_id, allowed_users) {
            trail_runs.insert((r.course_id, r.user_id), r.id);
        }
    }
    let certificate_pairs: HashSet<SnapshotKey> = ctx
        .certificates
        .iter()
        .filter(|c| allowed(c.user_id, allowed_users))
        .map(|c| (c.course_id, c.user_id))
        .collect();

    let mut last_activity: HashMap<SnapshotKey, i64> = HashMap::new();
    for e in build_activity_events(ctx, allowed_users) {
        let entry = last_activity.entry((e.course_id, e.user_id)).or_insert(e.ts);
        *entry = (*entry).max(e.ts);
    }

    let mut keys: BTreeSet<SnapshotKey> = BTreeSet::new();
    keys.extend(activity_rows.keys().copied());
    keys.extend(course_rows.keys().copied());
    keys.extend(trail_runs.keys().copied());
    keys.extend(certificate_pairs.iter().copied());

    let mut snapshots = BTreeMap::new();
    for key in keys {
        let (course_id, user_id) = key;
        let rows = activity_rows.get(&key).cloned().unwrap_or_default();
        let (total_steps, completed_steps, mut progress_pct, mut is_completed, progress_last) =
            if let Some(cp) = course_rows.get(&key) {
                (
                    i64::from(cp.total_required_count),
                    i64::from(cp.completed_required_count),
                    cp.progress_pct,
                    cp.certificate_eligible,
                    cp.last_activity_at,
                )
            } else {
                let total = rows.iter().filter(|r| r.required).count();
                let completed = rows
                    .iter()
                    .filter(|r| r.required && r.completed_at.is_some())
                    .count();
                let pct = if total == 0 {
                    0.0
                } else {
                    round1(count(completed) / count(total) * 100.0)
                };
                (
                    count_i64(total),
                    count_i64(completed),
                    pct,
                    total > 0 && completed >= total,
                    rows.iter().filter_map(|r| r.last_activity_at).max(),
                )
            };
        let has_certificate = certificate_pairs.contains(&key);
        is_completed = has_certificate || is_completed;
        if total_steps == 0 && has_certificate {
            progress_pct = 100.0;
        }
        snapshots.insert(
            key,
            ProgressSnapshot {
                course_id,
                user_id,
                completed_steps,
                total_steps,
                progress_pct: if is_completed { 100.0 } else { progress_pct },
                is_completed,
                has_certificate,
                last_activity_at: progress_last.or_else(|| last_activity.get(&key).copied()),
                trail_run_id: trail_runs.get(&key).copied(),
            },
        );
    }
    snapshots
}

/// Legacy `build_series`: per-bucket counts (or distinct users) over
/// `[start, end]`, every bucket present even when empty.
#[must_use]
pub fn build_series(
    events: &[ActivityEvent],
    filters: &AnalyticsFilters,
    start: i64,
    end: i64,
    distinct_users: bool,
) -> Vec<(i64, f64)> {
    let mut buckets: BTreeMap<i64, HashSet<UserId>> = BTreeMap::new();
    let mut counts: BTreeMap<i64, f64> = BTreeMap::new();
    let mut cursor = filters.bucket_start_of(start);
    let mut guard = 0;
    while cursor <= end && guard < 1_000 {
        buckets.entry(cursor).or_default();
        counts.entry(cursor).or_insert(0.0);
        cursor = filters.next_bucket(cursor);
        guard += 1;
    }
    for e in events {
        if e.ts < start || e.ts > end {
            continue;
        }
        let key = filters.bucket_start_of(e.ts);
        if distinct_users {
            buckets.entry(key).or_default().insert(e.user_id);
        } else {
            *counts.entry(key).or_insert(0.0) += 1.0;
        }
    }
    if distinct_users {
        buckets
            .into_iter()
            .map(|(k, users)| (k, count(users.len())))
            .collect()
    } else {
        counts.into_iter().collect()
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::float_cmp)]
mod tests {
    use super::*;

    #[test]
    fn rounding_is_half_even_like_python() {
        // CPython: 0.25 is an exact tie (→ even), 0.35 and 2.675 sit just
        // below the half in binary, 0.45 just above.
        assert_eq!(round1(0.25), 0.2);
        assert_eq!(round1(0.35), 0.3);
        assert_eq!(round1(0.45), 0.5);
        assert_eq!(round2(2.675), 2.67);
        assert_eq!(round_to(66.666_66, 1), 66.7);
        assert_eq!(round_to(-1.005, 2), -1.0);
        assert!(round_to(f64::NAN, 1).is_nan());
    }

    #[test]
    fn percentile_interpolates_like_legacy() {
        assert_eq!(percentile(&[], 0.5), None);
        assert_eq!(percentile(&[4.0], 0.9), Some(4.0));
        assert_eq!(percentile(&[1.0, 2.0, 3.0, 4.0], 0.5), Some(2.5));
        assert_eq!(percentile(&[10.0, 20.0, 30.0, 40.0, 50.0], 0.9), Some(46.0));
        assert_eq!(median_or_none(&[3.0, 1.0, 2.0, 10.0]), Some(2.5));
    }

    #[test]
    fn safe_pct_and_days() {
        assert_eq!(safe_pct(1.0, 0.0), None);
        assert_eq!(safe_pct(1.0, 3.0), Some(33.3));
        assert_eq!(days_between(0, DAY_SECS * 7 + 5), 7);
        assert_eq!(days_between(100, 0), -1);
        assert_eq!(hours_between(Some(0), Some(5400)), Some(1.5));
        assert_eq!(hours_between(Some(10), Some(0)), None);
    }

    #[test]
    fn series_has_every_bucket_and_counts_distinct_users() {
        let filters = AnalyticsFilters::default();
        let start = 3 * DAY_SECS + 100;
        let end = start + 2 * DAY_SECS;
        let user = UserId::new();
        let course = CourseId::new();
        let mk = |ts| ActivityEvent {
            user_id: user,
            course_id: course,
            ts,
            source: EventSource::Quiz,
            assessment_id: None,
            activity_id: None,
        };
        let events = vec![mk(start + 10), mk(start + 20), mk(end + 5)];
        let series = build_series(&events, &filters, start, end, true);
        assert_eq!(series.len(), 3);
        assert_eq!(series[0], (3 * DAY_SECS, 1.0));
        assert_eq!(series[1].1, 0.0);
        let counted = build_series(&events, &filters, start, end, false);
        assert_eq!(counted[0].1, 2.0);
    }
}
