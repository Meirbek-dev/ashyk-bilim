//! UI-level capabilities (`GET /auth/session` `capabilities`, S-02).
//!
//! The web draws navigation and route guards from this closed set and never
//! parses permission strings. Each capability is the gate the matching
//! server endpoints enforce - the same functions, so the navigation cannot
//! drift from the 403s. THE mapping (also in docs/DECISIONS.md, 2026-10-03):
//!
//! | capability           | rule (server gate)                                                   |
//! | -------------------- | -------------------------------------------------------------------- |
//! | `course.create`      | `CoursesService::require_create` - `course:create:platform`          |
//! | `collection.create`  | `CollectionsService::require_create` - `collection:create:platform`  |
//! | `groups.manage`      | `usergroup:read:platform` and `UsergroupsService::require_writer`    |
//! | `analytics.view`     | `analytics::scope::ensure_access(read)` - `analytics:read:{assigned,platform,all}` |
//! | `analytics.export`   | `analytics::scope::ensure_access(export)`                            |
//! | `teach`              | authors any course, or `AssessmentsService::require_some_authoring`, or `course:{update,manage}:platform`, or `assessment:grade:platform`, or any of `course.create`, `analytics.view`, `groups.manage` |
//! | `admin.users`        | `RbacAdminService::require_read_users` - `platform:read:platform`    |
//! | `admin.roles`        | `RbacAdminService::require_read_roles` - `role:read:platform`        |
//! | `admin.platform`     | `PlatformService::require_update` - `platform:update:platform`       |
//! | `admin.ai`           | `ai::policy::require_admin` - `platform:read:platform`               |
//! | `admin.gamification` | `GamificationService::require_manage` - `platform:manage:platform`   |
//! | `admin.analytics`    | `analytics::scope::has_platform_scope(read)` - `analytics:read:{platform,all}` |
//! | `admin`              | any `admin.*`                                                        |

use ab_core::Result;
use ab_core::permission::{Action, Scope};
use serde::Serialize;
use sqlx::PgPool;
use utoipa::ToSchema;

use crate::analytics::scope;
use crate::assessments::AssessmentsService;
use crate::catalog::{CollectionsService, CoursesService, PlatformService};
use crate::gamification::GamificationService;
use crate::identity::{Actor, RbacAdminService, UsergroupsService};

/// A UI-level right: may the caller enter a workspace / see an entry point.
/// Closed set; object-level rights travel as `allowed_actions` instead.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
pub enum Capability {
    /// The teaching workspace (`/teach`).
    #[serde(rename = "teach")]
    Teach,
    #[serde(rename = "course.create")]
    CourseCreate,
    #[serde(rename = "collection.create")]
    CollectionCreate,
    #[serde(rename = "groups.manage")]
    GroupsManage,
    #[serde(rename = "analytics.view")]
    AnalyticsView,
    #[serde(rename = "analytics.export")]
    AnalyticsExport,
    /// The admin workspace (`/admin`): any `admin.*` below.
    #[serde(rename = "admin")]
    Admin,
    #[serde(rename = "admin.users")]
    AdminUsers,
    #[serde(rename = "admin.roles")]
    AdminRoles,
    #[serde(rename = "admin.platform")]
    AdminPlatform,
    #[serde(rename = "admin.ai")]
    AdminAi,
    #[serde(rename = "admin.gamification")]
    AdminGamification,
    #[serde(rename = "admin.analytics")]
    AdminAnalytics,
}

/// The caller's capabilities, in declaration order. One DB read at most
/// (course authorship), skipped when a grant already opens `teach`.
pub async fn capabilities(pool: &PgPool, actor: &Actor) -> Result<Vec<Capability>> {
    let mut caps = granted(actor);
    if !caps.contains(&Capability::Teach)
        && ab_db::catalog::authors_any_course(pool, actor.user_id).await?
    {
        caps.insert(0, Capability::Teach);
    }
    Ok(caps)
}

