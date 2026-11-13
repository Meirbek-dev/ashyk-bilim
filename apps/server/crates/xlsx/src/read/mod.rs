//! `.xlsx` → [`DotTest`] (spec 4, 10, 12.1).

mod book;
mod dot;
mod images;
mod sheet;
mod xml;
mod zip;

use std::collections::HashSet;

use serde_json::{Map, Value};

use crate::{DotTest, Issue, ParseOptions, Parsed, Severity};
use images::{Found, RichValues};
use zip::{Archive, Fail, rels_of};

const MAX_FILE: usize = 20 * 1024 * 1024;
const MAX_ISSUES: usize = 100;
const MAX_IMAGES: usize = 300;
const OLE2: [u8; 8] = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

/// Params of an issue from `(key, value)` pairs.
pub fn params<const N: usize>(pairs: [(&str, Value); N]) -> Map<String, Value> {
    pairs.into_iter().map(|(k, v)| (k.to_owned(), v)).collect()
}

/// Issues of one parse; rows with an error are remembered so their question
/// is left out.
#[derive(Default)]
pub struct Issues {
    list: Vec<Issue>,
    error_rows: HashSet<u32>,
}

impl Issues {
    pub fn at(
        &mut self,
        severity: Severity,
        code: &'static str,
        (row, col): (u32, u32),
        params: Map<String, Value>,
    ) {
        if severity == Severity::Error {
            self.error_rows.insert(row);
        }
        self.list.push(Issue {
            severity,
            code,
            cell: Some(sheet::cell_name(row, col)),
            row: Some(row),
            params,
        });
    }

    pub fn file(&mut self, severity: Severity, code: &'static str, params: Map<String, Value>) {
        self.list.push(Issue {
            severity,
            code,
            cell: None,
            row: None,
            params,
        });
    }

    pub fn row_failed(&self, row: u32) -> bool {
        self.error_rows.contains(&row)
    }

    /// An info listing cells, when there are any.
    pub fn cells(&mut self, code: &'static str, mut cells: Vec<(u32, u32)>) {
        if cells.is_empty() {
            return;
        }
        cells.sort_unstable();
        cells.dedup();
        let names: Vec<Value> = cells
            .iter()
            .map(|&(r, c)| sheet::cell_name(r, c).into())
            .collect();
        let mut p = params([("cells", Value::Array(names))]);
        if code == "trimmed" {
            p.insert("count".to_owned(), cells.len().into());
        }
        self.file(Severity::Info, code, p);
    }

    /// Errors, warnings, infos; each by row and column; capped.
    fn finish(self) -> (Vec<Issue>, usize) {
        let mut list = self.list;
        list.sort_by_key(|i| {
            let col = i
                .cell
                .as_deref()
                .and_then(sheet::parse_ref)
                .map_or(0, |(_, c)| c);
            (i.severity, i.row.unwrap_or(0), col)
        });
        let truncated = list.len().saturating_sub(MAX_ISSUES);
        list.truncate(MAX_ISSUES);
        (list, truncated)
    }
}

fn failed(sheet: String, code: &'static str, p: Map<String, Value>) -> Parsed {
    let mut issues = Issues::default();
    issues.file(Severity::Error, code, p);
    let (issues, truncated) = issues.finish();
    Parsed {
        test: None,
        sheet,
        issues,
        truncated,
    }
}

