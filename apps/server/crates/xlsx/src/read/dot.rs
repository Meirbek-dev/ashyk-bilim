//! The DOT rules over the read cells (spec 4.1, 4.2, 4.4, 4.5, 10).

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use serde_json::Map;

use super::book::Styles;
use super::images::{Found, Placed};
use super::sheet::{MAX_COL, Raw, Sheet, cell_name, col_name};
use super::{Issues, params};
use crate::{DotKind, DotOption, DotQuestion, DotTest, Image, ParseOptions, Severity};

const MAX_TEXT: usize = 20_000;
const MAX_TITLE: usize = 200;
const MAX_OPTIONS: u32 = 50;
const MAX_QUESTION_IMAGES: usize = 5;
const LEVELS: [u64; 7] = [1, 2, 3, 101, 102, 201, 202];

use Severity::{Error, Warning};

/// DOT's integer: digits only (surrounding whitespace allowed), ≤ i32::MAX.
fn integer(value: &str) -> Option<u32> {
    let v = value.trim();
    if v.is_empty() || !v.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let n: u64 = v.parse().ok()?;
    u32::try_from(n).ok().filter(|&n| n <= 2_147_483_647)
}

/// `1;3`, `1 ; 3;`: the numbers, or `None` when the format is wrong.
fn numbers(value: &str) -> Option<Vec<u64>> {
    let body = value.strip_suffix(';').unwrap_or(value);
    let body = body.trim_end();
    if body.is_empty() || body.starts_with(char::is_whitespace) {
        return None;
    }
    body.split(';')
        .map(|part| {
            let part = part.trim();
            (!part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
                .then(|| part.parse().unwrap_or(u64::MAX))
        })
        .collect()
}

/// `^\s*([1-9]\d*)\s*SEP\s*(\d+)\s*$`; `right_positive` requires `[1-9]` on the right too.
fn pair(value: &str, sep: char, right_positive: bool) -> Option<(u64, u64)> {
    let (a, b) = value.split_once(sep)?;
    let (a, b) = (a.trim(), b.trim());
    let ok = |s: &str, positive: bool| {
        !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit()) && (!positive || !s.starts_with('0'))
    };
    (ok(a, true) && ok(b, right_positive))
        .then(|| (a.parse().unwrap_or(u64::MAX), b.parse().unwrap_or(u64::MAX)))
}

fn joined(items: &BTreeSet<u64>) -> String {
    items
        .iter()
        .map(u64::to_string)
        .collect::<Vec<_>>()
        .join(";")
}

type Sha = [u8; 32];
/// Options of a row: texts, cells, picture indexes.
type Options = (Vec<DotOption>, Vec<(u32, u32)>, Vec<Option<usize>>);

/// What one sheet row gave.
enum Row {
    /// Invalid type: not counted as a question.
    Skipped,
    /// A question with errors.
    Failed,
    Question(DotQuestion),
}

struct Ctx<'a> {
    sheet: &'a Sheet,
    styles: &'a Styles,
    found: &'a Found,
    options: ParseOptions,
    issues: &'a mut Issues,
    /// Placements by cell, in anchor order.
    placed: BTreeMap<(u32, u32), Vec<&'a Placed>>,
    used: HashSet<(u32, u32)>,
    trimmed: Vec<(u32, u32)>,
    unescaped: Vec<(u32, u32)>,
    images: Vec<Image>,
    by_sha: HashMap<[u8; 32], usize>,
}

/// Which normalisation a text gets (spec 4.4).
#[derive(Clone, Copy, PartialEq, Eq)]
enum Text {
    /// Question text: edges trimmed silently.
    Question,
    /// Option or C: trimming is reported.
    Answer,
}

