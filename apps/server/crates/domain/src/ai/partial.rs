//! Incremental extraction of one string field from a JSON object that is
//! still arriving.
//!
//! The Q&A stream asks the model for a JSON object whose first key is
//! `answer_markdown`; while the object is incomplete this decodes the part
//! of that string value received so far (the legacy relied on pydantic-ai's
//! partial validation for the same effect). Escape sequences are decoded;
//! an incomplete escape at the very end is held back until it completes.

/// The decoded value of `"field": "…"` as far as `buffer` reaches, or `None`
/// while the key (or the opening quote of its value) has not arrived.
#[must_use]
pub fn partial_string_field(buffer: &str, field: &str) -> Option<String> {
    let key = format!("\"{field}\"");
    let key_at = buffer.find(&key)?;
    let rest = &buffer[key_at + key.len()..];
    let colon = rest.find(':')?;
    let after_colon = rest[colon + 1..].trim_start();
    let value = after_colon.strip_prefix('"')?;
    Some(decode_partial(value))
}

fn decode_partial(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => break,
            '\\' => {
                let Some(esc) = chars.next() else { break };
                match esc {
                    '"' => out.push('"'),
                    '\\' => out.push('\\'),
                    '/' => out.push('/'),
                    'n' => out.push('\n'),
                    't' => out.push('\t'),
                    'r' => out.push('\r'),
                    'b' => out.push('\u{8}'),
                    'f' => out.push('\u{c}'),
                    'u' => {
                        let Some(code) = take_hex4(&mut chars) else { break };
                        if (0xD800..0xDC00).contains(&code) {
                            // High surrogate: needs `\uDCxx` to follow.
                            let mut lookahead = chars.clone();
                            match (lookahead.next(), lookahead.next()) {
                                (Some('\\'), Some('u')) => match take_hex4(&mut lookahead) {
                                    Some(low) if (0xDC00..0xE000).contains(&low) => {
                                        let combined =
                                            0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                                        if let Some(ch) = char::from_u32(combined) {
                                            out.push(ch);
                                        }
                                        chars = lookahead;
                                    }
                                    // A complete escape that is not a low
                                    // surrogate: drop the orphan, keep going.
                                    Some(_) => {}
                                    // The pair has not fully arrived: hold back.
                                    None => break,
                                },
                                // Something else follows: an orphan, dropped.
                                (Some(_), _) => {}
                                // End of buffer: hold back.
                                (None, _) => break,
                            }
                            continue;
                        }
                        if let Some(ch) = char::from_u32(code) {
                            out.push(ch);
                        }
                    }
                    other => {
                        out.push('\\');
                        out.push(other);
                    }
                }
            }
            other => out.push(other),
        }
    }
    out
}

fn take_hex4(chars: &mut std::iter::Peekable<std::str::Chars<'_>>) -> Option<u32> {
    let mut code = 0u32;
    for _ in 0..4 {
        let digit = chars.next()?.to_digit(16)?;
        code = (code << 4) | digit;
    }
    Some(code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grows_with_the_buffer() {
        assert_eq!(partial_string_field("{\"answer", "answer_markdown"), None);
        assert_eq!(partial_string_field("{\"answer_markdown\": ", "answer_markdown"), None);
        assert_eq!(
            partial_string_field("{\"answer_markdown\": \"Hel", "answer_markdown"),
            Some("Hel".into())
        );
        assert_eq!(
            partial_string_field(
                "{\"answer_markdown\": \"Hello\", \"citations\": [",
                "answer_markdown"
            ),
            Some("Hello".into())
        );
    }

    #[test]
    fn decodes_escapes_and_holds_back_incomplete_ones() {
        let full = "{\"answer_markdown\": \"line\\nquote \\\" tab\\t \\u00e9\"";
        assert_eq!(
            partial_string_field(full, "answer_markdown"),
            Some("line\nquote \" tab\t é".into())
        );
        let cut = "{\"answer_markdown\": \"abc\\u00";
        assert_eq!(partial_string_field(cut, "answer_markdown"), Some("abc".into()));
        let cut_slash = "{\"answer_markdown\": \"abc\\";
        assert_eq!(partial_string_field(cut_slash, "answer_markdown"), Some("abc".into()));
    }

    #[test]
    fn surrogate_pairs_decode_once_complete() {
        let high_only = "{\"answer_markdown\": \"smile \\ud83d";
        assert_eq!(partial_string_field(high_only, "answer_markdown"), Some("smile ".into()));
        let pair = "{\"answer_markdown\": \"smile \\ud83d\\ude00!";
        assert_eq!(partial_string_field(pair, "answer_markdown"), Some("smile 😀!".into()));
    }
}
