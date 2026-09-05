//! Course discussion DTOs.

use ab_core::assessments::DiscussionStatus;
use ab_core::id::{CourseId, DiscussionId, UserId};
use ab_domain::community::discussions as domain;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// The post's author — no email (unlike the legacy `UserRead`); `null`
/// once the account is gone.
#[derive(Debug, Serialize, ToSchema)]
pub struct DiscussionAuthor {
    pub id: UserId,
    pub username: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
}

// `Vec<Self>` is not spelled out because utoipa resolves the recursive schema by name.
#[allow(clippy::struct_excessive_bools, clippy::use_self)]
#[derive(Debug, Serialize, ToSchema)]
pub struct Discussion {
    pub id: DiscussionId,
    pub course_id: CourseId,
    /// `null` for a top-level post.
    pub parent_id: Option<DiscussionId>,
    pub content: String,
    pub status: DiscussionStatus,
    pub author: Option<DiscussionAuthor>,
    pub likes_count: i32,
    pub dislikes_count: i32,
    pub replies_count: i32,
    pub is_liked: bool,
    pub is_disliked: bool,
    /// Embedded when the list was asked for `include_replies` (replies
    /// carry an empty list — one level only).
    #[schema(no_recursion)]
    pub replies: Vec<Discussion>,
    pub is_owner: bool,
    pub can_update: bool,
    pub can_delete: bool,
    pub can_moderate: bool,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl From<domain::Discussion> for Discussion {
    fn from(d: domain::Discussion) -> Self {
        let r = d.row;
        Self {
            id: r.id,
            course_id: r.course_id,
            parent_id: r.parent_id,
            content: r.content,
            status: r.status,
            author: r.user_id.map(|id| DiscussionAuthor {
                id,
                username: r.username.unwrap_or_default(),
                display_name: r.display_name.unwrap_or_default(),
                avatar_key: r.avatar_key,
            }),
            likes_count: r.likes_count,
            dislikes_count: r.dislikes_count,
            replies_count: r.replies_count,
            is_liked: r.my_reaction == Some(ab_core::assessments::ReactionKind::Like),
            is_disliked: r.my_reaction == Some(ab_core::assessments::ReactionKind::Dislike),
            replies: d.replies.into_iter().map(Into::into).collect(),
            is_owner: d.is_owner,
            can_update: d.can_update,
            can_delete: d.can_delete,
            can_moderate: d.can_moderate,
            created_at_unix: r.created_at,
            updated_at_unix: r.updated_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DiscussionPage {
    pub items: Vec<Discussion>,
    pub next_cursor: Option<DiscussionId>,
}

impl From<domain::DiscussionPage> for DiscussionPage {
    fn from(p: domain::DiscussionPage) -> Self {
        Self {
            items: p.items.into_iter().map(Into::into).collect(),
            next_cursor: p.next_cursor,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct DiscussionListQuery {
    /// Embed every active reply under each post.
    pub include_replies: Option<bool>,
    pub cursor: Option<DiscussionId>,
    /// 1..=100 (default 50).
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct RepliesQuery {
    pub cursor: Option<DiscussionId>,
    /// 1..=100 (default 50).
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateDiscussionRequest {
    /// HTML or text; must contain visible text.
    #[garde(length(min = 1, max = 20_000))]
    pub content: String,
    /// Reply to this post (one level).
    #[garde(skip)]
    pub parent_id: Option<DiscussionId>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateDiscussionRequest {
    #[garde(length(min = 1, max = 20_000))]
    pub content: Option<String>,
    #[garde(skip)]
    pub status: Option<DiscussionStatus>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReactionState {
    pub is_liked: bool,
    pub is_disliked: bool,
    pub likes_count: i64,
    pub dislikes_count: i64,
}

impl From<domain::ReactionState> for ReactionState {
    fn from(s: domain::ReactionState) -> Self {
        Self {
            is_liked: s.is_liked,
            is_disliked: s.is_disliked,
            likes_count: s.likes_count,
            dislikes_count: s.dislikes_count,
        }
    }
}
