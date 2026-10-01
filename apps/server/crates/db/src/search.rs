//! Platform search (search-lite).
//!
//! Matching is `search_matches` (UX-222, shared with `courses?q=`): every
//! word matches at a word start (UX-152 prefix), a one-character word only
//! whole and unfolded, symbols count (`C#`, `C++` - the 'simple' tsvector
//! drops them), and Cyrillic look-alikes fold to Latin; `-word` excludes. Hits are ranked by
//! `ts_rank_cd` over the `search` tsvector, then recency.
//! ponytail: a regex scan per row, not the GIN index - fine for hundreds of
//! courses; a trigram index on the folded text if the catalogue grows.

use ab_core::Result;
use ab_core::id::{CollectionId, CourseId, UserId};
use sqlx::PgPool;

use crate::catalog::CourseRow;
use crate::collections::CollectionRow;

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
            let quoted = word.replace('\\', r"\\").replace('\'', "''");
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

/// Visibility = SQL `course_visible` (BUG-190), the predicate shared with
/// [`crate::catalog::list_courses`] and `collection_listable`.
pub async fn search_courses(
    pool: &PgPool,
    query: &str,
    viewer: Option<UserId>,
    see_all: bool,
    limit: i64,
) -> Result<Vec<CourseRow>> {
    let patterns = word_patterns(query);
    let rows = sqlx::query_as!(
        CourseRow,
        r#"SELECT id AS "id: CourseId", name, description, about, tags,
                  public, open_to_contributors, thumbnail_image_key AS thumbnail_key, learnings, thumbnail_video_key,
                  creator_id AS "creator_id: UserId",
                  ARRAY(SELECT ra.user_id FROM resource_authors ra
                        WHERE ra.course_id = courses.id AND ra.status = 'active'
                          AND ra.authorship <> 'reporter')
                      AS "contributor_ids!: Vec<UserId>",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM courses
           WHERE search_matches(name || ' ' || description || ' ' || coalesce(about, ''), $5, $6, $7)
             AND course_visible(courses, $3, $2)
           ORDER BY ts_rank_cd(search, to_tsquery('simple', $1)) DESC, id DESC
           LIMIT $4"#,
        prefix_tsquery(query),
        see_all,
        viewer.map(|v| v.0),
        limit,
        &patterns.words,
        &patterns.letters,
        &patterns.excluded
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
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
) -> Result<Vec<CollectionRow>> {
    let patterns = word_patterns(query);
    let rows = sqlx::query_as!(
        CollectionRow,
        r#"SELECT id AS "id: CollectionId", name, description, public,
                  creator_id AS "creator_id: UserId", version,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM collections
           WHERE search_matches(name || ' ' || description, $6, $7, $8)
             AND (public OR $2 OR creator_id = $3)
             AND collection_listable(id, $3, $5)
           ORDER BY ts_rank_cd(search, to_tsquery('simple', $1)) DESC, id DESC
           LIMIT $4"#,
        prefix_tsquery(query),
        see_all,
        viewer.map(|v| v.0),
        limit,
        see_all_courses,
        &patterns.words,
        &patterns.letters,
        &patterns.excluded
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
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
pub async fn search_users(pool: &PgPool, query: &str, limit: i64) -> Result<Vec<UserHitRow>> {
    let letters = word_patterns(query).letters;
    let literal = crate::like_escape(query);
    let substring = format!("%{literal}%");
    let prefix = format!("{literal}%");
    let rows = sqlx::query_as!(
        UserHitRow,
        r#"SELECT id AS "id: UserId", username, display_name, avatar_key
           FROM users
           WHERE status = 'active'
             AND (username ILIKE $1 ESCAPE '\' OR display_name ILIKE $1 ESCAPE '\')
             AND search_matches(username || ' ' || display_name, ARRAY[]::text[], $4, ARRAY[]::text[])
           ORDER BY (username ILIKE $2 ESCAPE '\' OR display_name ILIKE $2 ESCAPE '\') DESC, username
           LIMIT $3"#,
        substring,
        prefix,
        limit,
        &letters
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::{WordPatterns, prefix_tsquery, word_patterns};

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
