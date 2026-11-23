//! `Mailer`: Resend first; SMTP when Resend fails or is not configured.
//!
//! - Resend accepting the message sends nothing over SMTP.
//! - Resend answering 403 (an unverified sender domain) sends the same message through the SMTP relay.
//! - SMTP alone delivers; `Mailer::send` fails when every provider fails.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::sync::{Arc, Mutex};

use ab_clients::email::Mailer;
use ab_core::config::{EmailConfig, ResendConfig, SmtpTls};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

/// A minimal plain-text SMTP server: accepts every message and keeps its DATA.
async fn fake_smtp() -> (u16, Arc<Mutex<Vec<String>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let received = Arc::new(Mutex::new(Vec::new()));
    let store = received.clone();
    tokio::spawn(async move {
        loop {
            let Ok((socket, _)) = listener.accept().await else {
                return;
            };
            let store = store.clone();
            tokio::spawn(async move {
                let (read, mut write) = socket.into_split();
                let mut lines = BufReader::new(read).lines();
                write.write_all(b"220 fake ESMTP\r\n").await.unwrap();
                let mut data: Option<String> = None;
                while let Ok(Some(line)) = lines.next_line().await {
                    if let Some(body) = data.as_mut() {
                        if line == "." {
                            store.lock().unwrap().push(data.take().unwrap_or_default());
                            write.write_all(b"250 queued\r\n").await.unwrap();
                        } else {
                            body.push_str(&line);
                            body.push('\n');
                        }
                        continue;
                    }
                    let verb = line.get(..4).unwrap_or_default().to_ascii_uppercase();
                    let reply: &[u8] = match verb.as_str() {
                        "EHLO" | "HELO" => b"250 fake\r\n",
                        "DATA" => {
                            data = Some(String::new());
                            b"354 go ahead\r\n"
                        }
                        "QUIT" => {
                            write.write_all(b"221 bye\r\n").await.unwrap();
                            return;
                        }
                        _ => b"250 ok\r\n",
                    };
                    write.write_all(reply).await.unwrap();
                }
            });
        }
    });
    (port, received)
}

fn smtp_config(port: u16) -> EmailConfig {
    EmailConfig {
        smtp_host: Some("127.0.0.1".into()),
        smtp_port: Some(port),
        smtp_tls: SmtpTls::None,
        smtp_from: Some("Ashyq Bilim <noreply@tou.example>".into()),
        ..EmailConfig::default()
    }
}

fn resend_config(server: &MockServer) -> ResendConfig {
    ResendConfig {
        api_key: "re_test".to_owned().into(),
        from: "Ashyq Bilim <noreply@ashyq.example>".into(),
        base_url: server.uri(),
    }
}

#[tokio::test]
async fn resend_success_skips_smtp() {
    let resend = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/emails"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "id": "x" })))
        .expect(1)
        .mount(&resend)
        .await;
    let (port, received) = fake_smtp().await;
    let mailer = Mailer::from_config(Some(&resend_config(&resend)), &smtp_config(port))
        .unwrap()
        .unwrap();
    assert_eq!(mailer.providers(), "resend+smtp");
    mailer
        .send("student@tou.example", "Code", "<p>1</p>")
        .await
        .unwrap();
    assert!(received.lock().unwrap().is_empty());
}

#[tokio::test]
async fn resend_failure_falls_back_to_smtp() {
    let resend = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/emails"))
        .respond_with(ResponseTemplate::new(403))
        .expect(1)
        .mount(&resend)
        .await;
    let (port, received) = fake_smtp().await;
    let mailer = Mailer::from_config(Some(&resend_config(&resend)), &smtp_config(port))
        .unwrap()
        .unwrap();
    mailer
        .send("student@tou.example", "Verification code", "<p>654321</p>")
        .await
        .unwrap();
    let received = received.lock().unwrap().clone();
    assert_eq!(received.len(), 1);
    let message = &received[0];
    assert!(message.contains("To: student@tou.example"), "{message}");
    assert!(
        message.contains("From: \"Ashyq Bilim\" <noreply@tou.example>"),
        "{message}"
    );
    assert!(message.contains("Subject: Verification code"), "{message}");
    assert!(message.contains("<p>654321</p>"), "{message}");
}

#[tokio::test]
async fn smtp_alone_delivers_and_failures_surface() {
    let (port, received) = fake_smtp().await;
    let mailer = Mailer::from_config(None, &smtp_config(port))
        .unwrap()
        .unwrap();
    assert_eq!(mailer.providers(), "smtp");
    mailer
        .send("a@tou.example", "Hi", "<p>hi</p>")
        .await
        .unwrap();
    assert_eq!(received.lock().unwrap().len(), 1);

    // Nothing listens on the port any more: the error reaches the caller.
    let closed = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let dead_port = closed.local_addr().unwrap().port();
    drop(closed);
    let mailer = Mailer::from_config(None, &smtp_config(dead_port))
        .unwrap()
        .unwrap();
    assert!(
        mailer
            .send("a@tou.example", "Hi", "<p>hi</p>")
            .await
            .is_err()
    );
}
