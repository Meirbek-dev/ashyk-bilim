//! Plain text of a submitted file for AI pre-grading (docs/AI-FIRST.md 4.1).
//!
//! Text-like files as they are, DOCX from its `word/document.xml`, PDF through `pdf-extract`. Anything
//! else has no text. Extraction is bounded: the archive entry and the output are capped, and a broken
//! file only yields `None`.

use std::io::Read;

/// Bytes read out of a DOCX's document part.
const DOCX_XML_CAP: u64 = 8 * 1024 * 1024;

fn media(content_type: &str) -> String {
    content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
}

/// Whether the content type is read as text as-is (`text/*`, JSON, XML, YAML).
#[must_use]
pub fn is_plain_text(content_type: &str) -> bool {
    let media = media(content_type);
    media.starts_with("text/")
        || matches!(
            media.as_str(),
            "application/json" | "application/xml" | "application/x-yaml" | "application/yaml"
        )
}

fn is_docx(content_type: &str, name: &str) -> bool {
    media(content_type) == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        || name.to_ascii_lowercase().ends_with(".docx")
}

fn is_pdf(content_type: &str, name: &str) -> bool {
    media(content_type) == "application/pdf" || name.to_ascii_lowercase().ends_with(".pdf")
}

/// Whether [`extract`] can read this kind of file at all.
#[must_use]
pub fn extractable(content_type: &str, name: &str) -> bool {
    is_plain_text(content_type) || is_docx(content_type, name) || is_pdf(content_type, name)
}

/// The text of a file, at most `max_chars` characters; `None` when the kind is unsupported or broken.
#[must_use]
pub fn extract(bytes: &[u8], content_type: &str, name: &str, max_chars: usize) -> Option<String> {
    let text = if is_plain_text(content_type) {
        Some(String::from_utf8_lossy(bytes).into_owned())
    } else if is_docx(content_type, name) {
        docx_text(bytes)
    } else if is_pdf(content_type, name) {
        pdf_text(bytes)
    } else {
        None
    }?;
    let text = normalize(&text);
    (!text.trim().is_empty()).then(|| text.chars().take(max_chars).collect())
}

/// Collapses runs of blank lines and trailing spaces left by extractors.
fn normalize(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut blank = 0;
    for line in text.lines().map(str::trim_end) {
        if line.trim().is_empty() {
            blank += 1;
            if blank > 1 {
                continue;
            }
        } else {
            blank = 0;
        }
        out.push_str(line);
        out.push('\n');
    }
    out.trim().to_owned()
}

fn docx_text(bytes: &[u8]) -> Option<String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).ok()?;
    let entry = archive.by_name("word/document.xml").ok()?;
    let mut xml = String::new();
    entry.take(DOCX_XML_CAP).read_to_string(&mut xml).ok()?;
    let mut reader = quick_xml::Reader::from_str(&xml);
    let mut out = String::new();
    let mut in_text = false;
    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Start(e)) if e.name().as_ref() == b"w:t" => in_text = true,
            Ok(quick_xml::events::Event::End(e)) => match e.name().as_ref() {
                b"w:t" => in_text = false,
                b"w:p" => out.push('\n'),
                _ => {}
            },
            Ok(quick_xml::events::Event::Empty(e)) => match e.name().as_ref() {
                b"w:tab" => out.push('\t'),
                b"w:br" | b"w:cr" => out.push('\n'),
                _ => {}
            },
            Ok(quick_xml::events::Event::Text(t)) if in_text => {
                if let Ok(text) = t.decode() {
                    out.push_str(&text);
                }
            }
            Ok(quick_xml::events::Event::GeneralRef(r)) if in_text => {
                let name: &[u8] = &r;
                let resolved = match name {
                    b"amp" => "&",
                    b"lt" => "<",
                    b"gt" => ">",
                    b"quot" => "\"",
                    b"apos" => "'",
                    _ => "",
                };
                out.push_str(resolved);
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(_) => return None,
            _ => {}
        }
    }
    Some(out)
}

fn pdf_text(bytes: &[u8]) -> Option<String> {
    // pdf-extract panics on some malformed files; a panic must not take the worker down.
    std::panic::catch_unwind(|| pdf_extract::extract_text_from_mem(bytes).ok())
        .ok()
        .flatten()
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::float_cmp,
    clippy::panic
)]
mod tests {
    use super::*;
    use std::io::Write;

    fn docx(document_xml: &str) -> Vec<u8> {
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buf);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            zip.start_file("word/document.xml", options).unwrap();
            zip.write_all(document_xml.as_bytes()).unwrap();
            zip.finish().unwrap();
        }
        buf.into_inner()
    }

    #[test]
    fn docx_paragraphs_become_lines() {
        let bytes = docx(
            r#"<w:document><w:body><w:p><w:r><w:t>Рекурсия &amp; стек</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Вторая </w:t></w:r><w:r><w:t>строка</w:t></w:r></w:p></w:body></w:document>"#,
        );
        let text = extract(&bytes, "application/octet-stream", "essay.docx", 1000).unwrap();
        assert_eq!(text, "Рекурсия & стек\nВторая строка");
    }

    #[test]
    fn plain_text_is_capped_and_broken_files_yield_nothing() {
        assert_eq!(
            extract("абвгд".as_bytes(), "text/plain", "a.txt", 3).as_deref(),
            Some("абв")
        );
        assert_eq!(
            extract(b"not a zip", "application/octet-stream", "x.docx", 10),
            None
        );
        assert_eq!(
            extract(b"%PDF-broken", "application/pdf", "x.pdf", 10),
            None
        );
        assert_eq!(extract(b"\x89PNG", "image/png", "x.png", 10), None);
        assert!(extractable("application/pdf", "x"));
        assert!(!extractable("image/png", "x.png"));
    }
}
