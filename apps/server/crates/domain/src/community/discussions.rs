//! Course discussions (legacy `services/courses/discussions.py`).
//!
//! Posts and one level of replies on a course, like/dislike toggles (one
//! reaction per user), owner edits, moderator edits/removal. Reading needs
//! the course to be visible to the caller plus `discussion:read`; writing
//! needs `discussion:create`; owners edit with `:own`, moderators with
//! `discussion:moderate` (platform, or `own` on courses they created).

use ab_core::assessments::{DiscussionStatus, ReactionKind};
use ab_core::id::{CourseId, DiscussionId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, FieldError, Result};
use ab_db::discussions::DiscussionRow;
use sqlx::PgPool;

use crate::catalog::courses::{Course, CoursesService};
use crate::identity::Actor;

pub const MAX_PAGE: i64 = 100;
pub const MAX_CONTENT_CHARS: usize = 20_000;

const fn perm(action: Action, scope: Scope) -> Permission {
    Permission {
        resource: ResourceType::Discussion,
        action,
        scope: Some(scope),
    }
}

/// A post or reply with the caller's abilities resolved (flags mirror the
/// legacy `CourseDiscussionReadWithPermissions` contract).
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone)]
pub struct Discussion {
    pub row: DiscussionRow,
    pub replies: Vec<Self>,
    pub is_owner: bool,
    pub can_update: bool,
    pub can_delete: bool,
    pub can_moderate: bool,
}

#[derive(Debug, Clone)]
pub struct DiscussionPage {
    pub items: Vec<Discussion>,
    pub next_cursor: Option<DiscussionId>,
}

/// Counts after a toggle.
#[derive(Debug, Clone, Copy)]
pub struct ReactionState {
    pub is_liked: bool,
    pub is_disliked: bool,
    pub likes_count: i64,
    pub dislikes_count: i64,
}

/// The caller's standing on one course's discussions.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone, Copy)]
struct Abilities {
    moderate: bool,
    update_any: bool,
    delete_any: bool,
    update_own: bool,
    delete_own: bool,
}

impl Abilities {
    fn of(actor: &Actor, course: &Course) -> Self {
        let creator = course.creator_id == Some(actor.user_id);
        let moderate = actor.has(perm(Action::Moderate, Scope::Platform))
            || (creator && actor.has(perm(Action::Moderate, Scope::Own)));
        Self {
            moderate,
            update_any: moderate || actor.has(perm(Action::Update, Scope::Platform)),
            delete_any: moderate || actor.has(perm(Action::Delete, Scope::Platform)),
            update_own: actor.has(perm(Action::Update, Scope::Own)),
            delete_own: actor.has(perm(Action::Delete, Scope::Own)),
        }
    }

    fn resolve(self, actor: &Actor, row: DiscussionRow, replies: Vec<Discussion>) -> Discussion {
        let is_owner = row.user_id == Some(actor.user_id);
        Discussion {
            is_owner,
            can_update: self.update_any || (is_owner && self.update_own),
            can_delete: self.delete_any || (is_owner && self.delete_own),
            can_moderate: self.moderate,
            row,
            replies,
        }
    }
}

/// Text left after dropping `<...>` tags and whitespace.
fn visible_text_len(content: &str) -> usize {
    let mut in_tag = false;
    let mut count = 0;
    for ch in content.chars() {
        match ch {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            c if !in_tag && !c.is_whitespace() => count += 1,
            _ => {}
        }
    }
    count
}

fn validate_content(content: &str) -> Result<()> {
    if content.chars().count() > MAX_CONTENT_CHARS {
        return Err(Error::validation(vec![FieldError {
            field: "content".into(),
            code: "too-long".into(),
            message: format!("at most {MAX_CONTENT_CHARS} characters"),
        }]));
    }
    if visible_text_len(content) == 0 {
        return Err(Error::validation(vec![FieldError {
            field: "content".into(),
            code: "required".into(),
            message: "content cannot be empty".into(),
        }]));
    }
    Ok(())
}

