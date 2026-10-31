//! Text embeddings for semantic search (docs/AI-FIRST.md 1.3).
//!
//! Two providers behind one [`Embedder`]:
//! - `hash`: local and deterministic. Words and character 3-5-grams of the folded text are hashed into
//!   [`DIMENSIONS`] signed buckets and L2-normalised. Lexical, but needs no network or key, so search
//!   works on every stand and in tests.
//! - `openai_compatible`: `POST {base}/embeddings` with `dimensions` (OpenAI, OpenRouter, self-hosted
//!   TEI/Infinity/Ollama).
//!
//! Vectors cross into SQL as pgvector text literals ([`to_pg_vector`]), so no pgvector crate type leaks.

use std::time::Duration;

use ab_core::config::AiConfig;
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;

/// Fixed width of every stored vector (`vector(1024)` in the migrations).
pub const DIMENSIONS: usize = 1024;

/// The `hash` provider's model name as stored beside its vectors.
pub const HASH_MODEL: &str = "hash-ngram-v1";

#[derive(Debug)]
pub enum EmbedError {
    /// The provider could not be reached or answered 5xx/429: retry later.
    Unavailable(String),
    /// The provider refused the request or answered something unusable.
    Rejected(String),
}

impl std::fmt::Display for EmbedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unavailable(m) => write!(f, "embeddings unavailable: {m}"),
            Self::Rejected(m) => write!(f, "embeddings rejected: {m}"),
        }
    }
}

impl std::error::Error for EmbedError {}

#[derive(Clone)]
enum Provider {
    Hash,
    Remote {
        http: reqwest::Client,
        base_url: String,
        api_key: Option<SecretString>,
        model: String,
        batch: usize,
    },
}

#[derive(Clone)]
pub struct Embedder {
    provider: Provider,
}

impl std::fmt::Debug for Embedder {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Embedder")
            .field("model", &self.model())
            .finish()
    }
}

#[derive(Deserialize)]
struct EmbeddingsResponse {
    #[serde(default)]
    data: Vec<EmbeddingRow>,
}

#[derive(Deserialize)]
struct EmbeddingRow {
    #[serde(default)]
    index: Option<usize>,
    embedding: Vec<f32>,
}

impl Embedder {
    /// The local hashing embedder.
    #[must_use]
    pub const fn hash() -> Self {
        Self {
            provider: Provider::Hash,
        }
    }

    /// From `AB__AI__EMBEDDING_*`; an unknown provider name falls back to `hash` with a warning.
    #[must_use]
    pub fn from_ai_config(config: &AiConfig) -> Self {
        match config.embedding_provider.as_str() {
            "openai_compatible" | "openai" => {
                let timeout = Duration::from_secs_f64(config.embedding_timeout_secs.max(1.0));
                let http = reqwest::Client::builder()
                    .timeout(timeout)
                    .build()
                    .unwrap_or_default();
                Self {
                    provider: Provider::Remote {
                        http,
                        base_url: config.embedding_base_url.trim_end_matches('/').to_owned(),
                        api_key: config
                            .embedding_api_key
                            .clone()
                            .filter(|k| !k.expose_secret().trim().is_empty()),
                        model: config.embedding_model.clone(),
                        batch: usize::try_from(config.embedding_batch.clamp(1, 256)).unwrap_or(32),
                    },
                }
            }
            "hash" => Self::hash(),
            other => {
                tracing::warn!(provider = other, "unknown embedding provider; using hash");
                Self::hash()
            }
        }
    }

    /// The name stored beside each vector; vectors of different models are never compared.
    #[must_use]
    pub fn model(&self) -> &str {
        match &self.provider {
            Provider::Hash => HASH_MODEL,
            Provider::Remote { model, .. } => model,
        }
    }

    /// One unit vector of [`DIMENSIONS`] per input, in input order.
    pub async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, EmbedError> {
        match &self.provider {
            Provider::Hash => Ok(texts.iter().map(|t| hash_embed(t)).collect()),
            Provider::Remote {
                http,
                base_url,
                api_key,
                model,
                batch,
            } => {
                let mut out = Vec::with_capacity(texts.len());
                for chunk in texts.chunks(*batch) {
                    out.extend(remote_embed(http, base_url, api_key.as_ref(), model, chunk).await?);
                }
                Ok(out)
            }
        }
    }
}

