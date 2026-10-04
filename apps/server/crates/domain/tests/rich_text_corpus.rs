//! `rich_text` over a stored corpus (read-only): every activity document
//! and discussion post must pass, or the write-time check would refuse
//! saving data production already holds. Not part of the suite:
//!
//! `CORPUS_DATABASE_URL=postgres://ashyq:ashyq@localhost:5433/ashyq_restore
//!  CORPUS_OWN_ORIGIN=https://cs-mooc.tou.edu.kz
//!  cargo nextest run --workspace -E 'binary(rich_text_corpus)' --run-ignored only --no-capture`
// The counts line is the report of a manual run.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::print_stdout
)]

use ab_domain::rich_text::violations;
use serde_json::Value;

#[tokio::test]
#[ignore = "needs CORPUS_DATABASE_URL (a restored production copy)"]
async fn stored_documents_pass_the_write_check() {
    let pool = sqlx::PgPool::connect(&std::env::var("CORPUS_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let own: Vec<String> = std::env::var("CORPUS_OWN_ORIGIN")
        .ok()
        .and_then(|o| url::Url::parse(&o).ok()?.host_str().map(str::to_owned))
        .into_iter()
        .collect();
    let activities: Vec<(Value,)> = sqlx::query_as("SELECT content FROM activities")
        .fetch_all(&pool)
        .await
        .unwrap();
    let posts: Vec<(String,)> = sqlx::query_as("SELECT content FROM course_discussions")
        .fetch_all(&pool)
        .await
        .unwrap();
    let docs =
        activities
            .into_iter()
            .map(|(v,)| ("activity", v))
            .chain(posts.into_iter().filter_map(|(text,)| {
                serde_json::from_str::<Value>(&text)
                    .ok()
                    .map(|v| ("post", v))
            }));
    let (mut checked, mut documents, mut failing) = (0, 0, Vec::new());
    for (kind, doc) in docs {
        checked += 1;
        documents += i32::from(doc.get("type").and_then(Value::as_str) == Some("doc"));
        for error in violations("content", &doc, &own) {
            failing.push(format!("{kind} {}: {}", error.field, error.message));
        }
    }
    println!(
        "corpus: {checked} rows, {documents} documents, {} violations",
        failing.len()
    );
    assert!(failing.is_empty(), "{failing:#?}");
}