#[derive(Clone)]
pub struct DiscussionsService {
    pool: PgPool,
    courses: CoursesService,
}

impl DiscussionsService {
    #[must_use]
    pub const fn new(pool: PgPool, courses: CoursesService) -> Self {
        Self { pool, courses }
    }

    /// Visible course (404) + `discussion:read`.
    async fn readable_course(&self, actor: &Actor, course_id: CourseId) -> Result<Course> {
        let course = self.courses.get(actor, course_id).await?;
        let readable = actor.has(perm(Action::Read, Scope::All))
            || actor.has(perm(Action::Read, Scope::Platform))
            || actor.has(perm(Action::Moderate, Scope::Platform));
        if !readable {
            return Err(Error::forbidden("missing permission discussion:read"));
        }
        Ok(course)
    }

    async fn load(&self, actor: &Actor, id: DiscussionId) -> Result<(DiscussionRow, Course)> {
        let row = ab_db::discussions::get_discussion(&self.pool, id, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("discussion"))?;
        let course = self
            .readable_course(actor, row.course_id)
            .await
            .map_err(|_| Error::not_found("discussion"))?;
        Ok((row, course))
    }

    /// Newest posts first, optionally with every active reply embedded.
    pub async fn list(
        &self,
        actor: &Actor,
        course_id: CourseId,
        include_replies: bool,
        cursor: Option<DiscussionId>,
        limit: i64,
    ) -> Result<DiscussionPage> {
        let course = self.readable_course(actor, course_id).await?;
        let abilities = Abilities::of(actor, &course);
        let limit = limit.clamp(1, MAX_PAGE);
        let mut rows =
            ab_db::discussions::list_posts(&self.pool, course_id, actor.user_id, cursor, limit + 1)
                .await?;
        let page = usize::try_from(limit).unwrap_or(usize::MAX);
        let next_cursor = if rows.len() > page {
            rows.truncate(page);
            rows.last().map(|r| r.id)
        } else {
            None
        };
        let mut replies = if include_replies && !rows.is_empty() {
            let ids: Vec<DiscussionId> = rows.iter().map(|r| r.id).collect();
            ab_db::discussions::list_replies_for(&self.pool, &ids, actor.user_id).await?
        } else {
            Vec::new()
        };
        let items = rows
            .into_iter()
            .map(|row| {
                let own: Vec<Discussion> = replies
                    .extract_if(.., |r| r.parent_id == Some(row.id))
                    .map(|r| abilities.resolve(actor, r, Vec::new()))
                    .collect();
                abilities.resolve(actor, row, own)
            })
            .collect();
        Ok(DiscussionPage { items, next_cursor })
    }

    /// Replies under one post, oldest first.
    pub async fn replies(
        &self,
        actor: &Actor,
        id: DiscussionId,
        cursor: Option<DiscussionId>,
        limit: i64,
    ) -> Result<DiscussionPage> {
        let (parent, course) = self.load(actor, id).await?;
        if parent.status != DiscussionStatus::Active {
            return Err(Error::not_found("discussion"));
        }
        let abilities = Abilities::of(actor, &course);
        let limit = limit.clamp(1, MAX_PAGE);
        let mut rows =
            ab_db::discussions::list_replies(&self.pool, id, actor.user_id, cursor, limit + 1)
                .await?;
        let page = usize::try_from(limit).unwrap_or(usize::MAX);
        let next_cursor = if rows.len() > page {
            rows.truncate(page);
            rows.last().map(|r| r.id)
        } else {
            None
        };
        Ok(DiscussionPage {
            items: rows
                .into_iter()
                .map(|r| abilities.resolve(actor, r, Vec::new()))
                .collect(),
            next_cursor,
        })
    }

