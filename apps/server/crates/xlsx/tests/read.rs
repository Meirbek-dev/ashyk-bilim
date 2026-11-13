//! Reader tests (spec 14): values, normalisation, every issue code with its
//! cell, pictures, limits and safety.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::too_many_lines
)]

mod common;

use ab_xlsx::{DotKind, DotOption, DotQuestion, ParseOptions, Severity, parse};
use common::*;
use rust_xlsxwriter::{Format, Image, ObjectMovement, Shape};

fn opt(text: &str) -> DotOption {
    DotOption {
        text: text.to_owned(),
        image: None,
    }
}

fn opts(texts: &[&str]) -> Vec<DotOption> {
    texts.iter().map(|t| opt(t)).collect()
}

fn options_of(q: &DotQuestion) -> Vec<String> {
    match &q.kind {
        DotKind::Single { options, .. } | DotKind::Multiple { options, .. } => {
            options.iter().map(|o| o.text.clone()).collect()
        }
        _ => panic!("choice expected"),
    }
}

#[test]
fn cell_values_and_normalisation() {
    let shared = r#"<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Сколько</t></si><si><r><rPr><b/></rPr><t>Rich </t></r><r><t>text</t></r><rPh><t>PHONETIC</t></rPh></si><si><t xml:space="preserve">byte </t></si></sst>"#;
    let rows = [
        raw_header(),
        r(
            2,
            &[
                r#"<c r="A2" t="s"><v>0</v></c>"#.to_owned(),
                n("B2", "1"),
                n("C2", "1"),
                r#"<c r="E2" t="s"><v>1</v></c>"#.to_owned(),
                s("F2", "inline"),
                n("G2", "310"),
                s("H2", "310.0"),
                n("I2", "0.1"),
                n("J2", "1E-7"),
                r#"<c r="K2" t="s"><v>2</v></c>"#.to_owned(),
                s("L2", "\u{a0}nbsp\u{a0}"),
                s("M2", "a_x000D_\nb\r\nc"),
            ],
        ),
        r(
            3,
            &[
                s("A3", "  {\\n System.out.println(\\\"x\\\");\\n}  "),
                n("B3", "3"),
                s("C3", "\\nanswer "),
            ],
        ),
    ]
    .concat();
    let bytes = raw(&[("Лист1", &rows)], 0, &[("xl/sharedStrings.xml", shared)]);
    let parsed = read(&bytes);
    let test = parsed.test.as_ref().unwrap();
    assert_eq!(parsed.sheet, "Лист1");
    assert!(!parsed.has_errors(), "{:#?}", parsed.issues);
    let q = &test.questions[0];
    assert_eq!(q.text, "Сколько");
    assert_eq!(
        options_of(q),
        [
            "Rich text",
            "inline",
            "310",
            "310.0",
            "0.1",
            "0.0000001",
            "byte",
            "nbsp",
            "a\nb\nc"
        ]
    );
    let q = &test.questions[1];
    assert_eq!(q.text, "{\n System.out.println(\\\"x\\\");\n}");
    assert_eq!(
        q.kind,
        DotKind::Short {
            answer: "answer".to_owned()
        }
    );
    assert_eq!(cells(issue(&parsed, "trimmed")), ["K2", "L2", "C3"]);
    assert_eq!(issue(&parsed, "trimmed").params["count"], 3);
    assert_eq!(cells(issue(&parsed, "unescaped_newlines")), ["A3", "C3"]);
    assert!(has(&parsed, "suspicious_escape", "A3"));

    let kept = parse(
        &bytes,
        ParseOptions {
            unescape_newlines: false,
            ..ParseOptions::default()
        },
    );
    let q = &kept.test.as_ref().unwrap().questions[1];
    assert!(q.text.contains("\\n System"));
    assert!(kept.issues.iter().all(|i| i.code != "unescaped_newlines"));
}

