//! `AB__*` environment variables → typed config through serde.
//!
//! `AB__SECTION__KEY` nests by `__`; key segments are matched case-insensitively (lowercased, as the serde field
//! names). Each value is read as the target field asks: strings verbatim (trimmed; one pair of surrounding double
//! quotes is removed), `true`/`false`, numbers, enums by variant name, lists as `["a","b"]` (TOML/JSON style, bare
//! items allowed). Errors name the variable: `AB__SERVER__PORT: invalid value "abc": ...`, `AB__DATABASE__URL must
//! be set`.

use std::collections::BTreeMap;
use std::fmt;

use serde::de::{self, DeserializeOwned, DeserializeSeed, IntoDeserializer, Visitor};

/// Deserialize `T` from `defaults` (keys without the prefix, `SERVER__HOST`) overlaid with the prefixed `vars`.
pub fn from_vars<T: DeserializeOwned>(
    prefix: &str,
    defaults: &[(&str, &str)],
    vars: impl IntoIterator<Item = (String, String)>,
) -> Result<T, EnvError> {
    let mut root = BTreeMap::new();
    let defaults = defaults
        .iter()
        .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()));
    let prefixed = vars.into_iter().filter_map(|(key, value)| {
        let key = key.trim();
        let rest = key
            .get(..prefix.len())?
            .eq_ignore_ascii_case(prefix)
            .then(|| &key[prefix.len()..])?;
        Some((rest.to_owned(), value))
    });
    for (key, value) in defaults.chain(prefixed) {
        let segments: Vec<String> = key.split("__").map(str::to_ascii_lowercase).collect();
        if segments.iter().any(String::is_empty) {
            continue;
        }
        insert(&mut root, prefix.trim_end_matches('_'), &segments, value)?;
    }
    T::deserialize(Node::Map(prefix.trim_end_matches('_').to_owned(), root))
}

fn insert(
    map: &mut BTreeMap<String, Node>,
    path: &str,
    segments: &[String],
    value: String,
) -> Result<(), EnvError> {
    let Some((first, rest)) = segments.split_first() else {
        return Ok(());
    };
    let var = format!("{path}__{}", first.to_ascii_uppercase());
    if rest.is_empty() {
        if matches!(map.get(first), Some(Node::Map(..))) {
            return Err(EnvError::new(format!(
                "{var} is a section ({var}__*), not a value"
            )));
        }
        map.insert(first.clone(), Node::Leaf(var, value));
        return Ok(());
    }
    let node = map
        .entry(first.clone())
        .or_insert_with(|| Node::Map(var.clone(), BTreeMap::new()));
    match node {
        Node::Map(_, children) => insert(children, &var, rest, value),
        Node::Leaf(..) => Err(EnvError::new(format!(
            "{var} is a value, so {var}__* cannot be set"
        ))),
    }
}

/// A config error that names the variable it is about.
#[derive(Debug)]
pub struct EnvError {
    msg: String,
    /// The variable (or section) once known; `missing_field` leaves the field name for the enclosing section.
    var: Option<String>,
    missing: Option<&'static str>,
}

impl EnvError {
    const fn new(msg: String) -> Self {
        Self {
            msg,
            var: None,
            missing: None,
        }
    }

    fn at(mut self, var: &str) -> Self {
        if self.var.is_none() {
            self.var = Some(match self.missing.take() {
                Some(field) => format!("{var}__{}", field.to_ascii_uppercase()),
                None => var.to_owned(),
            });
        }
        self
    }
}

impl fmt::Display for EnvError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match (&self.var, self.missing) {
            (Some(var), _) if self.msg.is_empty() => write!(f, "{var} must be set"),
            (Some(var), _) => write!(f, "{var}: {}", self.msg),
            (None, Some(field)) => write!(f, "missing field `{field}`"),
            (None, None) => f.write_str(&self.msg),
        }
    }
}

impl std::error::Error for EnvError {}

impl de::Error for EnvError {
    fn custom<T: fmt::Display>(msg: T) -> Self {
        Self::new(msg.to_string())
    }

