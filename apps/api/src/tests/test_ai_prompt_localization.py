import pytest

from src.services.ai.agents._shared import load_prompt


def test_load_prompt_localization() -> None:
    # 1. Test loading English prompt (from root, fallback behavior)
    en_content = load_prompt("study_companion.md", "en-US")
    assert "study companion" in en_content.lower()

    # 2. Test loading Russian translation
    ru_content = load_prompt("study_companion.md", "ru-RU")
    assert "учебным помощником" in ru_content.lower()

    # 3. Test loading Kazakh translation
    kk_content = load_prompt("study_companion.md", "kk-KZ")
    assert "оқу көмекшісісіз" in kk_content.lower()


def test_load_prompt_language_code_fallback() -> None:
    # Test shorthand lang code fallback: e.g. "ru" -> "ru-RU"
    ru_short = load_prompt("study_companion.md", "ru")
    ru_full = load_prompt("study_companion.md", "ru-RU")
    assert ru_short == ru_full

    # Test shorthand lang code fallback: e.g. "kk" -> "kk-KZ"
    kk_short = load_prompt("study_companion.md", "kk")
    kk_full = load_prompt("study_companion.md", "kk-KZ")
    assert kk_short == kk_full


def test_load_prompt_unsupported_locale_fallback() -> None:
    # Test fallback to root (English) when translation doesn't exist for a requested language
    fallback_content = load_prompt("study_companion.md", "fr-FR")
    en_content = load_prompt("study_companion.md", "en-US")
    assert fallback_content == en_content


def test_load_prompt_file_not_found() -> None:
    # Test FileNotFoundError for non-existent files
    with pytest.raises(FileNotFoundError):
        load_prompt("does_not_exist_xyz.md", "ru-RU")
