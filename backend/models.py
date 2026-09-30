"""Strict Pydantic schemas for the Execution Truth Engine backend."""

from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum
from typing import ClassVar, Generic, TypeVar
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


def utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


class StrictModel(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True, extra="forbid", validate_assignment=True
    )


class Discipline(str, Enum):
    CIVIL = "CIVIL"
    PIPING = "PIPING"
    MECHANICAL = "MECHANICAL"
    ELECTRICAL = "ELECTRICAL"
    INSTRUMENTATION = "INSTRUMENTATION"
    HSE = "HSE"
    OTHER = "OTHER"


class SourceType(str, Enum):
    DPR = "DPR"
    SPREADSHEET = "SPREADSHEET"
    VOICE_TRANSCRIPT = "VOICE_TRANSCRIPT"
    SITE_DIARY = "SITE_DIARY"
    SUPERVISOR_UPDATE = "SUPERVISOR_UPDATE"
    OTHER = "OTHER"


class EventType(str, Enum):
    START = "START"
    PROGRESS = "PROGRESS"
    COMPLETE = "COMPLETE"
    DELAY = "DELAY"
    BLOCK = "BLOCK"
    RESUME = "RESUME"
    INSPECTION = "INSPECTION"
    TEST = "TEST"
    OTHER = "OTHER"


class ExecutionStatus(str, Enum):
    AUTO_APPROVED = "AUTO_APPROVED"
    REQUIRES_REVIEW = "REQUIRES_REVIEW"
    CONFLICT_DETECTED = "CONFLICT_DETECTED"


class SourceFactType(str, Enum):
    FACT = "FACT"
    INFERENCE = "INFERENCE"
    FORECAST = "FORECAST"


class ResolutionPath(str, Enum):
    EXPLICIT_ID = "EXPLICIT_ID"
    ASSET_LOOKUP = "ASSET_LOOKUP"
    KEYWORD_LOOKUP = "KEYWORD_LOOKUP"
    UNRESOLVED = "UNRESOLVED"


class BaselineActivity(StrictModel):
    """One L5/L6 node of the baseline schedule."""

    activity_id: str = Field(
        ..., min_length=5, max_length=100, pattern=r"^[A-Z]{2,4}-L[56]-\d{2,4}$"
    )
    activity_name: str = Field(..., min_length=3, max_length=500)
    discipline: Discipline
    asset_id: str | None = Field(default=None, max_length=150)
    line_number: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=255)
    planned_start: date
    planned_finish: date
    planned_duration: float = Field(
        ..., gt=0, le=3650, description="Planned duration in days"
    )
    predecessors: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_window(self) -> BaselineActivity:
        if self.planned_finish < self.planned_start:
            raise ValueError("planned_finish must not be earlier than planned_start")
        return self


class FieldEvidence(StrictModel):
    """Raw evidence arriving from the field before extraction."""

    evidence_id: str = Field(..., min_length=1, max_length=100)
    source_type: SourceType
    raw_text: str = Field(..., min_length=1, max_length=10_000)
    reported_progress_percent: float | None = Field(default=None, ge=0, le=100)
    reporter_id: str = Field(..., min_length=1, max_length=100)
    timestamp: datetime


class ExtractedEvent(StrictModel):
    """Deterministic extraction output for one sentence/claim of one evidence."""

    event_id: str
    evidence_id: str
    source_type: SourceType
    reporter_id: str
    timestamp: datetime
    raw_text: str
    sentence: str
    mentioned_activity_id: str | None = None
    mentioned_asset_id: str | None = None
    line_number: str | None = None
    discipline: Discipline | None = None
    location: str | None = None
    event_type: EventType = EventType.PROGRESS
    progress_percent: float | None = Field(default=None, ge=0, le=100)
    extraction_confidence: float = Field(..., ge=0, le=1)
    resolved_activity_id: str | None = None
    resolution_path: ResolutionPath = ResolutionPath.UNRESOLVED
    fact_type: SourceFactType = SourceFactType.FACT
    extraction_notes: list[str] = Field(default_factory=list)


class EvidenceLog(StrictModel):
    """One fused claim inside an ExecutionState."""

    evidence_id: str
    event_id: str
    source_type: SourceType
    reporter_id: str
    timestamp: datetime
    claimed_progress_percent: float | None = Field(default=None, ge=0, le=100)
    source_reliability: float = Field(..., ge=0, le=1)
    claim_summary: str


