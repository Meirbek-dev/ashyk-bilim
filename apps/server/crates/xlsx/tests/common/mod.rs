//! Fixtures built in code: `rust_xlsxwriter` workbooks, hand-written
//! packages and post-processed zips. Nothing binary is committed.

#![allow(
    dead_code,
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::format_push_string
)]

use std::io::{Cursor, Read, Write};

use ab_xlsx::{Issue, ParseOptions, Parsed, Severity, parse};
use rust_xlsxwriter::{Workbook, Worksheet};

/// A workbook whose first sheet `Test` is filled by `fill`.
pub fn book(fill: impl FnOnce(&mut Worksheet)) -> Vec<u8> {
    let mut book = Workbook::new();
    let sheet = book.add_worksheet();
    sheet.set_name("Test").unwrap();
    fill(sheet);
    book.save_to_buffer().unwrap()
}

/// Row 1: title, B1 = 0, attempts, minutes, limit, leveling.
pub fn header(sheet: &mut Worksheet, attempts: u32, minutes: u32, limit: u32, leveling: bool) {
    sheet.write_string(0, 0, "Тест").unwrap();
    sheet.write_number(0, 1, 0).unwrap();
    sheet.write_number(0, 2, attempts).unwrap();
    sheet.write_number(0, 3, minutes).unwrap();
    sheet.write_number(0, 4, limit).unwrap();
    sheet.write_number(0, 5, u32::from(leveling)).unwrap();
}

/// A question row (`row` 1-based) with string cells from column A; an
/// empty string leaves the cell blank, a leading `#` writes a number.
pub fn row(sheet: &mut Worksheet, row: u32, cells: &[&str]) {
    for (col, value) in (0u16..).zip(cells) {
        if value.is_empty() {
            continue;
        }
        if let Some(n) = value.strip_prefix('#') {
            sheet
                .write_number(row - 1, col, n.parse::<f64>().unwrap())
                .unwrap();
        } else {
            sheet.write_string(row - 1, col, *value).unwrap();
        }
    }
}

fn chunk(out: &mut Vec<u8>, kind: &[u8], data: &[u8]) {
    out.extend_from_slice(&u32::try_from(data.len()).unwrap().to_be_bytes());
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    out.extend_from_slice(&[0; 4]);
}

/// A header-only PNG (enough for size checks); `seed` makes it unique.
pub fn png(width: u32, height: u32, seed: u32) -> Vec<u8> {
    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut header = width.to_be_bytes().to_vec();
    header.extend_from_slice(&height.to_be_bytes());
    header.extend_from_slice(&[8, 6, 0, 0, 0]);
    chunk(&mut out, b"IHDR", &header);
    chunk(&mut out, b"tEXt", format!("seed\0{seed}").as_bytes());
    chunk(&mut out, b"IEND", &[]);
    out
}