#[test]
fn errors_booleans_formulas_and_formats() {
    let styles = r#"<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="0&quot; [попыток]&quot;"/></numFmts><fonts count="1"><font/></fonts><cellXfs count="5"><xf numFmtId="0" fontId="0"/><xf numFmtId="14" fontId="0"/><xf numFmtId="164" fontId="0"/><xf numFmtId="9" fontId="0"/><xf numFmtId="165" fontId="0"/></cellXfs></styleSheet>"#;
    let rows = [
        r(
            1,
            &[
                s("A1", "Тест"),
                r#"<c r="C1"><f>1+2</f><v>3</v></c>"#.to_owned(),
                r#"<c r="D1" s="4"><v>45</v></c>"#.to_owned(),
            ],
        ),
        r(
            2,
            &[
                s("A2", "Q"),
                n("B2", "1"),
                n("C2", "1"),
                r#"<c r="E2" t="e"><v>#N/A</v></c>"#.to_owned(),
                r#"<c r="F2" t="b"><v>1</v></c>"#.to_owned(),
                r#"<c r="G2"><f>E2*2</f><v>4</v></c>"#.to_owned(),
                r#"<c r="H2" s="1"><v>45000</v></c>"#.to_owned(),
                r#"<c r="I2" s="2"><v>45001</v></c>"#.to_owned(),
                r#"<c r="J2" s="3"><v>0.5</v></c>"#.to_owned(),
                r#"<c r="K2" vm="1" t="e"><v>#VALUE!</v></c>"#.to_owned(),
            ],
        ),
    ]
    .concat();
    let parsed = read(&raw(&[("S", &rows)], 0, &[("xl/styles.xml", styles)]));
    let test = parsed.test.as_ref().unwrap();
    assert_eq!((test.attempts, test.time_minutes), (3, 45));
    assert!(test.questions.is_empty());
    assert_eq!(
        located(&parsed),
        [
            (Severity::Error, "cell_error", Some("E2".to_owned())),
            (Severity::Error, "formula", Some("G2".to_owned())),
            (Severity::Error, "cell_error", Some("K2".to_owned())),
            (Severity::Warning, "boolean_cell", Some("F2".to_owned())),
            (Severity::Warning, "number_format", Some("H2".to_owned())),
            (Severity::Warning, "number_format", Some("I2".to_owned())),
            (Severity::Warning, "number_format", Some("J2".to_owned())),
        ]
    );
    assert_eq!(parsed.issues[0].params["value"], "#N/A");
    assert_eq!(parsed.issues[3].params["value"], "TRUE");
    assert_eq!(parsed.issues[6].params["value"], "0.5");
}

#[test]
fn every_type_with_levels() {
    let bytes = book(|sheet| {
        header(sheet, 2, 30, 4, true);
        row(sheet, 2, &["Один", "#1", "2", "#1", "a", "b", "c"]);
        row(sheet, 3, &["Несколько", "#2", "3;1;", "#2", "a", "b", "c"]);
        row(sheet, 4, &["Коротко", "#3", " Ответ ", "#3"]);
        row(
            sheet,
            5,
            &[
                "Сопоставь",
                "#4",
                "1-2;2-0;3-2",
                "3;3",
                "#101",
                "l1",
                "l2",
                "l3",
                "r1",
                "r2",
                "r3",
            ],
        );
        row(sheet, 6, &["Эссе", "#5", "", "#202"]);
        row(
            sheet,
            7,
            &["Сопоставь 2", "#4", "1-1", "1;2", "#102", "l", "r1", "r2"],
        );
    });
    let parsed = read(&bytes);
    assert!(!parsed.has_errors(), "{:#?}", parsed.issues);
    let test = parsed.test.unwrap();
    assert_eq!(
        (
            test.title.as_str(),
            test.attempts,
            test.time_minutes,
            test.limit,
            test.leveling
        ),
        ("Тест", 2, 30, 4, true)
    );
    let kinds: Vec<(u32, u32, DotKind)> = test
        .questions
        .into_iter()
        .map(|q| (q.row, q.level, q.kind))
        .collect();
    assert_eq!(
        kinds,
        [
            (
                2,
                1,
                DotKind::Single {
                    options: opts(&["a", "b", "c"]),
                    correct: 1
                }
            ),
            (
                3,
                2,
                DotKind::Multiple {
                    options: opts(&["a", "b", "c"]),
                    correct: vec![0, 2]
                }
            ),
            (
                4,
                3,
                DotKind::Short {
                    answer: "Ответ".to_owned()
                }
            ),
            (
                5,
                101,
                DotKind::Matching {
                    left: opts(&["l1", "l2", "l3"]),
                    right: opts(&["r1", "r2", "r3"]),
                    pairs: vec![Some(1), None, Some(1)],
                }
            ),
            (6, 202, DotKind::Essay),
            (
                7,
                102,
                DotKind::Matching {
                    left: opts(&["l"]),
                    right: opts(&["r1", "r2"]),
                    pairs: vec![Some(0)]
                }
            ),
        ]
    );
}