    fn missing_field(field: &'static str) -> Self {
        Self {
            msg: String::new(),
            var: None,
            missing: Some(field),
        }
    }
}

/// A variable (`Leaf(name, value)`) or a section (`Map(name, children)`).
enum Node {
    Leaf(String, String),
    Map(String, BTreeMap<String, Self>),
}

/// The scalar text: trimmed, one pair of surrounding double quotes removed (`\"` and `\\` unescaped inside).
fn scalar(raw: &str) -> String {
    let t = raw.trim();
    match t.strip_prefix('"').and_then(|s| s.strip_suffix('"')) {
        Some(inner) => inner.replace("\\\"", "\"").replace("\\\\", "\\"),
        None => t.to_owned(),
    }
}

/// `["a", "b"]`, `[a, b]` or `a, b` → items; commas inside double quotes do not split.
fn list(raw: &str) -> Vec<String> {
    let t = raw.trim();
    let inner = t
        .strip_prefix('[')
        .and_then(|s| s.strip_suffix(']'))
        .unwrap_or(t);
    let (mut items, mut cur, mut quoted, mut escaped) = (Vec::new(), String::new(), false, false);
    for c in inner.chars() {
        match c {
            _ if escaped => escaped = false,
            '\\' if quoted => escaped = true,
            '"' => quoted = !quoted,
            ',' if !quoted => {
                items.push(scalar(&cur));
                cur.clear();
                continue;
            }
            _ => {}
        }
        cur.push(c);
    }
    if !cur.trim().is_empty() || !items.is_empty() {
        items.push(scalar(&cur));
    }
    items
}

macro_rules! parse_scalar {
    ($($method:ident => $visit:ident: $ty:ty),* $(,)?) => {$(
        fn $method<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, EnvError> {
            match self {
                Self::Leaf(var, raw) => {
                    let text = scalar(&raw);
                    let parsed: $ty = text.parse().map_err(|e| {
                        EnvError::new(format!("invalid value {text:?}: {e}")).at(&var)
                    })?;
                    visitor.$visit(parsed).map_err(|e: EnvError| e.at(&var))
                }
                Self::Map(var, _) => Err(EnvError::new("expected a value, found a section".into()).at(&var)),
            }
        }
    )*};
}

impl<'de> de::Deserializer<'de> for Node {
    type Error = EnvError;

    fn deserialize_any<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, EnvError> {
        match self {
            Self::Leaf(var, raw) => visitor
                .visit_string(scalar(&raw))
                .map_err(|e: EnvError| e.at(&var)),
            Self::Map(var, children) => visitor
                .visit_map(Entries::new(children))
                .map_err(|e: EnvError| e.at(&var)),
        }
    }

    parse_scalar! {
        deserialize_u8 => visit_u8: u8,
        deserialize_u16 => visit_u16: u16,
        deserialize_u32 => visit_u32: u32,
        deserialize_u64 => visit_u64: u64,
        deserialize_i8 => visit_i8: i8,
        deserialize_i16 => visit_i16: i16,
        deserialize_i32 => visit_i32: i32,
        deserialize_i64 => visit_i64: i64,
        deserialize_f32 => visit_f32: f32,
        deserialize_f64 => visit_f64: f64,
    }

    fn deserialize_bool<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, EnvError> {
        match self {
            Self::Leaf(var, raw) => match scalar(&raw).to_ascii_lowercase().as_str() {
                "true" => visitor.visit_bool(true),
                "false" => visitor.visit_bool(false),
                other => Err(de::Error::custom(format!(
                    "expected true or false, found {other:?}"
                ))),
            }
            .map_err(|e: EnvError| e.at(&var)),
            Self::Map(var, _) => {
                Err(EnvError::new("expected true or false, found a section".into()).at(&var))
            }
        }
    }

    fn deserialize_option<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, EnvError> {
        visitor.visit_some(self)
    }

