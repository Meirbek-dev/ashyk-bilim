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
    pub telemetry: TelemetryConfig,
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
    /// Optional until slice 1.3 wires the session store.
    pub url: Option<SecretString>,
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
            telemetry: TelemetryConfig {
                json_logs: false,
                otlp_endpoint: None,
            },
        }
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