#[test]
fn leveling_off_ignores_levels() {
    let bytes = book(|sheet| {
        header(sheet, 0, 0, 0, false);
        row(sheet, 2, &["Q", "#1", "1", "#2", "a", "b"]);
        row(sheet, 3, &["Q2", "#1", "1", "#0", "a", "b"]);
        row(sheet, 4, &["Q3", "#1", "1", "#7", "a", "b"]);
    });
    let parsed = read(&bytes);
    let test = parsed.test.as_ref().unwrap();
    assert_eq!(
        test.questions.iter().map(|q| q.level).collect::<Vec<_>>(),
        [0, 0]
    );
    assert_eq!(
        located(&parsed),
        [(Severity::Error, "level_disabled", Some("D4".to_owned()))]
    );
    assert_eq!(parsed.issues[0].params["cell"], "E4");
}

#[test]
fn every_row_code_with_its_cell() {
    let long = "x".repeat(20_001);
    let wide: Vec<String> = (0..51).map(|i| format!("o{i}")).collect();
    let mut wide_row: Vec<&str> = vec!["Широко", "#1", "1", ""];
    wide_row.extend(wide.iter().map(String::as_str));
    let bytes = book(|sheet| {
        header(sheet, 0, 0, 0, true);
        let rows: [&[&str]; 22] = [
            &["", "#1", "1", "#1", "a", "b"],                  // 2 no_question
            &["Q", "#9", "1", "#1", "a", "b"],                 // 3 type_invalid
            &["Q", "#1", "1", "#5", "a", "b"],                 // 4 level_invalid
            &["Q", "#1", "1", "#1", "a", "", "c"],             // 5 empty_between
            &["Q", "#1", "1", "#1"],                           // 6 no_options
            &["Q", "#1", "1", "#1", "a"],                      // 7 too_few_options
            &["Q", "#1", "1", "#1", "a", "b", "a"],            // 8 options_not_distinct
            &["Q", "#1", "1,2", "#1", "a", "b"],               // 9 correct_format
            &["Q", "#1", "1;2", "#1", "a", "b"],               // 10 single_needs_one
            &["Q", "#2", "1;1", "#1", "a", "b"],               // 11 correct_repeated
            &["Q", "#2", "1;3", "#1", "a", "b"],               // 12 correct_out_of_range
            &["Q", "#3", "", "#1"],                            // 13 no_text_answer
            &["Q", "#4", "1-1", "x", "#1", "l", "r"],          // 14 matching_counts_format
            &["Q", "#4", "1-1", "1;2", "#1", "l", "r"],        // 15 matching_counts_mismatch
            &["Q", "#4", "1-1;x", "1;1", "#1", "l", "r"],      // 16 matching_pair_format
            &["Q", "#4", "1-1;1-1", "1;1", "#1", "l", "r"],    // 17 matching_pair_repeated
            &["Q", "#4", "1-2", "1;1", "#1", "l", "r"],        // 18 matching_pair_out_of_range
            &["Q", "#4", "1-1", "2;1", "#1", "l1", "l2", "r"], // 19 matching_pairs_incomplete
            &[long.as_str(), "#1", "1", "#1", "a", "b"],       // 20 text_too_long
            &["Q21", "#1", "1", "#1", "A", "a"],               // 21 distinct by case
            &["Q22", "#5", "", "#1"],                          // 22 fine
            &["Q23", "#2", "2;1", "#1", "a", "b"],             // 23 fine
        ];
        for (i, cells) in rows.iter().enumerate() {
            row(sheet, u32::try_from(i).unwrap() + 2, cells);
        }
        let mut wide_row = wide_row.clone();
        wide_row[3] = "#1";
        row(sheet, 24, &wide_row); // too_many_options
    });
    let parsed = read(&bytes);
    let expected = [
        ("no_question", "A2"),
        ("type_invalid", "B3"),
        ("level_invalid", "D4"),
        ("empty_between", "F5"),
        ("correct_out_of_range", "C6"),
        ("no_options", "E6"),
        ("too_few_options", "E7"),
        ("options_not_distinct", "G8"),
        ("correct_format", "C9"),
        ("single_needs_one", "C10"),
        ("correct_repeated", "C11"),
        ("correct_out_of_range", "C12"),
        ("no_text_answer", "C13"),
        ("matching_counts_format", "D14"),
        ("matching_counts_mismatch", "D15"),
        ("matching_pair_format", "C16"),
        ("matching_pair_repeated", "C17"),
        ("matching_pair_out_of_range", "C18"),
        ("matching_pairs_incomplete", "C19"),
        ("text_too_long", "A20"),
        ("too_many_options", "BC24"),
    ];
    let got: Vec<(&str, String)> = parsed
        .issues
        .iter()
        .map(|i| (i.code, i.cell.clone().unwrap_or_default()))
        .collect();
    let want: Vec<(&str, String)> = expected.iter().map(|&(c, at)| (c, at.to_owned())).collect();
    assert_eq!(got, want);
    assert_eq!(issue(&parsed, "level_invalid").params["cell"], "E4");
    assert_eq!(issue(&parsed, "options_not_distinct").params["a"], "E8");
    assert_eq!(issue(&parsed, "options_not_distinct").params["b"], "G8");
    let range = parsed
        .issues
        .iter()
        .find(|i| i.cell.as_deref() == Some("C12"))
        .unwrap();
    assert_eq!(
        (
            range.params["item"].as_u64(),
            range.params["total"].as_u64()
        ),
        (Some(3), Some(2))
    );
    let counts = issue(&parsed, "matching_counts_mismatch");
    assert_eq!(counts.params["total"], 2);
    assert_eq!(issue(&parsed, "matching_pair_format").params["pair"], "x");
    assert_eq!(
        issue(&parsed, "matching_pair_out_of_range").params["row"],
        18
    );
    assert_eq!(issue(&parsed, "text_too_long").params["max"], 20_000);
    assert_eq!(issue(&parsed, "too_many_options").params["max"], 50);
    let rows: Vec<u32> = parsed
        .test
        .unwrap()
        .questions
        .iter()
        .map(|q| q.row)
        .collect();
    assert_eq!(rows, [21, 22, 23]);
}

