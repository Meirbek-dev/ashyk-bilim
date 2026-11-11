//! One message to several learners of a course (stage 2, docs/DIALOGS.md 12):
//! a separate message in each learner's conversation, written in one
//! transaction, so a resend with the same `client_key` sends nothing twice.

use std::collections::HashSet;

use ab_core::id::{ConversationId, CourseId, MessageId, UserId};
use ab_core::{Error, FieldError, Result};
use ab_db::messages as db;
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use super::delivery::{Budget, Outgoing};
use super::{DenyReason, MessagesService, NewAttachment, READ_PLATFORM, clean_body, clean_files};
use crate::identity::Actor;

/// Recipients of one bulk send.
pub const MAX_BULK_RECIPIENTS: usize = 50;

pub struct BulkInput<'a> {
    pub course_id: CourseId,
    pub to: Vec<UserId>,
    pub body: &'a str,
    pub client_key: Uuid,
    pub attachments: Vec<NewAttachment>,
    /// Also record a `message_sent` intervention for each learner.
    pub intervention: bool,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct BulkSent {
    pub user_id: UserId,
    pub conversation_id: ConversationId,
    pub message_id: MessageId,
}

/// A recipient who got nothing, and why.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct BulkSkipped {
    pub user_id: UserId,
    pub reason: DenyReason,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct BulkResult {
    pub sent: Vec<BulkSent>,
    pub skipped: Vec<BulkSkipped>,
}

/// Each copy's own idempotency key, derived from the request's: distinct per
/// recipient and the same on a resend.
const fn copy_key(client_key: Uuid, to: UserId) -> Uuid {
    Uuid::from_u128(client_key.as_u128() ^ to.0.as_u128())
}

fn recipients(actor: &Actor, to: &[UserId]) -> Result<Vec<UserId>> {
    let invalid = |message: String| {
        Error::validation(vec![FieldError {
            field: "to_user_ids".into(),
            code: "invalid".into(),
            message,
        }])
    };
    let mut seen = HashSet::new();
    let unique: Vec<UserId> = to.iter().copied().filter(|u| seen.insert(*u)).collect();
    if unique.is_empty() || unique.len() > MAX_BULK_RECIPIENTS {
        return Err(invalid(format!("1 to {MAX_BULK_RECIPIENTS} recipients")));
    }
    if unique.contains(&actor.user_id) {
        return Err(invalid("you cannot write to yourself".into()));
    }
    Ok(unique)
}

impl MessagesService {
    /// The course's teachers (and administrators) write one message to many
    /// of its learners. Who is not a learner of the course or cannot be
    /// written to is skipped with the reason; a sender's ban refuses all.
    pub async fn send_bulk(&self, actor: &Actor, input: BulkInput<'_>) -> Result<BulkResult> {
        // The gate first (UX-311): nobody else learns what the body lacks.
        if !actor.has(READ_PLATFORM)
            && !db::teaches(&self.pool, actor.user_id, input.course_id).await?
        {
            return Err(Error::forbidden(
                "only the course's teachers write to its learners",
            ));
        }
        let files = clean_files(&input.attachments)?;
        let body = clean_body(input.body, !files.is_empty())?;
        let to = recipients(actor, &input.to)?;
        let learners: HashSet<UserId> = db::learners_of(&self.pool, input.course_id, &to)
            .await?
            .into_iter()
            .collect();
        let candidates: Vec<UserId> = to
            .iter()
            .copied()
            .filter(|u| learners.contains(u))
            .collect();
        let people = self.people(&candidates).await?;
        let standing = self.standing(actor, &candidates, &[]).await?;
        let mut targets = Vec::new();
        let mut skipped = Vec::new();
        for user_id in to {
            let reason = match people.get(&user_id) {
                _ if !learners.contains(&user_id) => Some(DenyReason::NoRelation),
                None => Some(DenyReason::PeerUnavailable),
                Some(peer) => standing.decide(peer, None),
            };
            match reason {
                None => targets.push(user_id),
                Some(DenyReason::Banned) => return Err(DenyReason::Banned.error()),
                Some(reason) => skipped.push(BulkSkipped { user_id, reason }),
            }
        }
        if targets.is_empty() {
            return Ok(BulkResult {
                sent: Vec::new(),
                skipped,
            });
        }
        // The same order for every bulk send: pair locks never cross.
        targets.sort_by_key(|u| u.0);
        let mut tx = self.pool.begin().await?;
        db::lock_sender(&mut tx, actor.user_id).await?;
        let mut budget = Budget::read(
            &mut tx,
            actor,
            i64::try_from(targets.len()).unwrap_or(i64::MAX),
        )
        .await?;
        self.claim_files(&mut tx, actor, &files).await?;
        let mut delivered = Vec::with_capacity(targets.len());
        for &to in &targets {
            let outgoing = Outgoing {
                to,
                body: &body,
                client_key: copy_key(input.client_key, to),
                course: Some(input.course_id),
                activity: None,
                files: &files,
                intervention: input.intervention,
            };
            let Some(done) = self.deliver(&mut tx, actor, &outgoing, &mut budget).await? else {
                return Err(Error::conflict(
                    "a conversation changed while sending; try again",
                ));
            };
            delivered.push((to, done));
        }
        tx.commit().await?;
        let mut sent = Vec::with_capacity(delivered.len());
        for (to, done) in delivered {
            done.announce(actor.user_id, to).await;
            sent.push(BulkSent {
                user_id: to,
                conversation_id: done.conversation,
                message_id: done.message,
            });
        }
        Ok(BulkResult { sent, skipped })
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn each_copy_has_its_own_stable_key() {
        let key = Uuid::now_v7();
        let (a, b) = (UserId::new(), UserId::new());
        assert_ne!(copy_key(key, a), copy_key(key, b));
        assert_eq!(copy_key(key, a), copy_key(key, a));
        assert_ne!(copy_key(key, a), key);
    }
}
