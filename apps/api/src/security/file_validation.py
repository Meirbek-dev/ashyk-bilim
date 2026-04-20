"""
Secure file validation utilities.
Blocks SVG files entirely to prevent XSS attacks (CWE-79).
Validates file types and content to prevent unrestricted uploads (CWE-434).
"""

import re
from typing import List, Optional, Tuple

from fastapi import HTTPException, UploadFile


def validate_image_content(content: bytes) -> bool:
    """Validate image content using magic bytes."""
    if len(content) < 12:
        return False

    # Check common image format magic bytes
    magic_bytes = content[:12]

    # JPEG: FF D8 FF
    if magic_bytes.startswith(b"\xff\xd8\xff"):
        return True

    # PNG: 89 50 4E 47 0D 0A 1A 0A
    if magic_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return True

    # GIF: GIF87a or GIF89a
    if magic_bytes.startswith((b"GIF87a", b"GIF89a")):
        return True

    # AVIF: ftyp..avif / avis
    if magic_bytes[4:8] == b"ftyp" and magic_bytes[8:12] in (b"avif", b"avis"):
        return True

    # WebP: RIFF....WEBP
    return bool(magic_bytes.startswith(b"RIFF") and b"WEBP" in content[:16])


def validate_audio_content(content: bytes) -> bool:
    """Validate audio content using magic bytes."""
    if len(content) < 12:
        return False

    magic_bytes = content[:12]

    # MP3: ID3 marker or frame header
    if magic_bytes.startswith(b"ID3") or magic_bytes[0] == 0xFF:
        return True

    # WAV: RIFF....WAVE
    if magic_bytes.startswith(b"RIFF") and content[8:12] == b"WAVE":
        return True

    # OGG: OggS header
    if magic_bytes.startswith(b"OggS"):
        return True

    # M4A: MP4 container with audio brand
    return magic_bytes[4:8] == b"ftyp" and magic_bytes[8:12] in (
        b"M4A ",
        b"isom",
        b"mp42",
        b"mp41",
    )


def validate_video_content(content: bytes) -> bool:
    """Validate video content using magic bytes."""
    if len(content) < 12:
        return False

    magic_bytes = content[:12]

    # MP4 / MOV: starts with specific ftyp box signatures
    if magic_bytes[4:8] == b"ftyp" and (
        b"mp4" in magic_bytes[8:12]
        or b"M4V" in magic_bytes[8:12]
        or b"isom" in magic_bytes[8:12]
        or magic_bytes[8:12] == b"qt  "
    ):
        return True

    # AVI: RIFF....AVI
    if magic_bytes.startswith(b"RIFF") and content[8:12] == b"AVI ":
        return True

    # FLV: FLV header
    if magic_bytes.startswith(b"FLV"):
        return True

    # WebM / MKV: EBML header
    return bool(magic_bytes.startswith(b"\x1aE\xdf\xa3"))


def validate_document_content(content: bytes) -> bool:
    """Validate document and archive content using magic bytes."""
    if len(content) < 4:
        return False

    # PDF: %PDF-
    if content.startswith(b"%PDF-"):
        return True

    # PPTX / DOCX / ZIP: ZIP container header
    if (
        content.startswith(b"PK\x03\x04")
        or content.startswith(b"PK\x05\x06")
        or content.startswith(b"PK\x07\x08")
    ):
        return True

    # VTT: WEBVTT
    if content.startswith(b"WEBVTT"):
        return True

    # SRT: plain text subtitle
    try:
        decoded = content.decode("utf-8-sig")
        return bool(decoded.strip())
    except UnicodeDecodeError:
        return False


# File type configurations
FILE_TYPES = {
    "image": {
        "extensions": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"],
        "mime_types": [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/avif",
        ],
        "max_size": 10 * 1024 * 1024,  # 10MB
        "validator": validate_image_content,
    },
    "video": {
        "extensions": [".mp4", ".webm", ".mkv", ".mov", ".avi", ".flv"],
        "mime_types": [
            "video/mp4",
            "video/webm",
            "video/x-matroska",
            "video/quicktime",
            "video/x-msvideo",
            "video/x-flv",
        ],
        "max_size": 1000 * 1024 * 1024,  # 1000MB
        "validator": validate_video_content,
    },
    "audio": {
        "extensions": [".mp3", ".wav", ".ogg", ".m4a", ".opus", ".oga"],
        "mime_types": [
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
            "audio/ogg",
            "audio/opus",
            "audio/mp4",
            "audio/x-m4a",
        ],
        "max_size": 100 * 1024 * 1024,  # 100MB
        "validator": validate_audio_content,
    },
    "document": {
        "extensions": [".pdf", ".pptx", ".docx", ".zip", ".srt", ".vtt", ".txt"],
        "mime_types": [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/zip",
            "application/x-zip-compressed",
            "text/vtt",
            "text/plain",
            "application/octet-stream",
        ],
        "max_size": 100 * 1024 * 1024,  # 100MB
        "validator": validate_document_content,
    },
}


def validate_upload(
    file: UploadFile, allowed_types: list[str], max_size: int | None = None
) -> tuple[str, bytes]:
    """
    Validate uploaded file for security and type compliance.

    Args:
        file: The uploaded file
        allowed_types: List of allowed file types ('image', 'video', 'audio', 'document')
        max_size: Maximum file size in bytes (auto-determined if None)

    Returns:
        Tuple of (mime_type, file_content)

    Raises:
        HTTPException: If validation fails
    """
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Read file content once
    content = file.file.read()
    file.file.seek(0)

    # Get file extension and block SVG explicitly
    ext = "." + file.filename.split(".")[-1].lower()
    if ext == ".svg":
        raise HTTPException(
            status_code=415, detail="SVG files are not allowed for security reasons"
        )

    # Find matching file type configuration
    config = None
    for file_type in allowed_types:
        if file_type in FILE_TYPES and ext in FILE_TYPES[file_type]["extensions"]:
            config = FILE_TYPES[file_type]
            break

    if not config:
        allowed_exts = [
            ext
            for t in allowed_types
            for ext in FILE_TYPES.get(t, {}).get("extensions", [])
        ]
        raise HTTPException(
            status_code=415, detail=f"File type not allowed. Allowed: {allowed_exts}"
        )

    # Check file size
    size_limit = max_size or config["max_size"]
    if len(content) > size_limit:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) / 1024 / 1024:.1f}MB > {size_limit / 1024 / 1024:.1f}MB)",
        )

    # Validate file content
    if not config["validator"](content):
        raise HTTPException(
            status_code=415, detail="File appears to be corrupted or invalid"
        )

    return file.content_type, content


def get_safe_filename(original_filename: str, prefix: str = "") -> str:
    """Generate a safe filename with UUID and validated extension."""
    if not original_filename:
        return f"{prefix}.bin"

    ext = original_filename.rsplit(".", maxsplit=1)[-1].lower()
    # Only allow safe alphanumeric extensions
    if re.match(r"^[a-zA-Z0-9]+$", ext):
        return f"{prefix}.{ext}"

    return f"{prefix}.bin"