#[test]
fn header_codes() {
    let bytes = book(|sheet| {
        sheet.write_number(0, 1, 7).unwrap();
        sheet.write_string(0, 2, "много").unwrap();
        sheet.write_number(0, 3, 1.5).unwrap();
        sheet.write_number(0, 4, 5).unwrap();
        sheet.write_number(0, 5, 2).unwrap();
        row(sheet, 2, &["Q", "#5"]);
    });
    let parsed = read(&bytes);
    assert_eq!(
        located(&parsed),
        [
            (Severity::Error, "no_title", Some("A1".to_owned())),
            (
                Severity::Error,
                "not_non_negative_int",
                Some("C1".to_owned())
            ),
            (
                Severity::Error,
                "not_non_negative_int",
                Some("D1".to_owned())
            ),
            (Severity::Error, "limit_too_big", Some("E1".to_owned())),
            (Severity::Error, "leveling_cell", Some("F1".to_owned())),
            (Severity::Warning, "service_cell", Some("B1".to_owned())),
        ]
    );
    assert_eq!(issue(&parsed, "limit_too_big").params["total"], 1);

    let empty = read(&book(|sheet| header(sheet, 0, 0, 0, false)));
    assert_eq!(
        located(&empty),
        [(Severity::Error, "no_questions", Some("A2".to_owned()))]
    );
    let long = read(&book(|sheet| {
        sheet.write_string(0, 0, "т".repeat(201)).unwrap();
        row(sheet, 2, &["Q", "#5"]);
    }));
    assert_eq!(issue(&long, "text_too_long").params["max"], 200);
}

