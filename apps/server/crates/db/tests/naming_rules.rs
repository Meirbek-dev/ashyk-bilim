//! Column names follow one convention (docs/ARCHITECTURE.md §8, rule 2) in
//! every migration from 2026-11-02 on (schema review 3, item 33):
//!
//! - a key onto `users` is `user_id` (the person the row belongs to or is
//!   about: owner, learner, member, recipient), `<verb>_by` (who did
//!   something to it: `created_by`, `graded_by`, `decided_by`) or a role
//!   when the row is about two people and no verb fits (`teacher_id`, `peer_id`); not
//!   `creator_id`, `author_id`, `actor_id`, `learner_id`, `student_id` or
//!   `*_user_id`;
//! - a row's variant is `kind` (`<thing>_kind` when the table has two), not
//!   `type` / `*_type` (`content_type` stays: it holds a MIME type);
//! - a row's state machine is `status`, not `state` / `lifecycle`.
//!
//! Older columns that break it are renamed by the plan in REWRITE §5.6;
//! renaming is a contract step, so they are not checked here. The rules read
//! the embedded migrations; no database is needed.
#![allow(clippy::panic)]

const FIRST: i64 = 20_261_102_000_000;

/// Words that start a column type (enough to tell a column definition).
const TYPES: &[&str] = &[
    "bigint",
    "bigserial",
    "boolean",
    "bool",
    "bytea",
    "date",
    "double",
    "halfvec",
    "inet",
    "int",
    "integer",
    "interval",
    "jsonb",
    "numeric",
    "real",
    "smallint",
    "text",
    "timestamptz",
    "tsvector",
    "uuid",
    "vector",
];

/// Actor names allowed besides `user_id` and `<verb>_by`.
const ROLES: &[&str] = &["teacher_id", "peer_id"];

/// SQL with `--` comments removed and lowercased, as tokens: identifiers
/// (dots kept, so `t.kind` is one token) and single punctuation characters.
/// Quoted strings and dollar-quoted bodies are skipped (function bodies are
/// code the rules do not read).
fn tokens(sql: &str) -> Vec<String> {
    let code: String = sql
        .lines()
        .map(|l| l.split_once("--").map_or(l, |(c, _)| c))
        .collect::<Vec<_>>()
        .join("\n")
        .to_lowercase();
    let mut out = Vec::new();
    let mut chars = code.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\'' {
            for d in chars.by_ref() {
                if d == '\'' {
                    break;
                }
            }
        } else if c == '$' {
            // `$tag$ ... $tag$`: skip to the same tag.
            let mut tag = String::from("$");
            while let Some(&d) = chars.peek() {
                chars.next();
                tag.push(d);
                if d == '$' {
                    break;
                }
                if !(d.is_alphanumeric() || d == '_') {
                    break;
                }
            }
            if tag.ends_with('$') && tag.len() >= 2 {
                let mut body = String::new();
                for d in chars.by_ref() {
                    body.push(d);
                    if body.ends_with(&tag) {
                        break;
                    }
                }
            }
        } else if c.is_alphanumeric() || c == '_' {
            let mut word = String::from(c);
            while let Some(&d) = chars.peek() {
                if d.is_alphanumeric() || d == '_' || d == '.' {
                    word.push(d);
                    chars.next();
                } else {
                    break;
                }
            }
            out.push(word);
        } else if !c.is_whitespace() {
            out.push(c.to_string());
        }
    }
    out
}

