//! The certificate as an A4-landscape PDF (`GET /certificates/{code}/pdf`).
//!
//! Text only, laid out by hand on one page with two embedded Noto Sans
//! subsets (`assets/fonts`, SIL OFL) so Cyrillic — including the Kazakh
//! letters — renders everywhere. No headless browser, no layout engine.

use ab_core::language::Language;
use ab_core::{Error, Result};
use pdf_writer::types::{
    ActionType, AnnotationType, CidFontType, FontFlags, SystemInfo, UnicodeCmap,
};
use pdf_writer::{Content, Finish, Name, Pdf, Rect, Ref, Str, TextStr};
use skrifa::instance::{LocationRef, Size};
use skrifa::{FontRef, GlyphId, MetadataProvider};
use subsetter::GlyphRemapper;

const REGULAR: &[u8] = include_bytes!("../../assets/fonts/NotoSans-Regular.ttf");
const BOLD: &[u8] = include_bytes!("../../assets/fonts/NotoSans-Bold.ttf");

/// A4 landscape, in points.
const PAGE_W: f32 = 841.89;
const PAGE_H: f32 = 595.28;
const MARGIN: f32 = 36.0;
/// Widest a centred line may be before its font shrinks to fit.
const MAX_LINE_W: f32 = PAGE_W - 2.0 * (MARGIN + 40.0);
/// Where the verification code and link start.
const FOOTER_X: f32 = MARGIN + 24.0;

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
}

struct Strings {
    title: &'static str,
    certifies: &'static str,
    completed: &'static str,
    issued_on: &'static str,
    teacher: &'static str,
    verify_code: &'static str,
    verify_at: &'static str,
}

