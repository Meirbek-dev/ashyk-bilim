use ab_core::id::{CourseId, UserId, UsergroupId};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct Usergroup {
    pub id: UsergroupId,
    pub name: String,
    pub description: String,
    pub creator_id: Option<UserId>,
    pub member_count: i64,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl From<ab_domain::identity::usergroups::Usergroup> for Usergroup {
    fn from(g: ab_domain::identity::usergroups::Usergroup) -> Self {
        Self {
            id: g.id,
            name: g.name,
            description: g.description,
            creator_id: g.creator_id,
            member_count: g.member_count,
            created_at_unix: g.created_at,
            updated_at_unix: g.updated_at,
        }
    }
}

/// Keyset page (ARCHITECTURE §6): pass `next_cursor` back as `cursor`.
#[derive(Debug, Serialize, ToSchema)]
pub struct UsergroupPage {
    pub items: Vec<Usergroup>,
    pub next_cursor: Option<UsergroupId>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UsergroupMember {
    pub id: UserId,
    pub username: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
}

impl From<ab_domain::identity::usergroups::Member> for UsergroupMember {
    fn from(m: ab_domain::identity::usergroups::Member) -> Self {
        Self {
            id: m.id,
            username: m.username,
            display_name: m.display_name,
            avatar_key: m.avatar_key,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateUsergroupRequest {
    #[garde(length(min = 1, max = 500))]
    pub name: String,
    #[garde(length(max = 5000))]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateUsergroupRequest {
    #[garde(inner(length(min = 1, max = 500)))]
    pub name: Option<String>,
    #[garde(inner(length(max = 5000)))]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UsergroupMembersRequest {
    #[garde(length(min = 1, max = 500))]
    pub user_ids: Vec<UserId>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UsergroupCoursesRequest {
    #[garde(length(min = 1, max = 100))]
    pub course_ids: Vec<CourseId>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UsergroupListQuery {
    pub cursor: Option<UsergroupId>,
    /// 1..=100, default 20.
    pub limit: Option<i64>,
}