#[test]
fn bold_merged_hidden_duplicates() {
    let bold = Format::new().set_bold();
    let bytes = book(|sheet| {
        header(sheet, 0, 0, 0, false);
        row(sheet, 2, &["Вопрос", "#1", "1", "", "a", "b"]);
        sheet.write_string_with_format(1, 5, "b", &bold).unwrap();
        row(sheet, 3, &["вопрос ", "#1", "2", "", "a", "b"]);
        sheet.write_string_with_format(2, 5, "b", &bold).unwrap();
        sheet
            .merge_range(4, 0, 5, 0, "Объединено", &Format::new())
            .unwrap();
        row(sheet, 5, &["", "#5"]);
        row(sheet, 7, &["Скрыто", "#5"]);
        sheet.set_row_hidden(6).unwrap();
        sheet.set_column_hidden(6).unwrap();
        row(sheet, 8, &["Q", "#1", "1", "", "a", "b", "c"]);
    });
    let parsed = read(&bytes);
    assert!(has(&parsed, "bold_mismatch", "C2"));
    assert!(!has(&parsed, "bold_mismatch", "C3"));
    let b = issue(&parsed, "bold_mismatch");
    assert_eq!(
        (b.params["bold"].as_str(), b.params["correct"].as_str()),
        (Some("2"), Some("1"))
    );
    assert!(has(&parsed, "duplicate_question", "A3"));
    assert_eq!(issue(&parsed, "duplicate_question").params["row"], 2);
    assert!(has(&parsed, "merged_cells", "A5"));
    assert_eq!(issue(&parsed, "merged_cells").params["range"], "A5:A6");
    assert!(has(&parsed, "hidden_cells", "A7"));
    assert!(has(&parsed, "hidden_cells", "G8"));
}

#[test]
fn pictures_by_anchor() {
    let a = png(100, 50, 1);
    let b = png(60, 60, 2);
    let bytes = book(|sheet| {
        header(sheet, 0, 0, 0, false);
        row(sheet, 2, &["", "#1", "2", "", "a"]);
        let image_a = Image::new_from_buffer(&a).unwrap();
        let image_b = Image::new_from_buffer(&b).unwrap();
        sheet.insert_image(1, 0, &image_a).unwrap();
        sheet
            .insert_image_with_offset(1, 0, &image_b, 0, 5)
            .unwrap();
        sheet.insert_image(1, 5, &image_a).unwrap(); // F2: option 2 is only a picture
        row(sheet, 3, &["Q", "#1", "1", "", "x", "y"]);
        sheet.embed_image(2, 0, &image_b).unwrap();
        sheet.embed_image(2, 5, &image_a).unwrap();
        sheet
            .insert_shape(3, 0, &Shape::textbox().set_text("s"))
            .unwrap();
        row(sheet, 4, &["Shape", "#5"]);
    });
    let parsed = read(&bytes);
    assert!(!parsed.has_errors(), "{:#?}", parsed.issues);
    let test = parsed.test.as_ref().unwrap();
    assert_eq!(test.images.len(), 2);
    assert_eq!(
        (
            test.images[0].width,
            test.images[0].height,
            test.images[0].mime
        ),
        (100, 50, "image/png")
    );
    let q = &test.questions[0];
    assert_eq!((q.text.as_str(), q.images.clone()), ("", vec![0, 1]));
    assert_eq!(
        q.kind,
        DotKind::Single {
            options: vec![
                opt("a"),
                DotOption {
                    text: String::new(),
                    image: Some(0)
                }
            ],
            correct: 1
        }
    );
    let q = &test.questions[1];
    // An in-cell picture replaces the cell value.
    assert_eq!((q.text.as_str(), q.images.clone()), ("", vec![1]));
    assert_eq!(
        q.kind,
        DotKind::Single {
            options: vec![
                opt("x"),
                DotOption {
                    text: String::new(),
                    image: Some(0)
                }
            ],
            correct: 0
        }
    );
    assert_eq!(cells(issue(&parsed, "shapes_skipped")), ["A4"]);

    // twoCellAnchor → oneCellAnchor (other writers) reads the same.
    let one = edit(&bytes, "drawings/drawing1.xml", |x| {
        x.replace("<xdr:twoCellAnchor", "<xdr:oneCellAnchor")
            .replace("</xdr:twoCellAnchor>", "</xdr:oneCellAnchor>")
    });
    assert_eq!(read(&one).test, parsed.test);
}

