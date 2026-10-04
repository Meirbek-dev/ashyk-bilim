//! S-11: the one map of web app URLs.
//!
//! Every web URL the server hands out (emails, the Google sign-in
//! error page, the certificate PDF's QR code, `next_action.href`, work
//! queue links) goes through this map, so the cutover flips one setting -
//! `AB__SERVER__WEB_LINKS=v2` - and a web rollback flips it back without a
//! server rollback. `legacy` (the default) is today's old-web URLs; it goes
//! away in phase 9.

use std::sync::OnceLock;

use crate::assessments::AssessmentKind;
use crate::id::{ActivityId, AssessmentId, CourseId};
use crate::language::Language;

/// Which web app the links point into.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LinkScheme {
    /// The old web: locale prefixes (`/ru`, `/kz`, `/en`), `/auth/...`,
    /// `/course/...`.
    #[default]
    Legacy,
    /// The new web (stage-2 spec 5.3): no locale in the URL.
    V2,
}

static SCHEME: OnceLock<LinkScheme> = OnceLock::new();

/// Fix the process-wide scheme from config at boot; the first call wins.
pub fn init(scheme: LinkScheme) {
    // A second call (tests that build the app twice) keeps the first value.
    let _ = SCHEME.set(scheme);
}

/// The configured scheme (`legacy` until [`init`]).
#[must_use]
pub fn scheme() -> LinkScheme {
    SCHEME.get().copied().unwrap_or_default()
}

