from collections.abc import Mapping
from typing import TypeGuard

from src.db.courses.activities import ActivityRead
from src.db.courses.courses import CourseRead


def _is_node(value: object) -> TypeGuard[dict[str, object]]:
    return isinstance(value, dict) and all(isinstance(key, str) for key in value)


def _node_content(node: Mapping[str, object]) -> list[object]:
    content = node.get("content")
    return content if isinstance(content, list) else []


def _node_attrs(node: Mapping[str, object]) -> dict[str, object]:
    attrs = node.get("attrs")
    return attrs if isinstance(attrs, dict) and all(isinstance(key, str) for key in attrs) else {}


def _extract_inline_text(nodes: list[object]) -> str:
    """Recursively extract text from inline content nodes."""
    if not nodes:
        return ""
    parts = []
    for node in nodes:
        if isinstance(node, str):
            parts.append(node)
        elif _is_node(node):
            if "text" in node:
                parts.append(str(node["text"]))
            elif node.get("type") == "hardBreak":
                parts.append("\n")
            elif "content" in node:
                parts.append(_extract_inline_text(_node_content(node)))
    return "".join(parts)


def _extract_block_text(node: dict[str, object]) -> str:
    """Extract text from a block-level content node, handling all common types."""
    node_type = node.get("type", "")
    content = _node_content(node)
    attrs = _node_attrs(node)

    if node_type == "heading":
        level = attrs.get("level", 2)
        text = _extract_inline_text(content)
        heading_level = level if isinstance(level, int) else 2
        return f"{'#' * heading_level} {text}" if text else ""

    if node_type == "paragraph":
        return _extract_inline_text(content)

    if node_type in {"calloutInfo", "calloutWarning"}:
        label = "Note" if node_type == "calloutInfo" else "Warning"
        text = _extract_inline_text(content)
        return f"[{label}] {text}" if text else ""

    if node_type == "codeBlock":
        lang = attrs.get("language", "")
        text = _extract_inline_text(content)
        return f"```{lang}\n{text}\n```" if text else ""

    if node_type == "blockquote":
        lines: list[str] = []
        for child in content:
            if _is_node(child):
                child_text = _extract_block_text(child)
                if child_text:
                    lines.append(child_text)
        return "\n".join(f"> {line}" for line in lines) if lines else ""

    if node_type in {"bulletList", "orderedList"}:
        items = []
        for i, child in enumerate(content):
            if _is_node(child) and child.get("type") == "listItem":
                item_parts: list[str] = []
                for sub in _node_content(child):
                    if _is_node(sub):
                        sub_text = _extract_block_text(sub)
                        if sub_text:
                            item_parts.append(sub_text)
                item_text = " ".join(item_parts)
                prefix = f"{i + 1}." if node_type == "orderedList" else "-"
                if item_text:
                    items.append(f"{prefix} {item_text}")
        return "\n".join(items)

    if node_type == "table":
        rows = []
        for row_node in content:
            if _is_node(row_node) and row_node.get("type") == "tableRow":
                cells = []
                for cell_node in _node_content(row_node):
                    if _is_node(cell_node):
                        cell_parts = []
                        for sub in _node_content(cell_node):
                            if _is_node(sub):
                                sub_text = _extract_block_text(sub)
                                if sub_text:
                                    cell_parts.append(sub_text)
                        cells.append(" ".join(cell_parts).strip())
                rows.append(" | ".join(cells))
        return "\n".join(rows)

    if node_type == "image":
        alt = attrs.get("alt", "")
        return f"[Image: {alt}]" if alt else ""

    # Fallback: try to extract content from unknown node types
    if content:
        parts: list[str] = []
        for child in content:
            if _is_node(child):
                child_text = _extract_block_text(child)
                if child_text:
                    parts.append(child_text)
        if parts:
            return "\n".join(parts)
        return _extract_inline_text(content)
    return ""


def structure_activity_content_by_type(activity: ActivityRead | dict[str, object]) -> list[str]:
    """Extract structured sections from activity content.

    Returns a list of text sections preserving document order and structure.
    Each section is a non-empty string representing a block of content.
    """
    content_dict = activity if isinstance(activity, dict) else activity.content or {}

    if not content_dict or not isinstance(content_dict, dict):
        return []

    nodes = content_dict.get("content")
    if not isinstance(nodes, list):
        return []

    sections: list[str] = []
    for node in nodes:
        if not _is_node(node):
            continue
        text = _extract_block_text(node)
        if text and text.strip():
            sections.append(text.strip())

    return sections


def serialize_activity_text_to_ai_comprehensible_text(
    sections: list[str],
    course: CourseRead,
    activity: ActivityRead,
    is_activity_empty: bool = False,
) -> str:
    """Serialize activity content into a structured document for AI consumption."""
    header = f"Course: {course.name}\nLecture: {activity.name}"

    if is_activity_empty or not sections:
        return f"{header}\n\nThis lecture has no content yet."

    content_text = "\n\n".join(sections)
    return f"{header}\n\n{content_text}"
