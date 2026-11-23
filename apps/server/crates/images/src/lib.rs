//! Image previews (ARCHITECTURE §11 "Previews"): decode an uploaded picture,
//! scale it down with `fast_image_resize` and encode it as WebP. Pure: no
//! storage, no database - the domain decides which sizes a purpose gets and
//! where the bytes go.
//!
//! Every codec is pure Rust. The `image` crate encodes WebP lossless only
//! (VP8L); at preview sizes (at most 640 px wide) that stays small, and a
//! preview that would not be smaller than the original is reported as
//! [`Preview::Original`] instead, so a preview never costs more bytes than
//! the picture it stands in for.
//!
//! Decoding is bounded before any pixel is allocated: only JPEG, PNG, GIF and
//! WebP content (sniffed from the bytes, not the declared type), at most
//! [`MAX_SIDE`] px a side and [`MAX_PIXELS`] in all. Animated pictures keep
//! their animation: they are [`Skip::Animated`].

use std::io::Cursor;

use fast_image_resize::images::Image;
use fast_image_resize::{PixelType, ResizeOptions, Resizer};
use image::codecs::gif::GifDecoder;
use image::codecs::png::PngDecoder;
use image::codecs::webp::{WebPDecoder, WebPEncoder};
use image::{
    AnimationDecoder, DynamicImage, ExtendedColorType, ImageDecoder, ImageEncoder, ImageFormat,
    ImageReader, Limits,
};

/// The longest side a decoded picture may have.
pub const MAX_SIDE: u32 = 12_000;
/// The most pixels a decoded picture may have (a 50 MP phone photo fits).
pub const MAX_PIXELS: u64 = 50_000_000;
/// What the decoder may allocate at once: a [`MAX_PIXELS`] RGBA buffer.
const MAX_ALLOC: u64 = MAX_PIXELS * 4;

/// The box a preview must cover: the picture is scaled, keeping its
/// proportions, until it just covers `width` x `height` (what the web draws
/// with `object-fit: cover`), never up.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Target {
    pub width: u32,
    pub height: u32,
}

/// One preview of [`previews`], in the order of the targets.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Preview {
    /// A WebP picture of `width` x `height`.
    WebP {
        bytes: Vec<u8>,
        width: u32,
        height: u32,
    },
    /// The original is no bigger than a WebP would be: serve it as is.
    Original,
}

/// Why no preview can be made; the original stands in for every size.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Skip {
    /// The bytes are not a JPEG, PNG, GIF or WebP picture (AVIF is not
    /// decoded: its decoder is C).
    Unsupported,
    /// Wider, taller or bigger than the decode limits.
    TooLarge { width: u32, height: u32 },
    /// More than one frame: a still preview would drop the animation.
    Animated,
    /// The decoder, resizer or encoder refused the picture.
    Broken(String),
}

impl std::fmt::Display for Skip {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsupported => f.write_str("not a JPEG, PNG, GIF or WebP picture"),
            Self::TooLarge { width, height } => {
                write!(f, "{width}x{height} is over the decode limits")
            }
            Self::Animated => f.write_str("animated"),
            Self::Broken(reason) => write!(f, "unreadable: {reason}"),
        }
    }
}

fn broken(err: impl std::fmt::Display) -> Skip {
    Skip::Broken(err.to_string())
}

fn limits() -> Limits {
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_SIDE);
    limits.max_image_height = Some(MAX_SIDE);
    limits.max_alloc = Some(MAX_ALLOC);
    limits
}

/// The size a `width` x `height` picture is scaled to so it covers `target`
/// (never larger than it is, never 0).
#[must_use]
pub fn cover_size(width: u32, height: u32, target: Target) -> (u32, u32) {
    let scale = (f64::from(target.width) / f64::from(width))
        .max(f64::from(target.height) / f64::from(height))
        .min(1.0);
    let side = |value: u32| {
        // In (0, value]: `scale` is at most 1 and the result is rounded.
        #[allow(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "a non-negative value no larger than the u32 it came from"
        )]
        let scaled = (f64::from(value) * scale).round() as u32;
        scaled.max(1)
    };
    (side(width), side(height))
}