/// A page of the web app.
#[derive(Debug, Clone, Copy)]
pub enum WebLink<'a> {
    /// Sign-in page showing an error code.
    LoginError(&'a str),
    /// Email verification (the caller appends `?email=&code=`).
    VerifyEmail,
    /// Password reset (the caller appends `?email=&code=`).
    ResetPassword,
    Course(CourseId),
    /// The learner player on an activity.
    Activity(CourseId, ActivityId),
    /// A teacher's submissions of an activity, optionally one submission.
    Review(CourseId, ActivityId, Option<uuid::Uuid>),
    /// Public verification of a certificate code.
    CertificateVerify(&'a str),
    /// Analytics: the at-risk learners of a course.
    AnalyticsAtRisk(CourseId),
    /// Analytics: the grading backlog.
    AnalyticsBacklog,
    /// Analytics: one course's drill-down.
    AnalyticsCourse(CourseId),
    /// Analytics: the overview filtered to one course.
    AnalyticsCourseFilter(CourseId),
    /// Analytics: one assessment's drill-down.
    AnalyticsAssessment(AssessmentKind, AssessmentId),
}

impl WebLink<'_> {
    /// Host-relative path in the configured scheme; `language` adds the old
    /// web's locale prefix where it had one.
    #[must_use]
    pub fn path(self, language: Option<Language>) -> String {
        self.path_in(scheme(), language)
    }

    #[must_use]
    pub fn path_in(self, scheme: LinkScheme, language: Option<Language>) -> String {
        match scheme {
            LinkScheme::Legacy => {
                let prefix = language.map_or("", Language::web_prefix);
                match self {
                    Self::LoginError(code) => format!("/auth/login?error={code}"),
                    Self::VerifyEmail => format!("{prefix}/auth/verify-email"),
                    Self::ResetPassword => format!("{prefix}/auth/reset-password"),
                    Self::Course(c) => format!("/course/{c}"),
                    Self::Activity(c, a) => format!("/course/{c}/activity/{a}"),
                    Self::Review(c, a, None) => format!("/dash/courses/{c}/activity/{a}/review"),
                    Self::Review(c, a, Some(s)) => {
                        format!("/dash/courses/{c}/activity/{a}/review?submission={s}")
                    }
                    Self::CertificateVerify(code) => {
                        format!("{prefix}/certificates/{code}/verify")
                    }
                    Self::AnalyticsAtRisk(_) => "/dash/analytics/learners/at-risk".to_owned(),
                    Self::AnalyticsBacklog => "/dash/analytics?drill=backlog".to_owned(),
                    Self::AnalyticsCourse(c) => format!("/dash/analytics/courses/{c}"),
                    Self::AnalyticsCourseFilter(c) => {
                        format!("/dash/analytics/courses?course_ids={c}")
                    }
                    Self::AnalyticsAssessment(k, a) => {
                        format!("/dash/analytics/assessments/{k}/{a}")
                    }
                }
            }
            LinkScheme::V2 => match self {
                Self::LoginError(code) => format!("/login?error={code}"),
                Self::VerifyEmail => "/verify-email".to_owned(),
                Self::ResetPassword => "/reset-password".to_owned(),
                Self::Course(c) => format!("/courses/{c}"),
                Self::Activity(c, a) => format!("/learn/{c}/{a}"),
                Self::Review(c, a, None) => {
                    format!("/teach/courses/{c}/activities/{a}/submissions")
                }
                Self::Review(c, a, Some(s)) => {
                    format!("/teach/courses/{c}/activities/{a}/submissions/{s}")
                }
                Self::CertificateVerify(code) => format!("/certificates/{code}/verify"),
                Self::AnalyticsAtRisk(c) => format!("/teach/analytics/learners?course={c}"),
                Self::AnalyticsBacklog => "/teach/analytics/operations?metric=backlog".to_owned(),
                Self::AnalyticsCourse(c) => format!("/teach/analytics/performance?courseId={c}"),
                Self::AnalyticsCourseFilter(c) => format!("/teach/analytics/overview?course={c}"),
                Self::AnalyticsAssessment(k, a) => {
                    format!("/teach/analytics/performance?assessmentType={k}&assessmentId={a}")
                }
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_maps() {
        let c = CourseId(uuid::Uuid::nil());
        let a = ActivityId(uuid::Uuid::nil());
        let kk = Some(Language::Kk);
        let legacy = |l: WebLink<'_>| l.path_in(LinkScheme::Legacy, kk);
        let v2 = |l: WebLink<'_>| l.path_in(LinkScheme::V2, kk);
        assert_eq!(legacy(WebLink::VerifyEmail), "/kz/auth/verify-email");
        assert_eq!(v2(WebLink::VerifyEmail), "/verify-email");
        assert_eq!(v2(WebLink::ResetPassword), "/reset-password");
        assert_eq!(legacy(WebLink::LoginError("x")), "/auth/login?error=x");
        assert_eq!(v2(WebLink::LoginError("x")), "/login?error=x");
        assert_eq!(legacy(WebLink::Course(c)), format!("/course/{c}"));
        assert_eq!(v2(WebLink::Course(c)), format!("/courses/{c}"));
        assert_eq!(v2(WebLink::Activity(c, a)), format!("/learn/{c}/{a}"));
        assert_eq!(
            legacy(WebLink::CertificateVerify("AB-CD")),
            "/kz/certificates/AB-CD/verify"
        );
        assert_eq!(
            v2(WebLink::CertificateVerify("AB-CD")),
            "/certificates/AB-CD/verify"
        );
        let s = AssessmentId(uuid::Uuid::nil());
        assert_eq!(
            legacy(WebLink::AnalyticsAssessment(AssessmentKind::Quiz, s)),
            format!("/dash/analytics/assessments/quiz/{s}")
        );
        assert_eq!(
            v2(WebLink::AnalyticsAssessment(
                AssessmentKind::CodeChallenge,
                s
            )),
            format!("/teach/analytics/performance?assessmentType=code_challenge&assessmentId={s}")
        );
        assert_eq!(
            v2(WebLink::AnalyticsBacklog),
            "/teach/analytics/operations?metric=backlog"
        );
        assert_eq!(
            v2(WebLink::AnalyticsAtRisk(c)),
            format!("/teach/analytics/learners?course={c}")
        );
    }
}
