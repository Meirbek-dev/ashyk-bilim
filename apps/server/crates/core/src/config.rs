//! Typed configuration, loaded from embedded defaults + `AB__*` environment.
//!
//! Convention: `AB__SECTION__KEY` (nested via `__`), e.g. `AB__DATABASE__URL`.
//! List values use TOML array syntax: `AB__SERVER__CORS_ORIGINS=["https://a"]`.
//! Startup is fail-fast: a config that parses but violates posture rules
//! (see [`Config::validate`]) refuses to boot.

use figment::Figment;
use figment::providers::{Env, Serialized};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

pub const ENV_PREFIX: &str = "AB__";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Environment {
    Development,
    Production,
}

impl Environment {
    #[must_use]
    pub const fn is_production(self) -> bool {
        matches!(self, Self::Production)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub environment: Environment,
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    /// Required by `serve` (authentication); optional for other subcommands.
    pub zitadel: Option<ZitadelConfig>,
    /// Google login is optional (password login works without it).
    pub google: Option<GoogleOauthConfig>,
    /// Required by `serve`/`worker` (uploads, media); optional elsewhere.
    pub storage: Option<StorageSettings>,
    /// Code execution. Unset = code runs answer 503 `code-runner-degraded`
    /// and code challenges fall back to manual review.
    pub judge0: Option<Judge0Config>,
    /// AI subsystem (`AB__AI__*`). Always present; without an OpenAI key (or
    /// with `ai_enabled=false`) every AI route answers 503 `ai-disabled`.
    #[serde(default)]
    pub ai: AiConfig,
    pub telemetry: TelemetryConfig,
}

/// Provider keys, models, budgets and feature flags. Field names and
/// defaults mirror the legacy `AIConfig` (`PLATFORM_AI_*` / `PLATFORM_OPENAI_*`).
#[allow(
    clippy::struct_excessive_bools,
    reason = "each flag is an independent operator switch mirrored from the legacy config"
)]
#[derive(Debug, Clone, Deserialize)]
pub struct AiConfig {
    pub openai_api_key: Option<SecretString>,
    #[serde(default = "AiConfig::default_openai_model")]
    pub openai_model: String,
    /// OpenAI-compatible origin + version prefix, no trailing slash. Tests
    /// point it at a wiremock fake.
    #[serde(default = "AiConfig::default_openai_base_url")]
    pub openai_base_url: String,
    pub openrouter_api_key: Option<SecretString>,
    #[serde(default = "AiConfig::default_openrouter_model")]
    pub openrouter_model: String,
    #[serde(default = "AiConfig::default_openrouter_base_url")]
    pub openrouter_base_url: String,
    /// Hard per-call timeout for the primary provider (legacy: 5s, fail fast
    /// so a rate-limited key cannot eat the 30s request budget).
    #[serde(default = "AiConfig::default_openai_timeout_secs")]
    pub openai_timeout_secs: f64,
    /// Hard per-call timeout for the fallback provider (legacy: 25s).
    #[serde(default = "AiConfig::default_openrouter_timeout_secs")]
    pub openrouter_timeout_secs: f64,
    #[serde(default = "AiConfig::default_max_tokens_per_request")]
    pub max_tokens_per_request: u32,
    #[serde(default = "AiConfig::default_max_output_tokens")]
    pub max_output_tokens: u32,
    #[serde(default = "AiConfig::default_monthly_token_budget")]
    pub monthly_token_budget: i64,
    #[serde(default = "AiConfig::default_true")]
    pub ai_enabled: bool,
    #[serde(default = "AiConfig::default_true")]
    pub course_analysis_enabled: bool,
    #[serde(default = "AiConfig::default_true")]
    pub submission_analysis_enabled: bool,
    #[serde(default = "AiConfig::default_true")]
    pub remediation_enabled: bool,
    #[serde(default = "AiConfig::default_true")]
    pub course_qa_enabled: bool,
    #[serde(default = "AiConfig::default_true")]
    pub study_companion_enabled: bool,
    #[serde(default = "AiConfig::default_true")]
    pub lecture_authoring_enabled: bool,
    /// Without a reachable provider, agents answer with deterministic draft
    /// artifacts instead of failing (legacy `ai_draft_mode_enabled`).
    #[serde(default = "AiConfig::default_true")]
    pub ai_draft_mode_enabled: bool,
    #[serde(default = "AiConfig::default_true")]
    pub semantic_memory_enabled: bool,
    #[serde(default = "AiConfig::default_analysis_requests_per_hour")]
    pub analysis_requests_per_hour_per_user: u32,
    #[serde(default = "AiConfig::default_remediation_requests_per_hour")]
    pub remediation_requests_per_hour_per_user: u32,
}

