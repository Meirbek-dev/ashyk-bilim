from __future__ import annotations

from typing import Literal

from pydantic import Field

from src.db.strict_base_model import PydanticStrictBaseModel
from src.types import JsonObject

AIWorkState = Literal[
    "idle",
    "confirming",
    "queued",
    "collecting_context",
    "running",
    "checking_evidence",
    "complete",
    "needs_human_review",
    "failed",
    "cancelled",
]


class AICitation(PydanticStrictBaseModel):
    citation_id: str
    label: str
    source_type: str
    source_uuid: str | None = None
    excerpt: str
    confidence: float = Field(default=0.75, ge=0, le=1)


class AIKnowledgeGap(PydanticStrictBaseModel):
    concept: str
    severity: Literal["low", "medium", "high"]
    evidence: str
    remediation_goal: str


class AIRecommendation(PydanticStrictBaseModel):
    title: str
    rationale: str
    priority: Literal["low", "medium", "high"]
    action: str


class CourseQualityReport(PydanticStrictBaseModel):
    public_score: int = Field(ge=0, le=100)
    summary: str
    strengths: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    recommendations: list[AIRecommendation] = Field(default_factory=list)
    citations: list[AICitation] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"] = "medium"
    language: str = "auto"


class SubmissionAnalysisReport(PydanticStrictBaseModel):
    summary: str
    knowledge_gaps: list[AIKnowledgeGap] = Field(default_factory=list)
    next_action: str
    citations: list[AICitation] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"] = "medium"
    language: str = "auto"


class RemediationQuestion(PydanticStrictBaseModel):
    prompt: str
    choices: list[str] = Field(default_factory=list)
    answer: str
    explanation: str


class RemediationBundle(PydanticStrictBaseModel):
    title: str
    learning_objectives: list[str] = Field(default_factory=list)
    micro_lecture_markdown: str
    practice_questions: list[RemediationQuestion] = Field(default_factory=list)
    pass_threshold: int = Field(default=70, ge=0, le=100)
    citations: list[AICitation] = Field(default_factory=list)
    language: str = "auto"


class StudyCompanionAnswer(PydanticStrictBaseModel):
    mode: Literal["explain", "practice", "flashcards", "summarize", "deepen"]
    answer_markdown: str
    practice_items: list[RemediationQuestion] = Field(default_factory=list)
    flashcards: list[JsonObject] = Field(default_factory=list)
    follow_up_suggestions: list[str] = Field(default_factory=list)
    citations: list[AICitation] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"] = "medium"


class LectureSuggestion(PydanticStrictBaseModel):
    suggestion_id: str
    location: str
    title: str
    rationale: str
    replacement_markdown: str | None = None
    priority: Literal["low", "medium", "high"]


class LectureReviewReport(PydanticStrictBaseModel):
    summary: str
    suggestions: list[LectureSuggestion] = Field(default_factory=list)
    citations: list[AICitation] = Field(default_factory=list)
    language: str = "auto"


class CourseQAAnswer(PydanticStrictBaseModel):
    answer_markdown: str
    citations: list[AICitation] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"] = "medium"
    out_of_scope: bool = False
    follow_up_suggestions: list[str] = Field(default_factory=list)


class AIRunEnvelope(PydanticStrictBaseModel):
    run_uuid: str
    state: AIWorkState
    model_name: str | None = None
    artifact: JsonObject = Field(default_factory=dict)
    citations: list[AICitation] = Field(default_factory=list)
    audit: JsonObject = Field(default_factory=dict)
