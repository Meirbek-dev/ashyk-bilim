//! Outgoing email: Resend first, SMTP (the university relay) second.
//!
//! [`Mailer`] holds whichever providers are configured. With both, a message goes through Resend and, when Resend
//! fails (an error answer or no answer), the same message goes through SMTP; Resend refusing a sender domain does not
//! stop account codes. A Resend timeout after it accepted the message can deliver it twice, which a code mail
//! survives. With only one provider, that one is used. TLS is rustls with ring (REWRITE 4.1).

use std::time::Duration;

use ab_core::config::{EmailConfig, ResendConfig, SmtpTls};
use ab_core::{Error, ErrorCode, Result};
use lettre::message::Mailbox;
use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use secrecy::ExposeSecret;

use crate::resend::ResendClient;

/// The configured email providers, tried in order.
pub struct Mailer {
    resend: Option<ResendClient>,
    smtp: Option<SmtpClient>,
}

impl Mailer {
    /// `None` when no provider is configured. A blank Resend key counts as unset: compose passes the key through
    /// even when it is empty.
    pub fn from_config(resend: Option<&ResendConfig>, email: &EmailConfig) -> Result<Option<Self>> {
        let resend = resend
            .filter(|r| !r.api_key.expose_secret().trim().is_empty())
            .cloned()
            .map(ResendClient::new)
            .transpose()?;
        let smtp = SmtpClient::from_config(email)?;
        Ok((resend.is_some() || smtp.is_some()).then_some(Self { resend, smtp }))
    }

    /// Which providers are on, for the startup log (`resend+smtp`).
    #[must_use]
    pub fn providers(&self) -> String {
        [
            self.resend.as_ref().map(|_| "resend"),
            self.smtp.as_ref().map(|_| "smtp"),
        ]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join("+")
    }

    /// Send one HTML email. Failures surface as `service-unavailable`; callers decide whether mail failure blocks
    /// the flow (it never does for account codes).
    pub async fn send(&self, to: &str, subject: &str, html: &str) -> Result<()> {
        if let Some(resend) = &self.resend {
            match resend.send(to, subject, html).await {
                Ok(()) => return Ok(()),
                Err(err) if self.smtp.is_some() => {
                    tracing::warn!(%err, "resend failed; sending through SMTP");
                }
                Err(err) => return Err(err),
            }
        }
        match &self.smtp {
            Some(smtp) => smtp.send(to, subject, html).await,
            None => Err(Error::app(
                ErrorCode::ServiceUnavailable,
                "no email provider",
            )),
        }
    }
}

/// SMTP submission through one relay (`AB__EMAIL__SMTP_*`).
pub struct SmtpClient {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
}

impl SmtpClient {
    /// `None` while `AB__EMAIL__SMTP_HOST` is unset (`Config::validate` has checked the rest).
    pub fn from_config(config: &EmailConfig) -> Result<Option<Self>> {
        let Some(host) = config.smtp_host() else {
            return Ok(None);
        };
        let from = config.smtp_from.as_deref().unwrap_or_default();
        let from = parse_mailbox(from)
            .map_err(|e| Error::config(format!("AB__EMAIL__SMTP_FROM {from:?}: {e}")))?;
        let tls_error = |e| Error::config(format!("AB__EMAIL__SMTP_HOST {host:?}: {e}"));
        let builder = match config.smtp_tls {
            SmtpTls::Starttls => {
                AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host).map_err(tls_error)?
            }
            SmtpTls::Tls => AsyncSmtpTransport::<Tokio1Executor>::relay(host).map_err(tls_error)?,
            SmtpTls::None => AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(host),
        };
        let mut builder = builder
            .port(config.smtp_port())
            .timeout(Some(Duration::from_secs(10)));
        if let Some((user, password)) = config.smtp_credentials() {
            builder = builder.credentials(Credentials::new(
                user.to_owned(),
                password.expose_secret().to_owned(),
            ));
        }
        Ok(Some(Self {
            transport: builder.build(),
            from,
        }))
    }

    /// Send one HTML email through the relay.
    pub async fn send(&self, to: &str, subject: &str, html: &str) -> Result<()> {
        let message = build_message(&self.from, to, subject, html)?;
        self.transport.send(message).await.map_err(|e| {
            Error::app(
                ErrorCode::ServiceUnavailable,
                format!("smtp relay rejected the email: {e}"),
            )
        })?;
        Ok(())
    }
}

fn parse_mailbox(address: &str) -> std::result::Result<Mailbox, lettre::address::AddressError> {
    address.trim().parse()
}

/// The MIME message: one `text/html` part, UTF-8 subject encoded by lettre.
fn build_message(from: &Mailbox, to: &str, subject: &str, html: &str) -> Result<Message> {
    let to = parse_mailbox(to).map_err(|e| {
        Error::app(
            ErrorCode::ServiceUnavailable,
            format!("invalid recipient: {e}"),
        )
    })?;
    Message::builder()
        .from(from.clone())
        .to(to)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(html.to_owned())
        .map_err(|e| Error::internal("building the email", e))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn message_is_html_with_an_encoded_subject() {
        let from = parse_mailbox("Ashyq Bilim <noreply@tou.example>").unwrap();
        let message = build_message(
            &from,
            "student@tou.example",
            "Код подтверждения",
            "<p>123456</p>",
        )
        .unwrap();
        let raw = String::from_utf8(message.formatted()).unwrap();
        assert!(
            raw.contains("From: \"Ashyq Bilim\" <noreply@tou.example>"),
            "{raw}"
        );
        assert!(raw.contains("To: student@tou.example"), "{raw}");
        assert!(
            raw.contains("Subject: =?utf-8?"),
            "a non-ASCII subject is RFC 2047 encoded: {raw}"
        );
        assert!(
            raw.contains("Content-Type: text/html; charset=utf-8"),
            "{raw}"
        );
        assert!(raw.contains("<p>123456</p>"), "{raw}");
    }

    #[test]
    fn a_bad_recipient_is_an_error_not_a_panic() {
        let from = parse_mailbox("noreply@tou.example").unwrap();
        assert!(build_message(&from, "not an address", "s", "b").is_err());
    }

    #[test]
    fn mailer_needs_a_provider() {
        let blank = ResendConfig {
            api_key: " ".to_owned().into(),
            from: "a@b.example".into(),
            base_url: "http://127.0.0.1:9".into(),
        };
        assert!(
            Mailer::from_config(Some(&blank), &EmailConfig::default())
                .unwrap()
                .is_none()
        );
        let smtp = EmailConfig {
            smtp_host: Some("relay.tou.example".into()),
            smtp_from: Some("Ashyq <noreply@tou.example>".into()),
            ..EmailConfig::default()
        };
        let mailer = Mailer::from_config(Some(&blank), &smtp).unwrap().unwrap();
        assert_eq!(mailer.providers(), "smtp");
        let bad_from = EmailConfig {
            smtp_from: Some("nobody".into()),
            ..smtp
        };
        let err = Mailer::from_config(None, &bad_from)
            .err()
            .unwrap()
            .to_string();
        assert!(err.contains("AB__EMAIL__SMTP_FROM"), "{err}");
    }
}
