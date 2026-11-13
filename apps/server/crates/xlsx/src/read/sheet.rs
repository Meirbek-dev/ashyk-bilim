//! The worksheet part: cells (spec 4.3), merges, hidden rows/columns and the
//! drawing relationship. Streamed; only the columns a DOT row can use are kept.

use std::collections::{BTreeMap, BTreeSet};

use super::book::inline_text;
use super::xml::{self, Bad, Node};

/// Columns kept per row: type 4 options run F..BC (50), one more shows the overflow.
pub const MAX_COL: u32 = 56;

#[derive(Debug, Clone)]
pub enum Raw {
    Text(String),
    /// The `<v>` text of a number cell.
    Number(String),
    Bool(bool),
    Error(String),
}

#[derive(Debug, Clone)]
pub struct Cell {
    pub raw: Raw,
    pub style: u32,
    pub formula: bool,
    /// `vm` (1-based value metadata): a picture in the cell or another rich value.
    pub vm: Option<u32>,
}

impl Cell {
    /// The cell as text (spec 4.3).
    pub fn shown(&self) -> String {
        match &self.raw {
            Raw::Text(s) | Raw::Error(s) => s.clone(),
            Raw::Number(n) => number(n),
            Raw::Bool(b) => if *b { "TRUE" } else { "FALSE" }.to_owned(),
        }
    }

    /// DOT's "not blank": a value other than whitespace, or a formula.
    pub fn content(&self) -> bool {
        self.formula || self.vm.is_some() || !self.shown().trim().is_empty()
    }
}

/// Shortest exact decimal without exponent: `310`, `0.1`, `0.0000001`.
pub fn number(raw: &str) -> String {
    let raw = raw.trim();
    match raw.parse::<f64>() {
        Ok(f) if f.is_finite() => {
            let shown = format!("{f}");
            if shown == "-0" { "0".to_owned() } else { shown }
        }
        _ => raw.to_owned(),
    }
}

#[derive(Default)]
pub struct Sheet {
    /// `(row, col)`, 1-based, columns up to [`MAX_COL`].
    pub cells: BTreeMap<(u32, u32), Cell>,
    /// Row → last column with content past [`MAX_COL`].
    pub wide: BTreeMap<u32, u32>,
    /// `(first row, first col, last row, last col)` and the `ref` text.
    pub merges: Vec<((u32, u32, u32, u32), String)>,
    pub hidden_rows: BTreeSet<u32>,
    /// Inclusive column ranges.
    pub hidden_cols: Vec<(u32, u32)>,
    /// Relationship id of `<drawing>`.
    pub drawing: Option<String>,
    /// More rows with content than `max_rows`: parsing stopped keeping cells.
    pub too_many_rows: bool,
}

/// `AB12` → `(12, 28)`.
pub fn parse_ref(cell: &str) -> Option<(u32, u32)> {
    let cell = cell.trim().trim_start_matches('$');
    let split = cell.find(|c: char| !c.is_ascii_alphabetic())?;
    let (letters, digits) = cell.split_at(split);
    if letters.is_empty() || letters.len() > 3 {
        return None;
    }
    let col = letters.bytes().fold(0u32, |acc, b| {
        acc * 26 + u32::from(b.to_ascii_uppercase() - b'A' + 1)
    });
    let row: u32 = digits.trim_start_matches('$').parse().ok()?;
    (row >= 1 && (1..=16_384).contains(&col)).then_some((row, col))
}

pub fn col_name(mut col: u32) -> String {
    let mut out = Vec::new();
    while col > 0 {
        let rem = (col - 1) % 26;
        out.push(char::from(b'A' + u8::try_from(rem).unwrap_or(0)));
        col = (col - 1) / 26;
    }
    out.iter().rev().collect()
}

pub fn cell_name(row: u32, col: u32) -> String {
    format!("{}{row}", col_name(col))
}

#[derive(Default)]
struct Pending {
    row: u32,
    col: u32,
    kind: String,
    style: u32,
    vm: Option<u32>,
    formula: bool,
    value: String,
    inline: String,
}

