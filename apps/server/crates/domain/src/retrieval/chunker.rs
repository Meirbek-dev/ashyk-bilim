//! Cutting course material into chunks with anchors (docs/AI-FIRST.md 1.2). Pure functions.

use serde_json::{Value, json};

use crate::ai::context::lesson_text;

/// Paragraphs accumulate up to this many characters...
pub const TARGET_CHARS: usize = 900;
/// ...and never past this many (a single longer block is split on line breaks).
pub const MAX_CHARS: usize = 1500;
/// The tail of the previous chunk repeated at the head of the next.
pub const OVERLAP_CHARS: usize = 200;

/// One cut piece: body text plus where it came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Piece {
    pub label: String,
    pub body: String,
    pub anchor: Value,
}

fn chars(s: &str) -> usize {
    s.chars().count()
}

/// The last sentence (or the last `OVERLAP_CHARS`) of a chunk, carried into the next.
fn overlap_of(text: &str) -> String {
    let tail: String = {
        let n = chars(text);
        text.chars().skip(n.saturating_sub(OVERLAP_CHARS)).collect()
    };
    match tail.find(['.', '!', '?', '\n']) {
        Some(i) if i + 1 < tail.len() => tail[i + 1..].trim().to_owned(),
        _ => tail.trim().to_owned(),
    }
}

/// Splits text longer than `MAX_CHARS` on line boundaries (then hard, as a last resort).
fn split_long(text: &str) -> Vec<String> {
    if chars(text) <= MAX_CHARS {
        return vec![text.to_owned()];
    }
    let mut out = Vec::new();
    let mut current = String::new();
    for line in text.lines() {
        if chars(&current) + chars(line) + 1 > MAX_CHARS && !current.is_empty() {
            out.push(std::mem::take(&mut current));
        }
        if chars(line) > MAX_CHARS {
            let all: Vec<char> = line.chars().collect();
            for part in all.chunks(MAX_CHARS) {
                out.push(part.iter().collect());
            }
            continue;
        }
        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(line);
    }
    if !current.trim().is_empty() {
        out.push(current);
    }
    out
}

fn heading_level(block: &Value) -> Option<usize> {
    (block.get("type").and_then(Value::as_str) == Some("heading")).then(|| {
        block
            .get("attrs")
            .and_then(|a| a.get("level"))
            .and_then(Value::as_u64)
            .map_or(2, |l| usize::try_from(l.clamp(1, 6)).unwrap_or(2))
    })
}

fn label_for(title: &str, path: &[String]) -> String {
    let mut label = title.to_owned();
    for heading in path {
        label.push_str(" › ");
        label.push_str(heading);
    }
    label.chars().take(500).collect()
}

/// A Tiptap lesson document cut by top-level blocks under the current heading path.
#[must_use]
pub fn lesson_pieces(title: &str, doc: &Value) -> Vec<Piece> {
    let blocks = doc
        .get("content")
        .and_then(Value::as_array)
        .map_or(&[][..], Vec::as_slice);
    let mut path: Vec<(usize, String)> = Vec::new();
    let mut pieces = Vec::new();
    let mut body = String::new();
    let mut start = 0usize;
    let mut overlap = String::new();
    let flush = |pieces: &mut Vec<Piece>,
                 body: &mut String,
                 path: &[(usize, String)],
                 start: usize,
                 end: usize,
                 overlap: &mut String| {
        if body.trim().is_empty() {
            body.clear();
            return;
        }
        let headings: Vec<String> = path.iter().map(|(_, h)| h.clone()).collect();
        for part in split_long(body.trim()) {
            let text = if overlap.is_empty() {
                part.clone()
            } else {
                format!("{overlap}\n{part}")
            };
            pieces.push(Piece {
                label: label_for(title, &headings),
                body: text,
                anchor: json!({ "heading_path": headings, "block_start": start, "block_end": end }),
            });
            *overlap = overlap_of(&part);
        }
        body.clear();
    };
    for (i, block) in blocks.iter().enumerate() {
        if let Some(level) = heading_level(block) {
            flush(
                &mut pieces,
                &mut body,
                &path,
                start,
                i.saturating_sub(1),
                &mut overlap,
            );
            overlap.clear();
            let text = lesson_text(&json!({ "type": "doc", "content": [block] }));
            let heading = text.trim_start_matches('#').trim().to_owned();
            path.retain(|(l, _)| *l < level);
            if !heading.is_empty() {
                path.push((level, heading));
            }
            start = i + 1;
            continue;
        }
        let text = lesson_text(&json!({ "type": "doc", "content": [block] }));
        if text.trim().is_empty() {
            continue;
        }
        if body.is_empty() {
            start = i;
        } else if chars(&body) + chars(&text) > TARGET_CHARS {
            flush(
                &mut pieces,
                &mut body,
                &path,
                start,
                i.saturating_sub(1),
                &mut overlap,
            );
            start = i;
        }
        if !body.is_empty() {
            body.push('\n');
        }
        body.push_str(&text);
    }
    let end = blocks.len().saturating_sub(1);
    flush(&mut pieces, &mut body, &path, start, end, &mut overlap);
    pieces
}

