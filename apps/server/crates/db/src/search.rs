//! Platform search (search-lite).
//!
//! Matching is the `search_matches` rule (UX-222, shared with `courses?q=`): every
//! word matches at a word start (UX-152 prefix), a one-character word only
//! whole and unfolded, symbols count (`C#`, `C++` - the 'simple' tsvector
//! drops them), Kazakh letters fold to the Russian keyboard's (қ→к, і→и) and ё to е, and Cyrillic
//! look-alikes fold to Latin (SQL `search_fold`); `-word` excludes. Hits are ranked by
//! `ts_rank_cd` over the `search` tsvector, then recency.
//!
//! The `/search` queries spell the rule out as one predicate per word ([`push_terms`]), so the
//! trigram index on each searched text (`*_search_trgm_idx`, `pg_trgm`) answers a word of three
//! or more characters; shorter words and exclusions filter the rows it found. `search_matches`
//! (one function over arrays, no index) still serves the catalog listings' `q` filter.

use ab_core::Result;
use ab_core::id::{ActivityId, CourseId, UserId};
use sqlx::{PgPool, Postgres, QueryBuilder};

use crate::catalog::CourseRow;
use crate::collections::CollectionRow;

/// Inflection endings of Russian (and the Kazakh vowel ones), longest first.
const ENDINGS: &[&str] = &[
    "ями", "ами", "ого", "его", "ому", "ему", "ыми", "ими", "ых", "их", "ой", "ей", "ий", "ый",
    "ая", "яя", "ое", "ее", "ов", "ев", "ам", "ям", "ах", "ях", "ом", "ем", "ию", "ия", "ие", "ии",
    "а", "я", "ы", "и", "у", "ю", "е", "о", "й", "ь", "і",
];

/// A Cyrillic word without its inflection ending: «базы» finds «базами».
///
/// A word-start prefix alone missed every other case form («данных» / «данные»). The stem keeps at least three
/// letters; other words stay as typed.
/// ponytail: an ending list, not a stemmer - add Snowball if Kazakh suffixes (-лар, -ның) start to matter.
#[must_use]
pub fn stem(word: &str) -> &str {
    if !word
        .chars()
        .all(|c| matches!(c, 'а'..='я' | 'А'..='Я' | 'ё' | 'Ё') || "әғқңөұүһіӘҒҚҢӨҰҮҺІ".contains(c))
    {
        return word;
    }
    let lower = word.to_lowercase();
    let letters = lower.chars().count();
    ENDINGS
        .iter()
        .find(|ending| lower.ends_with(*ending) && letters - ending.chars().count() >= 3)
        .map_or(word, |ending| {
            let keep = letters - ending.chars().count();
            word.char_indices()
                .nth(keep)
                .map_or(word, |(at, _)| &word[..at])
        })
}

/// `to_tsquery` text for `query`: every word a quoted prefix term.
///
/// `'крит':*` matches «Критик», `'gauntlet21-analytics':*` the hyphenated
/// name; `-word` negates (as a prefix too, UX-155); all ANDed. Quoting keeps the operators ours;
/// inside quotes only `'` and `\` are special, so both are escaped (BUG-249: a trailing `\`
/// escaped the closing quote → 42601) and the text is always valid tsquery syntax.
#[must_use]
pub fn prefix_tsquery(query: &str) -> String {
    query
        .split_whitespace()
        .map(|word| {
            let (negate, word) = match word.strip_prefix('-') {
                Some(rest) if !rest.is_empty() => (true, rest),
                _ => (false, word),
            };
            let not = if negate { "!" } else { "" };
            let quoted = stem(word).replace('\\', r"\\").replace('\'', "''");
            format!("{not}'{quoted}':*")
        })
        .collect::<Vec<_>>()
        .join(" & ")
}

/// `search_matches` word regexes for a query.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct WordPatterns {
    /// Must match the folded text.
    pub words: Vec<String>,
    /// One-character words: must match the unfolded text, so `c` is not
    /// the Russian preposition «с».
    pub letters: Vec<String>,
    /// `-word`: must not match the folded text.
    pub excluded: Vec<String>,
}

/// The `search_matches` regexes for each word of `query`.
///
/// A word must start where a word starts (or the text does) unless it
/// starts with a symbol; a one-character word must also end there, so `c`
/// finds «C» and «C#» but not every word starting with «c». Regex
/// metacharacters are literal.
#[must_use]
pub fn word_patterns(query: &str) -> WordPatterns {
    let mut out = WordPatterns::default();
    for word in query.split_whitespace() {
        let (negate, word) = match word.strip_prefix('-') {
            Some(rest) if !rest.is_empty() => (true, rest),
            _ => (false, word),
        };
        let word = stem(word);
        let mut pattern = String::new();
        if word.starts_with(char::is_alphanumeric) {
            pattern.push_str("(^|[^[:alnum:]])");
        }
        for c in word.chars() {
            if r"\^$.|?*+()[]{}".contains(c) {
                pattern.push('\\');
            }
            pattern.push(c);
        }
        let letter = word.chars().count() == 1;
        if letter {
            pattern.push_str("($|[^[:alnum:]])");
        }
        match (negate, letter) {
            (true, _) => out.excluded.push(pattern),
            (false, true) => out.letters.push(pattern),
            (false, false) => out.words.push(pattern),
        }
    }
    out
}

