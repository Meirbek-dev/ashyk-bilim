//! Streaming XML over quick-xml with the spec 12.1 rules: a `DOCTYPE` or an
//! undefined entity makes the part unreadable, nothing is expanded.

use quick_xml::Reader;
use quick_xml::events::{BytesStart, Event};

/// The part is not well-formed or uses a forbidden construct.
#[derive(Debug)]
pub struct Bad;

/// One step of [`walk`]. `Open` is followed by `Close` also for an empty
/// element.
pub enum Node<'a, 'x> {
    Open(&'a BytesStart<'x>),
    Close,
    Text(&'a str),
}

/// Calls `visit` with the local names of the open elements (the innermost
/// last; for `Open` it is the element itself) and the node.
pub fn walk(xml: &[u8], mut visit: impl FnMut(&[Vec<u8>], Node<'_, '_>)) -> Result<(), Bad> {
    let text = std::str::from_utf8(xml).map_err(|_| Bad)?;
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut reader = Reader::from_str(text);
    let mut stack: Vec<Vec<u8>> = Vec::new();
    loop {
        match reader.read_event().map_err(|_| Bad)? {
            Event::Start(e) => {
                stack.push(e.local_name().as_ref().as_bytes().to_vec());
                visit(&stack, Node::Open(&e));
            }
            Event::Empty(e) => {
                stack.push(e.local_name().as_ref().as_bytes().to_vec());
                visit(&stack, Node::Open(&e));
                visit(&stack, Node::Close);
                stack.pop();
            }
            Event::End(_) => {
                visit(&stack, Node::Close);
                stack.pop();
            }
            Event::Text(t) => {
                visit(&stack, Node::Text(&t.xml10_content()));
            }
            Event::CData(c) => {
                visit(&stack, Node::Text(&c.xml10_content()));
            }
            Event::GeneralRef(r) => {
                let resolved = entity(&r)?;
                let mut buf = [0u8; 4];
                visit(&stack, Node::Text(resolved.encode_utf8(&mut buf)));
            }
            Event::DocType(_) => return Err(Bad),
            Event::Eof => return Ok(()),
            Event::Comment(_) | Event::Decl(_) | Event::PI(_) => {}
        }
    }
}

/// A predefined or character entity; anything else is undefined without a DTD.
fn entity(name: &str) -> Result<char, Bad> {
    Ok(match name {
        "amp" => '&',
        "lt" => '<',
        "gt" => '>',
        "quot" => '"',
        "apos" => '\'',
        _ => {
            let code =
                if let Some(hex) = name.strip_prefix("#x").or_else(|| name.strip_prefix("#X")) {
                    u32::from_str_radix(hex, 16).map_err(|_| Bad)?
                } else if let Some(dec) = name.strip_prefix('#') {
                    dec.parse::<u32>().map_err(|_| Bad)?
                } else {
                    return Err(Bad);
                };
            char::from_u32(code).ok_or(Bad)?
        }
    })
}

/// Resolves the entities of an attribute value.
fn unescape(raw: &str) -> Result<String, Bad> {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        let tail = &rest[at + 1..];
        let end = tail.find(';').ok_or(Bad)?;
        out.push(entity(&tail[..end])?);
        rest = &tail[end + 1..];
    }
    out.push_str(rest);
    Ok(out)
}

/// The attribute with this local name (`r:id` is `id`), entities resolved.
pub fn attr(e: &BytesStart<'_>, local: &[u8]) -> Option<String> {
    e.attributes().flatten().find_map(|a| {
        if a.key.local_name().as_ref().as_bytes() != local {
            return None;
        }
        unescape(&a.value).ok()
    })
}

/// Like [`attr`] for a non-negative number.
pub fn attr_u32(e: &BytesStart<'_>, local: &[u8]) -> Option<u32> {
    attr(e, local)?.trim().parse().ok()
}

/// `1`/`true` (any case); OOXML booleans.
pub fn attr_true(e: &BytesStart<'_>, local: &[u8]) -> bool {
    attr(e, local).is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"))
}

/// Decodes the OOXML `_xHHHH_` escapes of cell text (`_x000D_` is CR,
/// `_x005F_` a literal underscore).
pub fn ooxml_unescape(text: &str) -> String {
    if !text.contains("_x") {
        return text.to_owned();
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find("_x") {
        out.push_str(&rest[..at]);
        let tail = &rest[at..];
        let decoded = tail
            .get(2..6)
            .filter(|hex| hex.bytes().all(|b| b.is_ascii_hexdigit()))
            .filter(|_| tail.as_bytes().get(6) == Some(&b'_'))
            .and_then(|hex| u32::from_str_radix(hex, 16).ok())
            .and_then(char::from_u32);
        if let Some(c) = decoded {
            out.push(c);
            rest = &tail[7..];
        } else {
            out.push_str("_x");
            rest = &tail[2..];
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn ooxml_escapes_decode() {
        assert_eq!(ooxml_unescape("a_x000D_b"), "a\rb");
        assert_eq!(ooxml_unescape("_x005F_x000D_"), "_x000D_");
        assert_eq!(ooxml_unescape("_x00_ x_x"), "_x00_ x_x");
    }

    #[test]
    fn doctype_and_unknown_entities_are_refused() {
        assert!(walk(b"<!DOCTYPE x [<!ENTITY a \"b\">]><x>&a;</x>", |_, _| {}).is_err());
        assert!(walk(b"<x>&nbsp;</x>", |_, _| {}).is_err());
        let mut text = String::new();
        walk(b"<x>a&amp;&#x41;&#66;</x>", |_, n| {
            if let Node::Text(t) = n {
                text.push_str(t);
            }
        })
        .unwrap();
        assert_eq!(text, "a&AB");
    }
}
