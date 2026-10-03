//! Course discussions (legacy `services/courses/discussions.py`).
//!
//! Posts and one level of replies on a course, like/dislike toggles (one
//! reaction per user), owner edits, moderator edits/removal. Reading needs
//! the course to be visible to the caller plus `discussion:read`; writing
//! needs `discussion:create`; owners edit with `:own`, moderators with
//! `discussion:moderate` (platform, or `own` on courses they created).

use ab_core::assessments::{DiscussionStatus, ReactionKind};
use ab_core::id::{CourseId, DiscussionId, UserId};
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
    pub allowed_actions: Vec<DiscussionAction>,
    /// The parent post's `replies_count` after this reply was created
    /// (create responses only).
    pub parent_replies_count: Option<i32>,
}

/// What the caller may do to a post or reply (`Discussion.allowed_actions`):
/// the gates of `update`, `delete`, `create` (reply) and `toggle`, plus the
/// archive freeze (409) and the post's state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum DiscussionAction {
    /// Edit the content.
    Update,
    Delete,
    /// Change the status (hide / restore) - moderators only.
    Moderate,
    /// Reply under it (active top-level posts).
    Reply,
    /// Like / dislike (active posts).
    React,
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
    /// `discussion:create` - the posting half of `postable_course`.
    post: bool,
    /// The course is not archived (every write is 409 otherwise).
    open: bool,
}

impl Abilities {
    fn of(actor: &Actor, course: &Course) -> Self {
        let creator = course.is_author(actor.user_id);
        let moderate = actor.has(perm(Action::Moderate, Scope::Platform))
            || (creator && actor.has(perm(Action::Moderate, Scope::Own)));
        Self {
            moderate,
            update_any: moderate || actor.has(perm(Action::Update, Scope::Platform)),
            delete_any: moderate || actor.has(perm(Action::Delete, Scope::Platform)),
            update_own: actor.has(perm(Action::Update, Scope::Own)),
            delete_own: actor.has(perm(Action::Delete, Scope::Own)),
            post: may_post(actor),
            open: course.archived_at.is_none(),
        }
    }

    fn resolve(self, actor: &Actor, row: DiscussionRow, replies: Vec<Discussion>) -> Discussion {
        let is_owner = row.user_id == Some(actor.user_id);
        let can_update = self.update_any || (is_owner && self.update_own);
        let can_delete = self.delete_any || (is_owner && self.delete_own);
        let active = row.status == DiscussionStatus::Active;
        let allowed_actions = [
            (DiscussionAction::Update, can_update),
            (DiscussionAction::Delete, can_delete),
            (DiscussionAction::Moderate, self.moderate),
            (
                DiscussionAction::Reply,
                self.post && active && row.parent_id.is_none(),
            ),
            (DiscussionAction::React, active),
        ]
        .into_iter()
        .filter_map(|(action, ok)| (ok && self.open).then_some(action))
        .collect();
        Discussion {
            is_owner,
            can_update,
            can_delete,
            can_moderate: self.moderate,
            allowed_actions,
            row,
            replies,
            parent_replies_count: None,
        }
    }
}

/// The grant half of `postable_course`.
fn may_post(actor: &Actor) -> bool {
    actor.has(perm(Action::Create, Scope::Platform)) || actor.has(perm(Action::Create, Scope::Own))
}

