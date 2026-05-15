
from urllib.parse import quote


def get_content_disposition_header(filename: str) -> str:
    """
    Generate a Content-Disposition header that safely handles non-ASCII characters
    according to RFC 6266.
    """
    try:
        filename.encode('latin-1')
        # If it's latin-1 compatible, we can use the standard filename parameter.
        safe_filename = filename.replace('"', '\\"')
        return f'attachment; filename="{safe_filename}"'
    except UnicodeEncodeError:
        # For non-latin-1 characters, we use filename* as per RFC 6266 / RFC 5987.
        # We also provide a fallback 'filename' with non-ASCII characters stripped.
        fallback_filename = filename.encode('ascii', 'ignore').decode('ascii') or "file"
        safe_fallback = fallback_filename.replace('"', '\\"')
        encoded_filename = quote(filename)
        return f'attachment; filename="{safe_fallback}"; filename*=UTF-8\'\'{encoded_filename}'
