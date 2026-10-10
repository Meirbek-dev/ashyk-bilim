//! The certificate as an A4-landscape PDF (`GET /certificates/{code}/pdf`).
//!
//! The supplied bilingual university artwork with generated text and two Noto Sans
//! subsets (`assets/fonts`, SIL OFL) so Cyrillic - including the Kazakh
//! letters - renders everywhere. No headless browser, no layout engine.

use ab_core::language::Language;
use ab_core::{Error, Result};
use pdf_writer::types::{
    ActionType, AnnotationType, CidFontType, FontFlags, SystemInfo, UnicodeCmap,
};
use pdf_writer::{Content, Filter, Finish, Name, Pdf, Rect, Ref, Str, TextStr};
use skrifa::instance::{LocationRef, Size};
use skrifa::{FontRef, GlyphId, MetadataProvider};
use subsetter::GlyphRemapper;

const REGULAR: &[u8] = include_bytes!("../../assets/fonts/NotoSans-Regular.ttf");
const BOLD: &[u8] = include_bytes!("../../assets/fonts/NotoSans-Bold.ttf");
const ARTWORK: &[u8] = include_bytes!("../../assets/certificates/reference.jpg");

/// A4 landscape, in points.
const PAGE_W: f32 = 841.89;
const PAGE_H: f32 = 595.28;
/// Where the verification code and link start.
const FOOTER_X: f32 = 180.0;

/// What the page says.
#[derive(Debug, Clone)]
pub struct CertificatePdf {
    pub language: Language,
    pub holder_name: String,
    pub course_name: String,
    /// The template's `certification_name` (falls back to the course name).
    pub certificate_name: String,
    /// The template's `certification_type` key (`completion`, `mastery`…).
    pub certificate_type: String,
    pub issued_at_unix: i64,
    pub verify_code: String,
    pub verify_url: String,
    pub teacher_name: Option<String>,
    pub course_start: Option<String>,
    pub course_end: Option<String>,
    pub training_hours: Option<u32>,
}

struct Strings {
    issued_on: &'static str,
    verify_at: &'static str,
}

const fn strings(language: Language) -> Strings {
    match language {
        Language::Ru => Strings {
            issued_on: "Дата выдачи",
            verify_at: "Проверить подлинность",
        },
        Language::Kk => Strings {
            issued_on: "Берілген күні",
            verify_at: "Түпнұсқалығын тексеру",
        },
        Language::En => Strings {
            issued_on: "Issued on",
            verify_at: "Verify at",
        },
    }
}

/// The certificate type as printed under the title (mirrors the web's
/// `Certificates.CourseEndView.certificationTypes` catalog).
fn type_label(language: Language, key: &str) -> Option<&'static str> {
    Some(match (language, key) {
        (Language::Ru, "achievement") => "За достижение",
        (Language::Ru, "assessment") => "По результатам оценки",
        (Language::Ru, "completion") => "За завершение курса",
        (Language::Ru, "continuing") => "Дополнительное образование",
        (Language::Ru, "mastery") => "Освоение навыка",
        (Language::Ru, "participation") => "Участие",
        (Language::Ru, "professional") => "Профессиональное развитие",
        (Language::Ru, "specialization") => "Специализация",
        (Language::Kk, "achievement") => "Жетістік үшін",
        (Language::Kk, "assessment") => "Бағалау нәтижесі бойынша",
        (Language::Kk, "completion") => "Курсты аяқтағаны үшін",
        (Language::Kk, "continuing") => "Қосымша білім",
        (Language::Kk, "mastery") => "Дағдыны меңгеру",
        (Language::Kk, "participation") => "Қатысу",
        (Language::Kk, "professional") => "Кәсіби даму",
        (Language::Kk, "specialization") => "Мамандандыру",
        (Language::En, "achievement") => "Certificate of Achievement",
        (Language::En, "assessment") => "Certificate of Assessment",
        (Language::En, "completion") => "Certificate of Completion",
        (Language::En, "continuing") => "Continuing Education",
        (Language::En, "mastery") => "Certificate of Mastery",
        (Language::En, "participation") => "Certificate of Participation",
        (Language::En, "professional") => "Professional Development",
        (Language::En, "specialization") => "Specialization",
        _ => return None,
    })
}