impl AiConfig {
    fn default_openai_model() -> String {
        "gpt-5.6-luna".into()
    }
    fn default_openai_base_url() -> String {
        "https://api.openai.com/v1".into()
    }
    fn default_openrouter_model() -> String {
        "deepseek/deepseek-v4-flash".into()
    }
    fn default_openrouter_base_url() -> String {
        "https://openrouter.ai/api/v1".into()
    }
    const fn default_openai_timeout_secs() -> f64 {
        5.0
    }
    const fn default_openrouter_timeout_secs() -> f64 {
        25.0
    }
    const fn default_max_tokens_per_request() -> u32 {
        32_000
    }
    const fn default_max_output_tokens() -> u32 {
        16_000
    }
    const fn default_monthly_token_budget() -> i64 {
        1_000_000
    }
    const fn default_true() -> bool {
        true
    }
    const fn default_analysis_requests_per_hour() -> u32 {
        10
    }
    const fn default_remediation_requests_per_hour() -> u32 {
        20
    }

    fn key_present(key: Option<&SecretString>) -> bool {
        key.is_some_and(|k| !k.expose_secret().trim().is_empty())
    }

    /// Legacy admin `provider_ready`: any provider key present.
    #[must_use]
    pub fn provider_ready(&self) -> bool {
        Self::key_present(self.openai_api_key.as_ref())
            || Self::key_present(self.openrouter_api_key.as_ref())
    }

    /// Legacy `ModelProvider.enabled()` (master switch + a key). The legacy
    /// insisted on the OpenAI key specifically; v2 accepts any configured
    /// provider so an OpenRouter-only deployment is not stuck in draft mode.
    #[must_use]
    pub fn provider_enabled(&self) -> bool {
        self.ai_enabled && self.provider_ready()
    }

    /// The per-feature switch (the master switch is applied separately).
    #[must_use]
    pub const fn feature_enabled(&self, feature: crate::ai::AiFeature) -> bool {
        use crate::ai::AiFeature;
        match feature {
            AiFeature::CourseAnalysis => self.course_analysis_enabled,
            AiFeature::SubmissionAnalysis => self.submission_analysis_enabled,
            AiFeature::Remediation => self.remediation_enabled,
            AiFeature::CourseQa => self.course_qa_enabled,
            AiFeature::StudyCompanion => self.study_companion_enabled,
            AiFeature::LectureAuthoring => self.lecture_authoring_enabled,
            AiFeature::SemanticMemory => self.semantic_memory_enabled,
        }
    }

