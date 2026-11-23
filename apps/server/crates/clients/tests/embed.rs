//! Wiremock contract fixtures for `ab_clients::embed` against Voyage AI fakes:
//! - `voyage` embeds with `output_dimension` 1024 and `input_type` `document` / `query`, the bearer
//!   key, batches of `embedding_batch`, vectors back in input order and L2-normalised;
//! - `voyage` without a key is the offline `hash` embedder and has no reranker;
//! - 429/5xx are `Unavailable` (retry), a wrong vector width or count is `Rejected`;
//! - the reranker sends `query`, `documents`, `rerank-2.5`, `return_documents: false`, returns every
//!   document once by relevance, and rejects an answer that loses or repeats a document;
//! - `openai_compatible` keeps the OpenAI wire (`dimensions`, no `input_type`).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_clients::embed::{DIMENSIONS, EmbedError, Embedder, HASH_MODEL, InputKind, Reranker};
use ab_core::config::AiConfig;
use secrecy::SecretString;
use wiremock::matchers::{body_partial_json, header, method, path};
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

const KEY: &str = "voyage-test-key";

fn config(server: &MockServer) -> AiConfig {
    AiConfig {
        embedding_provider: "voyage".into(),
        embedding_base_url: format!("{}/v1", server.uri()),
        embedding_api_key: Some(SecretString::from(KEY)),
        embedding_timeout_secs: 5.0,
        ..AiConfig::default()
    }
}

/// A vector whose first component is `seed` (so the order is visible) of `dims` dimensions.
fn vector(seed: f32, dims: usize) -> Vec<f32> {
    let mut v = vec![0.0_f32; dims];
    v[0] = seed;
    v[1] = 1.0;
    v
}

/// Answers each input with a vector seeded by its position, rows returned in reverse.
fn echo_vectors(dims: usize) -> impl Fn(&Request) -> ResponseTemplate {
    move |req: &Request| {
        let body: serde_json::Value = serde_json::from_slice(&req.body).unwrap();
        let n = body["input"].as_array().unwrap().len();
        let data: Vec<serde_json::Value> = (0..n)
            .rev()
            .map(|i| {
                #[allow(clippy::cast_precision_loss)]
                let seed = i as f32;
                serde_json::json!({"object": "embedding", "index": i, "embedding": vector(seed, dims)})
            })
            .collect();
        ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "object": "list", "data": data, "model": "voyage-3.5", "usage": {"total_tokens": 10}
        }))
    }
}

#[tokio::test]
async fn voyage_embeds_documents_in_order_and_in_batches() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/embeddings"))
        .and(header("authorization", format!("Bearer {KEY}").as_str()))
        .and(body_partial_json(serde_json::json!({
            "model": "voyage-3.5",
            "input_type": "document",
            "output_dimension": 1024,
            "output_dtype": "float",
        })))
        .respond_with(echo_vectors(DIMENSIONS))
        .expect(2)
        .mount(&server)
        .await;
    let embedder = Embedder::from_ai_config(&AiConfig {
        embedding_batch: 2,
        ..config(&server)
    });
    assert_eq!(embedder.model(), "voyage-3.5");
    let texts: Vec<String> = (0..3).map(|i| format!("passage {i}")).collect();
    let vectors = embedder.embed(&texts, InputKind::Document).await.unwrap();
    assert_eq!(vectors.len(), 3);
    // The second batch restarts at index 0: rows are ordered per batch, by `index`.
    assert_eq!(vectors[0][0], 0.0);
    assert!(vectors[1][0] > 0.0);
    let norm: f32 = vectors[1].iter().map(|x| x * x).sum::<f32>().sqrt();
    assert!((norm - 1.0).abs() < 1e-4);
}

#[tokio::test]
async fn voyage_embeds_a_search_as_a_query() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/embeddings"))
        .and(body_partial_json(serde_json::json!({
            "input": ["что такое рекурсия"],
            "input_type": "query",
        })))
        .respond_with(echo_vectors(DIMENSIONS))
        .expect(1)
        .mount(&server)
        .await;
    let vectors = Embedder::from_ai_config(&config(&server))
        .embed(&["что такое рекурсия".to_owned()], InputKind::Query)
        .await
        .unwrap();
    assert_eq!(vectors[0].len(), DIMENSIONS);
}

#[tokio::test]
async fn voyage_without_a_key_is_the_hash_embedder() {
    let server = MockServer::start().await;
    let cfg = AiConfig {
        embedding_api_key: Some(SecretString::from("  ")),
        ..config(&server)
    };
    let embedder = Embedder::from_ai_config(&cfg);
    assert_eq!(embedder.model(), HASH_MODEL);
    assert!(Reranker::from_ai_config(&cfg).is_none());
    assert_eq!(
        Embedder::from_ai_config(&AiConfig::default()).model(),
        HASH_MODEL
    );
    let v = embedder
        .embed(&["рекурсия".to_owned()], InputKind::Query)
        .await
        .unwrap();
    assert_eq!(v[0].len(), DIMENSIONS);
    assert!(server.received_requests().await.unwrap().is_empty());
}

