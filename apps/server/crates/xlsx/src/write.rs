//! [`DotTest`] → `.xlsx` (spec 8.1): the format [`crate::parse`] reads back
//! to the same [`DotTest`].

use std::collections::BTreeMap;
use std::io::{Cursor, Read, Write};

use rust_xlsxwriter::{
    Format, FormatAlign, Image as XlsxImage, Note, ObjectMovement, Workbook, Worksheet, XlsxError,
};

use crate::{DotKind, DotOption, DotTest, Image};

/// A question or field the DOT format cannot hold, listed on the
/// «Пропущено» sheet.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Skipped {
    /// 1-based position of the item in the assessment.
    pub position: u32,
    /// The item's title or prompt excerpt.
    pub title: String,
    /// Russian reason shown to the teacher.
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WriteError {
    /// The workbook writer failed (message for logs).
    Xlsx(String),
}

impl From<XlsxError> for WriteError {
    fn from(e: XlsxError) -> Self {
        Self::Xlsx(e.to_string())
    }
}

impl From<std::io::Error> for WriteError {
    fn from(e: std::io::Error) -> Self {
        Self::Xlsx(e.to_string())
    }
}

impl From<zip::result::ZipError> for WriteError {
    fn from(e: zip::result::ZipError) -> Self {
        Self::Xlsx(e.to_string())
    }
}

/// Column widths in characters: A, B, C, D, then options.
const WIDTHS: [f64; 4] = [65.0, 26.0, 28.0, 40.0];
const OPTION_WIDTH: f64 = 40.0;
/// Excel's largest row, 409 pt, in pixels.
const MAX_ROW_PX: f64 = 545.0;
const PAD: f64 = 4.0;
const LINE_PX: f64 = 20.0;
/// Text above pictures takes at most this much of the row.
const MAX_TEXT_PX: f64 = 200.0;
const LEVELING_COMMENT: &str = "Распределение вопросов по сложности: 0 - отключено, 1 - включено.";

fn label(text: &str) -> Format {
    Format::new()
        .set_num_format(format!("0\" [{text}]\""))
        .set_align(FormatAlign::Top)
}

const fn type_label(kind: &DotKind) -> (u32, &'static str) {
    match kind {
        DotKind::Single { .. } => (1, "одинарный"),
        DotKind::Multiple { .. } => (2, "множественный"),
        DotKind::Short { .. } => (3, "текстовый"),
        DotKind::Matching { .. } => (4, "сопоставление"),
        DotKind::Essay => (5, "эссе"),
    }
}

fn col_px(col: u16) -> f64 {
    WIDTHS
        .get(usize::from(col))
        .copied()
        .unwrap_or(OPTION_WIDTH)
        .mul_add(7.0, 5.0)
}

fn joined(items: impl Iterator<Item = usize>) -> String {
    items
        .map(|i| (i + 1).to_string())
        .collect::<Vec<_>>()
        .join(";")
}

/// Write `test` as a DOT workbook: sheet `Test` (active) and, when
/// `skipped` is non-empty, sheet «Пропущено».
pub fn write(test: &DotTest, skipped: &[Skipped]) -> Result<Vec<u8>, WriteError> {
    write_book(test, &Extra::Skipped(skipped))
}

/// The teachers' template: `test` (an example of every type) on the active
/// sheet `Test`, then sheet «Инструкция» with `instructions` as
/// (topic, text) rows.
pub fn write_template(
    test: &DotTest,
    instructions: &[(&str, &str)],
) -> Result<Vec<u8>, WriteError> {
    write_book(test, &Extra::Instructions(instructions))
}