/// A header-only baseline JPEG.
pub fn jpeg(width: u16, height: u16) -> Vec<u8> {
    let mut out = vec![0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08];
    out.extend_from_slice(&height.to_be_bytes());
    out.extend_from_slice(&width.to_be_bytes());
    out.extend_from_slice(&[3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    out.extend_from_slice(&[0xFF, 0xDA, 0, 8, 1, 1, 0, 0, 0x3F, 0, 0xFF, 0xD9]);
    out
}

/// A header-only GIF.
pub fn gif(width: u16, height: u16) -> Vec<u8> {
    let mut out = b"GIF89a".to_vec();
    out.extend_from_slice(&width.to_le_bytes());
    out.extend_from_slice(&height.to_le_bytes());
    out.extend_from_slice(&[0, 0, 0, 0x3B]);
    out.resize(32, 0);
    out
}

/// A header-only extended WebP.
pub fn webp(width: u32, height: u32) -> Vec<u8> {
    let mut body = b"WEBPVP8X".to_vec();
    body.extend_from_slice(&10u32.to_le_bytes());
    body.extend_from_slice(&[0; 4]);
    body.extend_from_slice(&(width - 1).to_le_bytes()[..3]);
    body.extend_from_slice(&(height - 1).to_le_bytes()[..3]);
    let mut out = b"RIFF".to_vec();
    out.extend_from_slice(&u32::try_from(body.len()).unwrap().to_le_bytes());
    out.extend_from_slice(&body);
    out
}

/// Every part of a zip.
pub fn unzip(bytes: &[u8]) -> Vec<(String, Vec<u8>)> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    (0..archive.len())
        .map(|i| {
            let mut entry = archive.by_index(i).unwrap();
            let mut data = Vec::new();
            entry.read_to_end(&mut data).unwrap();
            (entry.name().unwrap().into_owned(), data)
        })
        .collect()
}

/// A zip of these parts.
pub fn zip(parts: &[(String, Vec<u8>)]) -> Vec<u8> {
    let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for (name, data) in parts {
        out.start_file(name.as_str(), options).unwrap();
        out.write_all(data).unwrap();
    }
    out.finish().unwrap().into_inner()
}

/// Rewrites the text of the parts whose name contains `part`.
pub fn edit(bytes: &[u8], part: &str, change: impl Fn(&str) -> String) -> Vec<u8> {
    let parts: Vec<(String, Vec<u8>)> = unzip(bytes)
        .into_iter()
        .map(|(name, data)| {
            if name.contains(part) {
                let text = change(&String::from_utf8(data).unwrap());
                (name, text.into_bytes())
            } else {
                (name, data)
            }
        })
        .collect();
    zip(&parts)
}

/// A hand-written package: `sheets` are `(name, sheetData rows)`.
pub fn raw(sheets: &[(&str, &str)], active: usize, extra: &[(&str, &str)]) -> Vec<u8> {
    let ns = r#"xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships""#;
    let rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    let mut parts = vec![(
        "_rels/.rels".to_owned(),
        format!(r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>"#).into_bytes(),
    )];
    let mut list = String::new();
    let mut rels = String::new();
    for (i, (name, rows)) in sheets.iter().enumerate() {
        let n = i + 1;
        list.push_str(&format!(
            r#"<sheet name="{name}" sheetId="{n}" r:id="rId{n}"/>"#
        ));
        rels.push_str(&format!(
            r#"<Relationship Id="rId{n}" Type="{rel}/worksheet" Target="worksheets/sheet{n}.xml"/>"#
        ));
        let body = if rows.starts_with('<') && rows.contains("<sheetData") {
            (*rows).to_owned()
        } else {
            format!("<worksheet {ns}><sheetData>{rows}</sheetData></worksheet>")
        };
        parts.push((format!("xl/worksheets/sheet{n}.xml"), body.into_bytes()));
    }
    rels.push_str(&format!(
        r#"<Relationship Id="rIdS" Type="{rel}/styles" Target="styles.xml"/>"#
    ));
    if extra
        .iter()
        .any(|(name, _)| *name == "xl/sharedStrings.xml")
    {
        rels.push_str(&format!(
            r#"<Relationship Id="rIdT" Type="{rel}/sharedStrings" Target="sharedStrings.xml"/>"#
        ));
    }
    parts.push((
        "xl/workbook.xml".to_owned(),
        format!(r#"<workbook {ns}><workbookPr date1904="1"/><bookViews><workbookView activeTab="{active}"/></bookViews><sheets>{list}</sheets></workbook>"#).into_bytes(),
    ));
    parts.push((
        "xl/_rels/workbook.xml.rels".to_owned(),
        format!(r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{rels}</Relationships>"#).into_bytes(),
    ));
    let mut styles = false;
    for (name, text) in extra {
        styles |= *name == "xl/styles.xml";
        parts.push(((*name).to_owned(), text.as_bytes().to_vec()));
    }
    if !styles {
        parts.push((
            "xl/styles.xml".to_owned(),
            format!(r#"<styleSheet {ns}><fonts count="1"><font/></fonts><cellXfs count="1"><xf numFmtId="0" fontId="0"/></cellXfs></styleSheet>"#).into_bytes(),
        ));
    }
    zip(&parts)
}

/// `<c>` with an inline string.
pub fn s(cell: &str, text: &str) -> String {
    format!(r#"<c r="{cell}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>"#)
}

/// `<c>` with a number as written in the XML.
pub fn n(cell: &str, value: &str) -> String {
    format!(r#"<c r="{cell}"><v>{value}</v></c>"#)
}

/// A `<row>` of cells.
pub fn r(row: u32, cells: &[String]) -> String {
    format!(r#"<row r="{row}">{}</row>"#, cells.concat())
}

/// The standard header row 1 as raw XML.
pub fn raw_header() -> String {
    r(
        1,
        &[
            s("A1", "Тест"),
            n("B1", "0"),
            n("C1", "0"),
            n("D1", "0"),
            n("E1", "0"),
            n("F1", "0"),
        ],
    )
}

pub fn read(bytes: &[u8]) -> Parsed {
    parse(bytes, ParseOptions::default())
}

/// `(severity, code, cell)` of every issue.
pub fn located(parsed: &Parsed) -> Vec<(Severity, &'static str, Option<String>)> {
    parsed
        .issues
        .iter()
        .map(|i| (i.severity, i.code, i.cell.clone()))
        .collect()
}

/// The one issue with this code.
pub fn issue<'a>(parsed: &'a Parsed, code: &str) -> &'a Issue {
    let found: Vec<&Issue> = parsed.issues.iter().filter(|i| i.code == code).collect();
    assert_eq!(found.len(), 1, "{code}: {:#?}", parsed.issues);
    found[0]
}

/// The cells listed by an aggregated info.
pub fn cells(issue: &Issue) -> Vec<String> {
    issue.params["cells"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c.as_str().unwrap().to_owned())
        .collect()
}

pub fn has(parsed: &Parsed, code: &str, cell: &str) -> bool {
    parsed
        .issues
        .iter()
        .any(|i| i.code == code && i.cell.as_deref() == Some(cell))
}
