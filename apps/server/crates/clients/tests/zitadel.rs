//! Wiremock contract fixtures for the Zitadel client. Response bodies below
//! replicate a LIVE Zitadel (2026-08-16, digest pinned in
//! docker-compose.rewrite.yml) — these tests are the tripwire for wire-shape
//! drift on Zitadel upgrades.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_clients::zitadel::{
    NewHumanUser, PasswordSessionOutcome, PasswordSpec, ZitadelClient, ZitadelConfig,
};
use secrecy::SecretString;
use wiremock::matchers::{body_partial_json, header_regex, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn client(server: &MockServer) -> ZitadelClient {
    ZitadelClient::new(ZitadelConfig {
        base_url: server.uri(),
        pat: SecretString::from("test-pat"),
    })
    .unwrap()
}

#[tokio::test]
async fn password_session_success() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v2/sessions"))
        .and(header_regex("authorization", "^Bearer test-pat$"))
        .and(body_partial_json(serde_json::json!({
            "checks": {
                "user": { "loginName": "smoke-test@example.com" },
                "password": { "password": "Sm0ke-test-pass!" },
            }
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "details": { "sequence": "4", "changeDate": "2026-08-16T06:54:34.717333Z",
                         "resourceOwner": "386492094732043779" },
            "sessionId": "386492151355147779",
            "sessionToken": "eyJhbGciOiJBMjU2R0NNS1ci.example.token"
        })))
        .expect(1)
        .mount(&server)
        .await;

    let outcome = client(&server)
        .create_password_session(
            "smoke-test@example.com",
            &SecretString::from("Sm0ke-test-pass!"),
        )
        .await
        .unwrap();
    match outcome {
        PasswordSessionOutcome::Ok(session) => {
            assert_eq!(session.session_id, "386492151355147779");
        }
        other => panic!("expected Ok, got {other:?}"),
    }
}

#[tokio::test]
async fn password_session_invalid_credentials() {
    let server = MockServer::start().await;
    // Captured live: code 3 + CredentialsCheckError detail with failedAttempts.
    Mock::given(method("POST"))
        .and(path("/v2/sessions"))
        .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
            "code": 3,
            "message": "Password is invalid (COMMAND-3M0fs)",
            "details": [{
                "@type": "type.googleapis.com/zitadel.v1.CredentialsCheckError",
                "id": "COMMAND-3M0fs",
                "message": "Password is invalid",
                "failedAttempts": 2
            }]
        })))
        .mount(&server)
        .await;

    let outcome = client(&server)
        .create_password_session("smoke-test@example.com", &SecretString::from("wrong"))
        .await
        .unwrap();
    match outcome {
        PasswordSessionOutcome::InvalidCredentials { failed_attempts } => {
            assert_eq!(failed_attempts, 2);
        }
        other => panic!("expected InvalidCredentials, got {other:?}"),
    }
}

#[tokio::test]
async fn create_human_user_with_hash_import() {
    let server = MockServer::start().await;
    // The ETL import path: hashedPassword.hash carries the modular-crypt string.
    Mock::given(method("POST"))
        .and(path("/v2/users/human"))
        .and(body_partial_json(serde_json::json!({
            "username": "meirbek",
            "email": { "email": "m@example.com", "isVerified": true },
            "hashedPassword": { "hash": "$argon2id$v=19$m=65536,t=3,p=4$abc$def" }
        })))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
            "userId": "386492126625531395",
            "details": { "sequence": "2", "changeDate": "2026-08-16T06:54:19.943975Z",
                         "resourceOwner": "386492094732109315" }
        })))
        .expect(1)
        .mount(&server)
        .await;

    let user_id = client(&server)
        .create_human_user(&NewHumanUser {
            username: "meirbek".into(),
            given_name: "Meirbek".into(),
            family_name: "User".into(),
            email: "m@example.com".into(),
            email_verified: true,
            password: PasswordSpec::Hash("$argon2id$v=19$m=65536,t=3,p=4$abc$def".into()),
        })
        .await
        .unwrap();
    assert_eq!(user_id, "386492126625531395");
}

#[tokio::test]
async fn create_user_conflict_maps_to_conflict_error() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v2/users/human"))
        .respond_with(ResponseTemplate::new(409).set_body_json(serde_json::json!({
            "code": 6,
            "message": "User already exists (COMMAND-k2unb)"
        })))
        .mount(&server)
        .await;

    let err = client(&server)
        .create_human_user(&NewHumanUser {
            username: "dup".into(),
            given_name: "D".into(),
            family_name: "U".into(),
            email: "dup@example.com".into(),
            email_verified: true,
            password: PasswordSpec::None,
        })
        .await
        .unwrap_err();
    assert_eq!(err.code(), ab_core::ErrorCode::Conflict);
}

#[tokio::test]
async fn delete_session_is_idempotent() {
    let server = MockServer::start().await;
    Mock::given(method("DELETE"))
        .and(path("/v2/sessions/gone-already"))
        .respond_with(ResponseTemplate::new(404).set_body_json(serde_json::json!({
            "code": 5, "message": "Session not found"
        })))
        .mount(&server)
        .await;

    client(&server)
        .delete_session("gone-already", &SecretString::from("tok"))
        .await
        .unwrap();
}
