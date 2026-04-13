"""SSE serialization utilities for AI streaming responses."""

import json

from src.services.ai.models import SSEEvent


def format_sse_message(data: SSEEvent | dict[str, object]) -> str:
    payload = data.model_dump(mode="json") if hasattr(data, "model_dump") else data
    encoded = json.dumps(payload, ensure_ascii=False).replace("\n", "\\n")
    return f"data: {encoded}\n\n"
