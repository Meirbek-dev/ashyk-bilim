//! The platform's three UI languages, picked from `Accept-Language` or a
//! stored user locale (`ru-RU` / `kk-KZ` / `en-US`).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    Ru,
    Kk,
    En,
}

impl Language {
    /// First supported tag in an `Accept-Language` value (order of listing
    /// stands in for q-weights); `None` when nothing matches.
    #[must_use]
    pub fn from_accept_language(header: Option<&str>) -> Option<Self> {
        header?
            .split(',')
            .filter_map(|part| part.split(';').next())
            .find_map(|tag| Self::from_locale(tag.trim()))
    }

    /// `ru`, `ru-RU`, `kk-KZ`, `en-US`… by primary subtag.
    #[must_use]
    pub fn from_locale(locale: &str) -> Option<Self> {
        match locale.split(['-', '_']).next().unwrap_or_default() {
            "ru" => Some(Self::Ru),
            "kk" => Some(Self::Kk),
            "en" => Some(Self::En),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Language;

    #[test]
    fn picks_the_first_supported_tag() {
        assert_eq!(
            Language::from_accept_language(Some("de, kk-KZ;q=0.8, en")),
            Some(Language::Kk)
        );
        assert_eq!(Language::from_accept_language(Some("fr")), None);
        assert_eq!(Language::from_accept_language(None), None);
        assert_eq!(Language::from_locale("en-US"), Some(Language::En));
    }
}
