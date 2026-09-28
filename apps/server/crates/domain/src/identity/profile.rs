//! The profile builder document (`users.profile`, legacy `user.profile`,
//! BUG-361) and the per-user UI theme slug (`users.theme`, BUG-362).
//!
//! The section kinds are exactly the ones the legacy builder wrote; an
//! unknown kind or field is a parse error (422 through the API, a hard error
//! with the row id in the ETL). [`ProfileSections::normalize`] trims every
//! string, strips control characters, caps sizes and admits only `http(s)`
//! URLs for images, links and logos.

use ab_core::{Error, FieldError, Result, strip_controls, strip_controls_multiline, trim_blank};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub const MAX_SECTIONS: usize = 20;
pub const MAX_ITEMS_PER_SECTION: usize = 50;
/// Serialized document cap (bytes) — a few hundred filled items.
pub const MAX_PROFILE_BYTES: usize = 64 * 1024;
pub const MAX_THEME_LEN: usize = 48;
const MAX_SHORT: usize = 200;
const MAX_DESCRIPTION: usize = 2_000;
const MAX_CONTENT: usize = 10_000;
const MAX_URL: usize = 2_048;

/// `{ "sections": [...] }`, the stored column's default.
///
/// Every array and plain-text field is required so the contract's TypeScript
/// shape needs no fallbacks; only the legacy-optional ones are `Option`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ProfileSections {
    pub sections: Vec<ProfileSection>,
}

