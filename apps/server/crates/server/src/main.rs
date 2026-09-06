//! `ashyq` — the single binary. Subcommands select the process role; the
//! compose services differ only by command (ARCHITECTURE §2).

use std::io::Write;

use ab_api::AppState;
use ab_core::config::Config;
use clap::{Parser, Subcommand};
use tokio_util::sync::CancellationToken;

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[derive(Parser)]
#[command(name = "ashyq", version, about = "Ashyq Bilim server")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run the HTTP API.
    Serve,
    /// Run the background worker (job queue + cron leader).
    Worker,
    /// Apply pending database migrations, then exit.
    Migrate,
    /// Print the OpenAPI 3.1 document to stdout (no config/DB needed).
    Openapi,
    /// Operational commands.
    Admin {
        #[command(subcommand)]
        command: AdminCommand,
    },
}

#[derive(Subcommand)]
enum AdminCommand {
    /// Print the effective configuration with secrets redacted.
    ConfigCheck,
    /// Verify Zitadel reachability + PAT validity (cutover runbook step).
    ZitadelCheck,
    /// Patch Judge0's `languages` table with the sandbox-safe compiler and
    /// run commands (Go, Java, Kotlin). Idempotent; run once per Judge0 DB.
    Judge0Tune,
    /// Rebuild activity/course progress projections from current submission
    /// state — every course, or one `--course <uuid>`. Idempotent.
    ProgressBackfill {
        #[arg(long)]
        course: Option<String>,
    },
    /// Rebuild the analytics daily rollups and risk snapshots for every UTC
    /// day in `--from ..= --to` (`YYYY-MM-DD`; both default to today).
    /// Idempotent: each day's rows are replaced.
    AnalyticsRollup {
        #[arg(long)]
        from: Option<String>,
        #[arg(long)]
        to: Option<String>,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let cli = Cli::parse();

    // `openapi` is deliberately config-free so CI and codegen never need env.
    if matches!(cli.command, Command::Openapi) {
        let doc = ab_api::openapi_doc();
        writeln!(std::io::stdout(), "{}", serde_json::to_string_pretty(&doc)?)?;
        return Ok(());
    }

    let config = Config::load()?;
    let _telemetry = ab_core::telemetry::init(&config.telemetry);

    match cli.command {
        Command::Openapi => unreachable!("handled above"),
        Command::Serve => serve(config).await,
        Command::Worker => worker(config).await,
        Command::Migrate => migrate(config).await,
        Command::Admin {
            command: AdminCommand::ConfigCheck,
        } => {
            writeln!(
                std::io::stdout(),
                "{}",
                serde_json::to_string_pretty(&config.redacted())?
            )?;
            Ok(())
        }
        Command::Admin {
            command: AdminCommand::ProgressBackfill { course },
        } => {
            let course = course
                .map(|c| c.parse::<ab_core::id::CourseId>())
                .transpose()
                .map_err(|e| anyhow::anyhow!("--course must be a uuid: {e}"))?;
            let pool = ab_db::connect(&config.database).await?;
            let report = ab_domain::progress::ProgressProjector::new(pool)
                .backfill(course)
                .await?;
            writeln!(
                std::io::stdout(),
                "progress backfilled: {} course(s), {} learner(s), {} activity row(s)",
                report.courses,
                report.learners,
                report.activity_rows
            )?;
            Ok(())
        }
        Command::Admin {
            command: AdminCommand::AnalyticsRollup { from, to },
        } => analytics_rollup(config, from, to).await,
        Command::Admin {
            command: AdminCommand::Judge0Tune,
        } => {
            let url = config
                .judge0
                .as_ref()
                .and_then(|j| j.database_url.clone())
                .ok_or_else(|| anyhow::anyhow!("AB__JUDGE0__DATABASE_URL must be set"))?;
            let report =
                ab_domain::code::tune::apply(secrecy::ExposeSecret::expose_secret(&url)).await?;
            writeln!(
                std::io::stdout(),
                "judge0 languages patched: {} row(s) updated across {} statement(s)",
                report.rows_updated,
                report.statements
            )?;
            Ok(())
        }
        Command::Admin {
            command: AdminCommand::ZitadelCheck,
        } => {
            let zitadel_config = config
                .zitadel
                .ok_or_else(|| anyhow::anyhow!("AB__ZITADEL__* must be set"))?;
            let client =
                ab_clients::zitadel::ZitadelClient::new(ab_clients::zitadel::ZitadelConfig {
                    base_url: zitadel_config.base_url.clone(),
                    pat: zitadel_config.pat,
                })?;
            let (id, name) = client.org_info().await?;
            writeln!(
                std::io::stdout(),
                "zitadel OK at {} — org {name} ({id})",
                zitadel_config.base_url
            )?;
            Ok(())
        }
    }
}

async fn serve(config: Config) -> anyhow::Result<()> {
    let pool = ab_db::connect(&config.database).await?;
    let pending = ab_db::MIGRATOR.iter().len();
    tracing::info!(migrations = pending, "database connected");

    // Sessions + Zitadel are the API's credential path — refuse to serve
    // without either (fail-fast, ARCHITECTURE §16).
    let redis_url = config
        .redis
        .url
        .clone()
        .ok_or_else(|| anyhow::anyhow!("AB__REDIS__URL must be set: sessions require Redis"))?;
    let sessions = ab_domain::identity::SessionStore::connect(
        secrecy::ExposeSecret::expose_secret(&redis_url),
    )
    .await?;
    let zitadel_config = config
        .zitadel
        .clone()
        .ok_or_else(|| anyhow::anyhow!("AB__ZITADEL__BASE_URL / AB__ZITADEL__PAT must be set"))?;
    let zitadel = std::sync::Arc::new(ab_clients::zitadel::ZitadelClient::new(
        ab_clients::zitadel::ZitadelConfig {
            base_url: zitadel_config.base_url,
            pat: zitadel_config.pat,
        },
    )?);
    let identity =
        ab_domain::identity::IdentityService::new(pool.clone(), sessions.clone(), zitadel.clone());
    let google = if let Some(g) = config.google.clone() {
        Some(ab_domain::identity::GoogleAuthService::new(
            pool.clone(),
            sessions,
            zitadel,
            std::sync::Arc::new(ab_clients::google::GoogleClient::new(
                ab_clients::google::GoogleConfig {
                    client_id: g.client_id,
                    client_secret: g.client_secret,
                    redirect_uri: g.redirect_uri,
                    token_endpoint: None,
                    userinfo_endpoint: None,
                    authorization_endpoint: None,
                },
            )?),
        ))
    } else {
        tracing::info!("google login not configured (AB__GOOGLE__* unset)");
        None
    };

    let storage = build_storage(&config)?;
    let judge0 = build_judge0(&config)?;

    let addr = format!("{}:{}", config.server.host, config.server.port);
    let router = ab_api::build_router(AppState::new(
        pool, config, identity, google, storage, judge0,
    ))?;
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(%addr, "ashyq serving");
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    tracing::info!("server drained and stopped");
    Ok(())
}

/// Storage is required by serve (uploads) and worker (reaper).
fn build_storage(
    config: &Config,
) -> anyhow::Result<std::sync::Arc<ab_clients::storage::StorageClient>> {
    let settings = config
        .storage
        .clone()
        .ok_or_else(|| anyhow::anyhow!("AB__STORAGE__* must be set"))?;
    Ok(std::sync::Arc::new(
        ab_clients::storage::StorageClient::new(&ab_clients::storage::StorageConfig {
            endpoint: settings.endpoint,
            access_key: settings.access_key,
            secret_key: settings.secret_key,
            public_bucket: settings.public_bucket,
            private_bucket: settings.private_bucket,
        })?,
    ))
}

/// Judge0 is optional: without `AB__JUDGE0__BASE_URL` code runs answer 503
/// and code challenges are graded by hand.
fn build_judge0(
    config: &Config,
) -> anyhow::Result<Option<std::sync::Arc<ab_clients::judge0::Judge0Client>>> {
    let Some(settings) = config.judge0.clone() else {
        tracing::info!("code execution not configured (AB__JUDGE0__* unset)");
        return Ok(None);
    };
    Ok(Some(std::sync::Arc::new(
        ab_clients::judge0::Judge0Client::new(ab_clients::judge0::Judge0Config {
            base_url: settings.base_url,
            api_key: settings.api_key,
            request_timeout: std::time::Duration::from_secs_f64(settings.request_timeout_secs),
            poll_interval: std::time::Duration::from_millis(settings.poll_interval_ms),
            poll_max_wait: std::time::Duration::from_secs_f64(settings.poll_max_wait_secs),
        })?,
    )))
}

async fn worker(config: Config) -> anyhow::Result<()> {
    let pool = ab_db::connect(&config.database).await?;
    let storage = build_storage(&config)?;
    // SSE fan-out from the worker (deadline extensions) needs Redis; the
    // worker still runs without it.
    let events = match &config.redis.url {
        Some(url) => {
            let sessions = ab_domain::identity::SessionStore::connect(
                secrecy::ExposeSecret::expose_secret(url),
            )
            .await?;
            Some(ab_domain::events::GradingEvents::new(
                sessions.client(),
                sessions.redis(),
            ))
        }
        None => None,
    };
    let runner = ab_domain::code::CodeRunner::new(
        pool.clone(),
        build_judge0(&config)?,
        config
            .judge0
            .as_ref()
            .map(|j| j.limits.clone())
            .unwrap_or_default(),
    );

    // Recurring schedules are seeded idempotently at boot.
    ab_db::schedule::upsert(
        &pool,
        ab_jobs::handlers::uploads::KIND,
        std::time::Duration::from_hours(6),
        serde_json::json!({}),
    )
    .await?;
    ab_db::schedule::upsert(
        &pool,
        ab_jobs::handlers::assessments::KIND,
        std::time::Duration::from_mins(1),
        serde_json::json!({}),
    )
    .await?;
    ab_db::schedule::upsert(
        &pool,
        ab_jobs::handlers::submissions::AUTO_SUBMIT_KIND,
        std::time::Duration::from_mins(1),
        serde_json::json!({}),
    )
    .await?;
    ab_db::schedule::upsert(
        &pool,
        ab_jobs::handlers::submissions::SWEEP_IDEMPOTENCY_KIND,
        std::time::Duration::from_hours(1),
        serde_json::json!({}),
    )
    .await?;
    ab_db::schedule::upsert(
        &pool,
        ab_jobs::handlers::analytics::KIND,
        std::time::Duration::from_hours(6),
        serde_json::json!({}),
    )
    .await?;

    let worker = ab_jobs::Worker::new(pool.clone(), ab_jobs::WorkerConfig::default())
        .register(ab_jobs::handlers::uploads::UploadsReaper::new(
            pool.clone(),
            storage,
        ))?
        .register(ab_jobs::handlers::assessments::AssessmentPublisher::new(
            pool.clone(),
        ))?
        .register(ab_jobs::handlers::submissions::AutoSubmitter::new(runner))?
        .register(ab_jobs::handlers::submissions::IdempotencySweeper::new(
            pool.clone(),
        ))?
        .register(ab_jobs::handlers::analytics::AnalyticsRollup::new(
            pool.clone(),
        ))?
        .register(ab_jobs::handlers::grading::BulkActionRunner::new(
            pool, events,
        ))?;
    let cancel = CancellationToken::new();
    let handle = tokio::spawn(worker.run(cancel.clone()));
    shutdown_signal().await;
    cancel.cancel();
    handle.await??;
    Ok(())
}

/// `admin analytics-rollup`: rebuild every UTC day in `[from, to]`
/// (both default to today) and print one line per day.
async fn analytics_rollup(
    config: Config,
    from: Option<String>,
    to: Option<String>,
) -> anyhow::Result<()> {
    let today = ab_domain::analytics::context::utc_date(ab_domain::analytics::context::now_unix());
    let from = from.unwrap_or_else(|| today.clone());
    let to = to.unwrap_or(today);
    let pool = ab_db::connect(&config.database).await?;
    let report = ab_domain::analytics::AnalyticsService::new(pool)
        .run_rollup_range(&from, &to)
        .await?;
    for (date, counts) in &report {
        writeln!(
            std::io::stdout(),
            "{date}: {} course, {} engagement, {} learner-course, {} risk, {} assessment, {} teacher row(s)",
            counts.course_rows,
            counts.engagement_rows,
            counts.progress_rows,
            counts.risk_rows,
            counts.assessment_rows,
            counts.teacher_rows
        )?;
    }
    Ok(())
}

async fn migrate(config: Config) -> anyhow::Result<()> {
    let pool = ab_db::connect(&config.database).await?;
    ab_db::MIGRATOR.run(&pool).await?;
    tracing::info!("migrations applied");
    Ok(())
}

/// Resolves on Ctrl-C or SIGTERM (compose stop). Serve drains in-flight
/// requests; the worker finishes claimed jobs.
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut sigterm = match signal(SignalKind::terminate()) {
            Ok(sig) => sig,
            Err(err) => {
                tracing::error!(%err, "failed to install SIGTERM handler");
                std::future::pending::<()>().await;
                return;
            }
        };
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = sigterm.recv() => {},
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
    tracing::info!("shutdown signal received");
}