impl Ctx<'_> {
    fn value(&self, at: (u32, u32)) -> String {
        self.sheet
            .cells
            .get(&at)
            .map(super::sheet::Cell::shown)
            .unwrap_or_default()
    }

    fn blank(&self, at: (u32, u32)) -> bool {
        self.sheet.cells.get(&at).is_none_or(|c| !c.content())
    }

    fn has_image(&self, at: (u32, u32)) -> bool {
        self.placed.contains_key(&at)
    }

    /// Valid picture indexes (into `found.pictures`) at a cell.
    fn pictures(&self, at: (u32, u32)) -> Vec<usize> {
        self.placed
            .get(&at)
            .map(|list| list.iter().filter_map(|p| p.picture.ok()).collect())
            .unwrap_or_default()
    }

    fn text(&mut self, at: (u32, u32), kind: Text) -> String {
        let raw = self.value(at);
        let mut s = raw.replace("\r\n", "\n").replace('\r', "\n");
        if s.contains("\\\"") {
            self.issues.at(Warning, "suspicious_escape", at, Map::new());
        }
        if self.options.unescape_newlines && s.contains("\\n") {
            s = s.replace("\\n", "\n");
            self.unescaped.push(at);
        }
        let trimmed = s.trim();
        if kind == Text::Answer && trimmed.len() != s.len() {
            self.trimmed.push(at);
        }
        if trimmed.chars().count() > MAX_TEXT {
            self.issues.at(
                Error,
                "text_too_long",
                at,
                params([("max", MAX_TEXT.into())]),
            );
        }
        trimmed.to_owned()
    }

    fn image(&mut self, picture: usize) -> usize {
        let p = &self.found.pictures[picture];
        if let Some(&i) = self.by_sha.get(&p.sha256) {
            return i;
        }
        self.images.push(Image {
            sha256: p.sha256,
            bytes: p.bytes.clone(),
            mime: p.mime,
            width: p.width,
            height: p.height,
        });
        self.by_sha.insert(p.sha256, self.images.len() - 1);
        self.images.len() - 1
    }

    /// Value checks of every kept cell in the rows that are read (spec 4.3).
    fn cell_checks(&mut self, rows: &BTreeSet<u32>) {
        let sheet = self.sheet;
        for (&(row, col), cell) in &sheet.cells {
            if !rows.contains(&row) || (row == 1 && col > 6) {
                continue;
            }
            let at = (row, col);
            let shown = || params([("value", cell.shown().into())]);
            if row > 1 && cell.formula {
                self.issues.at(Error, "formula", at, Map::new());
            }
            if cell.vm.is_some() || matches!(cell.raw, Raw::Error(_)) {
                self.issues.at(Error, "cell_error", at, shown());
            }
            match cell.raw {
                Raw::Bool(_) => self.issues.at(Warning, "boolean_cell", at, shown()),
                Raw::Number(_) if self.styles.shows_differently(cell.style) => {
                    self.issues.at(Warning, "number_format", at, shown());
                }
                _ => {}
            }
        }
        for ((top, left, bottom, _), range) in &sheet.merges {
            if *bottom >= 2 {
                self.issues.at(
                    Warning,
                    "merged_cells",
                    (*top, *left),
                    params([("range", range.clone().into())]),
                );
            }
        }
        for &row in sheet.hidden_rows.intersection(rows) {
            self.issues.at(
                Warning,
                "hidden_cells",
                (row, 1),
                params([("row", row.into())]),
            );
        }
        for &(min, max) in &sheet.hidden_cols {
            for col in min..=max.min(MAX_COL) {
                let first = rows
                    .iter()
                    .find(|&&r| !self.blank((r, col)) || self.has_image((r, col)));
                if let Some(&row) = first {
                    self.issues.at(
                        Warning,
                        "hidden_cells",
                        (row, col),
                        params([("column", col_name(col).into())]),
                    );
                }
            }
        }
    }

    /// Row 1 (spec 4.1): `(title, attempts, minutes, limit, leveling)`.
    fn header(&mut self) -> (String, u32, u32, u32, bool) {
        let title = self.text((1, 1), Text::Question);
        if title.is_empty() {
            self.issues.at(Error, "no_title", (1, 1), Map::new());
        } else if title.chars().count() > MAX_TITLE {
            self.issues.at(
                Error,
                "text_too_long",
                (1, 1),
                params([("max", MAX_TITLE.into())]),
            );
        }
        if !self.blank((1, 2)) && !matches!(integer(&self.value((1, 2))), Some(0 | 1)) {
            self.issues.at(Warning, "service_cell", (1, 2), Map::new());
        }
        let mut number = |col: u32| {
            if self.blank((1, col)) {
                return 0;
            }
            integer(&self.value((1, col))).unwrap_or_else(|| {
                self.issues
                    .at(Error, "not_non_negative_int", (1, col), Map::new());
                0
            })
        };
        let (attempts, minutes, limit) = (number(3), number(4), number(5));
        let leveling = if self.blank((1, 6)) {
            false
        } else {
            match integer(&self.value((1, 6))) {
                Some(0) => false,
                Some(1) => true,
                _ => {
                    self.issues.at(Error, "leveling_cell", (1, 6), Map::new());
                    false
                }
            }
        };
        (title, attempts, minutes, limit, leveling)
    }

    /// Options `first..=end` of a row; `None` past the 50-column limit.
    fn options(&mut self, row: u32, first: u32) -> Option<Options> {
        let mut end = self.sheet.wide.get(&row).copied().unwrap_or(first - 1);
        for (&(_, col), cell) in self.sheet.cells.range((row, first)..=(row, MAX_COL)) {
            if cell.content() {
                end = end.max(col);
            }
        }
        for &(_, col) in self
            .placed
            .range((row, first)..=(row, u32::MAX))
            .map(|(at, _)| at)
        {
            end = end.max(col);
        }
        for col in first..=end {
            self.used.insert((row, col));
        }
        if end + 1 > first + MAX_OPTIONS {
            self.issues.at(
                Error,
                "too_many_options",
                (row, first + MAX_OPTIONS),
                params([("max", MAX_OPTIONS.into())]),
            );
            return None;
        }
        let mut options = Vec::new();
        let mut cells = Vec::new();
        let mut pictures = Vec::new();
        for col in first..=end {
            let at = (row, col);
            if self.blank(at) && !self.has_image(at) {
                self.issues.at(Error, "empty_between", at, Map::new());
            }
            if self.placed.get(&at).is_some_and(|l| l.len() > 1) {
                self.issues.at(Error, "option_image_twice", at, Map::new());
            }
            pictures.push(self.pictures(at).first().copied());
            options.push(DotOption {
                text: self.text(at, Text::Answer),
                image: None,
            });
            cells.push(at);
        }
        Some((options, cells, pictures))
    }

    /// Options equal after trim (case-sensitive) and with the same picture.
    fn distinct(
        &mut self,
        options: &[DotOption],
        cells: &[(u32, u32)],
        pictures: &[Option<usize>],
    ) {
        let mut seen: HashMap<(&str, Option<Sha>), (u32, u32)> = HashMap::new();
        for ((option, &at), picture) in options.iter().zip(cells).zip(pictures) {
            let sha = picture.map(|p| self.found.pictures[p].sha256);
            if let Some(&earlier) = seen.get(&(option.text.as_str(), sha)) {
                self.issues.at(
                    Error,
                    "options_not_distinct",
                    at,
                    params([
                        ("a", cell_name(earlier.0, earlier.1).into()),
                        ("b", cell_name(at.0, at.1).into()),
                    ]),
                );
            } else {
                seen.insert((option.text.as_str(), sha), at);
            }
        }
    }

    /// Spec 4.2 for one row; `None` when the type is invalid (the row is no question).
    #[allow(clippy::too_many_lines)]
    fn question(&mut self, row: u32, leveling: bool) -> Row {
        let a = (row, 1);
        if self.blank(a) && !self.has_image(a) {
            self.issues.at(Error, "no_question", a, Map::new());
        }
        let kind = integer(&self.value((row, 2))).filter(|t| (1..=5).contains(t));
        let Some(kind) = kind else {
            self.issues.at(Error, "type_invalid", (row, 2), Map::new());
            return Row::Skipped;
        };
        self.used.insert(a);
        let level_col = if kind == 4 { 5 } else { 4 };
        let level_at = (row, level_col);
        let first = level_col + 1;
        let first_cell = || params([("cell", cell_name(row, first).into())]);
        let level_value = integer(&self.value(level_at)).map(u64::from);
        let empty_level = self.blank(level_at) || level_value == Some(0);
        let valid_level = level_value.is_some_and(|l| LEVELS.contains(&l));
        if !leveling && ((!empty_level && !valid_level) || self.has_image(level_at)) {
            self.issues
                .at(Error, "level_disabled", level_at, first_cell());
        } else if leveling && !valid_level {
            self.issues
                .at(Error, "level_invalid", level_at, first_cell());
        }
        let level = if leveling {
            level_value.and_then(|l| u32::try_from(l).ok()).unwrap_or(0)
        } else {
            0
        };

        let (options, cells, pictures) = if matches!(kind, 1 | 2 | 4) {
            let Some(found) = self.options(row, first) else {
                return Row::Failed;
            };
            found
        } else {
            (Vec::new(), Vec::new(), Vec::new())
        };
        if matches!(kind, 1 | 2 | 4) {
            if options.is_empty() {
                self.issues
                    .at(Error, "no_options", (row, first), Map::new());
            } else if kind != 4 && options.len() < 2 {
                self.issues.at(
                    Error,
                    "too_few_options",
                    (row, first),
                    params([("min", 2.into())]),
                );
            }
        }

        let c = (row, 3);
        let answer = if kind == 5 {
            String::new()
        } else {
            self.text(c, Text::Answer)
        };
        let built = match kind {
            1 | 2 => self.choice(row, kind, &answer, &options, &cells, &pictures),
            3 => {
                if answer.is_empty() {
                    self.issues.at(Error, "no_text_answer", c, Map::new());
                }
                Some(DotKind::Short { answer })
            }
            4 => self.matching(row, &answer, &options, &cells, &pictures),
            _ => Some(DotKind::Essay),
        };

        let text = self.text(a, Text::Question);
        let question_pictures = self.pictures(a);
        if question_pictures.len() > MAX_QUESTION_IMAGES {
            self.issues.at(
                Error,
                "too_many_images",
                a,
                params([("max", MAX_QUESTION_IMAGES.into())]),
            );
        }
        // Pictures this row does not own (B, C, the level cell, cells of types 3 and 5).
        let row_placed: Vec<(u32, u32)> = self
            .placed
            .range((row, 0)..=(row, u32::MAX))
            .map(|(&at, _)| at)
            .filter(|at| !self.used.contains(at))
            .collect();
        for at in row_placed {
            self.issues.at(Error, "image_outside", at, Map::new());
        }
        let Some(mut kind) = built else {
            return Row::Failed;
        };
        if self.issues.row_failed(row) {
            return Row::Failed;
        }
        let images: Vec<usize> = question_pictures
            .into_iter()
            .map(|p| self.image(p))
            .collect();
        let attach = |ctx: &mut Self, list: &mut [DotOption], pics: &[Option<usize>]| {
            for (option, picture) in list.iter_mut().zip(pics) {
                option.image = picture.map(|p| ctx.image(p));
            }
        };
        match &mut kind {
            DotKind::Single { options, .. } | DotKind::Multiple { options, .. } => {
                attach(self, options, &pictures);
            }
            DotKind::Matching { left, right, .. } => {
                let (l, r) = pictures.split_at(left.len());
                attach(self, left, l);
                attach(self, right, r);
            }
            DotKind::Short { .. } | DotKind::Essay => {}
        }
        Row::Question(DotQuestion {
            row,
            text,
            images,
            level,
            kind,
        })
    }

    fn choice(
        &mut self,
        row: u32,
        kind: u32,
        answer: &str,
        options: &[DotOption],
        cells: &[(u32, u32)],
        pictures: &[Option<usize>],
    ) -> Option<DotKind> {
        let c = (row, 3);
        self.distinct(options, cells, pictures);
        let Some(list) = numbers(answer) else {
            self.issues.at(Error, "correct_format", c, Map::new());
            return None;
        };
        if kind == 1 && list.len() != 1 {
            self.issues.at(Error, "single_needs_one", c, Map::new());
        }
        let set: BTreeSet<u64> = list.iter().copied().collect();
        if set.len() != list.len() {
            self.issues.at(Error, "correct_repeated", c, Map::new());
        }
        let total = options.len() as u64;
        for &item in &list {
            if item < 1 || item > total {
                self.issues.at(
                    Error,
                    "correct_out_of_range",
                    c,
                    params([("item", item.into()), ("total", total.into())]),
                );
            }
        }
        let bold: BTreeSet<u64> = (1..)
            .zip(cells)
            .filter(|&(_, at)| {
                self.sheet
                    .cells
                    .get(at)
                    .is_some_and(|cell| self.styles.bold(cell.style))
            })
            .map(|(n, _)| n)
            .collect();
        if !bold.is_empty() && bold != set {
            self.issues.at(
                Warning,
                "bold_mismatch",
                c,
                params([
                    ("bold", joined(&bold).into()),
                    ("correct", joined(&set).into()),
                ]),
            );
        }
        let index = |n: u64| n.checked_sub(1).and_then(|i| usize::try_from(i).ok());
        Some(if kind == 1 {
            DotKind::Single {
                options: options.to_vec(),
                correct: index(*list.first()?)?,
            }
        } else {
            DotKind::Multiple {
                options: options.to_vec(),
                correct: set.iter().map(|&n| index(n)).collect::<Option<_>>()?,
            }
        })
    }

    fn matching(
        &mut self,
        row: u32,
        answer: &str,
        options: &[DotOption],
        cells: &[(u32, u32)],
        pictures: &[Option<usize>],
    ) -> Option<DotKind> {
        let (c, d) = ((row, 3), (row, 4));
        let total = options.len() as u64;
        let counts = pair(&self.value(d), ';', true);
        let (left, right) = counts.unwrap_or((0, 0));
        if counts.is_none() {
            self.issues
                .at(Error, "matching_counts_format", d, Map::new());
        } else if left.saturating_add(right) != total {
            self.issues.at(
                Error,
                "matching_counts_mismatch",
                d,
                params([
                    ("left", left.into()),
                    ("right", right.into()),
                    ("total", total.into()),
                ]),
            );
        }
        let mut pairs: BTreeMap<u64, u64> = BTreeMap::new();
        for text in answer.trim_end_matches([';', ' ']).split(';') {
            let Some((from, to)) = pair(text, '-', false) else {
                self.issues.at(
                    Error,
                    "matching_pair_format",
                    c,
                    params([("pair", text.into())]),
                );
                continue;
            };
            if pairs.contains_key(&from) {
                self.issues.at(
                    Error,
                    "matching_pair_repeated",
                    c,
                    params([("left", from.into())]),
                );
            }
            if left > 0 && (from > left || to > right) {
                self.issues.at(
                    Error,
                    "matching_pair_out_of_range",
                    c,
                    params([
                        ("left", from.into()),
                        ("right", to.into()),
                        ("row", row.into()),
                    ]),
                );
            }
            pairs.insert(from, to);
        }
        if left > 0 && !(1..=left).all(|k| pairs.contains_key(&k)) {
            self.issues
                .at(Error, "matching_pairs_incomplete", c, Map::new());
        }
        let split = usize::try_from(left).ok().filter(|&l| l <= options.len())?;
        self.distinct(&options[..split], &cells[..split], &pictures[..split]);
        self.distinct(&options[split..], &cells[split..], &pictures[split..]);
        let pairs = (1..=left)
            .map(|k| {
                let to = *pairs.get(&k)?;
                Some((to > 0).then(|| usize::try_from(to - 1).ok()).flatten())
            })
            .collect::<Option<Vec<_>>>()?;
        Some(DotKind::Matching {
            left: options[..split].to_vec(),
            right: options[split..].to_vec(),
            pairs,
        })
    }
}

