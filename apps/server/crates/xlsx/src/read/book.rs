//! Workbook-level parts: relationships, sheet list, shared strings, styles.

use std::collections::HashMap;

use super::xml::{self, Bad, Node};
use super::zip::resolve;

pub struct Rel {
    pub id: String,
    /// Last segment of the relationship type (`worksheet`, `drawing`, …).
    pub kind: String,
    /// Part path resolved against the source; `None` for external targets.
    pub target: Option<String>,
}

/// Relationships of the part `source`, read from its `.rels` XML.
pub fn rels(source: &str, xml: &[u8]) -> Result<Vec<Rel>, Bad> {
    let mut out = Vec::new();
    xml::walk(xml, |stack, node| {
        if let Node::Open(e) = node
            && stack.last().is_some_and(|n| n == b"Relationship")
        {
            let external = xml::attr(e, b"TargetMode").is_some_and(|m| m == "External");
            let target = xml::attr(e, b"Target").unwrap_or_default();
            out.push(Rel {
                id: xml::attr(e, b"Id").unwrap_or_default(),
                kind: xml::attr(e, b"Type")
                    .and_then(|t| t.rsplit('/').next().map(str::to_owned))
                    .unwrap_or_default(),
                target: (!external).then(|| resolve(source, &target)),
            });
        }
    })?;
    Ok(out)
}

pub struct Book {
    /// `(name, relationship id)` in tab order.
    pub sheets: Vec<(String, String)>,
    /// Index into `sheets` (`bookViews/workbookView/@activeTab`).
    pub active: usize,
}

pub fn workbook(xml: &[u8]) -> Result<Book, Bad> {
    let mut sheets = Vec::new();
    let mut active = None;
    xml::walk(xml, |stack, node| {
        let Node::Open(e) = node else { return };
        match stack.last().map(Vec::as_slice) {
            Some(b"sheet") => sheets.push((
                xml::attr(e, b"name").unwrap_or_default(),
                xml::attr(e, b"id").unwrap_or_default(),
            )),
            Some(b"workbookView") if active.is_none() => {
                active = Some(xml::attr_u32(e, b"activeTab").unwrap_or(0));
            }
            _ => {}
        }
    })?;
    let active = active.unwrap_or(0) as usize;
    Ok(Book {
        active: if active < sheets.len() { active } else { 0 },
        sheets,
    })
}

/// Text of an `<si>` / `<is>`: every `<t>` outside phonetic runs.
fn is_run_text(stack: &[Vec<u8>]) -> bool {
    stack.last().is_some_and(|n| n == b"t") && !stack.iter().any(|n| n == b"rPh")
}

pub fn shared_strings(xml: &[u8]) -> Result<Vec<String>, Bad> {
    let mut out = Vec::new();
    let mut current = String::new();
    xml::walk(xml, |stack, node| match node {
        Node::Open(_) if stack.last().is_some_and(|n| n == b"si") => current.clear(),
        Node::Text(t) if is_run_text(stack) => current.push_str(t),
        Node::Close if stack.last().is_some_and(|n| n == b"si") => {
            out.push(xml::ooxml_unescape(&current));
        }
        _ => {}
    })?;
    Ok(out)
}

/// Inline string text, as [`shared_strings`].
pub fn inline_text(stack: &[Vec<u8>]) -> bool {
    is_run_text(stack) && stack.iter().any(|n| n == b"is")
}

#[derive(Default)]
pub struct Styles {
    /// `cellXfs`: `(numFmtId, fontId)`.
    xfs: Vec<(u32, u32)>,
    bold_fonts: Vec<bool>,
    formats: HashMap<u32, String>,
}

impl Styles {
    pub fn parse(xml: &[u8]) -> Result<Self, Bad> {
        let mut styles = Self::default();
        xml::walk(xml, |stack, node| {
            let Node::Open(e) = node else { return };
            let n = stack.len();
            let parent = n.checked_sub(2).map(|i| stack[i].as_slice());
            match (parent, stack[n - 1].as_slice()) {
                (Some(b"numFmts"), b"numFmt") => {
                    if let (Some(id), Some(code)) =
                        (xml::attr_u32(e, b"numFmtId"), xml::attr(e, b"formatCode"))
                    {
                        styles.formats.insert(id, code);
                    }
                }
                (Some(b"fonts"), b"font") => styles.bold_fonts.push(false),
                (Some(b"font"), b"b") if stack.iter().any(|s| s == b"fonts") => {
                    let off = xml::attr(e, b"val")
                        .is_some_and(|v| v == "0" || v.eq_ignore_ascii_case("false"));
                    if let Some(last) = styles.bold_fonts.last_mut() {
                        *last = !off;
                    }
                }
                (Some(b"cellXfs"), b"xf") => styles.xfs.push((
                    xml::attr_u32(e, b"numFmtId").unwrap_or(0),
                    xml::attr_u32(e, b"fontId").unwrap_or(0),
                )),
                _ => {}
            }
        })?;
        Ok(styles)
    }

    pub fn bold(&self, style: u32) -> bool {
        self.xfs
            .get(style as usize)
            .and_then(|&(_, font)| self.bold_fonts.get(font as usize))
            .copied()
            .unwrap_or(false)
    }

    /// A date, time or percent format: Excel shows the number differently.
    pub fn shows_differently(&self, style: u32) -> bool {
        let Some(&(id, _)) = self.xfs.get(style as usize) else {
            return false;
        };
        if (9..=22).contains(&id) || (45..=47).contains(&id) {
            return true;
        }
        self.formats.get(&id).is_some_and(|code| {
            let code = unquoted(code).to_lowercase();
            code.contains("[$-") || code.contains('%') || code.contains("yy")
        })
    }
}

/// A format code without its quoted literals and `\x` escapes.
fn unquoted(code: &str) -> String {
    let mut out = String::with_capacity(code.len());
    let mut quoted = false;
    let mut chars = code.chars();
    while let Some(c) = chars.next() {
        match c {
            '"' => quoted = !quoted,
            '\\' if !quoted => {
                chars.next();
            }
            _ if !quoted => out.push(c),
            _ => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quoted_labels_are_not_formats() {
        assert_eq!(unquoted(r#"0" [%yy]"\%"#), "0");
    }
}
