from __future__ import annotations

from pathlib import Path

PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"


def load_prompt(name: str) -> str:
    return (PROMPT_DIR / name).read_text(encoding="utf-8")


def clipped(text: str, *, limit: int = 12_000) -> str:
    return text if len(text) <= limit else f"{text[:limit]}\n\n[Context clipped to {limit} characters]"