#[test]
fn picture_errors() {
    let image = png(10, 10, 1);
    let bytes = book(|sheet| {
        header(sheet, 0, 0, 0, false);
        let pic = Image::new_from_buffer(&image).unwrap();
        sheet.insert_image(0, 3, &pic).unwrap(); // D1
        row(sheet, 2, &["Q", "#1", "1", "", "a", "b"]);
        sheet.insert_image(1, 2, &pic).unwrap(); // C2
        sheet.insert_image(1, 4, &pic).unwrap();
        sheet.insert_image_with_offset(1, 4, &pic, 3, 3).unwrap(); // E2 twice
        row(sheet, 3, &["Q", "#5"]);
        for i in 0..6 {
            sheet.insert_image_with_offset(2, 0, &pic, 0, i).unwrap();
        }
        sheet.insert_image(2, 4, &pic).unwrap(); // E3 of an essay
    });
    let parsed = read(&bytes);
    assert_eq!(
        located(&parsed),
        [
            (Severity::Error, "image_outside", Some("D1".to_owned())),
            (Severity::Error, "image_outside", Some("C2".to_owned())),
            (Severity::Error, "option_image_twice", Some("E2".to_owned())),
            (Severity::Error, "too_many_images", Some("A3".to_owned())),
            (Severity::Error, "image_outside", Some("E3".to_owned())),
        ]
    );
    assert_eq!(issue(&parsed, "too_many_images").params["max"], 5);

    // Media replaced after the fact: EMF, a truncated PNG, a huge PNG.
    let mut placed = book(|sheet| {
        header(sheet, 0, 0, 0, false);
        for (r, seed) in [(1, 1), (2, 2), (3, 3)] {
            row(sheet, r + 1, &["Q", "#5"]);
            sheet
                .insert_image(r, 0, &Image::new_from_buffer(&png(5, 5, seed)).unwrap())
                .unwrap();
        }
    });
    let mut emf = vec![1, 0, 0, 0, 0x6C, 0, 0, 0];
    emf.extend_from_slice(b" EMF");
    let huge = png(9000, 10, 9);
    let mut parts = unzip(&placed);
    for (name, data) in &mut parts {
        match name.as_str() {
            "xl/media/image1.png" => data.clone_from(&emf),
            "xl/media/image2.png" => data.truncate(12),
            "xl/media/image3.png" => data.clone_from(&huge),
            _ => {}
        }
    }
    placed = zip(&parts);
    let parsed = read(&placed);
    assert_eq!(
        located(&parsed),
        [
            (Severity::Error, "image_format", Some("A2".to_owned())),
            (Severity::Error, "image_broken", Some("A3".to_owned())),
            (Severity::Error, "image_too_large", Some("A4".to_owned())),
        ]
    );

    // A chart frame and an absolutely anchored picture.
    let frame = edit(
        &book(|sheet| {
            header(sheet, 0, 0, 0, false);
            row(sheet, 2, &["Q", "#5"]);
            sheet
                .insert_image(1, 0, &Image::new_from_buffer(&image).unwrap())
                .unwrap();
            sheet
                .insert_image(
                    1,
                    1,
                    &Image::new_from_buffer(&png(4, 4, 4))
                        .unwrap()
                        .set_object_movement(ObjectMovement::DontMoveOrSizeWithCells),
                )
                .unwrap();
        }),
        "drawings/drawing1.xml",
        |x| {
            let first = x.find("<xdr:twoCellAnchor").unwrap();
            let second = x[first + 1..].find("<xdr:twoCellAnchor").unwrap() + first + 1;
            let (head, tail) = x.split_at(second);
            let tail = tail
                .replacen("<xdr:twoCellAnchor", "<xdr:absoluteAnchor", 1)
                .replacen("</xdr:twoCellAnchor>", "</xdr:absoluteAnchor>", 1);
            let head = head.replacen("<xdr:pic>", "<xdr:graphicFrame/><xdr:pic>", 1);
            format!("{head}{tail}")
        },
    );
    let parsed = read(&frame);
    assert_eq!(
        located(&parsed),
        [
            (Severity::Error, "image_outside", None),
            (Severity::Error, "image_outside", Some("A2".to_owned()))
        ]
    );
}

