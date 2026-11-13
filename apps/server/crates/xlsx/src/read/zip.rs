//! The `.xlsx` container with the spec 4.6 / 12.1 limits: checked on the
//! central directory first and enforced again while inflating.

use std::collections::HashMap;
use std::io::{Cursor, Read};

use zip::ZipArchive;

const MAX_ENTRIES: usize = 10_000;
const MAX_TOTAL: u64 = 200 * 1024 * 1024;
const MAX_PART: u64 = 50 * 1024 * 1024;
const MAX_RATIO: u64 = 100;
/// Below this an entry cannot be a bomb; tiny runs of zeros compress past 100:1.
const RATIO_FLOOR: u64 = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fail {
    /// Not a zip, or a limit is exceeded: the whole file is unreadable.
    Unreadable,
    /// This entry does not inflate (bad data or CRC).
    Corrupt,
}

pub struct Archive<'a> {
    zip: ZipArchive<Cursor<&'a [u8]>>,
    /// Lowercase part name (no leading `/`) → entry index.
    names: HashMap<String, usize>,
    inflated: u64,
}

impl<'a> Archive<'a> {
    pub fn open(bytes: &'a [u8]) -> Result<Self, Fail> {
        let mut zip = ZipArchive::new(Cursor::new(bytes)).map_err(|_| Fail::Unreadable)?;
        if zip.len() > MAX_ENTRIES {
            return Err(Fail::Unreadable);
        }
        let mut names = HashMap::new();
        let mut total = 0u64;
        for index in 0..zip.len() {
            let entry = zip.by_index_raw(index).map_err(|_| Fail::Unreadable)?;
            let size = entry.size();
            total = total.saturating_add(size);
            let bomb =
                size > RATIO_FLOOR && size > entry.compressed_size().saturating_mul(MAX_RATIO);
            if size > MAX_PART || total > MAX_TOTAL || bomb {
                return Err(Fail::Unreadable);
            }
            if entry.is_dir() {
                continue;
            }
            let name = entry.name().map_err(|_| Fail::Unreadable)?;
            let key = name.trim_start_matches('/').to_lowercase();
            names.entry(key).or_insert(index);
        }
        Ok(Self {
            zip,
            names,
            inflated: 0,
        })
    }

    /// The part at `path` (case-insensitive), `None` when absent.
    pub fn read(&mut self, path: &str) -> Result<Option<Vec<u8>>, Fail> {
        let Some(&index) = self.names.get(&path.trim_start_matches('/').to_lowercase()) else {
            return Ok(None);
        };
        let entry = self.zip.by_index(index).map_err(|_| Fail::Corrupt)?;
        let limit = entry.size().min(MAX_PART);
        let mut bytes = Vec::new();
        entry
            .take(limit + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| Fail::Corrupt)?;
        let len = bytes.len() as u64;
        self.inflated = self.inflated.saturating_add(len);
        if len > limit || self.inflated > MAX_TOTAL {
            return Err(Fail::Unreadable);
        }
        Ok(Some(bytes))
    }
}

/// Resolves a relationship `target` against the part `source` that owns the
/// `.rels` (`xl/worksheets/sheet1.xml` + `../drawings/drawing1.xml`).
pub fn resolve(source: &str, target: &str) -> String {
    let mut parts: Vec<&str> = if let Some(absolute) = target.strip_prefix('/') {
        return normalize(absolute.split('/').collect());
    } else {
        source.split('/').collect()
    };
    parts.pop();
    parts.extend(target.split('/'));
    normalize(parts)
}

fn normalize(parts: Vec<&str>) -> String {
    let mut out: Vec<&str> = Vec::new();
    for part in parts {
        match part {
            "" | "." => {}
            ".." => {
                out.pop();
            }
            _ => out.push(part),
        }
    }
    out.join("/")
}

/// The `.rels` part of `source`.
pub fn rels_of(source: &str) -> String {
    match source.rsplit_once('/') {
        Some((dir, file)) => format!("{dir}/_rels/{file}.rels"),
        None => format!("_rels/{source}.rels"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn targets_resolve() {
        assert_eq!(
            resolve("xl/worksheets/sheet1.xml", "../drawings/drawing1.xml"),
            "xl/drawings/drawing1.xml"
        );
        assert_eq!(
            resolve("xl/workbook.xml", "worksheets/s.xml"),
            "xl/worksheets/s.xml"
        );
        assert_eq!(resolve("xl/workbook.xml", "/xl/x.xml"), "xl/x.xml");
        assert_eq!(rels_of("xl/workbook.xml"), "xl/_rels/workbook.xml.rels");
    }
}
