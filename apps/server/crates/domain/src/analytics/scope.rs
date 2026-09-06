//! Analytics scope resolution (legacy `services/analytics/scope.py`).
//!
//! Teacher scope = courses the actor created or actively co-authors, gated
//! by `analytics:<action>:assigned`; `analytics:<action>:platform` / `:all`
//! see every course and may inspect another teacher via `teacher_user_id`.
//! Explicitly requested `course_ids` outside the scope are a 403 (the caller
//! asked for something it may not see); path ids outside the scope are 404s
//! at the call sites (no existence leak).

use ab_core::id::{CourseId, UserId, UsergroupId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use sqlx::PgPool;

use super::filters::AnalyticsFilters;
use crate::identity::Actor;

#[derive(Debug, Clone)]
pub struct TeacherScope {
    /// The teacher the dashboard is about (the caller, or the inspected
    /// teacher under platform scope).
    pub teacher_user_id: UserId,
    pub course_ids: Vec<CourseId>,
    pub cohort_ids: Vec<UsergroupId>,
    pub has_platform_scope: bool,
}

impl TeacherScope {
    #[must_use]
    pub fn contains(&self, course_id: CourseId) -> bool {
        self.course_ids.contains(&course_id)
    }

    /// 404 when the course is not in scope (path ids never leak existence).
    pub fn ensure_course(&self, course_id: CourseId) -> Result<()> {
        if self.contains(course_id) {
            Ok(())
        } else {
            Err(Error::not_found("course"))
        }
    }
}

const fn perm(action: Action, scope: Scope) -> Permission {
    Permission {
        resource: ResourceType::Analytics,
        action,
        scope: Some(scope),
    }
}

fn has_scope(actor: &Actor, action: Action, scope: Scope) -> bool {
    actor.has(perm(action, scope))
}

/// Any of `analytics:<action>:{assigned,platform,all}` (wildcards included).
pub fn ensure_access(actor: &Actor, action: Action) -> Result<()> {
    if [Scope::Assigned, Scope::Platform, Scope::All]
        .into_iter()
        .any(|scope| has_scope(actor, action, scope))
    {
        Ok(())
    } else {
        Err(Error::forbidden(format!(
            "missing permission analytics:{}",
            action.as_str()
        )))
    }
}

#[must_use]
pub fn has_platform_scope(actor: &Actor, action: Action) -> bool {
    has_scope(actor, action, Scope::Platform) || has_scope(actor, action, Scope::All)
}

/// Legacy `resolve_teacher_scope`.
pub async fn resolve(
    pool: &PgPool,
    actor: &Actor,
    filters: &AnalyticsFilters,
    action: Action,
) -> Result<TeacherScope> {
    if actor.is_anonymous() {
        return Err(Error::unauthenticated());
    }
    ensure_access(actor, action)?;
    let platform = has_platform_scope(actor, action);
    let target = if platform {
        filters.teacher_user_id.unwrap_or(actor.user_id)
    } else {
        actor.user_id
    };
    let mut course_ids = if platform && filters.teacher_user_id.is_none() {
        ab_db::analytics::all_course_ids(pool).await?
    } else {
        ab_db::analytics::teacher_course_ids(pool, target).await?
    };
    course_ids.sort_unstable();
    course_ids.dedup();

    if !filters.course_ids.is_empty() {
        let unauthorized: Vec<String> = filters
            .course_ids
            .iter()
            .filter(|id| !course_ids.contains(id))
            .map(ToString::to_string)
            .collect();
        if !unauthorized.is_empty() {
            return Err(Error::forbidden(format!(
                "requested courses are outside the analytics scope: {}",
                unauthorized.join(", ")
            )));
        }
        let mut requested = filters.course_ids.clone();
        requested.sort_unstable();
        requested.dedup();
        course_ids = requested;
    }

    Ok(TeacherScope {
        teacher_user_id: target,
        course_ids,
        cohort_ids: filters.cohort_ids.clone(),
        has_platform_scope: platform,
    })
}