/// Builds the test; `Err(max)` when there are more questions than allowed.
#[allow(clippy::too_many_lines)]
pub fn build(
    sheet: &Sheet,
    styles: &Styles,
    found: &Found,
    options: ParseOptions,
    issues: &mut Issues,
) -> Result<DotTest, usize> {
    let mut placed: BTreeMap<(u32, u32), Vec<&Placed>> = BTreeMap::new();
    for p in &found.placed {
        placed.entry((p.row, p.col)).or_default().push(p);
    }
    let mut rows: BTreeSet<u32> = sheet
        .cells
        .iter()
        .filter(|(_, c)| c.content())
        .map(|(&(r, _), _)| r)
        .chain(sheet.wide.keys().copied())
        .chain(placed.keys().map(|&(r, _)| r))
        .collect();
    rows.insert(1);
    if rows.len() - 1 > options.max_questions {
        return Err(options.max_questions);
    }
    let mut ctx = Ctx {
        sheet,
        styles,
        found,
        options,
        issues,
        placed,
        used: HashSet::new(),
        trimmed: Vec::new(),
        unescaped: Vec::new(),
        images: Vec::new(),
        by_sha: HashMap::new(),
    };
    for p in &found.placed {
        if let Err(code) = p.picture {
            ctx.issues.at(Error, code, (p.row, p.col), Map::new());
        }
    }
    for &cell in &found.outside {
        match cell {
            Some(at) => ctx.issues.at(Error, "image_outside", at, Map::new()),
            None => ctx.issues.file(Error, "image_outside", Map::new()),
        }
    }
    ctx.cell_checks(&rows);

    let (title, attempts, time_minutes, limit, leveling) = ctx.header();
    let header_images: Vec<(u32, u32)> = ctx
        .placed
        .range((1, 0)..=(1, u32::MAX))
        .map(|(&at, _)| at)
        .collect();
    for at in header_images {
        ctx.issues.at(Error, "image_outside", at, Map::new());
    }

    let mut questions = Vec::new();
    let mut counted = 0u32;
    for &row in rows.iter().filter(|&&r| r > 1) {
        match ctx.question(row, leveling) {
            Row::Skipped => {}
            Row::Failed => counted += 1,
            Row::Question(q) => {
                counted += 1;
                questions.push(q);
            }
        }
    }
    if counted == 0 {
        ctx.issues.at(Error, "no_questions", (2, 1), Map::new());
    }
    if limit > counted {
        ctx.issues.at(
            Error,
            "limit_too_big",
            (1, 5),
            params([("total", counted.into())]),
        );
    }

    let mut seen: HashMap<(String, Vec<[u8; 32]>), u32> = HashMap::new();
    for q in &questions {
        let text = q
            .text
            .to_lowercase()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        let shas: Vec<[u8; 32]> = q.images.iter().map(|&i| ctx.images[i].sha256).collect();
        if let Some(&earlier) = seen.get(&(text.clone(), shas.clone())) {
            ctx.issues.at(
                Warning,
                "duplicate_question",
                (q.row, 1),
                params([("row", earlier.into())]),
            );
        } else {
            seen.insert((text, shas), q.row);
        }
    }
    let shapes = found.shapes.clone();
    let (trimmed, unescaped) = (
        std::mem::take(&mut ctx.trimmed),
        std::mem::take(&mut ctx.unescaped),
    );
    ctx.issues.cells("unescaped_newlines", unescaped);
    ctx.issues.cells("trimmed", trimmed);
    ctx.issues.cells("shapes_skipped", shapes);
    Ok(DotTest {
        title,
        attempts,
        time_minutes,
        limit,
        leveling,
        questions,
        images: ctx.images,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dot_number_lists() {
        assert_eq!(numbers("1;3"), Some(vec![1, 3]));
        assert_eq!(numbers("1 ; 3;"), Some(vec![1, 3]));
        assert_eq!(numbers("1;;"), None);
        assert_eq!(numbers("1 2"), None);
        assert_eq!(numbers(""), None);
        assert_eq!(pair("2-0", '-', false), Some((2, 0)));
        assert_eq!(pair("0-1", '-', false), None);
        assert_eq!(pair(" 3 ; 2 ", ';', true), Some((3, 2)));
        assert_eq!(pair("3;0", ';', true), None);
        assert_eq!(integer(" 30 "), Some(30));
        assert_eq!(integer("3.5"), None);
        assert_eq!(integer("2147483648"), None);
    }
}
