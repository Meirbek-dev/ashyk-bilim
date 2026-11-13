//! Pictures of the sheet (spec 4.5): drawing anchors and Excel 365 in-cell
//! pictures, each checked by signature and size.

use std::collections::HashMap;

use sha2::{Digest, Sha256};

use super::book::{self, Rel};
use super::xml::{self, Bad, Node};
use super::zip::{Archive, Fail, rels_of};

const MAX_BYTES: usize = 5 * 1024 * 1024;
const MAX_SIDE: usize = 8192;

/// A picture that passed the checks.
pub struct Picture {
    pub sha256: [u8; 32],
    pub bytes: Vec<u8>,
    pub mime: &'static str,
    pub width: u32,
    pub height: u32,
}

/// One picture placed on a cell.
pub struct Placed {
    pub row: u32,
    pub col: u32,
    /// `xdr:cNvPr/@id`; 0 for an in-cell picture.
    pub order: u32,
    /// Index into [`Found::pictures`], or the error code.
    pub picture: Result<usize, &'static str>,
}

#[derive(Default)]
pub struct Found {
    pub placed: Vec<Placed>,
    pub pictures: Vec<Picture>,
    /// Cells of shapes without a picture.
    pub shapes: Vec<(u32, u32)>,
    /// Charts and absolutely anchored pictures (`None`: no cell).
    pub outside: Vec<Option<(u32, u32)>>,
    /// Media part → result, so a part used twice is read once.
    media: HashMap<String, Result<usize, &'static str>>,
}

#[derive(Debug)]
pub enum Error {
    /// The archive limits were exceeded or a part is not XML.
    Unreadable,
}

impl From<Fail> for Error {
    fn from(_: Fail) -> Self {
        Self::Unreadable
    }
}

impl From<Bad> for Error {
    fn from(_: Bad) -> Self {
        Self::Unreadable
    }
}

/// A part and its relationships.
type Part = (Vec<u8>, Vec<Rel>);

/// Reads an XML part and its relationships; a missing part is empty.
fn part(archive: &mut Archive<'_>, path: &str) -> Result<Option<Part>, Error> {
    let Some(xml) = archive.read(path)? else {
        return Ok(None);
    };
    let rels = match archive.read(&rels_of(path))? {
        Some(r) => book::rels(path, &r)?,
        None => Vec::new(),
    };
    Ok(Some((xml, rels)))
}

impl Found {
    fn media(
        &mut self,
        archive: &mut Archive<'_>,
        target: Option<&str>,
    ) -> Result<Result<usize, &'static str>, Error> {
        let Some(path) = target else {
            return Ok(Err("image_broken"));
        };
        if let Some(done) = self.media.get(path) {
            return Ok(*done);
        }
        let result = match archive.read(path) {
            Ok(Some(bytes)) => check(bytes).map(|p| {
                self.pictures.push(p);
                self.pictures.len() - 1
            }),
            Ok(None) | Err(Fail::Corrupt) => Err("image_broken"),
            Err(Fail::Unreadable) => return Err(Error::Unreadable),
        };
        self.media.insert(path.to_owned(), result);
        Ok(result)
    }

    pub fn place(
        &mut self,
        archive: &mut Archive<'_>,
        (row, col): (u32, u32),
        order: u32,
        target: Option<&str>,
    ) -> Result<(), Error> {
        let picture = self.media(archive, target)?;
        self.placed.push(Placed {
            row,
            col,
            order,
            picture,
        });
        Ok(())
    }
}

#[derive(Default)]
struct Anchor {
    absolute: bool,
    from: (u32, u32),
    /// `(cNvPr id, r:embed)`.
    pics: Vec<(u32, Option<String>)>,
    frame: bool,
    shape: bool,
}

