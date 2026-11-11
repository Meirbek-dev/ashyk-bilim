//! The one write path of a message, shared by a send and a bulk send: limits,
//! the pair's conversation, the row, its files and the analytics
//! intervention, all in the caller's transaction (docs/DIALOGS.md 5, 12).

use ab_core::id::{ActivityId, ConversationId, CourseId, MessageId, UserId};
use ab_core::{Error, FieldError, Result};
use ab_db::messages as db;
use sqlx::PgConnection;
use uuid::Uuid;

use super::{
    ATTACHMENT_PURPOSE, MessagesService, NEW_PER_DAY, NEW_PER_DAY_STAFF, PER_DAY, PER_MINUTE,
    READ_PLATFORM, rate_limited,
};
use crate::events::user;
use crate::identity::Actor;

/// One message to write.
pub(super) struct Outgoing<'a> {
    pub to: UserId,
    pub body: &'a str,
    pub client_key: Uuid,
    pub course: Option<CourseId>,
    pub activity: Option<ActivityId>,
    /// Claimed uploads with their names, in order.
    pub files: &'a [(Uuid, String)],
    pub intervention: bool,
}

/// A message [`MessagesService::deliver`] wrote, or found under its key.
pub(super) struct Delivered {
    pub conversation: ConversationId,
    pub message: MessageId,
    /// `false` for a resend that found the stored message.
    pub new: bool,
}

impl Delivered {
    /// Tell both sides (after the commit).
    pub async fn announce(&self, from: UserId, to: UserId) {
        if self.new {
            user::message_created(
                [from, to],
                user::MessageCreated {
                    conversation_id: self.conversation,
                    message_id: self.message,
                    user_id: from,
                },
            )
            .await;
        }
    }
}

/// The new conversations the sender may still start today.
pub(super) struct Budget {
    started: i64,
    cap: i64,
    frees_in: i64,
}

impl Budget {
    /// Under the sender's lock: refuse `messages` more sends past the minute
    /// or day limit (a bulk send is one action a minute, every copy counts
    /// a day), and read today's new-conversation allowance.
    pub async fn read(tx: &mut PgConnection, actor: &Actor, messages: i64) -> Result<Self> {
        let counts = db::send_counts(&mut *tx, actor.user_id).await?;
        if counts.last_minute >= PER_MINUTE {
            return Err(rate_limited("minute", counts.minute_frees_in));
        }
        if counts.last_day + messages > PER_DAY {
            return Err(rate_limited("day", counts.day_frees_in));
        }
        let cap = if actor.has(READ_PLATFORM) || db::on_some_team(&mut *tx, actor.user_id).await? {
            NEW_PER_DAY_STAFF
        } else {
            NEW_PER_DAY
        };
        Ok(Self {
            started: counts.started_today,
            cap,
            frees_in: counts.start_frees_in,
        })
    }

    fn take(&mut self) -> Result<()> {
        if self.started >= self.cap {
            return Err(rate_limited("conversations", self.frees_in));
        }
        self.started += 1;
        Ok(())
    }
}

impl MessagesService {
    /// Claim the sender's finalized `message-attachment` uploads (locked in
    /// key order, the order every multi-upload write takes).
    pub(super) async fn claim_files(
        &self,
        tx: &mut PgConnection,
        actor: &Actor,
        files: &[(Uuid, String)],
    ) -> Result<()> {
        if files.is_empty() {
            return Ok(());
        }
        let ids: Vec<Uuid> = files.iter().map(|(id, _)| *id).collect();
        ab_db::uploads::lock_in_key_order(&mut *tx, &ids).await?;
        for id in ids {
            crate::files::uploads::claim_upload(
                &mut *tx,
                actor,
                id,
                ATTACHMENT_PURPOSE,
                "attachments",
            )
            .await?;
        }
        Ok(())
    }

    /// `intervention: true` needs the course context, a sender who teaches
    /// that course (or an administrator) and learners of it as recipients.
    pub(super) async fn require_intervention(
        &self,
        actor: &Actor,
        course: Option<CourseId>,
        learners: &[UserId],
    ) -> Result<()> {
        let invalid = |message: &str| {
            Error::validation(vec![FieldError {
                field: "intervention".into(),
                code: "invalid".into(),
                message: message.into(),
            }])
        };
        let Some(course) = course else {
            return Err(invalid("an intervention needs the course_id context"));
        };
        if !actor.has(READ_PLATFORM) && !db::teaches(&self.pool, actor.user_id, course).await? {
            return Err(invalid("only the course's teachers record interventions"));
        }
        let found = db::learners_of(&self.pool, course, learners).await?;
        if learners.iter().any(|l| !found.contains(l)) {
            return Err(invalid("the recipient is not a learner of the course"));
        }
        Ok(())
    }

    /// Write `out` in the caller's transaction (the sender's lock held).
    /// `None` when the pair's conversation appeared meanwhile: the caller
    /// rolls back and retries.
    pub(super) async fn deliver(
        &self,
        tx: &mut PgConnection,
        actor: &Actor,
        out: &Outgoing<'_>,
        budget: &mut Budget,
    ) -> Result<Option<Delivered>> {
        db::lock_pair(&mut *tx, actor.user_id, out.to).await?;
        if let Some(message) = db::by_client_key(&mut *tx, actor.user_id, out.client_key).await? {
            let conversation = db::get_message(&mut *tx, message, actor.user_id)
                .await?
                .ok_or_else(|| Error::not_found("message"))?
                .conversation_id;
            return Ok(Some(Delivered {
                conversation,
                message,
                new: false,
            }));
        }
        let conversation = if let Some(id) =
            db::conversation_with(&mut *tx, actor.user_id, out.to).await?
        {
            id
        } else {
            budget.take()?;
            let Some(id) = db::create_conversation(&mut *tx, actor.user_id, out.to).await? else {
                return Ok(None);
            };
            id
        };
        let message = db::insert_message(
            &mut *tx,
            db::NewMessage {
                conversation,
                user: actor.user_id,
                body: out.body,
                client_key: out.client_key,
                course: out.course,
                activity: out.activity,
            },
        )
        .await?;
        db::attach(&mut *tx, message, out.files).await?;
        if let (true, Some(course)) = (out.intervention, out.course) {
            let risk = ab_db::analytics::latest_risk_score(&mut *tx, out.to, course).await?;
            let payload = serde_json::json!({ "message_id": message });
            ab_db::analytics::insert_intervention(
                &mut *tx,
                ab_db::analytics::NewIntervention {
                    teacher_user_id: actor.user_id,
                    user_id: out.to,
                    course_id: course,
                    intervention_type: "message_sent",
                    status: "completed",
                    outcome: None,
                    outcome_code: None,
                    notes: None,
                    risk_score_before: risk,
                    risk_score_after: None,
                    payload: &payload,
                    resolved: false,
                },
            )
            .await?;
        }
        Ok(Some(Delivered {
            conversation,
            message,
            new: true,
        }))
    }
}
