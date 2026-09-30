//! Contract snapshot: the entire OpenAPI document. Any route/schema change
//! shows up in this snapshot's diff — read it before accepting (`cargo insta
//! review` or delete-and-regenerate via `just openapi`).

#[test]
fn openapi_document_snapshot() {
    let doc = ab_api::openapi_doc();
    let json = serde_json::to_value(&doc).unwrap_or_else(|e| {
        unreachable!("OpenAPI document must serialize: {e}");
    });
    insta::assert_json_snapshot!("openapi_v2", json);
}