    fn deserialize_newtype_struct<V: Visitor<'de>>(
        self,
        _name: &'static str,
        visitor: V,
    ) -> Result<V::Value, EnvError> {
        visitor.visit_newtype_struct(self)
    }

    fn deserialize_seq<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, EnvError> {
        match self {
            Self::Leaf(var, raw) => {
                let items = list(&raw)
                    .into_iter()
                    .enumerate()
                    .map(|(i, v)| Self::Leaf(format!("{var}[{i}]"), v));
                visitor
                    .visit_seq(de::value::SeqDeserializer::<_, EnvError>::new(items))
                    .map_err(|e: EnvError| e.at(&var))
            }
            Self::Map(var, _) => {
                Err(EnvError::new("expected a list, found a section".into()).at(&var))
            }
        }
    }

    fn deserialize_enum<V: Visitor<'de>>(
        self,
        _name: &'static str,
        _variants: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, EnvError> {
        match self {
            Self::Leaf(var, raw) => {
                let de: de::value::StringDeserializer<EnvError> = scalar(&raw).into_deserializer();
                visitor.visit_enum(de).map_err(|e: EnvError| e.at(&var))
            }
            Self::Map(var, _) => {
                Err(EnvError::new("expected a value, found a section".into()).at(&var))
            }
        }
    }

    fn deserialize_ignored_any<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, EnvError> {
        visitor.visit_unit()
    }

    serde::forward_to_deserialize_any! {
        i128 u128 char str string bytes byte_buf unit unit_struct tuple tuple_struct map struct identifier
    }
}

impl IntoDeserializer<'_, EnvError> for Node {
    type Deserializer = Self;

    fn into_deserializer(self) -> Self {
        self
    }
}

/// The children of a section, for `visit_map`.
struct Entries {
    iter: std::collections::btree_map::IntoIter<String, Node>,
    value: Option<Node>,
}

impl Entries {
    fn new(children: BTreeMap<String, Node>) -> Self {
        Self {
            iter: children.into_iter(),
            value: None,
        }
    }
}

impl<'de> de::MapAccess<'de> for Entries {
    type Error = EnvError;