/// The sheet after `Test`.
enum Extra<'a> {
    Skipped(&'a [Skipped]),
    Instructions(&'a [(&'a str, &'a str)]),
}

#[allow(clippy::too_many_lines)]
fn write_book(test: &DotTest, extra: &Extra<'_>) -> Result<Vec<u8>, WriteError> {
    let mut book = Workbook::new();
    let mut sheet = Worksheet::new();
    sheet.set_name("Test")?.set_active(true);
    let wrap = Format::new().set_text_wrap().set_align(FormatAlign::Top);
    let bold = wrap.clone().set_bold();
    for (col, width) in (0u16..).zip(WIDTHS) {
        sheet.set_column_width(col, width)?;
    }

    sheet.write_string_with_format(0, 0, &test.title, &bold)?;
    sheet.write_number_with_format(0, 1, 0, &bold)?;
    let settings = [
        (2, test.attempts, "количество попыток"),
        (3, test.time_minutes, "время на выполнение в минутах"),
        (4, test.limit, "лимит вопросов"),
    ];
    for (col, value, text) in settings {
        sheet.write_number_with_format(0, col, value, &label(text).set_bold())?;
    }
    let leveling = if test.leveling {
        "включено"
    } else {
        "отключено"
    };
    sheet.write_number_with_format(
        0,
        5,
        u32::from(test.leveling),
        &label(&format!("распределение по сложности: {leveling}")).set_bold(),
    )?;
    sheet.insert_note(0, 5, &Note::new(LEVELING_COMMENT).set_author("Ashyq"))?;
    sheet.set_row_height(0, 45)?;

    // Cell → pictures, and text per cell for the row height.
    let mut pictures: BTreeMap<(u32, u16), Vec<usize>> = BTreeMap::new();
    let mut texts: BTreeMap<(u32, u16), usize> = BTreeMap::new();
    let mut last_col = 3u16;
    for (row, q) in (1u32..).zip(&test.questions) {
        let (number, name) = type_label(&q.kind);
        let mut put = |sheet: &mut Worksheet, col: u16, text: &str| -> Result<(), XlsxError> {
            if !text.is_empty() {
                sheet.write_string_with_format(row, col, text, &wrap)?;
                texts.insert(
                    (row, col),
                    text.lines().count().max(1) + text.chars().count() / 60,
                );
            }
            Ok(())
        };
        put(&mut sheet, 0, &q.text)?;
        if !q.images.is_empty() {
            pictures.insert((row, 0), q.images.clone());
        }
        sheet.write_number_with_format(row, 1, number, &label(name))?;
        let (correct, counts, options): (String, Option<String>, Vec<&DotOption>) = match &q.kind {
            DotKind::Single { options, correct } => (
                joined(std::iter::once(*correct)),
                None,
                options.iter().collect(),
            ),
            DotKind::Multiple { options, correct } => (
                joined(correct.iter().copied()),
                None,
                options.iter().collect(),
            ),
            DotKind::Short { answer } => (answer.clone(), None, Vec::new()),
            DotKind::Matching { left, right, pairs } => {
                let pairs = pairs
                    .iter()
                    .enumerate()
                    .map(|(k, r)| format!("{}-{}", k + 1, r.map_or(0, |r| r + 1)))
                    .collect::<Vec<_>>()
                    .join(";");
                let counts = format!("{};{}", left.len(), right.len());
                (pairs, Some(counts), left.iter().chain(right).collect())
            }
            DotKind::Essay => (String::new(), None, Vec::new()),
        };
        put(&mut sheet, 2, &correct)?;
        let level_col = if let Some(counts) = &counts {
            sheet.write_string_with_format(row, 3, counts, &wrap)?;
            4
        } else {
            3
        };
        if test.leveling && q.level != 0 {
            sheet.write_number_with_format(row, level_col, q.level, &wrap)?;
        }
        for (col, option) in (level_col + 1..).zip(options) {
            put(&mut sheet, col, &option.text)?;
            if let Some(image) = option.image {
                pictures.insert((row, col), vec![image]);
            }
            last_col = last_col.max(col);
        }
    }
    for col in 4..=last_col {
        sheet.set_column_width(col, OPTION_WIDTH)?;
    }

    let mut placeholders: Vec<(Vec<u8>, usize)> = Vec::new();
    let mut heights: BTreeMap<u32, f64> = BTreeMap::new();
    for (&(row, col), list) in &pictures {
        let lines = texts.get(&(row, col)).copied().unwrap_or(0);
        #[allow(clippy::cast_precision_loss)]
        let mut y = (lines as f64 * LINE_PX).min(MAX_TEXT_PX) + PAD;
        let width = 2.0f64.mul_add(-PAD, col_px(col));
        let mut images = Vec::new();
        for &index in list {
            let image = test
                .images
                .get(index)
                .ok_or_else(|| WriteError::Xlsx(format!("image {index} is missing")))?;
            images.push(xlsx_image(image, index, &mut placeholders)?);
        }
        // Natural display sizes, fitted to the column, then all scaled to the row.
        let sizes: Vec<(f64, f64)> = images
            .iter()
            .map(|i| {
                let (w, h) = (
                    i.width() * 96.0 / i.width_dpi(),
                    i.height() * 96.0 / i.height_dpi(),
                );
                let fit = (width / w).min(1.0);
                (w * fit, h * fit)
            })
            .collect();
        #[allow(clippy::cast_precision_loss)]
        let room = PAD.mul_add(-(list.len() as f64 + 1.0), MAX_ROW_PX - y);
        let total: f64 = sizes.iter().map(|s| s.1).sum();
        let scale = (room / total).min(1.0);
        for (image, (w, h)) in images.into_iter().zip(sizes) {
            let (w, h) = ((w * scale).max(1.0), (h * scale).max(1.0));
            let image = image
                .set_scale_to_size(w, h, true)
                .set_object_movement(ObjectMovement::MoveButDontSizeWithCells);
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            sheet.insert_image_with_offset(row, col, &image, PAD as u32, y.round() as u32)?;
            y += h.ceil() + PAD;
        }
        let height = heights.entry(row).or_insert(0.0);
        *height = height.max(y.min(MAX_ROW_PX));
    }
    for (row, px) in heights {
        sheet.set_row_height(row, (px * 0.75).min(409.0))?;
    }
    sheet.set_freeze_panes(1, 0)?;
    book.push_worksheet(sheet);

    if let Extra::Instructions(rows) = *extra {
        let mut list = Worksheet::new();
        list.set_name("Инструкция")?;
        list.set_column_width(0, 28)?;
        list.set_column_width(1, 100)?;
        for (row, (topic, text)) in (0u32..).zip(rows) {
            list.write_string_with_format(row, 0, *topic, &bold)?;
            list.write_string_with_format(row, 1, *text, &wrap)?;
        }
        book.push_worksheet(list);
    }
    if let Extra::Skipped(skipped) = *extra
        && !skipped.is_empty()
    {
        let mut list = Worksheet::new();
        list.set_name("Пропущено")?;
        list.set_column_width(0, 10)?;
        list.set_column_width(1, 60)?;
        list.set_column_width(2, 60)?;
        for (col, head) in (0u16..).zip(["Позиция", "Вопрос", "Причина"]) {
            list.write_string_with_format(0, col, head, &bold)?;
        }
        for (row, s) in (1u32..).zip(skipped) {
            list.write_number(row, 0, s.position)?;
            list.write_string_with_format(row, 1, &s.title, &wrap)?;
            list.write_string_with_format(row, 2, &s.reason, &wrap)?;
        }
        book.push_worksheet(list);
    }
    let bytes = book.save_to_buffer()?;
    if placeholders.is_empty() {
        Ok(bytes)
    } else {
        swap_webp(&bytes, &placeholders, test)
    }
}

/// The writer has no WebP: such a picture goes in as a header-only PNG of
/// the same size, unique per image, and [`swap_webp`] puts the WebP back.
fn xlsx_image(
    image: &Image,
    index: usize,
    placeholders: &mut Vec<(Vec<u8>, usize)>,
) -> Result<XlsxImage, WriteError> {
    if image.mime != "image/webp" {
        return Ok(XlsxImage::new_from_buffer(&image.bytes)?);
    }
    let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut chunk = |kind: &[u8], data: &[u8]| {
        png.extend_from_slice(&u32::try_from(data.len()).unwrap_or(0).to_be_bytes());
        png.extend_from_slice(kind);
        png.extend_from_slice(data);
        png.extend_from_slice(&[0; 4]);
    };
    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&image.width.to_be_bytes());
    header.extend_from_slice(&image.height.to_be_bytes());
    header.extend_from_slice(&[8, 6, 0, 0, 0]);
    chunk(b"IHDR", &header);
    chunk(b"tEXt", format!("ab-webp\0{index}").as_bytes());
    chunk(b"IEND", &[]);
    let found = XlsxImage::new_from_buffer(&png)?;
    if !placeholders.iter().any(|(_, i)| *i == index) {
        placeholders.push((png, index));
    }
    Ok(found)
}