/// One builder section, tagged by `type` (legacy kebab-case kinds).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ProfileSection {
    ImageGallery(ImageGallerySection),
    Text(TextSection),
    Links(LinksSection),
    Skills(SkillsSection),
    Experience(ExperienceSection),
    Education(EducationSection),
    Affiliation(AffiliationSection),
    Courses(CoursesSection),
    Gamification(GamificationSection),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ImageGallerySection {
    pub id: String,
    pub title: String,
    pub images: Vec<ProfileImage>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct TextSection {
    pub id: String,
    pub title: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct LinksSection {
    pub id: String,
    pub title: String,
    pub links: Vec<ProfileLink>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SkillsSection {
    pub id: String,
    pub title: String,
    pub skills: Vec<ProfileSkill>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ExperienceSection {
    pub id: String,
    pub title: String,
    pub experiences: Vec<ProfileExperience>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct EducationSection {
    pub id: String,
    pub title: String,
    pub education: Vec<ProfileEducation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AffiliationSection {
    pub id: String,
    pub title: String,
    pub affiliations: Vec<ProfileAffiliation>,
}

/// The user's authored courses; rendered from `GET /users/{username}/courses`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CoursesSection {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct GamificationSection {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub settings: GamificationSectionSettings,
}

// Four independent legacy toggles, stored as written.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GamificationSectionSettings {
    #[serde(default)]
    pub show_level: bool,
    #[serde(default)]
    pub show_xp: bool,
    #[serde(default)]
    pub show_streaks: bool,
    #[serde(default)]
    pub show_leaderboard: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ProfileImage {
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ProfileLink {
    pub title: String,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum SkillLevel {
    Beginner,
    Intermediate,
    Advanced,
    Expert,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ProfileSkill {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level: Option<SkillLevel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProfileExperience {
    pub title: String,
    pub organization: String,
    /// `YYYY-MM-DD` as the builder's date picker writes it.
    pub start_date: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_date: Option<String>,
    pub current: bool,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProfileEducation {
    pub institution: String,
    pub degree: String,
    pub field: String,
    pub start_date: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_date: Option<String>,
    pub current: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProfileAffiliation {
    pub name: String,
    pub description: String,
    /// Blank or an `http(s)` URL.
    pub logo_url: String,
}

/// Field-path validator: collects every failure so the client can bind them.
struct Check {
    errors: Vec<FieldError>,
}

impl Check {
    fn push(&mut self, field: String, code: &str, message: String) {
        self.errors.push(FieldError {
            field,
            code: code.into(),
            message,
        });
    }

    fn short(&mut self, path: &str, value: &mut String) {
        self.text(path, value, MAX_SHORT, false);
    }

    fn long(&mut self, path: &str, value: &mut String, max: usize) {
        self.text(path, value, max, true);
    }

    fn text(&mut self, path: &str, value: &mut String, max: usize, multiline: bool) {
        let cleaned = if multiline {
            strip_controls_multiline(value)
        } else {
            strip_controls(value)
        };
        trim_blank(&cleaned).clone_into(value);
        if value.chars().count() > max {
            self.push(
                path.to_owned(),
                "too-long",
                format!("{path} must be at most {max} characters"),
            );
        }
    }

    fn opt_short(&mut self, path: &str, value: &mut Option<String>) {
        if let Some(v) = value {
            self.short(path, v);
        }
    }

    fn opt_long(&mut self, path: &str, value: &mut Option<String>) {
        if let Some(v) = value {
            self.long(path, v, MAX_DESCRIPTION);
        }
    }

    /// `http(s)://…` only; blank is `required` unless `optional`.
    fn url(&mut self, path: &str, value: &mut String, optional: bool) {
        trim_blank(&strip_controls(value)).clone_into(value);
        if value.is_empty() {
            if !optional {
                self.errors.push(FieldError::required(path));
            }
            return;
        }
        if value.len() > MAX_URL {
            self.push(
                path.to_owned(),
                "too-long",
                format!("{path} must be at most {MAX_URL} characters"),
            );
        } else if !is_http_url(value) {
            self.push(
                path.to_owned(),
                "invalid",
                format!("{path} must be an http(s) URL"),
            );
        }
    }

    fn count(&mut self, path: &str, len: usize, max: usize) {
        if len > max {
            self.push(
                path.to_owned(),
                "too-long",
                format!("{path} holds at most {max} entries"),
            );
        }
    }

    fn section_head(&mut self, path: &str, id: &mut String, title: &mut String) {
        self.short(&format!("{path}.id"), id);
        if id.is_empty() {
            self.errors
                .push(FieldError::required(&format!("{path}.id")));
        }
        self.short(&format!("{path}.title"), title);
    }
}

#[must_use]
pub fn is_http_url(value: &str) -> bool {
    let rest = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"));
    rest.is_some_and(|host| !host.is_empty() && !host.starts_with('/'))
}

impl ProfileSections {
    /// Trim, strip controls, cap, check URLs — every failure as one
    /// `profile.sections[i]…` field error (422).
    pub fn normalize(&mut self) -> Result<()> {
        let mut c = Check { errors: Vec::new() };
        c.count("profile.sections", self.sections.len(), MAX_SECTIONS);
        for (i, section) in self.sections.iter_mut().enumerate() {
            section.normalize(&mut c, &format!("profile.sections[{i}]"));
        }
        if c.errors.is_empty() {
            let bytes = serde_json::to_vec(self).map_or(usize::MAX, |v| v.len());
            if bytes > MAX_PROFILE_BYTES {
                c.push(
                    "profile".into(),
                    "too-long",
                    format!("profile must be at most {MAX_PROFILE_BYTES} bytes"),
                );
            }
        }
        if c.errors.is_empty() {
            Ok(())
        } else {
            Err(Error::validation(c.errors))
        }
    }
}

impl ProfileSection {
    fn normalize(&mut self, c: &mut Check, p: &str) {
        {
            let p = p.to_owned();
            match self {
                Self::ImageGallery(s) => {
                    c.section_head(&p, &mut s.id, &mut s.title);
                    c.count(
                        &format!("{p}.images"),
                        s.images.len(),
                        MAX_ITEMS_PER_SECTION,
                    );
                    for (j, image) in s.images.iter_mut().enumerate() {
                        c.url(&format!("{p}.images[{j}].url"), &mut image.url, false);
                        c.opt_short(&format!("{p}.images[{j}].caption"), &mut image.caption);
                    }
                }
                Self::Text(s) => {
                    c.section_head(&p, &mut s.id, &mut s.title);
                    c.long(&format!("{p}.content"), &mut s.content, MAX_CONTENT);
                }
                Self::Links(s) => {
                    c.section_head(&p, &mut s.id, &mut s.title);
                    c.count(&format!("{p}.links"), s.links.len(), MAX_ITEMS_PER_SECTION);
                    for (j, link) in s.links.iter_mut().enumerate() {
                        c.short(&format!("{p}.links[{j}].title"), &mut link.title);
                        c.url(&format!("{p}.links[{j}].url"), &mut link.url, false);
                        c.opt_short(&format!("{p}.links[{j}].icon"), &mut link.icon);
                    }
                }
                Self::Skills(s) => {
                    c.section_head(&p, &mut s.id, &mut s.title);
                    c.count(
                        &format!("{p}.skills"),
                        s.skills.len(),
                        MAX_ITEMS_PER_SECTION,
                    );
                    for (j, skill) in s.skills.iter_mut().enumerate() {
                        c.short(&format!("{p}.skills[{j}].name"), &mut skill.name);
                        c.opt_short(&format!("{p}.skills[{j}].category"), &mut skill.category);
                    }
                }
                Self::Experience(s) => {
                    c.section_head(&p, &mut s.id, &mut s.title);
                    c.count(
                        &format!("{p}.experiences"),
                        s.experiences.len(),
                        MAX_ITEMS_PER_SECTION,
                    );
                    for (j, e) in s.experiences.iter_mut().enumerate() {
                        let q = format!("{p}.experiences[{j}]");
                        c.short(&format!("{q}.title"), &mut e.title);
                        c.short(&format!("{q}.organization"), &mut e.organization);
                        c.short(&format!("{q}.startDate"), &mut e.start_date);
                        c.opt_short(&format!("{q}.endDate"), &mut e.end_date);
                        c.long(
                            &format!("{q}.description"),
                            &mut e.description,
                            MAX_DESCRIPTION,
                        );
                    }
                }
                Self::Education(s) => {
                    c.section_head(&p, &mut s.id, &mut s.title);
                    c.count(
                        &format!("{p}.education"),
                        s.education.len(),
                        MAX_ITEMS_PER_SECTION,
                    );
                    for (j, e) in s.education.iter_mut().enumerate() {
                        let q = format!("{p}.education[{j}]");
                        c.short(&format!("{q}.institution"), &mut e.institution);
                        c.short(&format!("{q}.degree"), &mut e.degree);
                        c.short(&format!("{q}.field"), &mut e.field);
                        c.short(&format!("{q}.startDate"), &mut e.start_date);
                        c.opt_short(&format!("{q}.endDate"), &mut e.end_date);
                        c.opt_long(&format!("{q}.description"), &mut e.description);
                    }
                }
                Self::Affiliation(s) => {
                    c.section_head(&p, &mut s.id, &mut s.title);
                    c.count(
                        &format!("{p}.affiliations"),
                        s.affiliations.len(),
                        MAX_ITEMS_PER_SECTION,
                    );
                    for (j, a) in s.affiliations.iter_mut().enumerate() {
                        let q = format!("{p}.affiliations[{j}]");
                        c.short(&format!("{q}.name"), &mut a.name);
                        c.long(
                            &format!("{q}.description"),
                            &mut a.description,
                            MAX_DESCRIPTION,
                        );
                        c.url(&format!("{q}.logoUrl"), &mut a.logo_url, true);
                    }
                }
                Self::Courses(s) => c.section_head(&p, &mut s.id, &mut s.title),
                Self::Gamification(s) => c.section_head(&p, &mut s.id, &mut s.title),
            }
        }
    }
}

/// A theme registry slug: `[A-Za-z0-9-]`, at most [`MAX_THEME_LEN`]. The
/// server keeps no theme list — the web resolves an unknown slug to its
/// default.
pub fn theme_slug(value: &str) -> Result<&str> {
    let value = trim_blank(value);
    let ok = !value.is_empty()
        && value.len() <= MAX_THEME_LEN
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-');
    if ok {
        Ok(value)
    } else {
        Err(Error::validation(vec![FieldError {
            field: "theme".into(),
            code: "invalid".into(),
            message: format!("theme must be 1..={MAX_THEME_LEN} characters of [A-Za-z0-9-]"),
        }]))
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    fn doc(json: serde_json::Value) -> serde_json::Result<ProfileSections> {
        serde_json::from_value(json)
    }

    #[test]
    fn legacy_document_round_trips_unchanged() {
        let json = serde_json::json!({"sections": [
            {"id": "section-1768118219681", "type": "education", "title": "Раздел «Образование»",
             "education": [{"institution": "ПГУ", "degree": "специалист", "field": "Математика",
                            "startDate": "1993-09-01", "current": false, "description": "", "endDate": "1997-06-30"}]},
            {"id": "section-2", "type": "experience", "title": "НПЦзем",
             "experiences": [{"title": "Главный специалист", "organization": "Филиал", "startDate": "2009-01-05",
                              "current": true, "description": "Администратор серверов. "}]},
            {"id": "section-3", "type": "image-gallery", "title": "Галерея",
             "images": [{"url": "https://img.example.com/a.jpg?x=1&w=740", "caption": "аватар"}]},
            {"id": "section-4", "type": "courses", "title": "Test Python"}
        ]});
        let mut parsed = doc(json).unwrap();
        parsed.normalize().unwrap();
        assert_eq!(parsed.sections.len(), 4);
        let ProfileSection::Experience(e) = &parsed.sections[1] else {
            panic!("experience")
        };
        assert_eq!(e.experiences[0].description, "Администратор серверов.");
        assert_eq!(e.experiences[0].end_date, None);
        // Absent optionals stay absent on the wire (legacy shape).
        let out = serde_json::to_value(&parsed).unwrap();
        assert!(
            out["sections"][1]["experiences"][0]
                .get("endDate")
                .is_none()
        );
        assert_eq!(out["sections"][0]["education"][0]["endDate"], "1997-06-30");
    }

    #[test]
    fn sections_are_required() {
        assert!(doc(serde_json::json!({})).is_err());
        assert_eq!(
            doc(serde_json::json!({"sections": []})).unwrap(),
            ProfileSections::default()
        );
    }

    #[test]
    fn unknown_kind_and_unknown_field_are_rejected() {
        assert!(
            doc(serde_json::json!({"sections": [{"id": "s", "type": "hero", "title": "x"}]}))
                .is_err()
        );
        assert!(doc(serde_json::json!({"sections": [{"id": "s", "type": "text", "title": "x", "html": "<b>"}]})).is_err());
        assert!(
            doc(
                serde_json::json!({"sections": [{"id": "s", "type": "skills", "title": "x",
            "skills": [{"name": "Rust", "level": "guru"}]}]})
            )
            .is_err()
        );
    }

    #[test]
    fn urls_must_be_http_and_strings_are_trimmed_and_capped() {
        let mut parsed = doc(serde_json::json!({"sections": [
            {"id": " s1 ", "type": "links", "title": "  Links\u{202E} ",
             "links": [{"title": "x", "url": "javascript:alert(1)"}, {"title": "y", "url": ""}]},
            {"id": "s2", "type": "affiliation", "title": "A",
             "affiliations": [{"name": "N", "description": "D", "logoUrl": ""}]},
            {"id": "s3", "type": "text", "title": "T", "content": "x".repeat(MAX_CONTENT + 1)}
        ]}))
        .unwrap();
        let Err(Error::Validation { field_errors }) = parsed.normalize() else {
            panic!("expected validation errors")
        };
        let keys: Vec<(String, String)> = field_errors
            .iter()
            .map(|e| (e.field.clone(), e.code.clone()))
            .collect();
        assert_eq!(
            keys,
            vec![
                ("profile.sections[0].links[0].url".into(), "invalid".into()),
                ("profile.sections[0].links[1].url".into(), "required".into()),
                ("profile.sections[2].content".into(), "too-long".into()),
            ]
        );
        let ProfileSection::Links(l) = &parsed.sections[0] else {
            panic!("links")
        };
        assert_eq!(l.id, "s1");
        assert_eq!(l.title, "Links");
    }

    #[test]
    fn section_and_item_counts_are_capped() {
        let sections: Vec<_> = (0..=MAX_SECTIONS)
            .map(|i| serde_json::json!({"id": format!("s{i}"), "type": "courses", "title": "c"}))
            .collect();
        let mut parsed = doc(serde_json::json!({"sections": sections})).unwrap();
        let Err(Error::Validation { field_errors }) = parsed.normalize() else {
            panic!("expected validation errors")
        };
        assert_eq!(field_errors[0].field, "profile.sections");
        assert_eq!(field_errors[0].code, "too-long");
    }

    #[test]
    fn theme_slug_rules() {
        assert_eq!(theme_slug(" modern-minimal ").unwrap(), "modern-minimal");
        assert_eq!(theme_slug("vintagePaper").unwrap(), "vintagePaper");
        assert_eq!(theme_slug("doom-64").unwrap(), "doom-64");
        assert!(theme_slug("").is_err());
        assert!(theme_slug("bad slug!").is_err());
        assert!(theme_slug(&"a".repeat(MAX_THEME_LEN + 1)).is_err());
    }
}