class TrustBreakdown(StrictModel):
    """Explainable components of the Execution Trust Score. Maxima sum to 100."""

    evidence_agreement: float = Field(..., ge=0, le=25)
    activity_match: float = Field(..., ge=0, le=25)
    temporal_consistency: float = Field(..., ge=0, le=20)
    source_reliability: float = Field(..., ge=0, le=15)
    historical_consistency: float = Field(..., ge=0, le=15)

    MAX_EVIDENCE_AGREEMENT: ClassVar[float] = 25.0
    MAX_ACTIVITY_MATCH: ClassVar[float] = 25.0
    MAX_TEMPORAL_CONSISTENCY: ClassVar[float] = 20.0
    MAX_SOURCE_RELIABILITY: ClassVar[float] = 15.0
    MAX_HISTORICAL_CONSISTENCY: ClassVar[float] = 15.0


class ConflictDetail(StrictModel):
    """Contradiction summary attached when claims disagree."""

    spread_percent: float = Field(..., ge=0)
    agreement_percent: float = Field(..., ge=0, le=100)
    low_claim_percent: float | None = None
    high_claim_percent: float | None = None
    description: str
    severity: str = "MEDIUM"


class ExecutionState(StrictModel):
    """Fused, auditable execution truth for a single schedule activity."""

    activity_id: str
    activity_name: str
    fused_progress_percent: float = Field(..., ge=0, le=100)
    trust_score: float = Field(..., ge=0, le=100)
    status: ExecutionStatus
    fact_type: SourceFactType = SourceFactType.INFERENCE
    breakdown: TrustBreakdown
    evidence_logs: list[EvidenceLog] = Field(default_factory=list)
    conflict: ConflictDetail | None = None
    explanation: list[str] = Field(default_factory=list)
    has_evidence: bool = False
    evaluated_at: datetime | None = None


class FusionConfig(StrictModel):
    """Configurable decision thresholds for the fusion engine."""

    agreement_tolerance_pct: float = Field(default=5.0, ge=0, le=100)
    conflict_spread_pct: float = Field(default=10.0, ge=0, le=100)
    auto_approve_min_trust: float = Field(default=90.0, ge=0, le=100)
    review_min_trust: float = Field(default=70.0, ge=0, le=100)
    temporal_grace_days: int = Field(default=5, ge=0, le=60)

    @model_validator(mode="after")
    def _validate_thresholds(self) -> FusionConfig:
        if self.conflict_spread_pct < self.agreement_tolerance_pct:
            raise ValueError("conflict_spread_pct must be >= agreement_tolerance_pct")
        if self.review_min_trust > self.auto_approve_min_trust:
            raise ValueError("review_min_trust must be <= auto_approve_min_trust")
        return self


class ProcessResult(StrictModel):
    """Full engine output for one processing run."""

    events: list[ExtractedEvent]
    states: dict[str, ExecutionState]
    unmatched_events: list[ExtractedEvent]
    conflict_activity_ids: list[str]
    processed_evidence_count: int


class ScheduleLoadResult(StrictModel):
    activities_loaded: int
    duplicate_activity_ids: list[str] = Field(default_factory=list)


class EvidenceSubmitResult(StrictModel):
    evidence_accepted: int
    duplicate_evidence_ids: list[str] = Field(default_factory=list)


class ScheduleStateSummary(StrictModel):
    total_activities: int
    evaluated: int
    auto_approved: int
    requires_review: int
    conflict_detected: int
    unmatched_events: int


class ScheduleStateResponse(StrictModel):
    states: list[ExecutionState]
    summary: ScheduleStateSummary


class HealthResponse(StrictModel):
    status: str = "ok"
    service: str = "execution-truth-engine"


class Meta(StrictModel):
    request_id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: datetime = Field(default_factory=utc_now)


class ErrorDetail(StrictModel):
    code: str
    message: str
    details: dict[str, str] = Field(default_factory=dict)


T = TypeVar("T")


class APIResponse(StrictModel, Generic[T]):
    success: bool = True
    data: T
    meta: Meta = Field(default_factory=Meta)


class ErrorResponse(StrictModel):
    success: bool = False
    error: ErrorDetail
    meta: Meta = Field(default_factory=Meta)


__all__ = [
    "APIResponse",
    "BaselineActivity",
    "ConflictDetail",
    "Discipline",
    "ErrorDetail",
    "ErrorResponse",
    "EventType",
    "EvidenceLog",
    "EvidenceSubmitResult",
    "ExecutionState",
    "ExecutionStatus",
    "ExtractedEvent",
    "FieldEvidence",
    "FusionConfig",
    "HealthResponse",
    "Meta",
    "ProcessResult",
    "ResolutionPath",
    "ScheduleLoadResult",
    "ScheduleStateResponse",
    "ScheduleStateSummary",
    "SourceFactType",
    "SourceType",
    "StrictModel",
    "TrustBreakdown",
    "utc_now",
]
