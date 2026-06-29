from __future__ import annotations

from pathlib import Path

PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"


def load_prompt(name: str, locale: str | None = None) -> str:
    if locale:
        locale_str = locale.strip()
        # 1. Try exact locale directory (e.g. "ru-RU")
        target_path = PROMPT_DIR / locale_str / name
        if target_path.is_file():
            return target_path.read_text(encoding="utf-8")

        # 2. Try language code mapping (e.g. "ru" -> "ru-RU")
        lang_code = locale_str.split("-")[0].lower()
        mapping = {"ru": "ru-RU", "kk": "kk-KZ", "en": "en-US"}
        if lang_code in mapping:
            target_path = PROMPT_DIR / mapping[lang_code] / name
            if target_path.is_file():
                return target_path.read_text(encoding="utf-8")

    # 3. Fallback to the root prompt directory
    fallback_path = PROMPT_DIR / name
    if fallback_path.is_file():
        return fallback_path.read_text(encoding="utf-8")

    # 4. Fallback to the default "ru-RU" locale directory
    default_path = PROMPT_DIR / "ru-RU" / name
    if default_path.is_file():
        return default_path.read_text(encoding="utf-8")

    err_msg = f"Файл подсказки '{name}' не найден в директории '{PROMPT_DIR}' для локали '{locale}' или резервных вариантов."
    raise FileNotFoundError(err_msg)


def clipped(text: str, *, limit: int = 12_000) -> str:
    return text if len(text) <= limit else f"{text[:limit]}\n\n[Контекст обрезан до {limit} символов]"
