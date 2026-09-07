//! Run report: one block per domain (source rows, written rows, drops with
//! reasons, notes, duration) plus the verification outcome.

use std::collections::BTreeMap;
use std::fmt::Write as _;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// One legacy row the ETL did not carry, and why.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Drop {
    pub entity: String,
    pub legacy_key: String,
    pub reason: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TableCounts {
    pub source: u64,
    pub written: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DomainReport {
    pub domain: String,
    pub tables: BTreeMap<String, TableCounts>,
    pub dropped: Vec<Drop>,
    pub notes: Vec<String>,
    pub duration_ms: u64,
}

impl DomainReport {
    #[must_use]
    pub fn new(domain: &str) -> Self {
        Self {
            domain: domain.to_owned(),
            ..Self::default()
        }
    }

    pub fn source(&mut self, table: &str, n: u64) {
        self.tables.entry(table.to_owned()).or_default().source += n;
    }

    pub fn wrote(&mut self, table: &str, n: u64) {
        self.tables.entry(table.to_owned()).or_default().written += n;
    }

    #[must_use]
    pub fn source_total(&self) -> u64 {
        self.tables.values().map(|t| t.source).sum()
    }

    #[must_use]
    pub fn written_total(&self) -> u64 {
        self.tables.values().map(|t| t.written).sum()
    }

    /// Drops grouped by reason — the summary line the rehearsal log records.
    #[must_use]
    pub fn drops_by_reason(&self) -> BTreeMap<String, u64> {
        let mut out = BTreeMap::new();
        for d in &self.dropped {
            *out.entry(d.reason.clone()).or_insert(0) += 1;
        }
        out
    }
}

/// One verification check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Check {
    pub name: String,
    pub ok: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Verification {
    pub checks: Vec<Check>,
}

impl Verification {
    pub fn push(&mut self, name: &str, ok: bool, detail: impl Into<String>) {
        self.checks.push(Check {
            name: name.to_owned(),
            ok,
            detail: detail.into(),
        });
    }

    #[must_use]
    pub fn ok(&self) -> bool {
        self.checks.iter().all(|c| c.ok)
    }

    #[must_use]
    pub fn failed(&self) -> Vec<&Check> {
        self.checks.iter().filter(|c| !c.ok).collect()
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Report {
    pub run_id: Uuid,
    pub dry_run: bool,
    pub domains: Vec<DomainReport>,
    pub verification: Option<Verification>,
    pub duration_ms: u64,
}

impl Report {
    /// Green = every verification check passed (a report without a
    /// verification phase is green by construction — `--domain` smoke runs).
    #[must_use]
    pub fn ok(&self) -> bool {
        self.verification.as_ref().is_none_or(Verification::ok)
    }

    #[must_use]
    pub fn dropped_total(&self) -> usize {
        self.domains.iter().map(|d| d.dropped.len()).sum()
    }

    /// Human-readable rendering for the CLI.
    #[must_use]
    pub fn render(&self) -> String {
        let mut out = String::new();
        let _ = writeln!(
            out,
            "etl run {}{} — {} ms",
            self.run_id,
            if self.dry_run {
                " (dry-run, rolled back)"
            } else {
                ""
            },
            self.duration_ms
        );
        for d in &self.domains {
            let _ = writeln!(
                out,
                "\n[{}] {} ms — source {} / written {} / dropped {}",
                d.domain,
                d.duration_ms,
                d.source_total(),
                d.written_total(),
                d.dropped.len()
            );
            for (table, counts) in &d.tables {
                let _ = writeln!(
                    out,
                    "  {table:<32} source {:>7}  written {:>7}",
                    counts.source, counts.written
                );
            }
            for (reason, n) in d.drops_by_reason() {
                let _ = writeln!(out, "  drop x{n:<6} {reason}");
            }
            for note in &d.notes {
                let _ = writeln!(out, "  note: {note}");
            }
        }
        if let Some(v) = &self.verification {
            let _ = writeln!(
                out,
                "\n[verification] {} check(s), {} failed",
                v.checks.len(),
                v.failed().len()
            );
            for c in &v.checks {
                let _ = writeln!(
                    out,
                    "  {} {:<44} {}",
                    if c.ok { "ok  " } else { "FAIL" },
                    c.name,
                    c.detail
                );
            }
        }
        let _ = writeln!(out, "\nresult: {}", if self.ok() { "GREEN" } else { "RED" });
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_is_red_when_a_check_fails() {
        let mut report = Report::default();
        assert!(report.ok());
        let mut v = Verification::default();
        v.push("counts", true, "");
        v.push("orphans", false, "3 orphan rows");
        report.verification = Some(v);
        assert!(!report.ok());
        let text = report.render();
        assert!(text.contains("FAIL orphans"));
        assert!(text.contains("result: RED"));
    }

    #[test]
    fn drops_group_by_reason() {
        let mut d = DomainReport::new("catalog");
        for i in 0..3 {
            d.dropped.push(Drop {
                entity: "resource_author".into(),
                legacy_key: i.to_string(),
                reason: "orphan".into(),
            });
        }
        d.dropped.push(Drop {
            entity: "block".into(),
            legacy_key: "9".into(),
            reason: "no file".into(),
        });
        let by = d.drops_by_reason();
        assert_eq!(by["orphan"], 3);
        assert_eq!(by["no file"], 1);
    }
}
