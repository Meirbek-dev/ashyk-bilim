import re
import secrets
import unicodedata

USERNAME_BASE_MAX_LENGTH = 20


def _ascii_username_base(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii").lower()
    dotted = re.sub(r"[^a-z0-9]+", ".", ascii_only)
    collapsed = re.sub(r"\.+", ".", dotted)
    return collapsed.strip(".")


def build_generated_username(
    *parts: str | None,
    email: str = "",
    suffix: str | None = None,
) -> str:
    raw_name = ".".join(part.strip() for part in parts if part and part.strip())
    base = _ascii_username_base(raw_name)

    if not base and email:
        base = _ascii_username_base(email.split("@", 1)[0])

    base = _ascii_username_base(base[:USERNAME_BASE_MAX_LENGTH]) or "user"
    resolved_suffix = suffix or str(1000 + secrets.randbelow(9000))
    return f"{base}.{resolved_suffix}"