/// Why the file as a whole cannot be read.
enum Stop {
    Unreadable,
    TooLarge(&'static str, usize),
}

impl From<Fail> for Stop {
    fn from(_: Fail) -> Self {
        Self::Unreadable
    }
}

impl From<xml::Bad> for Stop {
    fn from(_: xml::Bad) -> Self {
        Self::Unreadable
    }
}

impl From<images::Error> for Stop {
    fn from(_: images::Error) -> Self {
        Self::Unreadable
    }
}

/// Parse the active sheet of an `.xlsx` file.
#[must_use]
pub fn parse(bytes: &[u8], options: ParseOptions) -> Parsed {
    if bytes.len() > MAX_FILE {
        return failed(
            String::new(),
            "file_too_large",
            params([("max_mb", 20.into())]),
        );
    }
    if bytes.starts_with(&OLE2) {
        return failed(String::new(), "xls_not_supported", Map::new());
    }
    let mut sheet_name = String::new();
    match read(bytes, options, &mut sheet_name) {
        Ok((test, issues)) => {
            let (issues, truncated) = issues.finish();
            Parsed {
                test: Some(test),
                sheet: sheet_name,
                issues,
                truncated,
            }
        }
        Err(Stop::Unreadable) => failed(sheet_name, "file_unreadable", Map::new()),
        Err(Stop::TooLarge(code, max)) => failed(sheet_name, code, params([("max", max.into())])),
    }
}

#[allow(clippy::too_many_lines)]
fn read(
    bytes: &[u8],
    options: ParseOptions,
    sheet_name: &mut String,
) -> Result<(DotTest, Issues), Stop> {
    let mut archive = Archive::open(bytes)?;
    let root = match archive.read("_rels/.rels")? {
        Some(xml) => book::rels("", &xml)?,
        None => Vec::new(),
    };
    let workbook_path = root
        .iter()
        .find(|r| r.kind == "officeDocument")
        .and_then(|r| r.target.clone())
        .unwrap_or_else(|| "xl/workbook.xml".to_owned());
    let workbook = book::workbook(&archive.read(&workbook_path)?.ok_or(Stop::Unreadable)?)?;
    let book_rels = match archive.read(&rels_of(&workbook_path))? {
        Some(xml) => book::rels(&workbook_path, &xml)?,
        None => Vec::new(),
    };
    let target = |kind: &str| {
        book_rels
            .iter()
            .find(|r| r.kind == kind)
            .and_then(|r| r.target.clone())
    };
    let (name, rid) = workbook
        .sheets
        .get(workbook.active)
        .ok_or(Stop::Unreadable)?;
    sheet_name.clone_from(name);
    let sheet_path = book_rels
        .iter()
        .find(|r| &r.id == rid)
        .and_then(|r| r.target.clone())
        .ok_or(Stop::Unreadable)?;
    let shared = match target("sharedStrings") {
        Some(path) => match archive.read(&path)? {
            Some(xml) => book::shared_strings(&xml)?,
            None => Vec::new(),
        },
        None => Vec::new(),
    };
    let styles = match target("styles") {
        Some(path) => match archive.read(&path)? {
            Some(xml) => book::Styles::parse(&xml)?,
            None => book::Styles::default(),
        },
        None => book::Styles::default(),
    };
    let sheet_xml = archive.read(&sheet_path)?.ok_or(Stop::Unreadable)?;
    let mut sheet = sheet::parse(&sheet_xml, &shared, options.max_questions)?;
    drop(sheet_xml);
    if sheet.too_many_rows {
        return Err(Stop::TooLarge("too_many_questions", options.max_questions));
    }

    let mut found = Found::default();
    let sheet_rels = match archive.read(&rels_of(&sheet_path))? {
        Some(xml) => book::rels(&sheet_path, &xml)?,
        None => Vec::new(),
    };
    let drawing = sheet
        .drawing
        .as_ref()
        .and_then(|id| sheet_rels.iter().find(|r| &r.id == id))
        .and_then(|r| r.target.clone());
    if let Some(path) = drawing {
        images::drawing(&mut archive, &path, &mut found)?;
    }
    let in_cell: Vec<((u32, u32), u32)> = sheet
        .cells
        .iter()
        .filter_map(|(&at, c)| c.vm.map(|vm| (at, vm)))
        .collect();
    if found.placed.len() + in_cell.len() > MAX_IMAGES {
        return Err(Stop::TooLarge("too_many_images", MAX_IMAGES));
    }
    if !in_cell.is_empty() {
        let rich = RichValues::load(&mut archive)?;
        for (at, vm) in in_cell {
            if let Some(target) = rich.target(vm) {
                found.place(&mut archive, at, 0, Some(target))?;
                if let Some(cell) = sheet.cells.get_mut(&at) {
                    cell.vm = None;
                    cell.raw = sheet::Raw::Text(String::new());
                }
            }
        }
    }
    found.placed.sort_by_key(|p| (p.row, p.col, p.order));

    let mut issues = Issues::default();
    let others: Vec<Value> = workbook
        .sheets
        .iter()
        .enumerate()
        .filter(|&(i, _)| i != workbook.active)
        .map(|(_, (n, _))| n.clone().into())
        .collect();
    if !others.is_empty() {
        issues.file(
            Severity::Info,
            "other_sheets",
            params([
                ("sheet", name.clone().into()),
                ("names", Value::Array(others)),
            ]),
        );
    }
    let test = dot::build(&sheet, &styles, &found, options, &mut issues)
        .map_err(|max| Stop::TooLarge("too_many_questions", max))?;
    Ok((test, issues))
}
