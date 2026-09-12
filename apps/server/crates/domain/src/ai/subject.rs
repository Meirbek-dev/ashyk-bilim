//! The work the submission analyst and the remediation generator look at:
//! an assessment submission or a file-submission attempt, behind one id
//! (`AiSubjectId`, looked up in both tables — DECISIONS 2026-09-12).

use ab_clients::storage::Bucket;
use ab_core::id::{ActivityId, AiSubjectId, CourseId, FileAttemptId, SubmissionId, UserId};
use ab_core::{Error, Result};
use ab_db::ai::{AiSubject, RunRow};
use ab_db::file_submissions::AttemptRow;
use ab_db::submissions::SubmissionRow;

use super::AiService;
use super::agents::metadata_optional_id;
use super::context::{self, ContextBundle};
use crate::identity::Actor;

/// Text content the context reads back from storage: only files the model
/// can use as-is (plain text, markdown, csv, json, source code by
/// `text/*`); PDFs and office documents are described, not extracted.
const TEXT_FILE_BYTES: usize = 16 * 1024;
const TEXT_TOTAL_BYTES: usize = 48 * 1024;

#[derive(Debug, Clone)]
pub enum Subject {
    Submission(SubmissionRow),
    FileAttempt(AttemptRow),
}

impl Subject {
    pub(crate) const fn id(&self) -> AiSubject {
        match self {
            Self::Submission(s) => AiSubject::Submission(s.id),
            Self::FileAttempt(a) => AiSubject::FileAttempt(a.id),
        }
    }

    pub(crate) const fn user_id(&self) -> UserId {
        match self {
            Self::Submission(s) => s.user_id,
            Self::FileAttempt(a) => a.user_id,
        }
    }

    pub(crate) const fn course_id(&self) -> CourseId {
        match self {
            Self::Submission(s) => s.course_id,
            Self::FileAttempt(a) => a.course_id,
        }
    }

    /// The run-metadata key naming the subject (one of the two).
    pub(crate) fn metadata(&self) -> serde_json::Value {
        match self {
            Self::Submission(s) => serde_json::json!({ "submission_id": s.id }),
            Self::FileAttempt(a) => serde_json::json!({ "file_submission_attempt_id": a.id }),
        }
    }
}

/// The subject a queued run was created for.
pub fn run_subject(run: &RunRow) -> Result<AiSubject> {
    if let Some(id) = metadata_optional_id::<SubmissionId>(run, "submission_id") {
        return Ok(AiSubject::Submission(id));
    }
    if let Some(id) = metadata_optional_id::<FileAttemptId>(run, "file_submission_attempt_id") {
        return Ok(AiSubject::FileAttempt(id));
    }
    Err(Error::conflict("ai run metadata lacks a subject"))
}

impl AiService {
    /// The record behind an id, whichever table holds it (404 otherwise).
    pub(crate) async fn load_subject(&self, id: AiSubjectId) -> Result<Subject> {
        if let Some(s) = ab_db::submissions::get_submission(&self.pool, SubmissionId(id.0)).await? {
            return Ok(Subject::Submission(s));
        }
        if let Some(a) =
            ab_db::file_submissions::get_attempt(&self.pool, FileAttemptId(id.0)).await?
        {
            return Ok(Subject::FileAttempt(a));
        }
        Err(Error::not_found("submission"))
    }

    pub(crate) async fn load_subject_by(&self, subject: AiSubject) -> Result<Subject> {
        match subject {
            AiSubject::Submission(id) => ab_db::submissions::get_submission(&self.pool, id)
                .await?
                .map(Subject::Submission)
                .ok_or_else(|| Error::not_found("submission")),
            AiSubject::FileAttempt(id) => ab_db::file_submissions::get_attempt(&self.pool, id)
                .await?
                .map(Subject::FileAttempt)
                .ok_or_else(|| Error::not_found("attempt")),
        }
    }

    /// Legacy `require_ai_submission_access`, for either subject kind: the
    /// owner, or someone who can update the course — anyone else gets 404
    /// (an id must not leak that it exists).
    pub(crate) async fn accessible_subject(
        &self,
        actor: &Actor,
        id: AiSubjectId,
    ) -> Result<Subject> {
        let subject = self.load_subject(id).await?;
        self.require_subject_access(actor, &subject).await?;
        Ok(subject)
    }

    pub(crate) async fn require_subject_access(
        &self,
        actor: &Actor,
        subject: &Subject,
    ) -> Result<()> {
        if subject.user_id() == actor.user_id {
            return Ok(());
        }
        let visible = self.courses.get(actor, subject.course_id()).await?;
        super::policy::require_course_update(actor, &visible)
            .map_err(|_| Error::not_found("submission"))
    }

    /// The activity the subject belongs to.
    pub(crate) async fn subject_activity(&self, subject: &Subject) -> Result<ActivityId> {
        match subject {
            Subject::Submission(s) => {
                ab_db::assessments::get_assessment(&self.pool, s.assessment_id)
                    .await?
                    .map(|a| a.activity_id)
                    .ok_or_else(|| Error::not_found("assessment"))
            }
            Subject::FileAttempt(a) => {
                ab_db::file_submissions::get_file_submission(&self.pool, a.file_submission_id)
                    .await?
                    .map(|f| f.activity_id)
                    .ok_or_else(|| Error::not_found("file submission"))
            }
        }
    }

    /// The context bundle + run metadata for the subject.
    pub(crate) async fn subject_bundle(
        &self,
        subject: &Subject,
    ) -> Result<(ContextBundle, serde_json::Value)> {
        match subject {
            Subject::Submission(s) => context::submission_bundle(&self.pool, s).await,
            Subject::FileAttempt(a) => {
                let files = ab_db::file_submissions::list_files(&self.pool, a.id).await?;
                let mut texts = Vec::with_capacity(files.len());
                let mut budget = TEXT_TOTAL_BYTES;
                for file in &files {
                    let text = match &self.storage {
                        Some(storage) if budget > 0 && is_text(&file.content_type) => {
                            match storage.get(Bucket::Private, &file.storage_key).await {
                                Ok(Some(bytes)) => {
                                    let take = bytes.len().min(TEXT_FILE_BYTES).min(budget);
                                    budget -= take;
                                    Some(String::from_utf8_lossy(&bytes[..take]).into_owned())
                                }
                                Ok(None) => None,
                                // Described by name only; the analysis still runs.
                                Err(error) => {
                                    tracing::warn!(%error, key = %file.storage_key,
                                        "submitted file unreadable for the AI context");
                                    None
                                }
                            }
                        }
                        _ => None,
                    };
                    texts.push(text);
                }
                context::attempt_bundle(&self.pool, a, &files, &texts).await
            }
        }
    }
}

fn is_text(content_type: &str) -> bool {
    let media = content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    media.starts_with("text/")
        || matches!(
            media.as_str(),
            "application/json" | "application/xml" | "application/x-yaml" | "application/yaml"
        )
}

#[cfg(test)]
mod tests {
    use super::is_text;

    #[test]
    fn text_types_are_read_back() {
        assert!(is_text("text/markdown; charset=utf-8"));
        assert!(is_text("application/json"));
        assert!(!is_text("application/pdf"));
        assert!(!is_text("image/png"));
    }
}
