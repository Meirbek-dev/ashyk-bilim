//! The one CSV cell writer behind every export (gradebook, file-submission
//! and analytics CSVs): RFC 4180 quoting plus formula neutralisation, in the
//! shape Excel of the export's language opens by double-click.

use crate::grading::teacher::CsvLanguage;

/// Quote a CSV field when it needs it (RFC 4180) and defuse a cell a
/// spreadsheet would evaluate (BUG-196): a value starting with `=`, `+`,
/// `-`, `@`, tab or CR - a learner-controlled display name such as
/// `=HYPERLINK(...)` - is prefixed with `'` so it opens as text.
pub fn csv_field(value: &str, separator: char) -> String {
    let defused = if value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{value}")
    } else {
        value.to_owned()
    };
    if defused.contains([separator, '"', '\n', '\r']) {
        format!("\"{}\"", defused.replace('"', "\"\""))
    } else {
        defused
    }
}

/// One CSV line in `language`'s spreadsheet convention. Excel splits on
/// the Windows list separator: `;` with a decimal comma in the ru/kk
/// locales (a `,` file opened as one column there, and `8.7` became the
/// date 8 July), `,` with a decimal point in English.
pub fn csv_row(fields: &[String], language: CsvLanguage) -> String {
    let (separator, decimal_comma) = match language {
        CsvLanguage::Ru | CsvLanguage::Kk => (';', true),
        CsvLanguage::En => (',', false),
    };
    let mut line = fields
        .iter()
        .map(|f| {
            if decimal_comma && is_decimal(f) {
                csv_field(&f.replacen('.', ",", 1), separator)
            } else {
                csv_field(f, separator)
            }
        })
        .collect::<Vec<_>>()
        .join(&separator.to_string());
    line.push_str("\r\n");
    line
}

/// A plain decimal number (`93.33`, `0.5`) as the exports format scores
/// and percentages; ids, dates and versions (`3.8.1`) are not.
fn is_decimal(value: &str) -> bool {
    value.split_once('.').is_some_and(|(int, frac)| {
        let int = int.strip_prefix('-').unwrap_or(int);
        !int.is_empty()
            && !frac.is_empty()
            && int.bytes().all(|b| b.is_ascii_digit())
            && frac.bytes().all(|b| b.is_ascii_digit())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_fields_are_quoted_and_formulas_defused() {
        assert_eq!(csv_field("plain", ','), "plain");
        assert_eq!(csv_field("a,b", ','), "\"a,b\"");
        assert_eq!(csv_field("a,b", ';'), "a,b");
        assert_eq!(csv_field("a;b", ';'), "\"a;b\"");
        assert_eq!(csv_field("say \"hi\"", ','), "\"say \"\"hi\"\"\"");
        assert_eq!(
            csv_row(&["a".into(), "b\nc".into()], CsvLanguage::En),
            "a,\"b\nc\"\r\n"
        );
        // BUG-196: leading formula triggers are neutralised, quoting still applies.
        assert_eq!(
            csv_field("=HYPERLINK(\"http://evil\",\"x\") +1-1", ','),
            "\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\") +1-1\""
        );
        assert_eq!(csv_field("+1", ','), "'+1");
        assert_eq!(csv_field("-1", ','), "'-1");
        assert_eq!(csv_field("@cmd", ','), "'@cmd");
        assert_eq!(csv_field("\tx", ','), "'\tx");
        assert_eq!(csv_field("\rx", ','), "\"'\rx\"");
        assert_eq!(csv_field("30", ','), "30");
        assert_eq!(csv_field("Aigerim -Critic", ','), "Aigerim -Critic");
    }

    #[test]
    fn ru_and_kk_rows_are_what_their_excel_splits_and_reads_as_numbers() {
        let row = [
            "Иванов, И.".to_owned(),
            "93.33".to_owned(),
            "8.7".to_owned(),
            "-0.5".to_owned(),
            "100".to_owned(),
            "3.8.1".to_owned(),
            "2026-10-10T07:33:50Z".to_owned(),
            "a;b".to_owned(),
        ];
        assert_eq!(
            csv_row(&row, CsvLanguage::Ru),
            "Иванов, И.;93,33;8,7;'-0,5;100;3.8.1;2026-10-10T07:33:50Z;\"a;b\"\r\n"
        );
        assert_eq!(
            csv_row(&row, CsvLanguage::Kk),
            csv_row(&row, CsvLanguage::Ru)
        );
        assert_eq!(
            csv_row(&row, CsvLanguage::En),
            "\"Иванов, И.\",93.33,8.7,'-0.5,100,3.8.1,2026-10-10T07:33:50Z,a;b\r\n"
        );
    }
}
