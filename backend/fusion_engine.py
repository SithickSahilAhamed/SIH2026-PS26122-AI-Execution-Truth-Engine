"""Execution Truth Engine: extraction, evidence fusion, trust scoring, conflict detection.

Deterministic by design (regex/keyword extraction + explainable weighted fusion) so the
demo never depends on an external LLM API.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from statistics import median
from uuid import NAMESPACE_OID, uuid5

from models import (
    BaselineActivity,
    ConflictDetail,
    Discipline,
    EventType,
    EvidenceLog,
    ExecutionState,
    ExecutionStatus,
    ExtractedEvent,
    FieldEvidence,
    FusionConfig,
    ProcessResult,
    ResolutionPath,
    SourceFactType,
    SourceType,
    TrustBreakdown,
    utc_now,
)

ACTIVITY_ID_RE = re.compile(r"\b([A-Z]{2,4}-L[56]-\d{2,4})\b")
ASSET_ID_RE = re.compile(r"\b([A-Z]{1,3}-\d{3,4})\b")
LINE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bline\s*#?\s*(\d{1,3})\b", re.IGNORECASE),
    re.compile(r"\b(\d{1,3})\s*(?:inch|in|\"|mm)\b", re.IGNORECASE),
)
PERCENT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(\d{1,3}(?:\.\d+)?)\s*%"),
    re.compile(r"\b(\d{1,3}(?:\.\d+)?)\s*(?:percent|pct)\b", re.IGNORECASE),
)
COMPLETE_RE = re.compile(
    r"\b(completed|completion|finished|done|erected|installed|executed|cleared|signed[\s-]off)\b",
    re.IGNORECASE,
)
START_RE = re.compile(
    r"\b(started|began|commenced|kicked[\s-]off|mobilized)\b", re.IGNORECASE
)
DELAY_RE = re.compile(
    r"\b(delayed|behind[\s-]schedule|slipped|deferred|late)\b", re.IGNORECASE
)
BLOCK_RE = re.compile(r"\b(blocked|held[\s-]up|stopped|on[\s-]hold)\b", re.IGNORECASE)
PENDING_RE = re.compile(
    r"\b(pending|not[\s-]started|awaiting|yet[\s-]to[\s-]start)\b", re.IGNORECASE
)
PARTIAL_RE = re.compile(
    r"\b(halfway|half[\s-]done|partially|in[\s-]progress|under[\s-]way)\b",
    re.IGNORECASE,
)
INSPECTION_RE = re.compile(
    r"\b(inspected|inspection|itp|punch[\s-]list)\b", re.IGNORECASE
)
TEST_RE = re.compile(
    r"\b(hydrotest|hydro[\s-]test|pressure[\s-]test|commissioning|loop[\s-]check)\b",
    re.IGNORECASE,
)
LOCATION_RE = re.compile(
    r"\b(unit\s+[A-Z0-9-]+|area\s+[A-Z0-9-]+|battery[\s-]limit|plot\s*\d+)\b",
    re.IGNORECASE,
)

DISCIPLINE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "PIPING": (
        "pipe",
        "piping",
        "spool",
        "flange",
        "elbow",
        "weld",
        "line",
        "isometric",
    ),
    "CIVIL": (
        "civil",
        "concrete",
        "foundation",
        "excavation",
        "backfill",
        "raft",
        "plinth",
    ),
    "MECHANICAL": (
        "mechanical",
        "valve",
        "pump",
        "compressor",
        "vessel",
        "skid",
        "align",
    ),
    "ELECTRICAL": (
        "electrical",
        "cable",
        "tray",
        "motor",
        "switchgear",
        "earthing",
        "db ",
    ),
    "INSTRUMENTATION": (
        "instrument",
        "loop",
        "calibration",
        "transmitter",
        "plc",
        "dcs",
        "etag",
    ),
    "HSE": ("hse", "safety", "permit", "toolbox", "fire", "gas detection"),
}

SOURCE_RELIABILITY: dict[SourceType, float] = {
    SourceType.DPR: 0.95,
    SourceType.SPREADSHEET: 0.90,
    SourceType.SITE_DIARY: 0.85,
    SourceType.SUPERVISOR_UPDATE: 0.80,
    SourceType.VOICE_TRANSCRIPT: 0.65,
    SourceType.OTHER: 0.50,
}


class UnknownActivityError(KeyError):
    """Raised when evaluate_truth targets an activity missing from the baseline schedule."""


class ExecutionTruthEngine:
    """Fuses heterogeneous field evidence into an auditable execution state per activity."""

    def __init__(
        self,
        activities: Sequence[BaselineActivity] | None = None,
        config: FusionConfig | None = None,
    ) -> None:
        self.config: FusionConfig = config or FusionConfig()
        self._activities: dict[str, BaselineActivity] = {}
        self._asset_index: dict[str, str] = {}
        self._keyword_index: dict[str, str] = {}
        self._history: dict[str, ExecutionState] = {}
        self._load_activities(activities or [])

    def load_schedule(self, activities: Sequence[BaselineActivity]) -> None:
        """Replace the in-memory baseline schedule and clear derived history."""
        self._activities.clear()
        self._asset_index.clear()
        self._keyword_index.clear()
        self._history.clear()
        self._load_activities(activities)

    @property
    def activities(self) -> list[BaselineActivity]:
        return list(self._activities.values())

    def get_activity(self, activity_id: str) -> BaselineActivity | None:
        return self._activities.get(activity_id)

    def _load_activities(self, activities: Sequence[BaselineActivity]) -> None:
        for activity in activities:
            self._activities[activity.activity_id] = activity
            if activity.asset_id:
                self._asset_index.setdefault(
                    _normalize_asset(activity.asset_id), activity.activity_id
                )
            for token in _activity_tokens(activity):
                self._keyword_index.setdefault(token, activity.activity_id)

    def extract_events(
        self, evidence_list: Sequence[FieldEvidence]
    ) -> list[ExtractedEvent]:
        """Parse each evidence into sentence-level structured events (mock-LLM step)."""
        events: list[ExtractedEvent] = []
        for evidence in evidence_list:
            events.extend(self._extract_from_evidence(evidence))
        return events

    def _extract_from_evidence(self, evidence: FieldEvidence) -> list[ExtractedEvent]:
        sentences = [
            s.strip() for s in _split_sentences(evidence.raw_text) if s.strip()
        ]
        structured_override = evidence.reported_progress_percent is not None
        events: list[ExtractedEvent] = []
        for index, sentence in enumerate(sentences):
            event = self._extract_sentence(evidence, sentence, index)
            if event is None:
                continue
            if structured_override and event.progress_percent is None:
                event.progress_percent = evidence.reported_progress_percent
                event.extraction_notes.append(
                    "Structured progress column used instead of text parsing"
                )
            events.append(event)
        if not events and structured_override:
            events.append(
                self._build_event(
                    evidence=evidence,
                    sentence=evidence.raw_text,
                    index=0,
                    mentioned_activity_id=None,
                    mentioned_asset_id=None,
                    line_number=None,
                    discipline=None,
                    location=None,
                    event_type=EventType.PROGRESS,
                    progress=evidence.reported_progress_percent,
                    notes=["No textual claim found; used structured progress column"],
                )
            )
        return events

    def _extract_sentence(
        self,
        evidence: FieldEvidence,
        sentence: str,
        index: int,
    ) -> ExtractedEvent | None:
        mentioned_activity_id = _find_activity_id(sentence)
        mentioned_asset_id = _find_asset_id(sentence)
        line_number = _find_line_number(sentence)
        discipline = _infer_discipline(sentence)
        location = _find_location(sentence)
        event_type = _infer_event_type(sentence)
        progress = _parse_progress(sentence, event_type)
        if progress is not None and progress < 100 and event_type is EventType.COMPLETE:
            event_type = EventType.PROGRESS

        has_signal = any(
            (
                mentioned_activity_id,
                mentioned_asset_id,
                progress is not None,
                event_type is not EventType.PROGRESS,
                discipline is not None,
            )
        )
        if not has_signal:
            return None
        return self._build_event(
            evidence=evidence,
            sentence=sentence,
            index=index,
            mentioned_activity_id=mentioned_activity_id,
            mentioned_asset_id=mentioned_asset_id,
            line_number=line_number,
            discipline=discipline,
            location=location,
            event_type=event_type,
            progress=progress,
            notes=[],
        )

    def _build_event(
        self,
        *,
        evidence: FieldEvidence,
        sentence: str,
        index: int,
        mentioned_activity_id: str | None,
        mentioned_asset_id: str | None,
        line_number: str | None,
        discipline: Discipline | None,
        location: str | None,
        event_type: EventType,
        progress: float | None,
        notes: list[str],
    ) -> ExtractedEvent:
        resolved_id: str | None = None
        path = ResolutionPath.UNRESOLVED
        confidence = 0.35

        if mentioned_activity_id is not None:
            if mentioned_activity_id in self._activities:
                resolved_id = mentioned_activity_id
                path = ResolutionPath.EXPLICIT_ID
                confidence += 0.35
            else:
                notes.append(
                    f"Activity id {mentioned_activity_id} not present in baseline schedule"
                )

        if resolved_id is None and mentioned_asset_id is not None:
            candidate = self._asset_index.get(_normalize_asset(mentioned_asset_id))
            if candidate is not None:
                resolved_id = candidate
                path = ResolutionPath.ASSET_LOOKUP
                confidence += 0.25
            else:
                notes.append(f"Asset {mentioned_asset_id} has no baseline activity")

        if resolved_id is None and discipline is not None and path is ResolutionPath.UNRESOLVED:
            keyword_hit = _keyword_lookup(sentence, self._keyword_index)
            if keyword_hit is not None:
                resolved_id = keyword_hit
                path = ResolutionPath.KEYWORD_LOOKUP
                confidence += 0.15

        if progress is not None:
            confidence += 0.05
        if discipline is not None:
            confidence += 0.05
        if line_number is not None:
            confidence += 0.05
        if resolved_id is None:
            confidence = min(confidence, 0.55)
            notes.append("No baseline activity matched this claim")

        return ExtractedEvent(
            event_id=f"EVT-{uuid5(NAMESPACE_OID, f'{evidence.evidence_id}:{index}').hex[:12].upper()}",
            evidence_id=evidence.evidence_id,
            source_type=evidence.source_type,
            reporter_id=evidence.reporter_id,
            timestamp=evidence.timestamp,
            raw_text=evidence.raw_text,
            sentence=sentence,
            mentioned_activity_id=mentioned_activity_id,
            mentioned_asset_id=mentioned_asset_id,
            line_number=line_number,
            discipline=discipline,
            location=location,
            event_type=event_type,
            progress_percent=round(progress, 1) if progress is not None else None,
            extraction_confidence=round(min(confidence, 0.99), 2),
            resolved_activity_id=resolved_id,
            resolution_path=path,
            fact_type=SourceFactType.FACT,
            extraction_notes=notes,
        )

    def evaluate_truth(
        self,
        activity_id: str,
        extracted_events: Sequence[ExtractedEvent],
    ) -> ExecutionState:
        """Fuse all claims for one activity into an ExecutionState with an explained trust score."""
        activity = self._activities.get(activity_id)
        if activity is None:
            raise UnknownActivityError(activity_id)

        relevant = [
            event
            for event in extracted_events
            if event.resolved_activity_id == activity_id
            or event.mentioned_activity_id == activity_id
        ]
        if not relevant:
            return self._empty_state(activity)

        logs: list[EvidenceLog] = []
        for event in relevant:
            logs.append(
                EvidenceLog(
                    evidence_id=event.evidence_id,
                    event_id=event.event_id,
                    source_type=event.source_type,
                    reporter_id=event.reporter_id,
                    timestamp=event.timestamp,
                    claimed_progress_percent=event.progress_percent,
                    source_reliability=SOURCE_RELIABILITY.get(event.source_type, 0.5),
                    claim_summary=event.sentence,
                )
            )

        claims = [
            log.claimed_progress_percent
            for log in logs
            if log.claimed_progress_percent is not None
        ]
        explanation: list[str] = []
        conflict: ConflictDetail | None = None

        fused_progress = float(median(claims)) if claims else 0.0

        if claims:
            spread = round(max(claims) - min(claims), 1)
            agreement_percent = _agreement_percent(
                claims, tolerance=self.config.agreement_tolerance_pct
            )
            agreement_component = round(25.0 * agreement_percent / 100.0, 1)
            explanation.append(
                f"Cross-source agreement {agreement_percent:.0f}% across {len(claims)} progress claims "
                f"(spread {spread} pts, tolerance {self.config.agreement_tolerance_pct} pts)"
            )
            if spread > self.config.agreement_tolerance_pct:
                conflict = ConflictDetail(
                    spread_percent=spread,
                    agreement_percent=agreement_percent,
                    low_claim_percent=min(claims),
                    high_claim_percent=max(claims),
                    description=(
                        f"Evidence disagrees on {activity_id}: claims range "
                        f"{min(claims):.0f}%–{max(claims):.0f}% "
                        f"(spread {spread} pts exceeds {self.config.agreement_tolerance_pct} pt tolerance)"
                    ),
                    severity="HIGH"
                    if spread > self.config.conflict_spread_pct
                    else "MEDIUM",
                )
        else:
            spread = 0.0
            agreement_percent = 0.0 if len(logs) > 1 else 100.0
            agreement_component = 0.0
            explanation.append(
                "No numeric progress claims available for cross-source comparison"
            )

        activity_component, activity_note = _activity_match_component(relevant)
        temporal_component, temporal_notes = _temporal_component(
            activity, relevant, self.config
        )
        reliability_component = round(
            15.0
            * sum(SOURCE_RELIABILITY.get(event.source_type, 0.5) for event in relevant)
            / len(relevant),
            1,
        )
        explanation.append(
            "Source reliability "
            f"{reliability_component}/15 from {sorted({e.source_type.value for e in relevant})}"
        )
        historical_component, history_note = _historical_component(
            self._history.get(activity_id), fused_progress
        )

        breakdown = TrustBreakdown(
            evidence_agreement=agreement_component,
            activity_match=activity_component,
            temporal_consistency=temporal_component,
            source_reliability=reliability_component,
            historical_consistency=historical_component,
        )
        trust_score = round(
            min(
                100.0,
                breakdown.evidence_agreement
                + breakdown.activity_match
                + breakdown.temporal_consistency
                + breakdown.source_reliability
                + breakdown.historical_consistency,
            ),
            1,
        )

        explanation.append(activity_note)
        explanation.extend(temporal_notes)
        explanation.append(history_note)

        if (
            conflict is not None
            and conflict.spread_percent > self.config.conflict_spread_pct
        ):
            status = ExecutionStatus.CONFLICT_DETECTED
            trust_score = min(trust_score, 69.0)
            explanation.append(
                f"CONFLICT: spread {conflict.spread_percent} pts exceeds conflict threshold "
                f"{self.config.conflict_spread_pct} pts — trust capped at 69 and planner review forced"
            )
            explanation.append(
                "Fused progress is provisional (median of conflicting claims); "
                "no source is selected automatically until a planner resolves the conflict"
            )
        elif trust_score >= self.config.auto_approve_min_trust:
            status = ExecutionStatus.AUTO_APPROVED
            explanation.append(
                f"Trust {trust_score} >= {self.config.auto_approve_min_trust} — auto-linked to {activity_id}"
            )
        else:
            status = ExecutionStatus.REQUIRES_REVIEW
            if conflict is not None:
                explanation.append(
                    f"Minor disagreement (spread {conflict.spread_percent} pts) — planner review required"
                )
            else:
                explanation.append(
                    f"Trust {trust_score} below auto-approve threshold "
                    f"{self.config.auto_approve_min_trust} — planner review required"
                )

        state = ExecutionState(
            activity_id=activity_id,
            activity_name=activity.activity_name,
            fused_progress_percent=round(fused_progress, 1),
            trust_score=trust_score,
            status=status,
            fact_type=SourceFactType.INFERENCE,
            breakdown=breakdown,
            evidence_logs=logs,
            conflict=conflict,
            explanation=explanation,
            has_evidence=True,
            evaluated_at=utc_now(),
        )
        self._history[activity_id] = state
        return state

    def process(self, evidence_list: Sequence[FieldEvidence]) -> ProcessResult:
        """Full pipeline: extract every evidence, fuse per activity, flag unmatched claims."""
        events = self.extract_events(evidence_list)
        activity_ids = sorted(
            {
                event.resolved_activity_id
                for event in events
                if event.resolved_activity_id is not None
            }
            | {
                event.mentioned_activity_id
                for event in events
                if event.mentioned_activity_id in self._activities
            }
        )
        states = {
            activity_id: self.evaluate_truth(activity_id, events)
            for activity_id in activity_ids
        }
        unmatched = [event for event in events if event.resolved_activity_id is None]
        conflicts = sorted(
            activity_id
            for activity_id, state in states.items()
            if state.status is ExecutionStatus.CONFLICT_DETECTED
        )
        return ProcessResult(
            events=events,
            states=states,
            unmatched_events=unmatched,
            conflict_activity_ids=conflicts,
            processed_evidence_count=len(evidence_list),
        )

    def match_candidates(self, event: ExtractedEvent, top_n: int = 3) -> list[dict]:
        """Hybrid candidate ranking: structured signals + semantic (token) similarity."""
        scored: list[dict] = []
        for activity in self._activities.values():
            explanation = {
                "asset_match": False,
                "discipline_match": False,
                "location_match": False,
                "semantic_similarity": 0.0,
                "temporal_consistency": False,
                "explicit_id_match": False,
            }
            score = 0.0
            if event.mentioned_activity_id == activity.activity_id:
                score += 100.0
                explanation["explicit_id_match"] = True
            if event.mentioned_asset_id and activity.asset_id:
                if _normalize_asset(event.mentioned_asset_id) == _normalize_asset(activity.asset_id):
                    score += 40.0
                    explanation["asset_match"] = True
            if event.discipline is not None and event.discipline == activity.discipline:
                score += 20.0
                explanation["discipline_match"] = True
            if event.location and activity.location:
                if event.location.lower() in activity.location.lower():
                    score += 5.0
                    explanation["location_match"] = True
            similarity = _semantic_similarity(event.sentence, activity.activity_name)
            score += similarity * 25.0
            explanation["semantic_similarity"] = round(similarity, 2)
            temporal_ok = self._temporal_ok(activity, event)
            score += 15.0 if temporal_ok else 3.0
            explanation["temporal_consistency"] = temporal_ok
            scored.append(
                {
                    "activity_id": activity.activity_id,
                    "activity_code": activity.activity_id,
                    "activity_name": activity.activity_name,
                    "discipline": activity.discipline.value,
                    "rank": 0,
                    "score": round(min(score, 100.0), 1),
                    "explanation": explanation,
                }
            )
        scored.sort(key=lambda candidate: candidate["score"], reverse=True)
        for rank, candidate in enumerate(scored[:top_n], start=1):
            candidate["rank"] = rank
        return scored[:top_n]

    def _temporal_ok(self, activity: BaselineActivity, event: ExtractedEvent) -> bool:
        grace = self.config.temporal_grace_days
        day = event.timestamp.date().toordinal()
        return (
            activity.planned_start.toordinal() - grace
            <= day
            <= activity.planned_finish.toordinal() + grace
        )

    def _empty_state(self, activity: BaselineActivity) -> ExecutionState:
        return ExecutionState(
            activity_id=activity.activity_id,
            activity_name=activity.activity_name,
            fused_progress_percent=0.0,
            trust_score=0.0,
            status=ExecutionStatus.REQUIRES_REVIEW,
            fact_type=SourceFactType.INFERENCE,
            breakdown=TrustBreakdown(
                evidence_agreement=0.0,
                activity_match=0.0,
                temporal_consistency=0.0,
                source_reliability=0.0,
                historical_consistency=0.0,
            ),
            evidence_logs=[],
            conflict=None,
            explanation=[
                "No evidence received for this activity — cannot establish execution truth"
            ],
            has_evidence=False,
            evaluated_at=utc_now(),
        )

    def state_for_all(self) -> list[ExecutionState]:
        """ExecutionState for every schedule activity (unevaluated ones flagged for review)."""
        states: list[ExecutionState] = []
        for activity in self._activities.values():
            known = self._history.get(activity.activity_id)
            states.append(known if known is not None else self._empty_state(activity))
        return states


def _normalize_asset(asset_id: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", asset_id.upper())


GENERIC_TOKENS = {"LINE", "WORK", "AREA", "EACH", "SPOOL"}


def _activity_tokens(activity: BaselineActivity) -> list[str]:
    tokens: set[str] = set()
    name = activity.activity_name.upper()
    for word in re.findall(r"[A-Z0-9]{5,}", name):
        if word not in GENERIC_TOKENS and not word.isdigit():
            tokens.add(word)
    for keyword in DISCIPLINE_KEYWORDS.get(activity.discipline.value, ()):
        token = keyword.strip().upper()
        if token in name and token not in GENERIC_TOKENS:
            tokens.add(token)
    if activity.asset_id:
        tokens.add(_normalize_asset(activity.asset_id))
    return list(tokens)


def _keyword_lookup(sentence: str, keyword_index: dict[str, str]) -> str | None:
    upper = sentence.upper()
    for token, activity_id in keyword_index.items():
        if len(token) >= 4 and token in upper:
            return activity_id
    return None


def _split_sentences(raw_text: str) -> list[str]:
    chunks = re.split(r"(?:\r?\n)+|(?<=[.!?;])\s+", raw_text)
    return [chunk.strip() for chunk in chunks if chunk.strip()]


def _find_activity_id(sentence: str) -> str | None:
    match = ACTIVITY_ID_RE.search(sentence.upper())
    return match.group(1) if match else None


def _find_asset_id(sentence: str) -> str | None:
    upper = sentence.upper()
    for match in ASSET_ID_RE.finditer(upper):
        token = match.group(1)
        if token and not ACTIVITY_ID_RE.fullmatch(token):
            return token
    return None


def _find_line_number(sentence: str) -> str | None:
    for pattern in LINE_PATTERNS:
        match = pattern.search(sentence)
        if match:
            return match.group(1)
    return None


def _find_location(sentence: str) -> str | None:
    match = LOCATION_RE.search(sentence)
    return match.group(0).strip() if match else None


def _infer_discipline(sentence: str) -> Discipline | None:
    lower = sentence.lower()
    for discipline, keywords in DISCIPLINE_KEYWORDS.items():
        if any(keyword in lower for keyword in keywords):
            return Discipline[discipline]
    return None


def _infer_event_type(sentence: str) -> EventType:
    if INSPECTION_RE.search(sentence):
        return EventType.INSPECTION
    if TEST_RE.search(sentence):
        return EventType.TEST
    if BLOCK_RE.search(sentence):
        return EventType.BLOCK
    if DELAY_RE.search(sentence):
        return EventType.DELAY
    if COMPLETE_RE.search(sentence):
        return EventType.COMPLETE
    if START_RE.search(sentence):
        return EventType.START
    if PENDING_RE.search(sentence) or PARTIAL_RE.search(sentence):
        return EventType.PROGRESS
    return EventType.PROGRESS


def _parse_progress(sentence: str, event_type: EventType) -> float | None:
    for pattern in PERCENT_PATTERNS:
        match = pattern.search(sentence)
        if match:
            value = float(match.group(1))
            if 0 <= value <= 100:
                return value
    if COMPLETE_RE.search(sentence):
        return 100.0
    if PARTIAL_RE.search(sentence):
        return 50.0
    if START_RE.search(sentence):
        return 0.0
    return None


def _semantic_similarity(sentence: str, activity_name: str) -> float:
    """Token-overlap similarity with light synonym normalization (0..1)."""
    synonyms = {
        "erect": "erection",
        "erection": "erection",
        "install": "installation",
        "installation": "installation",
        "weld": "welding",
        "welding": "welding",
        "test": "testing",
        "testing": "testing",
        "paint": "painting",
        "painting": "painting",
        "pour": "concrete",
        "concrete": "concrete",
        "excavate": "excavation",
        "excavation": "excavation",
        "align": "alignment",
        "alignment": "alignment",
        "calibrate": "calibration",
        "calibration": "calibration",
        "inspect": "inspection",
        "inspection": "inspection",
        "lay": "laying",
        "laying": "laying",
        "terminate": "termination",
        "termination": "termination",
    }
    stop = {
        "the", "a", "an", "at", "on", "in", "of", "for", "and", "or", "to", "is",
        "was", "were", "completed", "complete", "done", "progress", "percent", "pct",
        "unit", "line", "as", "now", "only", "boss", "sep", "september",
    }

    def tokens(text: str) -> set[str]:
        words = re.findall(r"[a-z0-9]+", text.lower())
        return {synonyms.get(word, word) for word in words if word not in stop and len(word) > 2}

    left = tokens(sentence)
    right = tokens(activity_name)
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def _agreement_percent(claims: Sequence[float], tolerance: float) -> float:
    if not claims:
        return 0.0
    if len(claims) == 1:
        return 100.0
    center = median(claims)
    agreeing = sum(1 for claim in claims if abs(claim - center) <= tolerance)
    return round(100.0 * agreeing / len(claims), 1)


def _activity_match_component(events: Sequence[ExtractedEvent]) -> tuple[float, str]:
    paths = {event.resolution_path for event in events}
    if ResolutionPath.EXPLICIT_ID in paths:
        note = (
            "Activity match 25/25 — schedule activity id stated verbatim in field text"
        )
        return 25.0, note
    if ResolutionPath.ASSET_LOOKUP in paths:
        note = "Activity match 22/25 — resolved via asset id index (no explicit activity id in text)"
        return 22.0, note
    if ResolutionPath.KEYWORD_LOOKUP in paths:
        note = "Activity match 16/25 — resolved via terminology/keyword overlap only"
        return 16.0, note
    return 8.0, "Activity match 8/25 — weak structural signals"


def _temporal_component(
    activity: BaselineActivity,
    events: Sequence[ExtractedEvent],
    config: FusionConfig,
) -> tuple[float, list[str]]:
    grace = config.temporal_grace_days
    window_start = activity.planned_start.toordinal() - grace
    window_end = activity.planned_finish.toordinal() + grace
    notes: list[str] = []
    scores: list[float] = []
    for event in events:
        day = event.timestamp.date().toordinal()
        if window_start <= day <= window_end:
            scores.append(20.0)
        elif abs(day - window_start) <= grace or abs(day - window_end) <= grace:
            scores.append(13.0)
        else:
            scores.append(6.0)
            notes.append(
                f"Temporal anomaly: evidence {event.evidence_id} reported "
                f"{event.timestamp.date().isoformat()} outside planned window "
                f"{activity.planned_start.isoformat()}..{activity.planned_finish.isoformat()} "
                f"(grace {grace}d)"
            )
    if not scores:
        return 0.0, notes
    component = round(sum(scores) / len(scores), 1)
    notes.append(
        f"Temporal consistency {component}/20 vs planned window "
        f"{activity.planned_start.isoformat()}..{activity.planned_finish.isoformat()} "
        f"with {grace}d grace"
    )
    return component, notes


def _historical_component(
    prior_state: ExecutionState | None,
    fused_progress: float,
) -> tuple[float, str]:
    if prior_state is None or not prior_state.has_evidence:
        return (
            12.0,
            "Historical consistency 12/15 — no prior execution history, neutral baseline",
        )
    delta = abs(prior_state.fused_progress_percent - fused_progress)
    if delta <= 5:
        return (
            15.0,
            f"Historical consistency 15/15 — matches prior state within {delta:.1f} pts",
        )
    if delta <= 20:
        return (
            9.0,
            f"Historical consistency 9/15 — deviates {delta:.1f} pts from prior state",
        )
    return (
        4.0,
        f"Historical consistency 4/15 — deviates {delta:.1f} pts from prior state",
    )