/// `12.09.2026` (ru/kk) or `2026-09-12` (en), in Kazakhstan time (UTC+5).
fn issued_date(language: Language, unix: i64) -> String {
    let date = jiff::Timestamp::from_second(unix)
        .map(|ts| {
            ts.to_zoned(jiff::tz::TimeZone::fixed(jiff::tz::Offset::constant(5)))
                .date()
        })
        .unwrap_or_default();
    match language {
        Language::En => format!("{:04}-{:02}-{:02}", date.year(), date.month(), date.day()),
        Language::Ru | Language::Kk => {
            format!("{:02}.{:02}.{:04}", date.day(), date.month(), date.year())
        }
    }
}

/// An embedded font: the face for metrics plus the glyphs a page uses.
struct Font {
    data: &'static [u8],
    face: FontRef<'static>,
    remapper: GlyphRemapper,
    /// `(new gid, char)` pairs for the ToUnicode map.
    used: Vec<(u16, char)>,
}

impl Font {
    fn load(data: &'static [u8]) -> Result<Self> {
        let face = FontRef::new(data).map_err(|e| Error::internal("certificate font", e))?;
        Ok(Self {
            data,
            face,
            // `.notdef` is gid 0 in the subset too.
            remapper: GlyphRemapper::new(),
            used: Vec::new(),
        })
    }

    fn gid(&self, ch: char) -> u16 {
        self.face
            .charmap()
            .map(ch)
            .and_then(|g| u16::try_from(g.to_u32()).ok())
            .unwrap_or(0)
    }

    /// Advance of one glyph in font units.
    fn advance(&self, gid: u16) -> f32 {
        self.face
            .glyph_metrics(Size::unscaled(), LocationRef::default())
            .advance_width(GlyphId::from(gid))
            .unwrap_or(0.0)
    }

    fn units_per_em(&self) -> f32 {
        f32::from(
            self.face
                .metrics(Size::unscaled(), LocationRef::default())
                .units_per_em,
        )
    }

    /// Width of `text` at `size` points (advances only, no kerning).
    fn width(&self, text: &str, size: f32) -> f32 {
        text.chars()
            .map(|ch| self.advance(self.gid(ch)))
            .sum::<f32>()
            * size
            / self.units_per_em()
    }

    /// The text as Identity-H bytes (two bytes per glyph), registering the
    /// glyphs for the subset.
    fn encode(&mut self, text: &str) -> Vec<u8> {
        let mut out = Vec::with_capacity(text.len() * 2);
        for ch in text.chars() {
            let new = self.remapper.remap(self.gid(ch));
            if !self.used.iter().any(|(g, _)| *g == new) {
                self.used.push((new, ch));
            }
            out.extend_from_slice(&new.to_be_bytes());
        }
        out
    }

    /// Advance widths per new gid in 1/1000 em, in gid order.
    fn widths(&self) -> Vec<f32> {
        let upem = self.units_per_em();
        self.remapper
            .remapped_gids()
            .map(|old| self.advance(old) * 1000.0 / upem)
            .collect()
    }
}

struct Line {
    bold: bool,
    size: f32,
    x: f32,
    y: f32,
    max_width: f32,
    text: String,
}

fn line(text: impl Into<String>, size: f32, x: f32, y: f32, max_width: f32, bold: bool) -> Line {
    Line {
        text: text.into(),
        size,
        x,
        y,
        max_width,
        bold,
    }
}

fn training_text(input: &CertificatePdf, language: Language) -> String {
    let name = if input.certificate_name.trim().is_empty() {
        &input.course_name
    } else {
        &input.certificate_name
    };
    let mut period = String::new();
    for (date, ru, kk) in [
        (&input.course_start, "с", "күнінен бастап"),
        (&input.course_end, "по", "күніне дейін"),
    ] {
        if let Some(date) = date
            .as_ref()
            .and_then(|d| d.parse::<jiff::civil::Date>().ok())
        {
            let date = format!("{:02}.{:02}.{:04}", date.day(), date.month(), date.year());
            if language == Language::Kk {
                period.push_str(&date);
                period.push(' ');
                period.push_str(kk);
            } else {
                period.push_str(ru);
                period.push(' ');
                period.push_str(&date);
            }
            period.push(' ');
        }
    }
    let hours = input
        .training_hours
        .map(|h| {
            if language == Language::Kk {
                format!(" көлемі {h} сағат болатын")
            } else {
                format!(" в объеме {h} часов")
            }
        })
        .unwrap_or_default();
    if language == Language::Kk {
        format!("{period}«{name}» тақырыбы бойынша{hours} курсты сәтті аяқтағанын растайды")
    } else {
        format!("{period}успешно прошёл (-ла) курс по теме «{name}»{hours}")
    }
}

