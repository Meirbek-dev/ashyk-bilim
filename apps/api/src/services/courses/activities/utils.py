from src.db.courses.activities import ActivityRead
from src.db.courses.courses import CourseRead


def _extract_inline_text(nodes: list) -> str:
    """Recursively extract text from inline content nodes."""
    if not nodes:
        return ""
    parts = []
    for node in nodes:
        if isinstance(node, str):
            parts.append(node)
        elif isinstance(node, dict):
            if "text" in node:
                parts.append(node["text"])
            elif node.get("type") == "hardBreak":
                parts.append("\n")
            elif "content" in node:
                parts.append(_extract_inline_text(node["content"]))
    return "".join(parts)


def _extract_block_text(node: dict) -> str:
    """Extract text from a block-level content node, handling all common types."""
    node_type = node.get("type", "")
    content = node.get("content", [])
    attrs = node.get("attrs", {})

    if node_type == "heading":
        level = attrs.get("level", 2)
        text = _extract_inline_text(content)
        return f"{'#' * level} {text}" if text else ""

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
        lines = []
        for child in content:
            if isinstance(child, dict):
                child_text = _extract_block_text(child)
                if child_text:
                    lines.append(child_text)
        return "\n".join(f"> {line}" for line in lines) if lines else ""

    if node_type in {"bulletList", "orderedList"}:
        items = []
        for i, child in enumerate(content):
            if isinstance(child, dict) and child.get("type") == "listItem":
                item_parts = []
                for sub in child.get("content", []):
                    if isinstance(sub, dict):
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
            if isinstance(row_node, dict) and row_node.get("type") == "tableRow":
                cells = []
                for cell_node in row_node.get("content", []):
                    if isinstance(cell_node, dict):
                        cell_parts = []
                        for sub in cell_node.get("content", []):
                            if isinstance(sub, dict):
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
        parts = []
        for child in content:
            if isinstance(child, dict):
                child_text = _extract_block_text(child)
                if child_text:
                    parts.append(child_text)
        if parts:
            return "\n".join(parts)
        return _extract_inline_text(content)
    return ""


def structure_activity_content_by_type(activity: ActivityRead | dict) -> list[str]:
    """Extract structured sections from activity content.

    Returns a list of text sections preserving document order and structure.
    Each section is a non-empty string representing a block of content.
    """
    if isinstance(activity, dict):
        content_dict = activity
    else:
        content_dict = activity.content or {}

    if not content_dict or not isinstance(content_dict, dict):
        return []

    nodes = content_dict.get("content")
    if not isinstance(nodes, list):
        return []

    sections: list[str] = []
    for node in nodes:
        if not isinstance(node, dict):
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