    /// A post, or a reply to an active post of the same course.
    pub async fn create(
        &self,
        actor: &Actor,
        course_id: CourseId,
        parent_id: Option<DiscussionId>,
        content: &str,
    ) -> Result<Discussion> {
        let course = self.readable_course(actor, course_id).await?;
        if !(actor.has(perm(Action::Create, Scope::Platform))
            || actor.has(perm(Action::Create, Scope::Own)))
        {
            return Err(Error::forbidden("missing permission discussion:create"));
        }
        validate_content(content)?;
        if let Some(parent_id) = parent_id {
            let parent = ab_db::discussions::get_discussion(&self.pool, parent_id, actor.user_id)
                .await?
                .filter(|p| p.course_id == course_id && p.status == DiscussionStatus::Active)
                .ok_or_else(|| Error::not_found("parent discussion"))?;
            if parent.parent_id.is_some() {
                return Err(Error::validation(vec![FieldError {
                    field: "parent_id".into(),
                    code: "nested".into(),
                    message: "replies cannot be nested; reply to the post".into(),
                }]));
            }
        }
        let id = ab_db::discussions::insert_discussion(
            &self.pool,
            course_id,
            actor.user_id,
            parent_id,
            content,
        )
        .await?;
        crate::analytics::events::hooks::discussion_posted(
            &self.pool,
            course_id,
            actor.user_id,
            id,
            parent_id.is_some(),
        )
        .await;
        let row = ab_db::discussions::get_discussion(&self.pool, id, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("discussion"))?;
        Ok(Abilities::of(actor, &course).resolve(actor, row, Vec::new()))
    }

    /// Owner or moderator edits content and/or status.
    pub async fn update(
        &self,
        actor: &Actor,
        id: DiscussionId,
        content: Option<&str>,
        status: Option<DiscussionStatus>,
    ) -> Result<Discussion> {
        let (row, course) = self.load(actor, id).await?;
        let abilities = Abilities::of(actor, &course);
        let is_owner = row.user_id == Some(actor.user_id);
        if !(abilities.update_any || (is_owner && abilities.update_own)) {
            return Err(Error::forbidden("you cannot edit this discussion"));
        }
        if let Some(content) = content {
            validate_content(content)?;
        }
        ab_db::discussions::update_discussion(&self.pool, id, content, status).await?;
        let fresh = ab_db::discussions::get_discussion(&self.pool, id, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("discussion"))?;
        Ok(abilities.resolve(actor, fresh, Vec::new()))
    }

    /// Owner or moderator removes the post (replies and reactions go too).
    pub async fn delete(&self, actor: &Actor, id: DiscussionId) -> Result<()> {
        let (row, course) = self.load(actor, id).await?;
        let abilities = Abilities::of(actor, &course);
        let is_owner = row.user_id == Some(actor.user_id);
        if !(abilities.delete_any || (is_owner && abilities.delete_own)) {
            return Err(Error::forbidden("you cannot delete this discussion"));
        }
        ab_db::discussions::delete_discussion(&self.pool, id).await?;
        Ok(())
    }

    /// Toggle a like or dislike on an active post.
    pub async fn toggle(
        &self,
        actor: &Actor,
        id: DiscussionId,
        kind: ReactionKind,
    ) -> Result<ReactionState> {
        let (row, _) = self.load(actor, id).await?;
        if row.status != DiscussionStatus::Active {
            return Err(Error::not_found("discussion"));
        }
        ab_db::discussions::toggle_reaction(&self.pool, id, actor.user_id, kind).await?;
        let fresh = ab_db::discussions::get_discussion(&self.pool, id, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("discussion"))?;
        Ok(ReactionState {
            is_liked: fresh.my_reaction == Some(ReactionKind::Like),
            is_disliked: fresh.my_reaction == Some(ReactionKind::Dislike),
            likes_count: i64::from(fresh.likes_count),
            dislikes_count: i64::from(fresh.dislikes_count),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_after_stripping_tags_is_rejected() {
        assert!(validate_content("<p><br/></p>  ").is_err());
        assert!(validate_content("<p>hi</p>").is_ok());
        assert!(validate_content("plain").is_ok());
    }
}
