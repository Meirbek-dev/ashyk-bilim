from __future__ import annotations

from collections.abc import Iterable

from pydantic import Field

from src.db.strict_base_model import PydanticStrictBaseModel
from src.types import JsonObject


class AIContextSource(PydanticStrictBaseModel):
    citation_id: str
    label: str
    source_type: str
    source_uuid: str | None = None
    excerpt: str
    metadata: JsonObject = Field(default_factory=dict)


class AIContextBundle(PydanticStrictBaseModel):
    text: str
    sources: list[AIContextSource] = Field(default_factory=list)


class AICitationValidationResult(PydanticStrictBaseModel):
    valid_citations: list[JsonObject] = Field(default_factory=list)
    invalid_citations: list[JsonObject] = Field(default_factory=list)
    source_count: int = 0

    @property
    def metadata(self) -> JsonObject:
        return {
            "valid_count": len(self.valid_citations),
            "invalid_count": len(self.invalid_citations),
            "source_count": self.source_count,
            "invalid_citation_ids": [
                str(citation.get("citation_id") or citation.get("source_uuid") or "unknown")
                for citation in self.invalid_citations
            ],
        }


def render_context_bundle(bundle: AIContextBundle) -> str:
    if not bundle.sources:
        return bundle.text
    source_lines = ["", "Citation sources:"]
    for source in bundle.sources:
        source_lines.extend(
            [
                f"[{source.citation_id}] {source.source_type} | {source.source_uuid or 'untracked'} | {source.label}",
                f"Excerpt: {source.excerpt}",
            ]
        )
    return f"{bundle.text}\n" + "\n".join(source_lines)


def validate_citations(citations: Iterable[JsonObject], sources: Iterable[AIContextSource]) -> AICitationValidationResult:
    source_list = list(sources)
    valid_ids = {source.citation_id for source in source_list}
    valid_uuids = {source.source_uuid for source in source_list if source.source_uuid}
    valid: list[JsonObject] = []
    invalid: list[JsonObject] = []
    for citation in citations:
        citation_id = citation.get("citation_id")
        source_uuid = citation.get("source_uuid")
        if citation_id in valid_ids or source_uuid in valid_uuids:
            valid.append(citation)
        else:
            invalid.append({**citation, "validation_error": "citation_not_in_context"})
    return AICitationValidationResult(valid_citations=valid, invalid_citations=invalid, source_count=len(source_list))