/// Plain text cut into chunks of about `TARGET_CHARS` on paragraph boundaries.
#[must_use]
pub fn text_pieces(label: &str, text: &str, anchor: &Value) -> Vec<Piece> {
    let mut pieces = Vec::new();
    let mut body = String::new();
    for paragraph in text.split("\n\n").map(str::trim).filter(|p| !p.is_empty()) {
        if !body.is_empty() && chars(&body) + chars(paragraph) > TARGET_CHARS {
            pieces.extend(split_long(&body).into_iter().map(|b| Piece {
                label: label.chars().take(500).collect(),
                body: b,
                anchor: anchor.clone(),
            }));
            body.clear();
        }
        if !body.is_empty() {
            body.push_str("\n\n");
        }
        body.push_str(paragraph);
    }
    if !body.trim().is_empty() {
        pieces.extend(split_long(&body).into_iter().map(|b| Piece {
            label: label.chars().take(500).collect(),
            body: b,
            anchor: anchor.clone(),
        }));
    }
    pieces
}

/// The learner-visible prompt of an assessment item: the question, never the answer key.
#[must_use]
pub fn item_prompt(kind: &str, title: &str, body: &Value) -> String {
    let prompt = body
        .get("prompt")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let mut text = String::new();
    if !title.trim().is_empty() {
        text.push_str(title.trim());
    }
    if !prompt.trim().is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(prompt.trim());
    }
    match kind {
        "choice" => {
            for option in body
                .get("options")
                .and_then(Value::as_array)
                .map_or(&[][..], Vec::as_slice)
            {
                if let Some(t) = option.get("text").and_then(Value::as_str) {
                    text.push_str("\n- ");
                    text.push_str(t);
                }
            }
        }
        "code" => {
            for key in ["input_spec", "output_spec", "constraints"] {
                if let Some(t) = body
                    .get(key)
                    .and_then(Value::as_str)
                    .filter(|t| !t.trim().is_empty())
                {
                    text.push('\n');
                    text.push_str(t);
                }
            }
        }
        _ => {}
    }
    text
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::float_cmp,
    clippy::panic
)]
mod tests {
    use super::*;

    fn para(text: &str) -> Value {
        json!({ "type": "paragraph", "content": [{ "type": "text", "text": text }] })
    }

    fn heading(level: u64, text: &str) -> Value {
        json!({ "type": "heading", "attrs": { "level": level },
                "content": [{ "type": "text", "text": text }] })
    }

    #[test]
    fn headings_become_the_label_path_and_anchor() {
        let doc = json!({ "type": "doc", "content": [
            heading(1, "Рекурсия"), para("Функция вызывает саму себя."),
            heading(2, "База"), para("Без базового случая рекурсия не остановится."),
        ]});
        let pieces = lesson_pieces("Лекция 3", &doc);
        assert_eq!(pieces.len(), 2);
        assert_eq!(pieces[0].label, "Лекция 3 › Рекурсия");
        assert_eq!(pieces[1].label, "Лекция 3 › Рекурсия › База");
        assert_eq!(
            pieces[1].anchor["heading_path"],
            json!(["Рекурсия", "База"])
        );
        assert_eq!(pieces[1].anchor["block_start"], json!(3));
        assert!(pieces[1].body.contains("базового случая"));
    }

    #[test]
    fn long_sections_split_near_the_target_with_overlap() {
        let sentence = "Это предложение про циклы и рекурсию. ";
        let blocks: Vec<Value> = (0..40).map(|_| para(&sentence.repeat(3))).collect();
        let pieces = lesson_pieces("L", &json!({ "type": "doc", "content": blocks }));
        assert!(pieces.len() > 3);
        for piece in &pieces {
            assert!(piece.body.chars().count() <= MAX_CHARS + OVERLAP_CHARS + 1);
        }
        assert!(pieces[1].body.starts_with("Это предложение"));
    }

    #[test]
    fn empty_documents_give_no_pieces() {
        assert!(lesson_pieces("L", &json!({ "type": "doc", "content": [] })).is_empty());
        assert!(lesson_pieces("L", &json!({})).is_empty());
        assert!(text_pieces("L", "  ", &json!({})).is_empty());
    }

    #[test]
    fn item_prompts_never_carry_the_key() {
        let body = json!({ "prompt": "2+2?", "options": [
            { "id": "a", "text": "4", "is_correct": true }, { "id": "b", "text": "5", "is_correct": false }
        ], "explanation": "Потому что" });
        let text = item_prompt("choice", "Сложение", &body);
        assert_eq!(text, "Сложение\n2+2?\n- 4\n- 5");
        assert!(!text.contains("is_correct") && !text.contains("Потому"));
    }
}
