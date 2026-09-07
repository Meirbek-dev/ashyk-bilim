//! ETL orchestration and transaction boundary.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use ab_clients::storage::StorageClient;
use ab_core::{Error, Result};
use secrecy::{ExposeSecret, SecretString};
use serde::Serialize;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

use crate::ctx::{Ctx, Domain};
use crate::idmap::IdMap;
use crate::report::{DomainReport, Report};

/// Inputs for one deterministic legacy-to-v2 load.
pub struct EtlOptions {
    pub source_url: SecretString,
    pub target: PgPool,
    pub domain: Option<Domain>,
    pub limit: Option<i64>,
    pub dry_run: bool,
    pub files_root: Option<PathBuf>,
    pub storage: Option<Arc<StorageClient>>,
    pub quarantine_orphans: bool,
}

#[derive(Serialize)]
struct StoredOptions {
    domain: Option<String>,
    limit: Option<i64>,
    dry_run: bool,
    files: bool,
    quarantine_orphans: bool,
}

/// Run selected domains inside one target transaction.
pub async fn run(options: EtlOptions) -> Result<Report> {
    if options.limit.is_some_and(|limit| limit <= 0) {
        return Err(Error::config("ETL --limit must be greater than zero"));
    }

    let started = Instant::now();
    let source = PgPoolOptions::new()
        .max_connections(2)
        .connect(options.source_url.expose_secret())
        .await?;
    let mut tx = options.target.begin().await?;
    let run_id = Uuid::now_v7();
    let stored_options = serde_json::to_value(StoredOptions {
        domain: options.domain.map(|domain| domain.name().to_owned()),
        limit: options.limit,
        dry_run: options.dry_run,
        files: options.files_root.is_some(),
        quarantine_orphans: options.quarantine_orphans,
    })
    .map_err(|error| Error::internal("serializing ETL options", error))?;
    sqlx::query("INSERT INTO etl_runs (id, options) VALUES ($1, $2)")
        .bind(run_id)
        .bind(stored_options)
        .execute(&mut *tx)
        .await?;

    let idmap = IdMap::load(&mut tx).await?;
    let mut ctx = Ctx {
        run_id,
        source,
        tx,
        idmap,
        limit: options.limit,
        dry_run: options.dry_run,
        files_root: options.files_root,
        storage: options.storage,
        quarantine_orphans: options.quarantine_orphans,
        report: DomainReport::new("initializing"),
    };
    let selected = options
        .domain
        .map_or_else(|| Domain::ALL.to_vec(), |domain| vec![domain]);
    let mut reports = Vec::with_capacity(selected.len());
    for domain in selected {
        let domain_started = Instant::now();
        ctx.report = DomainReport::new(domain.name());
        crate::domains::run(&mut ctx, domain).await?;
        ctx.idmap.flush(&mut ctx.tx).await?;
        ctx.flush_drops().await?;
        ctx.report.duration_ms = millis(domain_started.elapsed());
        reports.push(std::mem::replace(
            &mut ctx.report,
            DomainReport::new("finished"),
        ));
    }

    let verification = if options.domain.is_none() {
        Some(crate::verify::run(&mut ctx, &reports).await?)
    } else {
        None
    };
    let mut report = Report {
        run_id,
        dry_run: options.dry_run,
        domains: reports,
        verification,
        duration_ms: millis(started.elapsed()),
    };
    let ok = report.ok();
    let stored_report = serde_json::to_value(&report)
        .map_err(|error| Error::internal("serializing ETL report", error))?;
    sqlx::query("UPDATE etl_runs SET finished_at = now(), report = $2, ok = $3 WHERE id = $1")
        .bind(run_id)
        .bind(stored_report)
        .bind(ok)
        .execute(&mut *ctx.tx)
        .await?;

    report.duration_ms = millis(started.elapsed());
    if options.dry_run {
        ctx.tx.rollback().await?;
    } else {
        ctx.tx.commit().await?;
    }
    Ok(report)
}

fn millis(duration: std::time::Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}