    /// Effective config with secrets redacted (admin settings + config-check).
    #[must_use]
    pub fn redacted(&self) -> serde_json::Value {
        serde_json::json!({
            "openai_api_key": self.openai_api_key.as_ref().map(|_| "[redacted]"),
            "openai_model": self.openai_model,
            "openai_base_url": self.openai_base_url,
            "openrouter_api_key": self.openrouter_api_key.as_ref().map(|_| "[redacted]"),
            "openrouter_model": self.openrouter_model,
            "openrouter_base_url": self.openrouter_base_url,
            "openai_timeout_secs": self.openai_timeout_secs,
            "openrouter_timeout_secs": self.openrouter_timeout_secs,
            "max_tokens_per_request": self.max_tokens_per_request,
            "max_output_tokens": self.max_output_tokens,
            "monthly_token_budget": self.monthly_token_budget,
            "ai_enabled": self.ai_enabled,
            "course_analysis_enabled": self.course_analysis_enabled,
            "submission_analysis_enabled": self.submission_analysis_enabled,
            "remediation_enabled": self.remediation_enabled,
            "course_qa_enabled": self.course_qa_enabled,
            "study_companion_enabled": self.study_companion_enabled,
            "lecture_authoring_enabled": self.lecture_authoring_enabled,
            "ai_draft_mode_enabled": self.ai_draft_mode_enabled,
            "semantic_memory_enabled": self.semantic_memory_enabled,
            "analysis_requests_per_hour_per_user": self.analysis_requests_per_hour_per_user,
            "remediation_requests_per_hour_per_user": self.remediation_requests_per_hour_per_user,
        })
    }
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            openai_api_key: None,
            openai_model: Self::default_openai_model(),
            openai_base_url: Self::default_openai_base_url(),
            openrouter_api_key: None,
            openrouter_model: Self::default_openrouter_model(),
            openrouter_base_url: Self::default_openrouter_base_url(),
            openai_timeout_secs: Self::default_openai_timeout_secs(),
            openrouter_timeout_secs: Self::default_openrouter_timeout_secs(),
            max_tokens_per_request: Self::default_max_tokens_per_request(),
            max_output_tokens: Self::default_max_output_tokens(),
            monthly_token_budget: Self::default_monthly_token_budget(),
            ai_enabled: true,
            course_analysis_enabled: true,
            submission_analysis_enabled: true,
            remediation_enabled: true,
            course_qa_enabled: true,
            study_companion_enabled: true,
            lecture_authoring_enabled: true,
            ai_draft_mode_enabled: true,
            semantic_memory_enabled: true,
            analysis_requests_per_hour_per_user: Self::default_analysis_requests_per_hour(),
            remediation_requests_per_hour_per_user: Self::default_remediation_requests_per_hour(),
        }
    }
}

/// Judge0 connection + the platform's own execution limits. Defaults mirror
/// the legacy `JUDGE0_*` settings; only `base_url` is required.
#[derive(Debug, Clone, Deserialize)]
pub struct Judge0Config {
    /// Origin only, no trailing slash (`http://judge0-server:2358` in compose).
    pub base_url: String,
    /// Sent as `X-Auth-Token` when set (Judge0 `AUTHN_TOKEN`).
    pub api_key: Option<SecretString>,
    /// Judge0's own Postgres database (the legacy `openu` DB in the shared
    /// cluster) — only `ashyq admin judge0-tune` connects to it.
    pub database_url: Option<SecretString>,
    /// Per-HTTP-call timeout.
    #[serde(default = "Judge0Config::default_request_timeout_secs")]
    pub request_timeout_secs: f64,
    #[serde(default = "Judge0Config::default_poll_interval_ms")]
    pub poll_interval_ms: u64,
    /// Total wait for a batch to finish. Must stay under the API request
    /// timeout (30s) — runs execute inside the request.
    #[serde(default = "Judge0Config::default_poll_max_wait_secs")]
    pub poll_max_wait_secs: f64,
    #[serde(default)]
    pub limits: Judge0Limits,
}

impl Judge0Config {
    const fn default_request_timeout_secs() -> f64 {
        10.0
    }
    const fn default_poll_interval_ms() -> u64 {
        500
    }
    const fn default_poll_max_wait_secs() -> f64 {
        25.0
    }
}