fn wrap(text: &str, font: &Font, size: f32, width: f32) -> Vec<String> {
    let mut lines = vec![String::new()];
    for word in text.split_whitespace() {
        if let Some(last) = lines.last_mut() {
            let candidate = if last.is_empty() {
                word.to_owned()
            } else {
                format!("{last} {word}")
            };
            if !last.is_empty() && font.width(&candidate, size) > width {
                lines.push(word.to_owned());
            } else {
                *last = candidate;
            }
        }
    }
    lines
}

/// The reference is bilingual regardless of the verification page's language.
fn lines(input: &CertificatePdf, regular: &Font) -> Vec<Line> {
    let mut lines = vec![
        line("СЕРТИФИКАТ", 44.0, PAGE_W / 2.0, 382.0, 610.0, true),
        line("Осымен", 17.0, PAGE_W / 2.0, 343.0, 590.0, false),
        line(
            "Настоящим подтверждается, что",
            17.0,
            PAGE_W / 2.0,
            321.0,
            590.0,
            false,
        ),
        line(&input.holder_name, 26.0, PAGE_W / 2.0, 287.0, 590.0, true),
    ];
    if let Some(label) = type_label(input.language, &input.certificate_type) {
        lines.push(line(label, 9.0, PAGE_W / 2.0, 362.0, 590.0, false));
    }
    for (language, x) in [(Language::Kk, 244.0), (Language::Ru, 588.0)] {
        let text = training_text(input, language);
        let mut size = 13.0;
        let mut wrapped = wrap(&text, regular, size, 284.0);
        loop {
            let height = wrapped
                .iter()
                .fold(0.0, |height, _| size.mul_add(1.4, height));
            if height <= 80.0 {
                break;
            }
            size *= 0.9;
            wrapped = wrap(&text, regular, size, 284.0);
        }
        let mut y = 254.0;
        for text in wrapped {
            lines.push(line(text, size, x, y, 284.0, false));
            y = size.mul_add(-1.4, y);
        }
    }
    lines.push(line("Лектор", 13.0, 169.0, 99.0, 80.0, true));
    if let Some(teacher) = &input.teacher_name {
        lines.push(line(teacher, 13.0, 635.0, 99.0, 240.0, true));
    }
    lines.push(line(
        format!("№ {}-ЦТМ", input.verify_code),
        9.0,
        285.0,
        64.0,
        280.0,
        false,
    ));
    lines.push(line(
        format!(
            "{}: {}",
            strings(input.language).issued_on,
            issued_date(input.language, input.issued_at_unix)
        ),
        9.0,
        651.0,
        64.0,
        220.0,
        false,
    ));
    let year = issued_date(Language::En, input.issued_at_unix);
    lines.push(line(
        year.chars().take(4).collect::<String>(),
        9.0,
        PAGE_W / 2.0,
        44.0,
        80.0,
        false,
    ));
    lines
}

fn background(content: &mut Content) {
    content
        .save_state()
        .transform([PAGE_W, 0.0, 0.0, PAGE_H, 0.0, 0.0])
        .x_object(Name(b"Artwork"))
        .restore_state();
    // Keep the supplied logos and ornament; cover every sample-specific field.
    content.set_fill_rgb(1.0, 1.0, 1.0);
    for (x, y, w, h) in [
        (95.0, 175.0, 640.0, 255.0),
        (140.0, 58.0, 575.0, 65.0),
        (370.0, 37.0, 100.0, 20.0),
    ] {
        content.rect(x, y, w, h).fill_nonzero();
    }
    content
        .set_stroke_rgb(0.25, 0.25, 0.25)
        .set_line_width(0.6)
        .move_to(124.0, 275.0)
        .line_to(718.0, 275.0)
        .stroke();
}