/// Replaces placeholder media with the WebP bytes, renames them `.webp` and
/// fixes the relationships and content types.
fn swap_webp(
    bytes: &[u8],
    placeholders: &[(Vec<u8>, usize)],
    dot: &DotTest,
) -> Result<Vec<u8>, WriteError> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))?;
    let mut parts: Vec<(String, Vec<u8>)> = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let mut data = Vec::new();
        entry.read_to_end(&mut data)?;
        parts.push((entry.name().map_err(WriteError::from)?.into_owned(), data));
    }
    let mut renamed: Vec<(String, String)> = Vec::new();
    for (name, data) in &mut parts {
        let Some(&(_, index)) = placeholders.iter().find(|(png, _)| png == data) else {
            continue;
        };
        let Some(file) = name
            .strip_prefix("xl/media/")
            .and_then(|f| f.strip_suffix(".png"))
        else {
            continue;
        };
        let webp = format!("{file}.webp");
        renamed.push((format!("{file}.png\""), format!("{webp}\"")));
        data.clone_from(&dot.images[index].bytes);
        *name = format!("xl/media/{webp}");
    }
    let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for (name, data) in parts {
        let rels = std::path::Path::new(&name)
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("rels"));
        let data = if rels {
            let mut text = String::from_utf8_lossy(&data).into_owned();
            for (from, to) in &renamed {
                text = text.replace(&format!("media/{from}"), &format!("media/{to}"));
            }
            text.into_bytes()
        } else if name == "[Content_Types].xml" {
            String::from_utf8_lossy(&data)
                .replacen(
                    "<Default ",
                    "<Default Extension=\"webp\" ContentType=\"image/webp\"/><Default ",
                    1,
                )
                .into_bytes()
        } else {
            data
        };
        out.start_file(name, options)?;
        out.write_all(&data)?;
    }
    Ok(out.finish()?.into_inner())
}