    fn next_key_seed<K: DeserializeSeed<'de>>(
        &mut self,
        seed: K,
    ) -> Result<Option<K::Value>, EnvError> {
        let Some((key, value)) = self.iter.next() else {
            return Ok(None);
        };
        self.value = Some(value);
        seed.deserialize(de::value::StringDeserializer::<EnvError>::new(key))
            .map(Some)
    }

    fn next_value_seed<V: DeserializeSeed<'de>>(&mut self, seed: V) -> Result<V::Value, EnvError> {
        match self.value.take() {
            Some(node) => seed.deserialize(node),
            None => Err(de::Error::custom("value requested before its key")),
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use secrecy::{ExposeSecret, SecretString};
    use serde::Deserialize;

    use super::*;

    #[derive(Debug, Deserialize, PartialEq, Eq)]
    #[serde(rename_all = "lowercase")]
    enum Mode {
        Dev,
        Prod,
    }

    #[derive(Debug, Deserialize)]
    struct Root {
        mode: Mode,
        server: Server,
        db: Db,
        smtp: Option<Smtp>,
        #[serde(default)]
        flag: bool,
    }

    #[derive(Debug, Deserialize)]
    struct Server {
        host: String,
        port: u16,
        origins: Vec<String>,
        ratio: f64,
        url: Option<String>,
    }

    #[derive(Debug, Deserialize)]
    struct Db {
        url: SecretString,
        #[serde(default)]
        limits: Limits,
    }

    #[derive(Debug, Default, Deserialize)]
    #[serde(default)]
    struct Limits {
        lock_secs: u64,
    }

    #[derive(Debug, Deserialize)]
    struct Smtp {
        host: String,
        password: Option<SecretString>,
    }

    const DEFAULTS: &[(&str, &str)] = &[
        ("MODE", "dev"),
        ("SERVER__HOST", "0.0.0.0"),
        ("SERVER__PORT", "8000"),
        ("SERVER__ORIGINS", "[]"),
        ("SERVER__RATIO", "0.5"),
    ];

    fn load(vars: &[(&str, &str)]) -> Result<Root, EnvError> {
        from_vars(
            "AB__",
            DEFAULTS,
            vars.iter().map(|(k, v)| ((*k).to_owned(), (*v).to_owned())),
        )
    }

    #[test]
    fn defaults_then_env_with_types_and_nesting() {
        let cfg = load(&[
            ("AB__MODE", "prod"),
            ("AB__SERVER__PORT", " 9000\r"),
            ("AB__SERVER__ORIGINS", r#"["https://a", "https://b,c"]"#),
            ("AB__SERVER__URL", ""),
            ("AB__DB__URL", "postgres://x"),
            ("AB__DB__LIMITS__LOCK_SECS", "5"),
            ("ab__flag", "TRUE"),
            ("OTHER__SERVER__PORT", "1"),
            ("AB__UNKNOWN__KEY", "ignored"),
        ])
        .unwrap();
        assert_eq!(cfg.mode, Mode::Prod);
        assert_eq!(cfg.server.host, "0.0.0.0");
        assert_eq!(cfg.server.port, 9000);
        assert_eq!(cfg.server.origins, ["https://a", "https://b,c"]);
        assert!((cfg.server.ratio - 0.5).abs() < f64::EPSILON);
        assert_eq!(
            cfg.server.url.as_deref(),
            Some(""),
            "an empty variable counts as set"
        );
        assert_eq!(cfg.db.url.expose_secret(), "postgres://x");
        assert_eq!(cfg.db.limits.lock_secs, 5);
        assert!(cfg.flag);
        assert!(cfg.smtp.is_none(), "an absent section is None");
    }

    #[test]
    fn strings_stay_verbatim_and_lists_accept_bare_items() {
        let cfg = load(&[
            ("AB__DB__URL", "123"),
            ("AB__SERVER__HOST", r#""quoted \"host\"""#),
            ("AB__SERVER__ORIGINS", "python, cpp"),
            ("AB__SMTP__HOST", "true"),
        ])
        .unwrap();
        assert_eq!(cfg.db.url.expose_secret(), "123");
        assert_eq!(cfg.server.host, r#"quoted "host""#);
        assert_eq!(cfg.server.origins, ["python", "cpp"]);
        let smtp = cfg.smtp.unwrap();
        assert_eq!(smtp.host, "true");
        assert!(smtp.password.is_none());
    }

    #[test]
    fn errors_name_the_variable() {
        let err = |vars: &[(&str, &str)]| load(vars).unwrap_err().to_string();
        assert_eq!(err(&[]), "AB__DB must be set");
        assert_eq!(
            err(&[("AB__DB__LIMITS__LOCK_SECS", "1")]),
            "AB__DB__URL must be set"
        );
        assert_eq!(
            err(&[("AB__DB__URL", "x"), ("AB__SMTP__PASSWORD", "p")]),
            "AB__SMTP__HOST must be set"
        );
        let port = err(&[("AB__DB__URL", "x"), ("AB__SERVER__PORT", "abc")]);
        assert!(
            port.starts_with("AB__SERVER__PORT: invalid value \"abc\""),
            "{port}"
        );
        let mode = err(&[("AB__DB__URL", "x"), ("AB__MODE", "staging")]);
        assert!(
            mode.starts_with("AB__MODE: unknown variant `staging`"),
            "{mode}"
        );
        let flag = err(&[("AB__DB__URL", "x"), ("AB__FLAG", "yes")]);
        assert_eq!(flag, "AB__FLAG: expected true or false, found \"yes\"");
        let shape = err(&[("AB__DB", "x")]);
        assert_eq!(
            shape,
            "AB__DB: invalid type: string \"x\", expected struct Db"
        );
        let clash = err(&[("AB__DB__URL", "x"), ("AB__DB__URL__MORE", "y")]);
        assert_eq!(
            clash,
            "AB__DB__URL is a value, so AB__DB__URL__* cannot be set"
        );
    }

    #[test]
    fn list_syntax() {
        assert!(list("[]").is_empty());
        assert!(list("").is_empty());
        assert_eq!(
            list(r#"["python","cpp","java"]"#),
            ["python", "cpp", "java"]
        );
        assert_eq!(list("[a, b ,c]"), ["a", "b", "c"]);
        assert_eq!(list(r#"["a\"b,c"]"#), [r#"a"b,c"#]);
    }
}