#[tokio::test]
async fn voyage_failures_map_to_retry_or_reject() {
    let server = MockServer::start().await;
    Mock::given(path("/v1/embeddings"))
        .and(body_partial_json(serde_json::json!({"input": ["busy"]})))
        .respond_with(ResponseTemplate::new(429))
        .mount(&server)
        .await;
    Mock::given(path("/v1/embeddings"))
        .and(body_partial_json(serde_json::json!({"input": ["narrow"]})))
        .respond_with(echo_vectors(512))
        .mount(&server)
        .await;
    Mock::given(path("/v1/embeddings"))
        .and(body_partial_json(serde_json::json!({"input": ["refused"]})))
        .respond_with(ResponseTemplate::new(400))
        .mount(&server)
        .await;
    let embedder = Embedder::from_ai_config(&config(&server));
    let run = |t: &str| {
        let embedder = embedder.clone();
        let t = t.to_owned();
        async move { embedder.embed(&[t], InputKind::Document).await }
    };
    assert!(matches!(run("busy").await, Err(EmbedError::Unavailable(_))));
    assert!(matches!(run("narrow").await, Err(EmbedError::Rejected(_))));
    assert!(matches!(run("refused").await, Err(EmbedError::Rejected(_))));
}

#[tokio::test]
async fn openai_compatible_keeps_its_wire() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/embeddings"))
        .and(body_partial_json(serde_json::json!({
            "model": "text-embedding-3-small",
            "dimensions": 1024,
        })))
        .respond_with(move |req: &Request| {
            let body: serde_json::Value = serde_json::from_slice(&req.body).unwrap();
            assert!(body.get("input_type").is_none(), "{body}");
            echo_vectors(DIMENSIONS)(req)
        })
        .expect(1)
        .mount(&server)
        .await;
    let cfg = AiConfig {
        embedding_provider: "openai_compatible".into(),
        embedding_model: "text-embedding-3-small".into(),
        ..config(&server)
    };
    assert!(Reranker::from_ai_config(&cfg).is_none());
    let v = Embedder::from_ai_config(&cfg)
        .embed(&["x".to_owned()], InputKind::Query)
        .await
        .unwrap();
    assert_eq!(v.len(), 1);
}

#[tokio::test]
async fn rerank_orders_every_document_by_relevance() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/rerank"))
        .and(header("authorization", format!("Bearer {KEY}").as_str()))
        .and(body_partial_json(serde_json::json!({
            "model": "rerank-2.5",
            "query": "рекурсия",
            "documents": ["a", "b", "c"],
            "return_documents": false,
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "object": "list",
            "data": [
                {"index": 2, "relevance_score": 0.91},
                {"index": 0, "relevance_score": 0.42},
                {"index": 1, "relevance_score": 0.05}
            ],
            "model": "rerank-2.5",
            "usage": {"total_tokens": 12}
        })))
        .expect(1)
        .mount(&server)
        .await;
    let reranker = Reranker::from_ai_config(&config(&server)).unwrap();
    assert_eq!(reranker.model(), "rerank-2.5");
    let docs: Vec<String> = ["a", "b", "c"].map(String::from).to_vec();
    let ranked = reranker.rerank("рекурсия", &docs).await.unwrap();
    assert_eq!(
        ranked.iter().map(|r| r.index).collect::<Vec<_>>(),
        vec![2, 0, 1]
    );
    assert!((ranked[0].score - 0.91).abs() < 1e-9);
    assert!(reranker.rerank("x", &[]).await.unwrap().is_empty());
}

#[tokio::test]
async fn rerank_rejects_lost_or_repeated_documents() {
    let server = MockServer::start().await;
    Mock::given(path("/v1/rerank"))
        .and(body_partial_json(serde_json::json!({"query": "lost"})))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "data": [{"index": 0, "relevance_score": 0.9}]
        })))
        .mount(&server)
        .await;
    Mock::given(path("/v1/rerank"))
        .and(body_partial_json(serde_json::json!({"query": "twice"})))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "data": [{"index": 0, "relevance_score": 0.9}, {"index": 0, "relevance_score": 0.8}]
        })))
        .mount(&server)
        .await;
    Mock::given(path("/v1/rerank"))
        .and(body_partial_json(serde_json::json!({"query": "down"})))
        .respond_with(ResponseTemplate::new(503))
        .mount(&server)
        .await;
    let reranker = Reranker::from_ai_config(&config(&server)).unwrap();
    let docs: Vec<String> = ["a", "b"].map(String::from).to_vec();
    assert!(matches!(
        reranker.rerank("lost", &docs).await,
        Err(EmbedError::Rejected(_))
    ));
    assert!(matches!(
        reranker.rerank("twice", &docs).await,
        Err(EmbedError::Rejected(_))
    ));
    assert!(matches!(
        reranker.rerank("down", &docs).await,
        Err(EmbedError::Unavailable(_))
    ));
    let off = AiConfig {
        rerank_model: String::new(),
        ..config(&server)
    };
    assert!(Reranker::from_ai_config(&off).is_none());
}