/// Anchors of a drawing part.
fn anchors(xml: &[u8]) -> Result<Vec<Anchor>, Bad> {
    let mut out = Vec::new();
    let mut anchor: Option<Anchor> = None;
    let mut pic: Option<(u32, Option<String>)> = None;
    xml::walk(xml, |stack, node| {
        let depth = stack.len();
        let name = stack.last().map_or(&[][..], Vec::as_slice);
        if stack.iter().any(|n| n == b"Fallback") {
            return;
        }
        match node {
            Node::Open(e) => match name {
                b"oneCellAnchor" | b"twoCellAnchor" | b"absoluteAnchor" if depth == 2 => {
                    anchor = Some(Anchor {
                        absolute: name == b"absoluteAnchor",
                        ..Anchor::default()
                    });
                }
                b"pic" => pic = Some((0, None)),
                b"cNvPr" => {
                    if let Some(p) = pic.as_mut() {
                        p.0 = xml::attr_u32(e, b"id").unwrap_or(0);
                    }
                }
                b"blip" => {
                    if let Some(p) = pic.as_mut() {
                        p.1 = xml::attr(e, b"embed");
                    }
                }
                b"graphicFrame" => {
                    if let Some(a) = anchor.as_mut() {
                        a.frame = true;
                    }
                }
                b"sp" | b"cxnSp" | b"grpSp" | b"contentPart" => {
                    if let Some(a) = anchor.as_mut() {
                        a.shape = true;
                    }
                }
                _ => {}
            },
            Node::Text(t) if depth >= 2 && stack[depth - 2] == b"from" => {
                if let (Some(a), Ok(n)) = (anchor.as_mut(), t.trim().parse::<u32>()) {
                    match name {
                        b"row" => a.from.0 = n + 1,
                        b"col" => a.from.1 = n + 1,
                        _ => {}
                    }
                }
            }
            Node::Close if name == b"pic" => {
                if let (Some(a), Some(p)) = (anchor.as_mut(), pic.take()) {
                    a.pics.push(p);
                }
            }
            Node::Close if depth == 2 => {
                if let Some(a) = anchor.take() {
                    out.push(a);
                }
            }
            _ => {}
        }
    })?;
    Ok(out)
}

/// Pictures of the drawing part at `path`.
pub fn drawing(archive: &mut Archive<'_>, path: &str, found: &mut Found) -> Result<(), Error> {
    let Some((xml, rels)) = part(archive, path)? else {
        return Ok(());
    };
    for anchor in anchors(&xml)? {
        let cell = (anchor.from.0.max(1), anchor.from.1.max(1));
        if anchor.absolute {
            if !anchor.pics.is_empty() || anchor.frame {
                found.outside.push(None);
            }
            continue;
        }
        if anchor.frame {
            found.outside.push(Some(cell));
        }
        if anchor.pics.is_empty() && !anchor.frame && anchor.shape {
            found.shapes.push(cell);
        }
        for (id, embed) in anchor.pics {
            let target = embed
                .and_then(|id| rels.iter().find(|r| r.id == id))
                .and_then(|r| r.target.clone());
            found.place(archive, cell, id, target.as_deref())?;
        }
    }
    Ok(())
}

/// Resolves Excel 365 in-cell pictures: `vm` (1-based) → media part, or
/// `None` when that value is not a local picture.
pub struct RichValues {
    targets: Vec<Option<String>>,
}

impl RichValues {
    pub fn load(archive: &mut Archive<'_>) -> Result<Self, Error> {
        let mut targets = Vec::new();
        let Some(metadata) = archive.read("xl/metadata.xml")? else {
            return Ok(Self { targets });
        };
        // metadataTypes names; futureMetadata XLRICHVALUE rvb indexes; valueMetadata rc (t, v).
        let mut types: Vec<String> = Vec::new();
        let mut future_name = String::new();
        let mut rvb: Vec<Option<usize>> = Vec::new();
        let mut values: Vec<Option<(usize, usize)>> = Vec::new();
        xml::walk(&metadata, |stack, node| {
            let Node::Open(e) = node else { return };
            let name = stack.last().map_or(&[][..], Vec::as_slice);
            let inside = |n: &[u8]| stack.iter().any(|s| s == n);
            match name {
                b"metadataType" => types.push(xml::attr(e, b"name").unwrap_or_default()),
                b"futureMetadata" => future_name = xml::attr(e, b"name").unwrap_or_default(),
                b"bk" if inside(b"futureMetadata") && future_name == "XLRICHVALUE" => {
                    rvb.push(None);
                }
                b"rvb" if future_name == "XLRICHVALUE" => {
                    if let Some(last) = rvb.last_mut() {
                        *last = xml::attr_u32(e, b"i").map(|i| i as usize);
                    }
                }
                b"bk" if inside(b"valueMetadata") => values.push(None),
                b"rc" if inside(b"valueMetadata") => {
                    if let (Some(last), Some(t), Some(v)) = (
                        values.last_mut(),
                        xml::attr_u32(e, b"t"),
                        xml::attr_u32(e, b"v"),
                    ) && last.is_none()
                    {
                        *last = Some((t as usize, v as usize));
                    }
                }
                _ => {}
            }
        })?;
        let rich = rich_values(archive)?;
        for value in values {
            let target = value.and_then(|(t, v)| {
                let kind = types.get(t.checked_sub(1)?)?;
                if kind != "XLRICHVALUE" {
                    return None;
                }
                rich.get((*rvb.get(v)?)?)?.clone()
            });
            targets.push(target);
        }
        Ok(Self { targets })
    }