/// Make one preview per target from `original`.
///
/// `Err` when no preview can be made at all (then the original stands in for
/// every size); per target, [`Preview::Original`] when the WebP would not be
/// smaller than the original.
pub fn previews(original: &[u8], targets: &[Target]) -> Result<Vec<Preview>, Skip> {
    let reader = ImageReader::new(Cursor::new(original))
        .with_guessed_format()
        .map_err(broken)?;
    let Some(
        format @ (ImageFormat::Jpeg | ImageFormat::Png | ImageFormat::Gif | ImageFormat::WebP),
    ) = reader.format()
    else {
        return Err(Skip::Unsupported);
    };
    // The header alone (no pixel is decoded) says how big the picture is.
    let mut header = ImageReader::with_format(Cursor::new(original), format);
    header.no_limits();
    let (width, height) = header.into_dimensions().map_err(broken)?;
    let too_large = Skip::TooLarge { width, height };
    if width > MAX_SIDE || height > MAX_SIDE || u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err(too_large);
    }
    if animated(format, original)? {
        return Err(Skip::Animated);
    }
    let mut reader = reader;
    reader.limits(limits());
    let limited = |err: image::ImageError| match err {
        image::ImageError::Limits(_) => too_large.clone(),
        other => broken(other),
    };
    let mut decoder = reader.into_decoder().map_err(limited)?;
    let orientation = decoder.orientation().map_err(broken)?;
    let icc = decoder.icc_profile().ok().flatten();
    let mut picture = DynamicImage::from_decoder(decoder).map_err(limited)?;
    picture.apply_orientation(orientation);
    // 8 bits a channel is all WebP holds; alpha only when the picture has it.
    let picture = if picture.color().has_alpha() {
        DynamicImage::ImageRgba8(picture.into_rgba8())
    } else {
        DynamicImage::ImageRgb8(picture.into_rgb8())
    };
    let original_len = original.len();
    let mut resizer = Resizer::new();
    targets
        .iter()
        .map(|target| {
            let preview = scaled(&mut resizer, &picture, *target, icc.as_deref())?;
            Ok(match preview {
                Preview::WebP { ref bytes, .. } if bytes.len() < original_len => preview,
                _ => Preview::Original,
            })
        })
        .collect()
}

/// More than one frame (GIF, APNG, animated WebP).
fn animated(format: ImageFormat, original: &[u8]) -> Result<bool, Skip> {
    match format {
        ImageFormat::Gif => {
            let mut decoder = GifDecoder::new(Cursor::new(original)).map_err(broken)?;
            decoder.set_limits(limits()).map_err(broken)?;
            Ok(decoder.into_frames().take(2).count() > 1)
        }
        ImageFormat::Png => {
            let decoder =
                PngDecoder::with_limits(Cursor::new(original), limits()).map_err(broken)?;
            decoder.is_apng().map_err(broken)
        }
        ImageFormat::WebP => Ok(WebPDecoder::new(Cursor::new(original))
            .map_err(broken)?
            .has_animation()),
        _ => Ok(false),
    }
}