/// Visible characters of a post: the text nodes of an editor document
/// (`{"type": "doc", ...}` JSON - its punctuation is not text), else what is
/// left of HTML after dropping `<...>` tags; whitespace never counts.
fn visible_text_len(content: &str) -> usize {
    if let Ok(doc @ serde_json::Value::Object(_)) = serde_json::from_str(content)
        && doc.get("type").is_some()
    {
        return editor_text_len(&doc);
    }
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

/// Non-whitespace characters in the `text` leaves of an editor document.
/// A non-text node with `attrs` (an image, an embed) counts as content.
fn editor_text_len(node: &serde_json::Value) -> usize {
    let text = node
        .get("text")
        .and_then(serde_json::Value::as_str)
        .map_or(0, |t| t.chars().filter(|c| !c.is_whitespace()).count());
    let leaf = usize::from(
        node.get("content").is_none()
            && node.get("text").is_none()
            && node.get("attrs").is_some_and(|a| {
                ["src", "url", "uri", "href", "id"]
                    .iter()
                    .any(|k| a.get(k).is_some_and(|v| !v.is_null()))
            }),
    );
    text + leaf
        + node
            .get("content")
            .and_then(serde_json::Value::as_array)
            .map_or(0, |children| children.iter().map(editor_text_len).sum())
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

    /// UX-311: [`Self::create`]'s gate on its own, before the body is read.
    pub async fn postable_course(&self, actor: &Actor, course_id: CourseId) -> Result<Course> {
        let course = self.readable_course(actor, course_id).await?;
        course.ensure_not_archived()?;
        if may_post(actor) {
            return Ok(course);
        }
        Err(Error::forbidden("missing permission discussion:create"))
    }

    /// UX-311: [`Self::update`]'s edit gate on its own (the moderator-only
    /// status change still needs the body).
    pub async fn require_editable(&self, actor: &Actor, id: DiscussionId) -> Result<()> {
        let (row, course) = self.load(actor, id).await?;
        course.ensure_not_archived()?;
        let abilities = Abilities::of(actor, &course);
        if abilities.update_any || (row.user_id == Some(actor.user_id) && abilities.update_own) {
            return Ok(());
        }
        Err(Error::forbidden("you cannot edit this discussion"))
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

    /// One post (with its active replies) or one reply. Hidden / deleted
    /// ones are for their author and moderators only (404 otherwise).
    pub async fn get(&self, actor: &Actor, id: DiscussionId) -> Result<Discussion> {
        let (row, course) = self.load(actor, id).await?;
        let abilities = Abilities::of(actor, &course);
        if row.status != DiscussionStatus::Active
            && !abilities.moderate
            && row.user_id != Some(actor.user_id)
        {
            return Err(Error::not_found("discussion"));
        }
        let replies = if row.parent_id.is_none() {
            ab_db::discussions::list_replies_for(&self.pool, &[row.id], actor.user_id)
                .await?
                .into_iter()
                .map(|r| abilities.resolve(actor, r, Vec::new()))
                .collect()
        } else {
            Vec::new()
        };
        Ok(abilities.resolve(actor, row, replies))
    }

    /// Newest posts first, optionally with every active reply embedded.
    /// Guests get an empty page of a visible course (no discussion data).
    pub async fn list(
        &self,
        actor: &Actor,
        course_id: CourseId,
        include_replies: bool,
        cursor: Option<DiscussionId>,
        limit: i64,
    ) -> Result<DiscussionPage> {
        if actor.is_anonymous() {
            self.courses.get(actor, course_id).await?;
            return Ok(DiscussionPage {
                items: Vec::new(),
                next_cursor: None,
            });
        }
        let course = self.readable_course(actor, course_id).await?;
        let abilities = Abilities::of(actor, &course);
        let limit = ab_core::page_limit(limit, MAX_PAGE)?;
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
        let limit = ab_core::page_limit(limit, MAX_PAGE)?;
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
        let course = self.postable_course(actor, course_id).await?;
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
        if let Some(parent_id) = parent_id {
            Self::notify_reply(&self.pool, &course, parent_id, &row).await;
        }
        let mut created = Abilities::of(actor, &course).resolve(actor, row, Vec::new());
        if let Some(parent_id) = parent_id {
            created.parent_replies_count =
                ab_db::discussions::get_discussion(&self.pool, parent_id, actor.user_id)
                    .await?
                    .map(|p| p.replies_count);
        }
        Ok(created)
    }

    /// S-07: the thread's author and its other repliers hear of a reply
    /// (never the replier).
    async fn notify_reply(
        pool: &PgPool,
        course: &Course,
        thread: DiscussionId,
        reply: &ab_db::discussions::DiscussionRow,
    ) {
        let participants = match ab_db::notifications::thread_participants(pool, thread).await {
            Ok(ids) => ids,
            Err(err) => {
                tracing::warn!(%err, "discussion reply: participants not resolved");
                return;
            }
        };
        let Some(author_id) = reply.user_id else {
            return;
        };
        let recipients: Vec<UserId> = participants
            .into_iter()
            .filter(|u| *u != author_id)
            .collect();
        crate::notifications::notify(
            pool,
            &recipients,
            &crate::notifications::NotificationPayload::DiscussionReply {
                course_id: course.id,
                course_name: course.name.clone(),
                discussion_id: thread,
                reply_id: reply.id,
                author_id,
                author_name: reply
                    .display_name
                    .clone()
                    .filter(|n| !n.trim().is_empty())
                    .or_else(|| reply.username.clone())
                    .unwrap_or_default(),
            },
            None,
        )
        .await;
    }

    /// Owner or moderator edits content; only a moderator changes status
    /// (an owner could otherwise un-hide a moderated post).
    pub async fn update(
        &self,
        actor: &Actor,
        id: DiscussionId,
        content: Option<&str>,
        status: Option<DiscussionStatus>,
    ) -> Result<Discussion> {
        let (row, course) = self.load(actor, id).await?;
        course.ensure_not_archived()?;
        let abilities = Abilities::of(actor, &course);
        let is_owner = row.user_id == Some(actor.user_id);
        if !(abilities.update_any || (is_owner && abilities.update_own)) {
            return Err(Error::forbidden("you cannot edit this discussion"));
        }
        if status.is_some_and(|s| s != row.status) && !abilities.moderate {
            return Err(Error::forbidden(
                "only a moderator can change a discussion's status",
            ));
        }
        // A non-moderator's same-as-read status is never written: a hide
        // landing between the read and the UPDATE must survive (BUG-346).
        let status = status.filter(|_| abilities.moderate);
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
        course.ensure_not_archived()?;
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
        let (row, course) = self.load(actor, id).await?;
        course.ensure_not_archived()?;
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

    /// An editor document counts its text nodes, not its JSON punctuation.
    #[test]
    fn empty_editor_document_is_rejected() {
        let empty = r#"{"type":"doc","content":[{"type":"paragraph"},{"type":"paragraph","content":[{"type":"text","text":"  "}]}]}"#;
        assert!(validate_content(empty).is_err());
        let text = r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hi"}]}]}"#;
        assert!(validate_content(text).is_ok());
        let image = r#"{"type":"doc","content":[{"type":"image","attrs":{"src":"k"}}]}"#;
        assert!(validate_content(image).is_ok());
        // JSON that is not a document is plain text.
        assert!(validate_content("[1]").is_ok());
    }
}