/// `(column, references users)` for every column a migration defines:
/// `CREATE TABLE t (<col> <type> ...)` and `ADD COLUMN <col> <type> ...`,
/// plus columns of `FOREIGN KEY (<col>) REFERENCES users`.
fn columns(tokens: &[String]) -> Vec<(String, bool)> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < tokens.len() {
        let t = tokens[i].as_str();
        let mut start = None;
        if t == "(" || t == "," {
            start = Some(i + 1);
        } else if t == "column" && i > 0 && tokens[i - 1] == "add" {
            let mut j = i + 1;
            if tokens.get(j).map(String::as_str) == Some("if") {
                j += 3; // if not exists
            }
            start = Some(j);
        }
        if let Some(s) = start
            && let (Some(name), Some(ty)) = (tokens.get(s), tokens.get(s + 1))
            && TYPES.contains(&ty.as_str())
            && !TYPES.contains(&name.as_str())
        {
            // The definition runs to the next `,` / `)` / `;` at its depth.
            let mut depth = 0i32;
            let mut users = false;
            for (k, tok) in tokens.iter().enumerate().skip(s + 2) {
                match tok.as_str() {
                    "(" => depth += 1,
                    ")" | "," if depth == 0 => break,
                    ";" => break,
                    ")" => depth -= 1,
                    "references" => {
                        users |= matches!(
                            tokens.get(k + 1).map(String::as_str),
                            Some("users" | "core.users")
                        );
                    }
                    _ => {}
                }
            }
            out.push((name.clone(), users));
        }
        if t == "foreign"
            && tokens.get(i + 1).map(String::as_str) == Some("key")
            && tokens.get(i + 2).map(String::as_str) == Some("(")
            && tokens.get(i + 4).map(String::as_str) == Some(")")
            && tokens.get(i + 5).map(String::as_str) == Some("references")
            && matches!(
                tokens.get(i + 6).map(String::as_str),
                Some("users" | "core.users")
            )
            && let Some(col) = tokens.get(i + 3)
        {
            out.push((col.clone(), true));
        }
        i += 1;
    }
    out
}

/// Why `name` breaks the convention, if it does.
fn broken(name: &str, onto_users: bool) -> Option<&'static str> {
    if onto_users && !(name == "user_id" || name.ends_with("_by") || ROLES.contains(&name)) {
        return Some("a key onto users is user_id, <verb>_by or a role (teacher_id)");
    }
    if name.ends_with("_user_id")
        || [
            "creator_id",
            "author_id",
            "actor_id",
            "learner_id",
            "student_id",
        ]
        .contains(&name)
    {
        return Some("a person is user_id, <verb>_by or a role (teacher_id)");
    }
    if name == "type" || (name.ends_with("_type") && name != "content_type") {
        return Some("a variant is kind (or <thing>_kind)");
    }
    if name == "state" || name == "lifecycle" {
        return Some("a state machine is status");
    }
    None
}

#[test]
fn new_columns_follow_the_naming_convention() {
    let mut found = Vec::new();
    for m in ab_db::MIGRATOR.iter().filter(|m| m.version >= FIRST) {
        for (name, users) in columns(&tokens(m.sql.as_str())) {
            if let Some(why) = broken(&name, users) {
                found.push(format!("{}_{}: {name}: {why}", m.version, m.description));
            }
        }
    }
    assert!(found.is_empty(), "{}", found.join("\n"));
}

#[test]
fn the_naming_rules_see_what_they_check() {
    let sql = "-- creator_id uuid REFERENCES users\n\
        CREATE TABLE t (id uuid PRIMARY KEY, creator_id uuid NOT NULL REFERENCES users (id),\n\
          user_id uuid REFERENCES users ON DELETE CASCADE, score numeric(5, 2), kind text,\n\
          graded_by uuid REFERENCES users, note_type text, body text DEFAULT 'a, type text',\n\
          FOREIGN KEY (author_id) REFERENCES users);\n\
        ALTER TABLE t ADD COLUMN IF NOT EXISTS state text;\n\
        CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE x_type text; BEGIN END $$;";
    let cols = columns(&tokens(sql));
    let bad: Vec<&str> = cols
        .iter()
        .filter(|(n, u)| broken(n, *u).is_some())
        .map(|(n, _)| n.as_str())
        .collect();
    assert_eq!(bad, ["creator_id", "note_type", "author_id", "state"]);
    assert!(cols.iter().any(|(n, u)| n == "user_id" && *u));
    assert!(cols.iter().any(|(n, _)| n == "score"));
    assert!(
        !cols.iter().any(|(n, _)| n == "x_type"),
        "function bodies are skipped"
    );
}