/// `AND` one predicate per word of `patterns` over `hay` (a constant SQL expression), the
/// `search_matches` rule: a word must match the folded text, a one-character word the lower-cased
/// one, an excluded word must not match. `search_fold(hay) ~ search_fold($n)` is the form the
/// trigram expression indexes answer.
fn push_terms(qb: &mut QueryBuilder<Postgres>, hay: &'static str, patterns: &WordPatterns) {
    for word in &patterns.words {
        qb.push(format_args!(" AND search_fold({hay}) ~ search_fold("))
            .push_bind(word.clone())
            .push(")");
    }
    for letter in &patterns.letters {
        qb.push(format_args!(" AND lower({hay}) ~ lower("))
            .push_bind(letter.clone())
            .push(")");
    }
    for word in &patterns.excluded {
        qb.push(format_args!(" AND search_fold({hay}) !~ search_fold("))
            .push_bind(word.clone())
            .push(")");
    }
}

/// The searched text of a course; `courses_search_trgm_idx` indexes `search_fold` of exactly this.
const COURSE_HAY: &str = "(name || ' ' || description || ' ' || coalesce(about, ''))";
/// The searched text of a collection (`collections_search_trgm_idx`).
const COLLECTION_HAY: &str = "(name || ' ' || description)";
/// The searched text of a lesson (`activities_search_trgm_idx`).
const LESSON_HAY: &str = "(a.name)";

/// Visibility = SQL `course_visible` (BUG-190), the predicate shared with
/// [`crate::catalog::list_courses`] and `collection_listable`.
pub async fn search_courses(
    pool: &PgPool,
    query: &str,
    viewer: Option<UserId>,
    see_all: bool,
    limit: i64,
    offset: i64,
) -> Result<Vec<CourseRow>> {
    let mut qb = courses_query("", query, viewer, see_all, limit, offset);
    Ok(qb.build_query_as::<CourseRow>().fetch_all(pool).await?)
}

/// The plan of [`search_courses`] for an anonymous viewer, one line per row (index regression
/// tests).
pub async fn explain_search_courses(pool: &PgPool, query: &str) -> Result<String> {
    let mut qb = courses_query("EXPLAIN ", query, None, false, 20, 0);
    let lines: Vec<String> = qb.build_query_scalar().fetch_all(pool).await?;
    Ok(lines.join("\n"))
}

