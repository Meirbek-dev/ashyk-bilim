//! Write the teachers' template: `cargo run -p ab-xlsx --example template -- <path>`
//! (`just server xlsx-template`).

#![allow(clippy::print_stderr, reason = "a command-line tool reports to stderr")]

use std::process::ExitCode;

fn main() -> ExitCode {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: template <output.xlsx>");
        return ExitCode::FAILURE;
    };
    let bytes = match ab_xlsx::template() {
        Ok(bytes) => bytes,
        Err(ab_xlsx::WriteError::Xlsx(e)) => {
            eprintln!("template: {e}");
            return ExitCode::FAILURE;
        }
    };
    if let Err(e) = std::fs::write(&path, bytes) {
        eprintln!("template: {path}: {e}");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}