#[test]
fn file_level_failures() {
    let one = |p: &ab_xlsx::Parsed| {
        assert!(p.test.is_none());
        assert_eq!(p.issues.len(), 1);
        p.issues[0].code
    };
    assert_eq!(one(&read(b"not a zip at all")), "file_unreadable");
    let mut ole = vec![0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    ole.resize(512, 0);
    assert_eq!(one(&read(&ole)), "xls_not_supported");
    assert_eq!(
        one(&read(&vec![0u8; 20 * 1024 * 1024 + 1])),
        "file_too_large"
    );
    assert_eq!(
        one(&read(&zip(&[("a.txt".to_owned(), b"x".to_vec())]))),
        "file_unreadable"
    );

    // Zip bombs: a 60 MB part, and 2 MB of zeros (ratio far past 100).
    let big = zip(&[("xl/bomb.bin".to_owned(), vec![0u8; 60 * 1024 * 1024])]);
    assert_eq!(one(&read(&big)), "file_unreadable");
    let mut parts = unzip(&raw(&[("S", &raw_header())], 0, &[]));
    parts.push(("xl/zeros.bin".to_owned(), vec![0u8; 2 * 1024 * 1024]));
    assert_eq!(one(&read(&zip(&parts))), "file_unreadable");

    let doctype = format!(
        r#"<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{}</sheetData></worksheet>"#,
        raw_header()
    );
    assert_eq!(
        one(&read(&raw(&[("S", &doctype)], 0, &[]))),
        "file_unreadable"
    );

    let rows = [
        raw_header(),
        r(2, &[s("A2", "Q"), n("B2", "5")]),
        r(3, &[s("A3", "Q"), n("B3", "5")]),
    ]
    .concat();
    let many = parse(
        &raw(&[("S", &rows)], 0, &[]),
        ParseOptions {
            max_questions: 1,
            ..ParseOptions::default()
        },
    );
    assert_eq!(one(&many), "too_many_questions");
    assert_eq!(many.issues[0].params["max"], 1);

    let image = png(3, 3, 3);
    let crowded = book(|sheet| {
        header(sheet, 0, 0, 0, false);
        let pic = Image::new_from_buffer(&image).unwrap();
        for r in 1..=301 {
            sheet.insert_image(r, 0, &pic).unwrap();
        }
    });
    let crowded = read(&crowded);
    assert_eq!(one(&crowded), "too_many_images");
    assert_eq!(crowded.issues[0].params["max"], 300);
}

#[test]
fn active_sheet_only_and_sparse_rows() {
    let other = [raw_header(), r(2, &[s("A2", "Чужой"), n("B2", "5")])].concat();
    let sparse = format!(
        r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:Z900"/><cols><col min="1" max="3" width="20"/></cols><sheetData>{}{}<row r="40"><c r="A40" s="0"/><c r="B40"><v> </v></c></row>{}</sheetData></worksheet>"#,
        raw_header(),
        r(2, &[s("A2", "Свой"), n("B2", "5")]),
        r(90, &[s("A90", "Последний"), n("B90", "5")])
    );
    let parsed = read(&raw(&[("Первый", &other), ("Второй", &sparse)], 1, &[]));
    assert_eq!(parsed.sheet, "Второй");
    let test = parsed.test.as_ref().unwrap();
    assert_eq!(
        test.questions
            .iter()
            .map(|q| (q.row, q.text.as_str()))
            .collect::<Vec<_>>(),
        [(2, "Свой"), (90, "Последний")]
    );
    let info = issue(&parsed, "other_sheets");
    assert_eq!(
        (info.severity, info.params["sheet"].as_str()),
        (Severity::Info, Some("Второй"))
    );
    assert_eq!(info.params["names"], serde_json::json!(["Первый"]));
}

#[test]
fn issues_are_capped_and_ordered() {
    let rows: String = (2..=161)
        .map(|i| r(i, &[s(&format!("A{i}"), "Q"), n(&format!("B{i}"), "9")]))
        .collect();
    let rows = [
        raw_header(),
        rows,
        r(162, &[s("A162", "Q"), n("B162", "5")]),
    ]
    .concat();
    let parsed = read(&raw(&[("S", &rows)], 0, &[]));
    assert_eq!(parsed.issues.len(), 100);
    assert_eq!(parsed.truncated, 60);
    assert_eq!(parsed.issues[0].cell.as_deref(), Some("B2"));
    assert_eq!(parsed.issues[99].cell.as_deref(), Some("B101"));
}