/// Render the page. Fails only on a corrupt embedded font (a build defect).
pub fn render(input: &CertificatePdf) -> Result<Vec<u8>> {
    let s = strings(input.language);
    let mut regular = Font::load(REGULAR)?;
    let mut bold = Font::load(BOLD)?;
    let url_line = format!("{}: {}", s.verify_at, input.verify_url);
    let mut content = Content::new();
    background(&mut content);
    for (index, line) in lines(input, &regular).iter().enumerate() {
        let font = if line.bold { &mut bold } else { &mut regular };
        let natural = font.width(&line.text, line.size);
        let size = if natural > line.max_width {
            line.size * line.max_width / natural
        } else {
            line.size
        };
        let width = font.width(&line.text, size);
        let bytes = font.encode(&line.text);
        content.begin_text();
        if index == 0 {
            content.set_fill_rgb(0.94, 0.49, 0.18);
        } else {
            content.set_fill_rgb(0.07, 0.07, 0.07);
        }
        content
            .set_font(Name(if line.bold { b"FB" } else { b"FR" }), size)
            .next_line(line.x - width / 2.0, line.y)
            .show(Str(&bytes))
            .end_text();
    }
    let url_size = 7.0_f32.min(7.0 * 520.0 / regular.width(&url_line, 7.0));
    let url_width = regular.width(&url_line, url_size);
    let bytes = regular.encode(&url_line);
    content
        .begin_text()
        .set_fill_rgb(0.4, 0.4, 0.4)
        .set_font(Name(b"FR"), url_size)
        .next_line(FOOTER_X, 32.0)
        .show(Str(&bytes))
        .end_text();
    let content = content.finish();

    // Objects.
    let catalog_id = Ref::new(1);
    let tree_id = Ref::new(2);
    let page_id = Ref::new(3);
    let content_id = Ref::new(4);
    let link_id = Ref::new(5);
    let info_id = Ref::new(6);
    let artwork_id = Ref::new(7);
    let mut next = 8;
    let mut pdf = Pdf::new();
    pdf.catalog(catalog_id).pages(tree_id);
    pdf.pages(tree_id).kids([page_id]).count(1);
    let regular_id = embed_font(&mut pdf, &mut next, &regular, "NotoSans-Regular", false)?;
    let bold_id = embed_font(&mut pdf, &mut next, &bold, "NotoSans-Bold", true)?;
    {
        let mut page = pdf.page(page_id);
        page.media_box(Rect::new(0.0, 0.0, PAGE_W, PAGE_H));
        page.parent(tree_id);
        page.contents(content_id);
        page.annotations([link_id]);
        let mut resources = page.resources();
        resources.x_objects().pair(Name(b"Artwork"), artwork_id);
        resources
            .fonts()
            .pair(Name(b"FR"), regular_id)
            .pair(Name(b"FB"), bold_id);
    }
    pdf.stream(content_id, &content);
    {
        let mut image = pdf.image_xobject(artwork_id, ARTWORK);
        image.filter(Filter::DctDecode);
        image.width(1600).height(1131).bits_per_component(8);
        image.color_space().device_rgb();
    }
    {
        let mut link = pdf.annotation(link_id);
        link.subtype(AnnotationType::Link);
        link.rect(Rect::new(FOOTER_X, 29.0, FOOTER_X + url_width, 39.0));
        link.border(0.0, 0.0, 0.0, None);
        link.action()
            .action_type(ActionType::Uri)
            .uri(Str(input.verify_url.as_bytes()));
    }
    pdf.document_info(info_id)
        .title(TextStr(&format!(
            "{} - {}",
            input.certificate_name, input.holder_name
        )))
        .creator(TextStr("Ashyq Bilim"));
    Ok(pdf.finish())
}