/// Everything decided by grants alone (`teach` without course authorship).
fn granted(actor: &Actor) -> Vec<Capability> {
    use Capability as C;
    let course_create = CoursesService::require_create(actor).is_ok();
    let groups = actor.has(crate::identity::usergroups::perm(Action::Read))
        && UsergroupsService::require_writer(actor).is_ok();
    let analytics = scope::ensure_access(actor, Action::Read).is_ok();
    let teach = course_create
        || groups
        || analytics
        || AssessmentsService::has_platform_authoring(actor)
        || actor.has(crate::catalog::courses::perm(
            Action::Update,
            Scope::Platform,
        ))
        || actor.has(crate::catalog::courses::perm(
            Action::Manage,
            Scope::Platform,
        ))
        || actor.has(crate::assessments::service::perm(
            Action::Grade,
            Scope::Platform,
        ));
    let admin = [
        (
            C::AdminUsers,
            RbacAdminService::require_read_users(actor).is_ok(),
        ),
        (
            C::AdminRoles,
            RbacAdminService::require_read_roles(actor).is_ok(),
        ),
        (
            C::AdminPlatform,
            PlatformService::require_update(actor).is_ok(),
        ),
        (C::AdminAi, crate::ai::policy::require_admin(actor).is_ok()),
        (
            C::AdminGamification,
            GamificationService::require_manage(actor).is_ok(),
        ),
        (
            C::AdminAnalytics,
            scope::has_platform_scope(actor, Action::Read),
        ),
    ];
    let any_admin = admin.iter().any(|(_, ok)| *ok);
    [
        (C::Teach, teach),
        (C::CourseCreate, course_create),
        (
            C::CollectionCreate,
            CollectionsService::require_create(actor).is_ok(),
        ),
        (C::GroupsManage, groups),
        (C::AnalyticsView, analytics),
        (
            C::AnalyticsExport,
            scope::ensure_access(actor, Action::Export).is_ok(),
        ),
        (C::Admin, any_admin),
    ]
    .into_iter()
    .chain(admin)
    .filter_map(|(cap, ok)| ok.then_some(cap))
    .collect()
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use crate::identity::sessions::SessionRecord;
    use ab_core::id::UserId;

    fn actor(perms: &[&str]) -> Actor {
        Actor::from_session(
            "s".into(),
            &SessionRecord {
                user_id: UserId::new(),
                zitadel_user_id: "z".into(),
                zitadel_session_id: "zs".into(),
                zitadel_session_token: "t".into(),
                roles: Vec::new(),
                permissions: perms.iter().map(ToString::to_string).collect(),
                rbac_version: 1,
                mfa_enabled: false,
                has_password: true,
                google_linked: false,
                created_at_unix: 0,
                last_seen_unix: 0,
                ip: None,
                user_agent: None,
            },
        )
        .unwrap()
    }

    /// The seeded role grants (migration 20260816000003) map as documented.
    #[test]
    fn seeded_roles_map_to_the_documented_capabilities() {
        use Capability as C;
        let all = granted(&actor(&["*:*:*"]));
        assert_eq!(all.len(), 13, "admin holds every capability: {all:?}");

        let student = granted(&actor(&[
            "course:read:all",
            "course:enroll:all",
            "assessment:submit:assigned",
            "user:read:platform",
            "usergroup:read:assigned",
            "discussion:create:platform",
        ]));
        assert!(student.is_empty(), "{student:?}");

        let instructor = granted(&actor(&[
            "course:create:platform",
            "course:update:own",
            "assessment:*:own",
            "collection:create:platform",
            "analytics:read:assigned",
            "analytics:export:assigned",
            "usergroup:create:platform",
            "usergroup:read:platform",
            "user:read:platform",
        ]));
        assert_eq!(
            instructor,
            [
                C::Teach,
                C::CourseCreate,
                C::CollectionCreate,
                C::GroupsManage,
                C::AnalyticsView,
                C::AnalyticsExport,
            ]
        );

        let maintainer = granted(&actor(&[
            "course:update:platform",
            "analytics:read:platform",
        ]));
        assert_eq!(
            maintainer,
            [C::Teach, C::AnalyticsView, C::Admin, C::AdminAnalytics]
        );

        // A grader alone teaches; a roles reader alone administers roles.
        assert_eq!(granted(&actor(&["assessment:grade:platform"])), [C::Teach]);
        assert_eq!(
            granted(&actor(&["role:read:platform"])),
            [C::Admin, C::AdminRoles]
        );
    }

    #[test]
    fn capabilities_serialize_dotted() {
        assert_eq!(
            serde_json::to_value([Capability::AdminAi, Capability::CourseCreate]).unwrap(),
            serde_json::json!(["admin.ai", "course.create"])
        );
    }
}
