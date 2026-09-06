//! Shared run context handed to every domain runner.

use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;

use ab_clients::storage::StorageClient;
use ab_core::Result;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::idmap::IdMap;
use crate::report::{DomainReport, Drop};

/// Domain runners in FK-dependency order (MIGRATION §2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Domain {
    Users,
    Catalog,
    Assessments,
    Submissions,
    Analytics,
    Ai,
    Gamification,
    Trail,
    Files,
}

impl Domain {
    pub const ALL: [Self; 9] = [
        Self::Users,
        Self::Catalog,
        Self::Assessments,
        Self::Submissions,
        Self::Analytics,
        Self::Ai,
        Self::Gamification,
        Self::Trail,
        Self::Files,
    ];

    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Users => "users",
            Self::Catalog => "catalog",
            Self::Assessments => "assessments",
            Self::Submissions => "submissions",
            Self::Analytics => "analytics",
            Self::Ai => "ai",
            Self::Gamification => "gamification",
            Self::Trail => "trail",
            Self::Files => "files",
        }
    }
}

impl FromStr for Domain {
    type Err = String;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        Self::ALL
            .into_iter()
            .find(|d| d.name() == s)
            .ok_or_else(|| {
                format!(
                    "unknown domain '{s}' (expected one of: {})",
                    Self::ALL
                        .iter()
                        .map(|d| d.name())
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            })
    }
}

impl std::fmt::Display for Domain {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.name())
    }
}

pub struct Ctx {
    pub run_id: Uuid,
    pub source: PgPool,
    pub tx: Transaction<'static, Postgres>,
    pub idmap: IdMap,
    /// `--limit N`: cap every extraction at N rows (smoke runs).
    pub limit: Option<i64>,
    pub dry_run: bool,
    /// Legacy `content/` tree (backup `app_content`), for the files domain.
    pub files_root: Option<PathBuf>,
    pub storage: Option<Arc<StorageClient>>,
    /// Copy unreferenced legacy files to `quarantine/` (MIGRATION §4).
    pub quarantine_orphans: bool,
    pub report: DomainReport,
}

impl Ctx {
    pub fn drop_row(&mut self, entity: &str, legacy_key: impl ToString, reason: impl Into<String>) {
        let reason = reason.into();
        tracing::debug!(entity, key = %legacy_key.to_string(), %reason, "etl drop");
        self.report.dropped.push(Drop {
            entity: entity.to_owned(),
            legacy_key: legacy_key.to_string(),
            reason,
        });
    }

    pub fn note(&mut self, note: impl Into<String>) {
        let note = note.into();
        tracing::info!(domain = %self.report.domain, "{note}");
        self.report.notes.push(note);
    }

    pub fn source(&mut self, table: &str, n: usize) {
        self.report.source(table, n as u64);
    }

    pub fn wrote(&mut self, table: &str, n: usize) {
        self.report.wrote(table, n as u64);
    }

    /// Persist the drops of the current domain into `etl_drop_log`.
    pub async fn flush_drops(&mut self) -> Result<()> {
        let domain = self.report.domain.clone();
        let drops = std::mem::take(&mut self.report.dropped);
        for chunk in drops.chunks(500) {
            let entities: Vec<String> = chunk.iter().map(|d| d.entity.clone()).collect();
            let keys: Vec<String> = chunk.iter().map(|d| d.legacy_key.clone()).collect();
            let reasons: Vec<String> = chunk.iter().map(|d| d.reason.clone()).collect();
            sqlx::query!(
                r#"INSERT INTO etl_drop_log (run_id, domain, entity, legacy_key, reason)
                   SELECT $1, $2, e, k, r FROM UNNEST($3::text[], $4::text[], $5::text[]) AS t(e, k, r)"#,
                self.run_id,
                domain,
                &entities,
                &keys,
                &reasons
            )
            .execute(&mut *self.tx)
            .await?;
        }
        self.report.dropped = drops;
        Ok(())
    }
}
