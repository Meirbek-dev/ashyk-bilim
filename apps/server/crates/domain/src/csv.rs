//! The one CSV cell writer behind every export (gradebook, file-submission
//! and analytics CSVs): RFC 4180 quoting plus formula neutralisation.

/// Quote a CSV field when it needs it (RFC 4180) and defuse a cell a
/// spreadsheet would evaluate (BUG-196): a value starting with `=`, `+`,
/// `-`, `@`, tab or CR — a learner-controlled display name such as
/// `=HYPERLINK(...)` — is prefixed with `'` so it opens as text.
pub fn csv_field(value: &str) -> String {
    let defused = if value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{value}")
    } else {
        value.to_owned()
    };
    if defused.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", defused.replace('"', "\"\""))
    } else {
        defused
    }
}

pub fn csv_row(fields: &[String]) -> String {
    let mut line = fields
        .iter()
        .map(|f| csv_field(f))
        .collect::<Vec<_>>()
        .join(",");
    line.push_str("\r\n");
    line
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_fields_are_quoted_and_formulas_defused() {
        assert_eq!(csv_field("plain"), "plain");
        assert_eq!(csv_field("a,b"), "\"a,b\"");
        assert_eq!(csv_field("say \"hi\""), "\"say \"\"hi\"\"\"");
        assert_eq!(csv_row(&["a".into(), "b\nc".into()]), "a,\"b\nc\"\r\n");
        // BUG-196: leading formula triggers are neutralised, quoting still applies.
        assert_eq!(
            csv_field("=HYPERLINK(\"http://evil\",\"x\") +1-1"),
            "\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\") +1-1\""
        );
        assert_eq!(csv_field("+1"), "'+1");
        assert_eq!(csv_field("-1"), "'-1");
        assert_eq!(csv_field("@cmd"), "'@cmd");
        assert_eq!(csv_field("\tx"), "'\tx");
        assert_eq!(csv_field("\rx"), "\"'\rx\"");
        assert_eq!(csv_field("30"), "30");
        assert_eq!(csv_field("Aigerim -Critic"), "Aigerim -Critic");
    }
}