fn scaled(
    resizer: &mut Resizer,
    picture: &DynamicImage,
    target: Target,
    icc: Option<&[u8]>,
) -> Result<Preview, Skip> {
    let (width, height) = cover_size(picture.width(), picture.height(), target);
    let (pixel_type, color) = if picture.color().has_alpha() {
        (PixelType::U8x4, ExtendedColorType::Rgba8)
    } else {
        (PixelType::U8x3, ExtendedColorType::Rgb8)
    };
    let mut output = Image::new(width, height, pixel_type);
    resizer
        .resize(picture, &mut output, &ResizeOptions::new())
        .map_err(broken)?;
    let mut bytes = Vec::new();
    let mut encoder = WebPEncoder::new_lossless(&mut bytes);
    if let Some(icc) = icc {
        // Keeps a wide-gamut (Display P3) photo's colors; WebP takes any profile.
        encoder.set_icc_profile(icc.to_vec()).map_err(broken)?;
    }
    encoder
        .write_image(output.buffer(), width, height, color)
        .map_err(broken)?;
    Ok(Preview::WebP {
        bytes,
        width,
        height,
    })
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::cast_possible_truncation
)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb, Rgba};

    const AVATAR: Target = Target {
        width: 64,
        height: 64,
    };
    const COVER: Target = Target {
        width: 320,
        height: 180,
    };

    /// A noisy photo-like RGB picture: lossless WebP cannot shrink it to
    /// nothing, so a large original still compresses to a smaller preview.
    fn photo(width: u32, height: u32) -> DynamicImage {
        let mut seed = 0x9e37_79b9_u32;
        DynamicImage::ImageRgb8(ImageBuffer::from_fn(width, height, |x, y| {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            let noise = (seed & 0x0f) as u8;
            Rgb([
                ((x * 255) / width) as u8 ^ noise,
                ((y * 255) / height) as u8,
                noise * 8,
            ])
        }))
    }

    fn encode(picture: &DynamicImage, format: ImageFormat) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        picture.write_to(&mut out, format).unwrap();
        out.into_inner()
    }

    fn decoded(bytes: &[u8]) -> DynamicImage {
        let reader = ImageReader::new(Cursor::new(bytes))
            .with_guessed_format()
            .unwrap();
        assert_eq!(reader.format(), Some(ImageFormat::WebP));
        reader.decode().unwrap()
    }

    #[test]
    fn cover_keeps_proportions_and_never_upscales() {
        assert_eq!(cover_size(1000, 1000, AVATAR), (64, 64));
        // A wide picture keeps the box's height, a tall one its width.
        assert_eq!(cover_size(3000, 1000, AVATAR), (192, 64));
        assert_eq!(cover_size(1000, 3000, AVATAR), (64, 192));
        assert_eq!(cover_size(1920, 1080, COVER), (320, 180));
        assert_eq!(cover_size(1080, 1080, COVER), (320, 320));
        assert_eq!(cover_size(40, 30, AVATAR), (40, 30));
        assert_eq!(cover_size(12_000, 1, AVATAR), (12_000, 1));
    }

    #[test]
    fn a_png_becomes_smaller_webp_previews_per_target() {
        let png = encode(&photo(1280, 720), ImageFormat::Png);
        let targets = [
            COVER,
            Target {
                width: 640,
                height: 360,
            },
        ];
        let out = previews(&png, &targets).unwrap();
        let sizes: Vec<_> = out
            .iter()
            .map(|preview| match preview {
                Preview::WebP {
                    bytes,
                    width,
                    height,
                } => {
                    assert!(bytes.len() < png.len());
                    let picture = decoded(bytes);
                    assert_eq!((picture.width(), picture.height()), (*width, *height));
                    (*width, *height)
                }
                Preview::Original => panic!("expected a WebP preview"),
            })
            .collect();
        assert_eq!(sizes, [(320, 180), (640, 360)]);
    }

    #[test]
    fn a_jpeg_photo_is_decoded_and_scaled() {
        let jpeg = encode(&photo(800, 800), ImageFormat::Jpeg);
        let out = previews(&jpeg, &[AVATAR]).unwrap();
        let Preview::WebP {
            bytes,
            width,
            height,
        } = &out[0]
        else {
            panic!("a 64 px preview of an 800 px JPEG is smaller");
        };
        assert_eq!((*width, *height), (64, 64));
        assert_eq!(decoded(bytes).width(), 64);
    }

    #[test]
    fn alpha_survives() {
        let picture = DynamicImage::ImageRgba8(ImageBuffer::from_fn(400, 400, |x, _| {
            Rgba([200, 30, 30, if x < 200 { 0 } else { 255 }])
        }));
        let png = encode(&picture, ImageFormat::Png);
        let out = previews(&png, &[AVATAR]).unwrap();
        match &out[0] {
            Preview::WebP { bytes, .. } => {
                let preview = decoded(bytes).into_rgba8();
                assert_eq!(preview.get_pixel(2, 32)[3], 0);
                assert_eq!(preview.get_pixel(60, 32)[3], 255);
            }
            Preview::Original => {
                // A flat two-colour PNG may already be tiny; then it is served as is.
                assert!(png.len() < 2_000, "{}", png.len());
            }
        }
    }

    #[test]
    fn a_small_original_stands_in_for_itself() {
        // A heavily compressed 64 px JPEG: a lossless WebP of it is bigger.
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 10)
            .encode_image(&photo(64, 64))
            .unwrap();
        assert_eq!(previews(&jpeg, &[AVATAR]).unwrap(), [Preview::Original]);
    }

    #[test]
    fn exif_orientation_is_applied() {
        // A 4:3 JPEG tagged "rotate 90" is shown 3:4 by browsers; its preview too.
        let jpeg = encode(&photo(400, 300), ImageFormat::Jpeg);
        let tagged = with_orientation_6(&jpeg);
        let out = previews(&tagged, &[AVATAR]).unwrap();
        let Preview::WebP { width, height, .. } = out[0] else {
            panic!("expected a WebP preview");
        };
        assert_eq!((width, height), (64, 85));
    }

    #[test]
    fn non_images_and_avif_are_unsupported() {
        assert_eq!(
            previews(b"<html>hi</html>", &[AVATAR]),
            Err(Skip::Unsupported)
        );
        assert_eq!(previews(b"", &[AVATAR]), Err(Skip::Unsupported));
        // An AVIF (ftyp avif) header: not decoded here.
        let avif = b"\0\0\0\x1cftypavif\0\0\0\0avifmif1miaf\0\0\0\0";
        assert_eq!(previews(avif, &[AVATAR]), Err(Skip::Unsupported));
    }

    #[test]
    fn truncated_bytes_are_broken_not_a_panic() {
        let png = encode(&photo(64, 64), ImageFormat::Png);
        let cut = &png[..png.len() / 2];
        assert!(matches!(previews(cut, &[AVATAR]), Err(Skip::Broken(_))));
    }

    #[test]
    fn decompression_bombs_are_refused_before_decoding() {
        // A valid PNG header declaring 20000x20000 (400 MP) with no pixel data.
        let bomb = png_header(20_000, 20_000);
        assert!(matches!(
            previews(&bomb, &[AVATAR]),
            Err(Skip::TooLarge { .. })
        ));
        // Under the side limit but over the pixel limit: 10000x6000 = 60 MP.
        let wide = png_header(10_000, 6_000);
        assert!(matches!(
            previews(&wide, &[AVATAR]),
            Err(Skip::TooLarge { .. })
        ));
    }

    #[test]
    fn animated_gifs_keep_their_animation() {
        use image::codecs::gif::GifEncoder;
        use image::{Delay, Frame};
        let mut gif = Vec::new();
        {
            let mut encoder = GifEncoder::new(&mut gif);
            for shade in [0_u8, 255] {
                let frame = ImageBuffer::from_pixel(32, 32, Rgba([shade, shade, shade, 255]));
                encoder
                    .encode_frame(Frame::from_parts(
                        frame,
                        0,
                        0,
                        Delay::from_numer_denom_ms(100, 1),
                    ))
                    .unwrap();
            }
        }
        assert_eq!(previews(&gif, &[AVATAR]), Err(Skip::Animated));
    }

    /// PNG signature + IHDR (8-bit RGB) + an empty IDAT + IEND.
    fn png_header(width: u32, height: u32) -> Vec<u8> {
        fn chunk(out: &mut Vec<u8>, kind: [u8; 4], data: &[u8]) {
            out.extend_from_slice(&u32::try_from(data.len()).unwrap().to_be_bytes());
            let mut crc_input = kind.to_vec();
            crc_input.extend_from_slice(data);
            out.extend_from_slice(&crc_input);
            out.extend_from_slice(&crc32(&crc_input).to_be_bytes());
        }
        let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
        let mut ihdr = Vec::new();
        ihdr.extend_from_slice(&width.to_be_bytes());
        ihdr.extend_from_slice(&height.to_be_bytes());
        ihdr.extend_from_slice(&[8, 2, 0, 0, 0]);
        chunk(&mut out, *b"IHDR", &ihdr);
        chunk(&mut out, *b"IDAT", &[]);
        chunk(&mut out, *b"IEND", &[]);
        out
    }

    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = !0_u32;
        for byte in bytes {
            crc ^= u32::from(*byte);
            for _ in 0..8 {
                crc = if crc & 1 == 1 {
                    (crc >> 1) ^ 0xedb8_8320
                } else {
                    crc >> 1
                };
            }
        }
        !crc
    }

    /// Insert an APP1 Exif segment with Orientation = 6 after the SOI marker.
    fn with_orientation_6(jpeg: &[u8]) -> Vec<u8> {
        let tiff: &[u8] = &[
            b'M', b'M', 0, 42, 0, 0, 0, 8, // big-endian TIFF, IFD at 8
            0, 1, // one entry
            0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, // Orientation SHORT 1 = 6
            0, 0, 0, 0, // no next IFD
        ];
        let mut payload = b"Exif\0\0".to_vec();
        payload.extend_from_slice(tiff);
        let len = u16::try_from(payload.len() + 2).unwrap();
        let mut out = jpeg[..2].to_vec();
        out.extend_from_slice(&[0xff, 0xe1]);
        out.extend_from_slice(&len.to_be_bytes());
        out.extend_from_slice(&payload);
        out.extend_from_slice(&jpeg[2..]);
        out
    }
}