async fn remote_embed(
    http: &reqwest::Client,
    base_url: &str,
    api_key: Option<&SecretString>,
    model: &str,
    texts: &[String],
) -> Result<Vec<Vec<f32>>, EmbedError> {
    let mut request = http
        .post(format!("{base_url}/embeddings"))
        .json(&serde_json::json!({
            "model": model,
            "input": texts,
            "dimensions": DIMENSIONS,
            "encoding_format": "float",
        }));
    if let Some(key) = api_key {
        request = request.bearer_auth(key.expose_secret());
    }
    let response = request
        .send()
        .await
        .map_err(|e| EmbedError::Unavailable(e.to_string()))?;
    let status = response.status();
    if status.is_server_error() || status.as_u16() == 429 {
        return Err(EmbedError::Unavailable(format!("status {status}")));
    }
    if !status.is_success() {
        return Err(EmbedError::Rejected(format!("status {status}")));
    }
    let body: EmbeddingsResponse = response
        .json()
        .await
        .map_err(|e| EmbedError::Rejected(e.to_string()))?;
    if body.data.len() != texts.len() {
        return Err(EmbedError::Rejected(format!(
            "{} vectors for {} inputs",
            body.data.len(),
            texts.len()
        )));
    }
    let mut rows = body.data;
    rows.sort_by_key(|r| r.index.unwrap_or(usize::MAX));
    rows.into_iter()
        .map(|row| {
            if row.embedding.len() == DIMENSIONS {
                Ok(normalised(row.embedding))
            } else {
                Err(EmbedError::Rejected(format!(
                    "vector of {} dimensions, expected {DIMENSIONS}",
                    row.embedding.len()
                )))
            }
        })
        .collect()
}

fn normalised(mut v: Vec<f32>) -> Vec<f32> {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in &mut v {
            *x /= norm;
        }
    }
    v
}

/// Kazakh letters to the Russian ones typed in their place, `ё` to `е` (as SQL `search_fold`, minus the
/// Latin look-alike step, which matters only for regex search).
#[must_use]
pub fn fold(text: &str) -> String {
    text.chars()
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            'ә' => 'а',
            'ғ' => 'г',
            'қ' => 'к',
            'ң' => 'н',
            'ө' => 'о',
            'ұ' | 'ү' => 'у',
            'һ' => 'х',
            'і' => 'и',
            'ё' => 'е',
            other => other,
        })
        .collect()
}

/// FNV-1a 64.
fn fnv(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

fn add_feature(v: &mut [f32], feature: &str, weight: f32) {
    let h = fnv(feature.as_bytes());
    #[allow(
        clippy::cast_possible_truncation,
        reason = "h % 1024 always fits in usize"
    )]
    let bucket = (h % DIMENSIONS as u64) as usize;
    let sign: f32 = if h >> 63 == 0 { 1.0 } else { -1.0 };
    v[bucket] = sign.mul_add(weight, v[bucket]);
}

/// The `hash` provider: words (weight 1) and the 3-5-grams of `#word#` (weight 0.4), signed feature
/// hashing, L2 norm. Similar wordings share n-grams, so Russian and Kazakh inflections still meet.
#[must_use]
pub fn hash_embed(text: &str) -> Vec<f32> {
    let mut v = vec![0.0_f32; DIMENSIONS];
    let folded = fold(text);
    for word in folded
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= 2)
    {
        add_feature(&mut v, &format!("w:{word}"), 1.0);
        let padded: Vec<char> = format!("#{word}#").chars().collect();
        for n in 3..=5 {
            if padded.len() < n {
                break;
            }
            for window in padded.windows(n) {
                let gram: String = window.iter().collect();
                add_feature(&mut v, &format!("g:{gram}"), 0.4);
            }
        }
    }
    normalised(v)
}

/// A pgvector text literal (`[0.1,0.2,...]`) bound as `$n::text::vector`.
#[must_use]
pub fn to_pg_vector(v: &[f32]) -> String {
    use std::fmt::Write as _;
    let mut out = String::with_capacity(v.len() * 10 + 2);
    out.push('[');
    for (i, x) in v.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        let _ = write!(out, "{x:.6}");
    }
    out.push(']');
    out
}

/// Cosine similarity of two unit vectors.
#[must_use]
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::float_cmp,
    clippy::panic
)]
mod tests {
    use super::*;

    #[test]
    fn hash_vectors_are_unit_and_deterministic() {
        let a = hash_embed("Рекурсия - функция вызывает саму себя");
        assert_eq!(a.len(), DIMENSIONS);
        let norm: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-4);
        assert_eq!(a, hash_embed("Рекурсия - функция вызывает саму себя"));
    }

    #[test]
    fn hash_similarity_follows_wording() {
        let q = hash_embed("что такое рекурсия");
        let close = hash_embed("Рекурсией называют вызов функцией самой себя");
        let far = hash_embed("Таблица умножения и деление столбиком");
        assert!(cosine(&q, &close) > cosine(&q, &far));
    }

    #[test]
    fn kazakh_letters_fold_like_search() {
        assert_eq!(fold("Қазақ тілі"), "казак тили");
        assert!(cosine(&hash_embed("қазақ тілі"), &hash_embed("казак тили")) > 0.99);
    }

    #[test]
    fn empty_text_is_a_zero_vector() {
        assert!(hash_embed("").iter().all(|x| *x == 0.0));
        assert_eq!(to_pg_vector(&[0.5, -1.0]), "[0.500000,-1.000000]");
    }
}