    pub fn target(&self, vm: u32) -> Option<&str> {
        self.targets.get((vm as usize).checked_sub(1)?)?.as_deref()
    }
}

/// Rich value index → media part of a `_localImage`, `None` for other kinds.
fn rich_values(archive: &mut Archive<'_>) -> Result<Vec<Option<String>>, Error> {
    let Some(values) = archive.read("xl/richData/rdrichvalue.xml")? else {
        return Ok(Vec::new());
    };
    // Structures: position of the image key, `None` when not a local image.
    let mut structures: Vec<Option<usize>> = Vec::new();
    if let Some(xml) = archive.read("xl/richData/rdrichvaluestructure.xml")? {
        let mut local = false;
        let mut keys = 0usize;
        xml::walk(&xml, |stack, node| {
            let name = stack.last().map_or(&[][..], Vec::as_slice);
            match node {
                Node::Open(e) if name == b"s" => {
                    local = xml::attr(e, b"t").is_some_and(|t| t == "_localImage");
                    keys = 0;
                    structures.push(None);
                }
                Node::Open(e) if name == b"k" => {
                    if local
                        && xml::attr(e, b"n").is_some_and(|n| n == "_rvRel:LocalImageIdentifier")
                        && let Some(last) = structures.last_mut()
                    {
                        *last = Some(keys);
                    }
                    keys += 1;
                }
                _ => {}
            }
        })?;
    }
    let rel_targets: Vec<Option<String>> = match part(archive, "xl/richData/richValueRel.xml")? {
        Some((xml, rels)) => {
            let mut ids = Vec::new();
            xml::walk(&xml, |stack, node| {
                if let Node::Open(e) = node
                    && stack.last().is_some_and(|n| n == b"rel")
                {
                    ids.push(xml::attr(e, b"id"));
                }
            })?;
            ids.into_iter()
                .map(|id| {
                    let id = id?;
                    rels.iter().find(|r| r.id == id)?.target.clone()
                })
                .collect()
        }
        None => Vec::new(),
    };
    // Each `<rv s>`: its `<v>` texts.
    let mut rows: Vec<(usize, Vec<String>)> = Vec::new();
    xml::walk(&values, |stack, node| {
        let name = stack.last().map_or(&[][..], Vec::as_slice);
        match node {
            Node::Open(e) if name == b"rv" => {
                rows.push((xml::attr_u32(e, b"s").unwrap_or(0) as usize, Vec::new()));
            }
            Node::Open(_) if name == b"v" => {
                if let Some(last) = rows.last_mut() {
                    last.1.push(String::new());
                }
            }
            Node::Text(t) if name == b"v" => {
                if let Some(v) = rows.last_mut().and_then(|r| r.1.last_mut()) {
                    v.push_str(t);
                }
            }
            _ => {}
        }
    })?;
    Ok(rows
        .into_iter()
        .map(|(s, v)| {
            let key = (*structures.get(s)?)?;
            let rel: usize = v.get(key)?.trim().parse().ok()?;
            rel_targets.get(rel)?.clone()
        })
        .collect())
}

/// The format by signature (spec 4.5).
fn mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

fn check(bytes: Vec<u8>) -> Result<Picture, &'static str> {
    if bytes.len() > MAX_BYTES {
        return Err("image_too_large");
    }
    let mime = mime(&bytes).ok_or("image_format")?;
    let size = imagesize::blob_size(&bytes).map_err(|_| "image_broken")?;
    if size.width == 0 || size.height == 0 {
        return Err("image_broken");
    }
    if size.width > MAX_SIDE || size.height > MAX_SIDE {
        return Err("image_too_large");
    }
    let width = u32::try_from(size.width).map_err(|_| "image_too_large")?;
    let height = u32::try_from(size.height).map_err(|_| "image_too_large")?;
    Ok(Picture {
        sha256: Sha256::digest(&bytes).into(),
        bytes,
        mime,
        width,
        height,
    })
}