/// Size caps and the language allowlist (legacy defaults).
#[derive(Debug, Clone, Deserialize)]
pub struct Judge0Limits {
    #[serde(default = "Judge0Limits::default_max_source_bytes")]
    pub max_source_bytes: usize,
    #[serde(default = "Judge0Limits::default_max_stdin_bytes")]
    pub max_stdin_bytes: usize,
    /// stdout/stderr/compile output kept per case (truncated beyond).
    #[serde(default = "Judge0Limits::default_max_output_bytes")]
    pub max_output_bytes: usize,
    /// Judge0 `max_file_size` (KB) for the sandbox.
    #[serde(default = "Judge0Limits::default_max_output_file_kb")]
    pub max_output_file_kb: i32,
    /// Empty = every non-archived Judge0 language.
    #[serde(default = "Judge0Limits::default_allowed_language_ids")]
    pub allowed_language_ids: Vec<i32>,
}

impl Judge0Limits {
    const fn default_max_source_bytes() -> usize {
        200_000
    }
    const fn default_max_stdin_bytes() -> usize {
        50_000
    }
    const fn default_max_output_bytes() -> usize {
        100_000
    }
    const fn default_max_output_file_kb() -> i32 {
        128
    }
    /// C, C++, Go, Java 13, Node 12, PHP, Python 3.8, Ruby, Rust, TypeScript,
    /// Kotlin, Swift — the legacy allowlist.
    fn default_allowed_language_ids() -> Vec<i32> {
        vec![50, 54, 60, 62, 63, 68, 71, 72, 73, 74, 78, 83]
    }
}