const fn strings(language: Language) -> Strings {
    match language {
        Language::Ru => Strings {
            title: "СЕРТИФИКАТ",
            certifies: "подтверждает, что",
            completed: "успешно завершил(а) курс",
            issued_on: "Дата выдачи",
            teacher: "Преподаватель",
            verify_code: "Код проверки",
            verify_at: "Проверить подлинность",
        },
        Language::Kk => Strings {
            title: "СЕРТИФИКАТ",
            certifies: "растайды:",
            completed: "курсын сәтті аяқтады",
            issued_on: "Берілген күні",
            teacher: "Оқытушы",
            verify_code: "Тексеру коды",
            verify_at: "Түпнұсқалығын тексеру",
        },
        Language::En => Strings {
            title: "CERTIFICATE",
            certifies: "This certifies that",
            completed: "has successfully completed the course",
            issued_on: "Issued on",
            teacher: "Instructor",
            verify_code: "Verification code",
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
    y: f32,
    text: String,
    gray: f32,
}

/// The centred lines of the page, top to bottom.
fn lines(input: &CertificatePdf) -> Vec<Line> {
    let s = strings(input.language);
    let mut lines = vec![Line {
        bold: true,
        size: 34.0,
        y: 470.0,
        text: s.title.to_owned(),
        gray: 0.12,
    }];
    if let Some(label) = type_label(input.language, &input.certificate_type) {
        lines.push(Line {
            bold: false,
            size: 14.0,
            y: 442.0,
            text: label.to_owned(),
            gray: 0.4,
        });
    }
    lines.extend([
        Line {
            bold: false,
            size: 13.0,
            y: 392.0,
            text: s.certifies.to_owned(),
            gray: 0.35,
        },
        Line {
            bold: true,
            size: 30.0,
            y: 352.0,
            text: input.holder_name.clone(),
            gray: 0.12,
        },
        Line {
            bold: false,
            size: 13.0,
            y: 312.0,
            text: s.completed.to_owned(),
            gray: 0.35,
        },
        Line {
            bold: true,
            size: 22.0,
            y: 278.0,
            text: input.course_name.clone(),
            gray: 0.12,
        },
    ]);
    if !input.certificate_name.trim().is_empty() && input.certificate_name != input.course_name {
        lines.push(Line {
            bold: false,
            size: 14.0,
            y: 248.0,
            text: input.certificate_name.clone(),
            gray: 0.3,
        });
    }
    lines.push(Line {
        bold: false,
        size: 12.0,
        y: 188.0,
        text: format!(
            "{}: {}",
            s.issued_on,
            issued_date(input.language, input.issued_at_unix)
        ),
        gray: 0.3,
    });
    if let Some(teacher) = input
        .teacher_name
        .as_deref()
        .filter(|t| !t.trim().is_empty())
    {
        lines.push(Line {
            bold: false,
            size: 12.0,
            y: 168.0,
            text: format!("{}: {teacher}", s.teacher),
            gray: 0.3,
        });
    }
    lines
}

/// A frame inset by `inset` points on every side.
fn frame(content: &mut Content, inset: f32, width: f32) {
    content
        .set_line_width(width)
        .rect(
            inset,
            inset,
            (-2.0f32).mul_add(inset, PAGE_W),
            (-2.0f32).mul_add(inset, PAGE_H),
        )
        .stroke();
}

/// Render the page. Fails only on a corrupt embedded font (a build defect).
pub fn render(input: &CertificatePdf) -> Result<Vec<u8>> {
    let s = strings(input.language);
    let mut regular = Font::load(REGULAR)?;
    let mut bold = Font::load(BOLD)?;
    let code_line = format!("{}: {}", s.verify_code, input.verify_code);
    let url_line = format!("{}: {}", s.verify_at, input.verify_url);

    // Content stream: a double frame, then every line centred (shrunk to fit).
    let mut content = Content::new();
    content.set_stroke_rgb(0.72, 0.6, 0.35);
    frame(&mut content, MARGIN, 2.0);
    frame(&mut content, MARGIN + 8.0, 0.75);
    for line in &lines(input) {
        let font = if line.bold { &mut bold } else { &mut regular };
        let natural = font.width(&line.text, line.size);
        let size = if natural > MAX_LINE_W {
            line.size * MAX_LINE_W / natural
        } else {
            line.size
        };
        let width = font.width(&line.text, size);
        let bytes = font.encode(&line.text);
        content
            .begin_text()
            .set_fill_rgb(line.gray, line.gray, line.gray)
            .set_font(Name(if line.bold { b"FB" } else { b"FR" }), size)
            .next_line((PAGE_W - width) / 2.0, line.y)
            .show(Str(&bytes))
            .end_text();
    }
    let url_width = regular.width(&url_line, 9.0);
    for (text, size, y) in [(&code_line, 10.0, 96.0), (&url_line, 9.0, 82.0)] {
        let bytes = regular.encode(text);
        content
            .begin_text()
            .set_fill_rgb(0.4, 0.4, 0.4)
            .set_font(Name(b"FR"), size)
            .next_line(FOOTER_X, y)
            .show(Str(&bytes))
            .end_text();
    }
    let content = content.finish();

    // Objects.
    let catalog_id = Ref::new(1);
    let tree_id = Ref::new(2);
    let page_id = Ref::new(3);
    let content_id = Ref::new(4);
    let link_id = Ref::new(5);
    let info_id = Ref::new(6);
    let mut next = 7;
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
        page.resources()
            .fonts()
            .pair(Name(b"FR"), regular_id)
            .pair(Name(b"FB"), bold_id);
    }
    pdf.stream(content_id, &content);
    {
        let mut link = pdf.annotation(link_id);
        link.subtype(AnnotationType::Link);
        link.rect(Rect::new(FOOTER_X, 78.0, FOOTER_X + url_width, 92.0));
        link.border(0.0, 0.0, 0.0, None);
        link.action()
            .action_type(ActionType::Uri)
            .uri(Str(input.verify_url.as_bytes()));
    }
    pdf.document_info(info_id)
        .title(TextStr(&format!(
            "{} — {}",
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
        }
    }

    #[test]
    fn renders_a_pdf_with_embedded_subsets() {
        for language in [Language::Ru, Language::Kk, Language::En] {
            let bytes = render(&sample(language)).unwrap();
            assert!(bytes.starts_with(b"%PDF-"));
            assert!(
                bytes.len() > 4_000 && bytes.len() < 200_000,
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
}
