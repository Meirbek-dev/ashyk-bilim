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

    let addr = format!("{}:{}", config.server.host, config.server.port);
    let router = ab_api::build_router(AppState::new(pool, config, identity, google, storage))?;
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

async fn worker(config: Config) -> anyhow::Result<()> {
    let pool = ab_db::connect(&config.database).await?;
    let storage = build_storage(&config)?;

    // Recurring schedules are seeded idempotently at boot.
    ab_db::schedule::upsert(
        &pool,
        ab_jobs::handlers::uploads::KIND,
        std::time::Duration::from_hours(6),
        serde_json::json!({}),
    )
    .await?;

    let worker = ab_jobs::Worker::new(pool.clone(), ab_jobs::WorkerConfig::default()).register(
        ab_jobs::handlers::uploads::UploadsReaper::new(pool, storage),
    )?;
    let cancel = CancellationToken::new();
    let handle = tokio::spawn(worker.run(cancel.clone()));
    shutdown_signal().await;
    cancel.cancel();
    handle.await??;
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