/// Parses the sheet. `max_rows` bounds the content rows below row 1 that are
/// kept (memory guard, spec 4.6).
pub fn parse(xml: &[u8], shared: &[String], max_rows: usize) -> Result<Sheet, Bad> {
    let mut sheet = Sheet::default();
    let mut row = 0u32;
    let mut col = 0u32;
    let mut cell: Option<Pending> = None;
    let mut content_rows: BTreeSet<u32> = BTreeSet::new();
    xml::walk(xml, |stack, node| {
        let name = stack.last().map_or(&[][..], Vec::as_slice);
        match node {
            Node::Open(e) => match name {
                b"row" => {
                    row = xml::attr_u32(e, b"r").unwrap_or(row + 1);
                    col = 0;
                    if xml::attr_true(e, b"hidden") {
                        sheet.hidden_rows.insert(row);
                    }
                }
                b"c" => {
                    let (r, c) = xml::attr(e, b"r")
                        .and_then(|r| parse_ref(&r))
                        .unwrap_or((row, col + 1));
                    col = c;
                    cell = Some(Pending {
                        row: r,
                        col: c,
                        kind: xml::attr(e, b"t").unwrap_or_default(),
                        style: xml::attr_u32(e, b"s").unwrap_or(0),
                        vm: xml::attr_u32(e, b"vm"),
                        ..Pending::default()
                    });
                }
                b"f" => {
                    if let Some(p) = cell.as_mut() {
                        p.formula = true;
                    }
                }
                b"col" if stack.iter().any(|n| n == b"cols") => {
                    if xml::attr_true(e, b"hidden") {
                        let min = xml::attr_u32(e, b"min").unwrap_or(1);
                        let max = xml::attr_u32(e, b"max").unwrap_or(min);
                        sheet.hidden_cols.push((min, max));
                    }
                }
                b"mergeCell" => {
                    if let Some(range) = xml::attr(e, b"ref") {
                        let (a, b) = range.split_once(':').unwrap_or((&range, &range));
                        if let (Some(a), Some(b)) = (parse_ref(a), parse_ref(b)) {
                            sheet.merges.push((
                                (a.0.min(b.0), a.1.min(b.1), a.0.max(b.0), a.1.max(b.1)),
                                range.clone(),
                            ));
                        }
                    }
                }
                b"drawing" if stack.len() == 2 => sheet.drawing = xml::attr(e, b"id"),
                _ => {}
            },
            Node::Text(t) => {
                if let Some(p) = cell.as_mut() {
                    if name == b"v" {
                        p.value.push_str(t);
                    } else if inline_text(stack) {
                        p.inline.push_str(t);
                    }
                }
            }
            Node::Close if name == b"c" => {
                let Some(p) = cell.take() else { return };
                let stored = finish(&p, shared);
                if !stored.content() || sheet.too_many_rows {
                    return;
                }
                if p.row >= 2 && content_rows.insert(p.row) && content_rows.len() > max_rows {
                    sheet.too_many_rows = true;
                    return;
                }
                if p.col > MAX_COL {
                    let last = sheet.wide.entry(p.row).or_insert(p.col);
                    *last = (*last).max(p.col);
                } else {
                    sheet.cells.insert((p.row, p.col), stored);
                }
            }
            Node::Close => {}
        }
    })?;
    Ok(sheet)
}

fn finish(p: &Pending, shared: &[String]) -> Cell {
    let raw = match p.kind.as_str() {
        "s" => Raw::Text(
            p.value
                .trim()
                .parse::<usize>()
                .ok()
                .and_then(|i| shared.get(i))
                .cloned()
                .unwrap_or_default(),
        ),
        "inlineStr" => Raw::Text(xml::ooxml_unescape(&p.inline)),
        "str" | "d" => Raw::Text(xml::ooxml_unescape(&p.value)),
        "b" => Raw::Bool(p.value.trim() == "1"),
        "e" => Raw::Error(p.value.trim().to_owned()),
        _ if p.value.trim().is_empty() => Raw::Text(String::new()),
        _ => Raw::Number(p.value.clone()),
    };
    Cell {
        raw,
        style: p.style,
        formula: p.formula,
        vm: p.vm,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_are_shortest_decimals() {
        assert_eq!(number("310"), "310");
        assert_eq!(number("310.0"), "310");
        assert_eq!(number("0.1"), "0.1");
        assert_eq!(number("1E-7"), "0.0000001");
        assert_eq!(number("3.1000000000000001"), "3.1");
        assert_eq!(number("-0"), "0");
    }

    #[test]
    fn refs_round_trip() {
        assert_eq!(parse_ref("AB12"), Some((12, 28)));
        assert_eq!(parse_ref("$C$3"), Some((3, 3)));
        assert_eq!(parse_ref("A0"), None);
        assert_eq!(cell_name(12, 28), "AB12");
        assert_eq!(col_name(54), "BB");
    }
}