impl Default for Judge0Limits {
    fn default() -> Self {
        Self {
            max_source_bytes: Self::default_max_source_bytes(),
            max_stdin_bytes: Self::default_max_stdin_bytes(),
            max_output_bytes: Self::default_max_output_bytes(),
            max_output_file_kb: Self::default_max_output_file_kb(),
            allowed_language_ids: Self::default_allowed_language_ids(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    /// Exact allowed CORS origins. Wildcards are rejected in production.
    pub cors_origins: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub url: SecretString,
    pub max_connections: u32,
    pub min_connections: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedisConfig {
    /// Required by `serve` (sessions); optional for other subcommands.
    pub url: Option<SecretString>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ZitadelConfig {
    /// Origin only, no trailing slash — internal-network address
    /// (`http://zitadel:8080` in compose; `http://localhost:8081` in dev).
    pub base_url: String,
    /// Provisioner machine-user PAT.
    pub pat: SecretString,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StorageSettings {
    /// S3 endpoint origin (`http://rustfs:9000` in compose).
    pub endpoint: String,
    pub access_key: String,
    pub secret_key: SecretString,
    pub public_bucket: String,
    pub private_bucket: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GoogleOauthConfig {
    pub client_id: String,
    pub client_secret: SecretString,
    /// Our callback URL as registered in the Google console.
    pub redirect_uri: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TelemetryConfig {
    /// JSON logs (prod) vs pretty logs (dev).
    pub json_logs: bool,
    /// OTLP endpoint (Logfire). None = local logging only.
    pub otlp_endpoint: Option<String>,
}

impl Config {
    /// Load from defaults + environment, then validate. Errors are precise and
    /// name the offending key — a misconfigured server must not limp.
    pub fn load() -> Result<Self> {
        let defaults = serde_json::json!({
            "environment": "development",
            "server": { "host": "0.0.0.0", "port": 8000, "cors_origins": [] },
            "database": { "max_connections": 10, "min_connections": 0 },
            "redis": {},
            "ai": {},
            "telemetry": { "json_logs": false },
        });
        let config: Self = Figment::from(Serialized::defaults(defaults))
            .merge(Env::prefixed(ENV_PREFIX).split("__"))
            .extract()
            .map_err(|e| Error::config(format!("failed to load configuration: {e}")))?;
        config.validate()?;
        Ok(config)
    }

    /// Posture checks that go beyond type-correctness.
    pub fn validate(&self) -> Result<()> {
        if self.database.url.expose_secret().is_empty() {
            return Err(Error::config("AB__DATABASE__URL must be set"));
        }
        if self.environment.is_production() {
            if self.server.cors_origins.is_empty() {
                return Err(Error::config(
                    "AB__SERVER__CORS_ORIGINS must be a non-empty allowlist in production",
                ));
            }
            if self.server.cors_origins.iter().any(|o| o.contains('*')) {
                return Err(Error::config(
                    "wildcard CORS origins are forbidden in production",
                ));
            }
            if !self.telemetry.json_logs {
                return Err(Error::config(
                    "AB__TELEMETRY__JSON_LOGS must be true in production",
                ));
            }
        }
        Ok(())
    }

    /// Effective config with secrets redacted — for `ashyq admin config-check`.
    #[must_use]
    pub fn redacted(&self) -> serde_json::Value {
        serde_json::json!({
            "environment": format!("{:?}", self.environment),
            "server": {
                "host": self.server.host,
                "port": self.server.port,
                "cors_origins": self.server.cors_origins,
            },
            "database": {
                "url": "[redacted]",
                "max_connections": self.database.max_connections,
                "min_connections": self.database.min_connections,
            },
            "redis": { "url": self.redis.url.as_ref().map(|_| "[redacted]") },
            "judge0": self.judge0.as_ref().map(|j| serde_json::json!({
                "base_url": j.base_url,
                "api_key": j.api_key.as_ref().map(|_| "[redacted]"),
                "database_url": j.database_url.as_ref().map(|_| "[redacted]"),
                "request_timeout_secs": j.request_timeout_secs,
                "poll_interval_ms": j.poll_interval_ms,
                "poll_max_wait_secs": j.poll_max_wait_secs,
                "limits": {
                    "max_source_bytes": j.limits.max_source_bytes,
                    "max_stdin_bytes": j.limits.max_stdin_bytes,
                    "max_output_bytes": j.limits.max_output_bytes,
                    "max_output_file_kb": j.limits.max_output_file_kb,
                    "allowed_language_ids": j.limits.allowed_language_ids,
                },
            })),
            "ai": self.ai.redacted(),
            "telemetry": {
                "json_logs": self.telemetry.json_logs,
                "otlp_endpoint": self.telemetry.otlp_endpoint,
            },
        })
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    fn base() -> Config {
        Config {
            environment: Environment::Development,
            server: ServerConfig {
                host: "127.0.0.1".into(),
                port: 8000,
                cors_origins: vec![],
            },
            database: DatabaseConfig {
                url: SecretString::from("postgres://x"),
                max_connections: 10,
                min_connections: 0,
            },
            redis: RedisConfig { url: None },
            zitadel: None,
            google: None,
            storage: None,
            judge0: None,
            ai: AiConfig::default(),
            telemetry: TelemetryConfig {
                json_logs: false,
                otlp_endpoint: None,
            },
        }
    }

    #[test]
    fn ai_defaults_mirror_legacy_and_redact_keys() {
        let mut ai = AiConfig::default();
        assert!(!ai.provider_enabled(), "no key = provider disabled");
        assert_eq!(ai.openai_model, "gpt-5.6-luna");
        assert_eq!(ai.monthly_token_budget, 1_000_000);
        ai.openai_api_key = Some(SecretString::from("sk-secret-value"));
        assert!(ai.provider_enabled());
        let redacted = ai.redacted().to_string();
        assert!(!redacted.contains("sk-secret-value"));
        assert!(redacted.contains("[redacted]"));
    }

    #[test]
    fn dev_defaults_validate() {
        base().validate().unwrap();
    }

    #[test]
    fn production_rejects_empty_cors() {
        let mut cfg = base();
        cfg.environment = Environment::Production;
        cfg.telemetry.json_logs = true;
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn production_rejects_wildcard_cors() {
        let mut cfg = base();
        cfg.environment = Environment::Production;
        cfg.telemetry.json_logs = true;
        cfg.server.cors_origins = vec!["*".into()];
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn secrets_do_not_debug_print() {
        let cfg = base();
        let debug = format!("{:?}", cfg.database);
        assert!(!debug.contains("postgres://x"));
    }
}