/// Type0 → CIDFontType2 (Identity-H) over a subset of the face; returns the
/// Type0 font's reference.
fn embed_font(pdf: &mut Pdf, next: &mut i32, font: &Font, name: &str, bold: bool) -> Result<Ref> {
    let mut alloc = || {
        let id = Ref::new(*next);
        *next += 1;
        id
    };
    let type0_id = alloc();
    let cid_id = alloc();
    let descriptor_id = alloc();
    let data_id = alloc();
    let cmap_id = alloc();

    let subset = subsetter::subset(font.data, 0, &font.remapper)
        .map_err(|e| Error::internal("certificate font subset", e))?;
    let base = format!("ABCDEF+{name}");
    let base_name = Name(base.as_bytes());
    let system = SystemInfo {
        registry: Str(b"Adobe"),
        ordering: Str(b"Identity"),
        supplement: 0,
    };

    pdf.type0_font(type0_id)
        .base_font(base_name)
        .encoding_predefined(Name(b"Identity-H"))
        .descendant_font(cid_id)
        .to_unicode(cmap_id);
    {
        let mut cid = pdf.cid_font(cid_id);
        cid.subtype(CidFontType::Type2)
            .base_font(base_name)
            .system_info(system)
            .font_descriptor(descriptor_id)
            .default_width(0.0)
            .cid_to_gid_map_predefined(Name(b"Identity"));
        cid.widths().consecutive(0, font.widths());
    }
    let metrics = font.face.metrics(Size::unscaled(), LocationRef::default());
    let scale = 1000.0 / f32::from(metrics.units_per_em);
    let bbox = metrics.bounds.unwrap_or_default();
    let mut flags = FontFlags::NON_SYMBOLIC;
    if bold {
        flags |= FontFlags::FORCE_BOLD;
    }
    pdf.font_descriptor(descriptor_id)
        .name(base_name)
        .flags(flags)
        .bbox(Rect::new(
            bbox.x_min * scale,
            bbox.y_min * scale,
            bbox.x_max * scale,
            bbox.y_max * scale,
        ))
        .italic_angle(0.0)
        .ascent(metrics.ascent * scale)
        .descent(metrics.descent * scale)
        .cap_height(metrics.cap_height.unwrap_or(700.0) * scale)
        .stem_v(if bold { 120.0 } else { 80.0 })
        .font_file2(data_id);
    pdf.stream(data_id, &subset).finish();
    let mut cmap = UnicodeCmap::new(Name(b"Custom"), system);
    for (gid, ch) in &font.used {
        cmap.pair(*gid, *ch);
    }
    pdf.cmap(cmap_id, &cmap.finish());
    Ok(type0_id)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    fn sample(language: Language) -> CertificatePdf {
        CertificatePdf {
            language,
            holder_name: "Әсел Қайратқызы".into(),
            course_name: "Основы Python".into(),
            certificate_name: "Python: базовый курс".into(),
            certificate_type: "completion".into(),
            issued_at_unix: 1_789_000_000,
            verify_code: "ABCD-EFGH-JKLM-NPQR".into(),
            verify_url: "http://localhost:3000/certificates/ABCD-EFGH-JKLM-NPQR/verify".into(),
            teacher_name: Some("Мейірбек".into()),
            course_start: None,
            course_end: None,
            training_hours: None,
        }
    }

    #[test]
    fn renders_a_pdf_with_embedded_subsets() {
        for language in [Language::Ru, Language::Kk, Language::En] {
            let bytes = render(&sample(language)).unwrap();
            assert!(bytes.starts_with(b"%PDF-"));
            assert!(
                bytes.len() > ARTWORK.len() && bytes.len() < ARTWORK.len() + 200_000,
                "{}",
                bytes.len()
            );
            let text = String::from_utf8_lossy(&bytes);
            assert!(text.contains("/FontFile2"));
            assert!(text.contains("/Identity-H"));
            assert!(text.contains("ABCD-EFGH-JKLM-NPQR/verify"));
        }
    }

    #[test]
    fn dates_follow_the_language() {
        assert_eq!(issued_date(Language::Ru, 1_789_000_000), "10.09.2026");
        assert_eq!(issued_date(Language::En, 1_789_000_000), "2026-09-10");
    }

    #[test]
    fn long_lines_shrink_instead_of_overflowing() {
        let mut input = sample(Language::Ru);
        input.course_name = "Очень ".repeat(40);
        let bytes = render(&input).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn bilingual_training_details_are_omitted_when_blank_and_printed_when_set() {
        let mut input = sample(Language::En);
        for language in [Language::Kk, Language::Ru] {
            let text = training_text(&input, language);
            assert!(text.contains(&input.certificate_name));
            assert!(!text.contains("сағат") && !text.contains("часов"));
            assert!(!text.contains("2026"));
        }
        input.course_start = Some("2026-09-01".into());
        input.course_end = Some("2026-09-30".into());
        input.training_hours = Some(72);
        assert!(training_text(&input, Language::Ru).contains("с 01.09.2026 по 30.09.2026"));
        assert!(training_text(&input, Language::Ru).contains("72 часов"));
        assert!(training_text(&input, Language::Kk).contains("72 сағат"));
    }

    #[test]
    fn wrapped_course_text_stays_above_the_footer() {
        let mut input = sample(Language::Ru);
        input.certificate_name = "Дополненная реальность ".repeat(22);
        let regular = Font::load(REGULAR).unwrap();
        for line in lines(&input, &regular)
            .iter()
            .filter(|l| (l.x - 244.0).abs() < f32::EPSILON || (l.x - 588.0).abs() < f32::EPSILON)
        {
            assert!(line.y >= 175.0, "{}", line.y);
        }
    }

    #[test]
    fn writes_reference_sample_for_visual_review() {
        let Some(path) = std::env::var_os("CERTIFICATE_SAMPLE_PATH") else {
            return;
        };
        let mut input = sample(Language::Ru);
        input.certificate_name = "Технологии дополненной и виртуальной реальности".into();
        input.course_start = Some("2026-09-01".into());
        input.course_end = Some("2026-09-30".into());
        input.training_hours = Some(72);
        std::fs::write(path, render(&input).unwrap()).unwrap();
    }
}