fn courses_query(
    prefix: &'static str,
    query: &str,
    viewer: Option<UserId>,
    see_all: bool,
    limit: i64,
    offset: i64,
) -> QueryBuilder<Postgres> {
    let mut qb = QueryBuilder::<Postgres>::new(prefix);
    qb.push(
        "SELECT id, name, description, about, tags,
                public, open_to_contributors, assessments_require_enrollment,
                thumbnail_image_key AS thumbnail_key, learnings, thumbnail_video_key, creator_id,
                (extract(epoch FROM archived_at))::bigint AS archived_at, archived_by, version,
                ARRAY(SELECT ra.user_id FROM course_staff ra
                      WHERE ra.course_id = courses.id AND ra.status = 'active'
                        AND ra.authorship <> 'reporter') AS contributor_ids,
                ARRAY(SELECT ra.user_id FROM course_staff ra
                      WHERE ra.course_id = courses.id AND ra.status = 'active'
                        AND ra.authorship = 'maintainer') AS maintainer_ids,
                (extract(epoch FROM created_at))::bigint AS created_at,
                (extract(epoch FROM updated_at))::bigint AS updated_at
         FROM courses
         WHERE archived_at IS NULL AND course_visible(courses, ",
    );
    qb.push_bind(viewer.map(|v| v.0))
        .push(", ")
        .push_bind(see_all)
        .push(")");
    push_terms(&mut qb, COURSE_HAY, &word_patterns(query));
    qb.push(" ORDER BY ts_rank_cd(search, to_tsquery('simple', ")
        .push_bind(prefix_tsquery(query))
        .push(")) DESC, id DESC LIMIT ")
        .push_bind(limit)
        .push(" OFFSET ")
        .push_bind(offset);
    qb
}

/// Same listing rule as [`crate::collections::list_collections`]
/// (`collection_listable`): no «0 courses» hits (UX-127).
pub async fn search_collections(
    pool: &PgPool,
    query: &str,
    viewer: Option<UserId>,
    see_all: bool,
    see_all_courses: bool,
    limit: i64,
    offset: i64,
) -> Result<Vec<CollectionRow>> {
    let viewer = viewer.map(|v| v.0);
    let mut qb = QueryBuilder::<Postgres>::new(
        "SELECT id, name, description, public, creator_id, version, cover_key,
                (extract(epoch FROM created_at))::bigint AS created_at,
                (extract(epoch FROM updated_at))::bigint AS updated_at
         FROM collections
         WHERE (public OR ",
    );
    qb.push_bind(see_all)
        .push(" OR creator_id = ")
        .push_bind(viewer)
        .push(") AND collection_listable(id, ")
        .push_bind(viewer)
        .push(", ")
        .push_bind(see_all_courses)
        .push(")");
    push_terms(&mut qb, COLLECTION_HAY, &word_patterns(query));
    qb.push(" ORDER BY ts_rank_cd(search, to_tsquery('simple', ")
        .push_bind(prefix_tsquery(query))
        .push(")) DESC, id DESC LIMIT ")
        .push_bind(limit)
        .push(" OFFSET ")
        .push_bind(offset);
    Ok(qb.build_query_as::<CollectionRow>().fetch_all(pool).await?)
}

/// A lesson hit: an activity and the course it is in.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LessonHitRow {
    pub activity_id: ActivityId,
    pub name: String,
    pub activity_type: String,
    pub course_id: CourseId,
    pub course_name: String,
}

/// Activities by name (CONTRACT-REQ-G-6): published activities of published
/// (public), unarchived courses only - never a draft activity or a draft
/// course, whoever asks.
pub async fn search_lessons(
    pool: &PgPool,
    query: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<LessonHitRow>> {
    let mut qb = QueryBuilder::<Postgres>::new(
        "SELECT a.id AS activity_id, a.name, a.activity_type,
                c.id AS course_id, c.name AS course_name
         FROM activities a JOIN courses c ON c.id = a.course_id
         WHERE a.published AND c.public AND c.archived_at IS NULL",
    );
    push_terms(&mut qb, LESSON_HAY, &word_patterns(query));
    qb.push(" ORDER BY lower(a.name), a.id LIMIT ")
        .push_bind(limit)
        .push(" OFFSET ")
        .push_bind(offset);
    Ok(qb.build_query_as::<LessonHitRow>().fetch_all(pool).await?)
}

/// Public-profile projection for people search.
pub struct UserHitRow {
    pub id: UserId,
    pub username: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
}

/// Prefix matches rank above substring matches; active users only.
///
/// (Privacy upgrade over legacy: email is NOT searchable - FINDINGS #16.)
/// A one-character word matches only a whole word of the username or
/// display name, as in course search (UX-238: `c` is not every «…c…»).
/// Both sides go through `search_fold`, so «Айгерим» typed on a Russian
/// keyboard finds «Әйгерім».
pub async fn search_users(
    pool: &PgPool,
    query: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<UserHitRow>> {
    let letters = word_patterns(query).letters;
    let literal = crate::like_escape(query);
    let substring = format!("%{literal}%");
    let prefix = format!("{literal}%");
    let rows = sqlx::query_as!(
        UserHitRow,
        r#"SELECT id AS "id: UserId", username, display_name, avatar_key
           FROM users
           WHERE status = 'active'
             AND (search_fold(username) LIKE search_fold($1) ESCAPE '\'
                  OR search_fold(display_name) LIKE search_fold($1) ESCAPE '\')
             AND search_matches(username || ' ' || display_name, ARRAY[]::text[], $4, ARRAY[]::text[])
           ORDER BY (search_fold(username) LIKE search_fold($2) ESCAPE '\'
                     OR search_fold(display_name) LIKE search_fold($2) ESCAPE '\') DESC, username, id
           LIMIT $3 OFFSET $5"#,
        substring,
        prefix,
        limit,
        &letters,
        offset
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::{WordPatterns, prefix_tsquery, stem, word_patterns};

    #[test]
    fn cyrillic_words_lose_their_inflection_ending() {
        assert_eq!(stem("базы"), "баз");
        assert_eq!(stem("Данных"), "Данн");
        assert_eq!(stem("программирования"), "программирован");
        assert_eq!(stem("курс"), "курс");
        assert_eq!(stem("Крит"), "Крит");
        assert_eq!(stem("мы"), "мы");
        assert_eq!(stem("java"), "java");
        assert_eq!(stem("С#"), "С#");
        assert_eq!(stem("бағдарламалау"), "бағдарламала");
        assert_eq!(
            word_patterns("базы").words,
            vec![r"(^|[^[:alnum:]])баз".to_owned()]
        );
    }

    #[test]
    fn word_patterns_anchor_words_and_keep_symbols() {
        assert_eq!(
            word_patterns(" C# c++ x -.net "),
            WordPatterns {
                words: vec![
                    r"(^|[^[:alnum:]])C#".into(),
                    r"(^|[^[:alnum:]])c\+\+".into()
                ],
                letters: vec![r"(^|[^[:alnum:]])x($|[^[:alnum:]])".into()],
                excluded: vec![r"\.net".into()],
            }
        );
        assert_eq!(word_patterns("  "), WordPatterns::default());
    }

    #[test]
    fn words_are_quoted_prefixes_and_dashes_negate() {
        assert_eq!(
            prefix_tsquery("  gauntlet21-analytics Крит -live it's - "),
            "'gauntlet21-analytics':* & 'Крит':* & !'live':* & 'it''s':* & '-':*"
        );
        assert_eq!(prefix_tsquery("   "), "");
        assert_eq!(prefix_tsquery(r"x\ \"), r"'x\\':* & '\\':*");
    }
}
