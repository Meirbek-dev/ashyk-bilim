use std::collections::HashSet;
use std::fmt::Write as _;

use ab_core::{Error, Result};
use sha2::{Digest, Sha256};

use crate::ctx::Ctx;

pub async fn run(ctx: &mut Ctx) -> Result<()> {
    if ctx.files_root.is_none() {
        ctx.note("files root not supplied; object copy skipped");
    } else {
        copy_objects(ctx).await?;
    }
    record_deliberate_drops(ctx).await
}

async fn copy_objects(ctx: &mut Ctx) -> Result<()> {
    let root = ctx
        .files_root
        .clone()
        .ok_or_else(|| Error::config("missing files root"))?;
    let storage = ctx
        .storage
        .clone()
        .ok_or_else(|| Error::config("ETL files root requires object-storage configuration"))?;
    let mut pending = vec![root.clone()];
    let referenced = referenced_keys(ctx).await?;
    let mut found = 0usize;
    let mut written = 0usize;
    let mut quarantined = 0usize;
    while let Some(path) = pending.pop() {
        let mut entries = tokio::fs::read_dir(&path).await.map_err(|error| {
            Error::internal(format!("reading legacy files at {}", path.display()), error)
        })?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|error| Error::internal("reading legacy directory entry", error))?
        {
            let file_type = entry
                .file_type()
                .await
                .map_err(|error| Error::internal("reading legacy file type", error))?;
            if file_type.is_dir() {
                pending.push(entry.path());
                continue;
            }
            if !file_type.is_file() {
                continue;
            }
            found += 1;
            let path = entry.path();
            let relative = path
                .strip_prefix(&root)
                .map_err(|error| Error::internal("resolving legacy file path", error))?
                .to_string_lossy();
            let Some(mut target) = crate::transform::files::classify(&relative) else {
                ctx.drop_row("file", relative, "unsafe object path");
                continue;
            };
            if ctx.quarantine_orphans && !referenced.contains(&target.key) {
                target.bucket = ab_clients::storage::Bucket::Private;
                target.key = format!("quarantine/{}", target.key);
                quarantined += 1;
            }
            let bytes = tokio::fs::read(&path).await.map_err(|error| {
                Error::internal(format!("reading legacy file {}", path.display()), error)
            })?;
            let size = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
            let digest = Sha256::digest(&bytes).iter().fold(
                String::with_capacity(64),
                |mut output, byte| {
                    let _ = write!(output, "{byte:02x}");
                    output
                },
            );
            storage.put(target.bucket, &target.key, bytes).await?;
            let stored_size = storage.head(target.bucket, &target.key).await?;
            if stored_size != Some(size) {
                return Err(Error::config(format!(
                    "object verification failed for {}: source size {size}, stored {stored_size:?}",
                    target.key
                )));
            }
            let stored = storage
                .get(target.bucket, &target.key)
                .await?
                .ok_or_else(|| {
                    Error::config(format!("uploaded object {} disappeared", target.key))
                })?;
            let stored_digest = Sha256::digest(&stored).iter().fold(
                String::with_capacity(64),
                |mut output, byte| {
                    let _ = write!(output, "{byte:02x}");
                    output
                },
            );
            if stored_digest != digest {
                return Err(Error::config(format!(
                    "object SHA-256 verification failed for {}",
                    target.key
                )));
            }
            tracing::debug!(key = %target.key, sha256 = %digest, size, "legacy object copied");
            written += 1;
        }
    }
    ctx.source("files", found);
    ctx.wrote("files", written);
    if ctx.quarantine_orphans {
        ctx.note(format!(
            "{quarantined} unreferenced file(s) preserved under private/quarantine/"
        ));
    }
    Ok(())
}

async fn referenced_keys(ctx: &Ctx) -> Result<HashSet<String>> {
    let paths = sqlx::query_scalar::<_, String>(concat!(
        "SELECT avatar_image FROM \"user\" WHERE avatar_image IS NOT NULL ",
        "UNION ALL SELECT logo_image FROM platform WHERE logo_image IS NOT NULL ",
        "UNION ALL SELECT thumbnail_image FROM platform WHERE thumbnail_image IS NOT NULL ",
        "UNION ALL SELECT thumbnail_image FROM course WHERE thumbnail_image IS NOT NULL ",
        "UNION ALL SELECT thumbnail_video FROM course WHERE thumbnail_video IS NOT NULL ",
        "UNION ALL SELECT thumbnail_image FROM chapter WHERE thumbnail_image IS NOT NULL ",
        "UNION ALL SELECT storage_key FROM upload WHERE storage_key IS NOT NULL ",
        "UNION ALL SELECT storage_key FROM file_submission_attempt_file WHERE storage_key IS NOT NULL"
    ))
    .fetch_all(&ctx.source)
    .await?;
    Ok(paths
        .into_iter()
        .filter(|path| !path.starts_with("http://") && !path.starts_with("https://"))
        .filter_map(|path| crate::transform::files::normalize(&path))
        .collect())
}

async fn record_deliberate_drops(ctx: &mut Ctx) -> Result<()> {
    for (table, reason) in crate::legacy::DROPPED_TABLES {
        let count = crate::legacy::count(&ctx.source, table).await?;
        ctx.report
            .source(table, u64::try_from(count).unwrap_or_default());
        for index in 1..=count {
            ctx.drop_row(table, format!("row#{index}"), *reason);
        }
    }
    Ok(())
}
