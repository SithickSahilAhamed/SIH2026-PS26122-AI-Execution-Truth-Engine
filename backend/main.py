"""FastAPI application for the Execution Truth Engine."""

from __future__ import annotations

from collections import deque
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from fusion_engine import ExecutionTruthEngine
from models import (
    APIResponse,
    BaselineActivity,
    ErrorDetail,
    ErrorResponse,
    EvidenceSubmitResult,
    ExecutionState,
    ExecutionStatus,
    ExtractedEvent,
    FieldEvidence,
    FusionConfig,
    HealthResponse,
    Meta,
    ProcessResult,
    ScheduleLoadResult,
    ScheduleStateResponse,
    ScheduleStateSummary,
)
from seed import build_dependencies, generate_activities, generate_historical, generate_reports

app = FastAPI(
    title="Execution Truth Engine",
    description="Evidence fusion, trust scoring and conflict detection for infrastructure schedules.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ID = "3f2a9c1e-5b7d-4a3f-9c2e-1d4b6a8c0e12"
PROJECT = {
    "id": PROJECT_ID,
    "project_code": "OIL-ASSAM-001",
    "name": "Assam Pipeline Expansion",
    "organization": "Oil India Limited",
    "location": "Assam",
    "status": "ACTIVE",
    "start_date": "2026-09-01",
    "planned_end_date": "2027-03-31",
}
DEMO_TODAY = date(2026, 12, 15)

engine = ExecutionTruthEngine()

activity_store: dict[str, dict] = {}
dependency_graph: list[dict] = []
evidence_store: list[FieldEvidence] = []
evidence_ids: set[str] = set()
reports_store: list[dict] = []
events_store: list[ExtractedEvent] = []
candidates_store: dict[str, list[dict]] = {}
states_store: dict[str, ExecutionState] = {}
links_store: dict[str, dict] = {}
conflicts_store: list[dict] = []
reviews_store: list[dict] = []
audit_log: list[dict] = []
scenarios_store: dict[str, dict] = {}
historical_store: list[dict] = []
last_process_result: ProcessResult | None = None


def ok(payload: object) -> APIResponse:
    return APIResponse(data=payload, meta=Meta())


def err(code: str, message: str, status_code: int, details: dict[str, str] | None = None) -> JSONResponse:
    body = ErrorResponse(
        error=ErrorDetail(code=code, message=message, details=details or {}),
        meta=Meta(),
    )
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _audit(entity_type: str, entity_id: str, action: str, old: Any = None, new: Any = None,
           reason: str = "", performed_by: str = "system") -> None:
    audit_log.append(
        {
            "id": str(uuid4()),
            "project_id": PROJECT_ID,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": action,
            "performed_by": performed_by,
            "old_value": old,
            "new_value": new,
            "reason": reason,
            "created_at": _now(),
        }
    )


def _reset_store() -> None:
    activity_store.clear()
    dependency_graph.clear()
    evidence_store.clear()
    evidence_ids.clear()
    reports_store.clear()
    events_store.clear()
    candidates_store.clear()
    states_store.clear()
    links_store.clear()
    conflicts_store.clear()
    reviews_store.clear()
    audit_log.clear()
    scenarios_store.clear()
    historical_store.clear()
    global last_process_result
    last_process_result = None


def _match_status_for(state: ExecutionState | None) -> str:
    if state is None:
        return "UNMATCHED"
    return {
        ExecutionStatus.AUTO_APPROVED: "AUTO_MATCHED",
        ExecutionStatus.REQUIRES_REVIEW: "REVIEW_REQUIRED",
        ExecutionStatus.CONFLICT_DETECTED: "REVIEW_REQUIRED",
    }[state.status]


def _parse_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(value[:10])


def _parse_ts(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _activity_status(aid: str) -> str:
    rec = activity_store[aid]
    progress = float(rec.get("progress_percent") or 0)
    planned_finish = _parse_date(rec["planned_finish"])
    actual_finish = _parse_ts(rec.get("actual_finish"))
    if progress >= 100:
        return "COMPLETED"
    if actual_finish and planned_finish and actual_finish.date() > planned_finish:
        return "DELAYED"
    if rec.get("actual_start") and planned_finish and DEMO_TODAY > planned_finish:
        return "DELAYED"
    if rec.get("actual_start"):
        return "IN_PROGRESS"
    return "NOT_STARTED"


def _sync_activity_status(aid: str) -> None:
    activity_store[aid]["status"] = _activity_status(aid)


def _success_rate() -> float:
    evaluated = [s for s in states_store.values() if s.has_evidence]
    if not evaluated:
        return 0.0
    return round(sum(1 for s in evaluated if s.status is ExecutionStatus.AUTO_APPROVED) / len(evaluated) * 100, 1)


# ---------------------------------------------------------------- seed


@app.post("/api/v1/demo/seed", response_model=APIResponse[dict])
def seed_demo() -> APIResponse | JSONResponse:
    _reset_store()
    activities = generate_activities()
    engine.load_schedule(activities)
    for activity in activities:
        activity_store[activity.activity_id] = {
            **activity.model_dump(mode="json"),
            "version": 1,
            "actual_start": None,
            "actual_finish": None,
            "progress_percent": 0.0,
            "status": "NOT_STARTED",
            "forecast_finish": None,
        }
    dependency_graph.extend(build_dependencies(activities))

    reports = generate_reports(activities)
    evidence = [FieldEvidence(**r) for r in reports]
    result = engine.process(evidence)
    events_store.extend(result.events)
    for event in result.events:
        candidates_store[event.event_id] = engine.match_candidates(event)
    states_store.update(result.states)

    for aid, state in result.states.items():
        rec = activity_store[aid]
        rec["progress_percent"] = state.fused_progress_percent
        related = [
            e for e in result.events
            if e.resolved_activity_id == aid or e.mentioned_activity_id == aid
        ]
        if related:
            rec["actual_start"] = min(e.timestamp for e in related).isoformat()
            if state.status is ExecutionStatus.CONFLICT_DETECTED:
                rec["status"] = "AT_RISK"
                continue
            if state.fused_progress_percent >= 100:
                rec["actual_finish"] = max(e.timestamp for e in related).isoformat()
        _sync_activity_status(aid)

    for event in result.events:
        state = result.states.get(event.resolved_activity_id) if event.resolved_activity_id else None
        links_store[event.event_id] = {
            "event_id": event.event_id,
            "activity_id": event.resolved_activity_id,
            "match_status": _match_status_for(state),
            "trust_score": state.trust_score if state else None,
            "matched_by": "engine",
            "matched_at": _now(),
            "reason": f"resolution={event.resolution_path.value}",
        }
        _audit("EXECUTION_EVENT", event.event_id, "EVENT_CREATED",
               new={"source_type": event.source_type.value, "sentence": event.sentence})
        if state is not None:
            _audit("EXECUTION_EVENT", event.event_id, "EVENT_MATCHED",
                   new={"activity_id": event.resolved_activity_id, "trust_score": state.trust_score})
            if state.status is ExecutionStatus.AUTO_APPROVED:
                _audit("SCHEDULE_ACTIVITY", event.resolved_activity_id, "SCHEDULE_UPDATED",
                       old={"progress_percent": 0},
                       new={"progress_percent": state.fused_progress_percent},
                       reason="Auto-approved execution event")

    for aid, state in result.states.items():
        if state.conflict:
            conflicts_store.append(
                {
                    "id": str(uuid4()),
                    "project_id": PROJECT_ID,
                    "activity_id": aid,
                    "conflict_type": "STATUS_CONFLICT",
                    "description": state.conflict.description,
                    "severity": state.conflict.severity,
                    "status": "OPEN",
                    "detected_at": _now(),
                    "resolved_at": None,
                    "resolved_by": None,
                    "resolution": None,
                    "claims": [
                        {"source": log.source_type.value, "claim": log.claimed_progress_percent}
                        for log in state.evidence_logs
                    ],
                }
            )

    historical_store.extend(generate_historical())
    for report in reports:
        reports_store.append(
            {
                "id": report["evidence_id"],
                "report_type": report["source_type"],
                "file_name": f"report_{report['evidence_id'].lower()}.txt",
                "raw_text": report["raw_text"],
                "report_date": report["timestamp"][:10],
                "reported_by": report["reporter_id"],
                "processing_status": "EXTRACTED",
            }
        )

    return ok(
        {
            "seeded": True,
            "activities": len(activities),
            "dependencies": len(dependency_graph),
            "reports": len(reports),
            "events": len(result.events),
            "evaluated_activities": len(result.states),
            "auto_approved": sum(1 for s in result.states.values() if s.status is ExecutionStatus.AUTO_APPROVED),
            "requires_review": sum(1 for s in result.states.values() if s.status is ExecutionStatus.REQUIRES_REVIEW),
            "conflicts": len(conflicts_store),
            "unmatched_events": len(result.unmatched_events),
            "historical_records": len(historical_store),
        }
    )


@app.get("/api/v1/demo/status", response_model=APIResponse[dict])
def demo_status() -> APIResponse:
    return ok({"seeded": bool(activity_store), "activities": len(activity_store)})


# ---------------------------------------------------------------- existing endpoints


@app.get("/health", response_model=APIResponse[HealthResponse])
def health() -> APIResponse:
    return ok(HealthResponse())


@app.post("/api/v1/schedule/load", response_model=APIResponse[ScheduleLoadResult])
def load_schedule(payload: list[BaselineActivity]) -> APIResponse | JSONResponse:
    if not payload:
        return err("VALIDATION_ERROR", "Schedule payload must contain at least one activity", 422)
    seen: set[str] = set()
    duplicates: list[str] = []
    unique: list[BaselineActivity] = []
    for activity in payload:
        if activity.activity_id in seen:
            duplicates.append(activity.activity_id)
            continue
        seen.add(activity.activity_id)
        unique.append(activity)
    engine.load_schedule(unique)
    evidence_store.clear()
    evidence_ids.clear()
    global last_process_result
    last_process_result = None
    return ok(ScheduleLoadResult(activities_loaded=len(unique), duplicate_activity_ids=duplicates))


@app.post("/api/v1/evidence/submit", response_model=APIResponse[EvidenceSubmitResult])
def submit_evidence(payload: list[FieldEvidence]) -> APIResponse | JSONResponse:
    if not payload:
        return err("VALIDATION_ERROR", "Evidence payload must contain at least one item", 422)
    accepted = 0
    duplicates: list[str] = []
    for item in payload:
        if item.evidence_id in evidence_ids:
            duplicates.append(item.evidence_id)
            continue
        evidence_ids.add(item.evidence_id)
        evidence_store.append(item)
        accepted += 1
        reports_store.append(
            {
                "id": item.evidence_id,
                "report_type": item.source_type.value,
                "file_name": f"report_{item.evidence_id.lower()}.txt",
                "raw_text": item.raw_text,
                "report_date": item.timestamp.date().isoformat(),
                "reported_by": item.reporter_id,
                "processing_status": "RECEIVED",
            }
        )
    return ok(EvidenceSubmitResult(evidence_accepted=accepted, duplicate_evidence_ids=duplicates))


@app.post("/api/v1/engine/process", response_model=APIResponse[ProcessResult])
def process_engine() -> APIResponse | JSONResponse:
    if not engine.activities:
        return err("SCHEDULE_NOT_LOADED", "Load a baseline schedule before running the engine", 400)
    if not evidence_store:
        return err("NO_EVIDENCE", "Submit at least one evidence item before running the engine", 400)
    result = engine.process(evidence_store)
    events_store.clear()
    events_store.extend(result.events)
    for event in result.events:
        candidates_store[event.event_id] = engine.match_candidates(event)
    states_store.update(result.states)
    for aid, state in result.states.items():
        rec = activity_store.get(aid)
        if rec:
            rec["progress_percent"] = state.fused_progress_percent
            related = [e for e in result.events if e.resolved_activity_id == aid or e.mentioned_activity_id == aid]
            if related:
                rec["actual_start"] = min(e.timestamp for e in related).isoformat()
                if state.status is ExecutionStatus.CONFLICT_DETECTED:
                    rec["status"] = "AT_RISK"
                    continue
                if state.fused_progress_percent >= 100:
                    rec["actual_finish"] = max(e.timestamp for e in related).isoformat()
            _sync_activity_status(aid)
    for event in result.events:
        state = result.states.get(event.resolved_activity_id) if event.resolved_activity_id else None
        links_store[event.event_id] = {
            "event_id": event.event_id,
            "activity_id": event.resolved_activity_id,
            "match_status": _match_status_for(state),
            "trust_score": state.trust_score if state else None,
            "matched_by": "engine",
            "matched_at": _now(),
            "reason": f"resolution={event.resolution_path.value}",
        }
    global last_process_result
    last_process_result = result
    return ok(result)


@app.get("/api/v1/schedule/state", response_model=APIResponse[ScheduleStateResponse])
def schedule_state(status: ExecutionStatus | None = None) -> APIResponse:
    all_states = engine.state_for_all()
    states = [state for state in all_states if state.status is status] if status else all_states
    evaluated = [state for state in all_states if state.has_evidence]
    summary = ScheduleStateSummary(
        total_activities=len(all_states),
        evaluated=len(evaluated),
        auto_approved=sum(1 for state in evaluated if state.status is ExecutionStatus.AUTO_APPROVED),
        requires_review=sum(1 for state in evaluated if state.status is ExecutionStatus.REQUIRES_REVIEW),
        conflict_detected=sum(1 for state in evaluated if state.status is ExecutionStatus.CONFLICT_DETECTED),
        unmatched_events=len(last_process_result.unmatched_events) if last_process_result else 0,
    )
    return ok(ScheduleStateResponse(states=states, summary=summary))


@app.get("/api/v1/evidence", response_model=APIResponse[list[FieldEvidence]])
def list_evidence() -> APIResponse:
    return ok(evidence_store)


@app.get("/api/v1/config/thresholds", response_model=APIResponse[FusionConfig])
def get_thresholds() -> APIResponse:
    return ok(engine.config)


@app.put("/api/v1/config/thresholds", response_model=APIResponse[FusionConfig])
def set_thresholds(payload: FusionConfig) -> APIResponse:
    engine.config = payload
    return ok(engine.config)


# ---------------------------------------------------------------- project helpers


def _require_project(project_id: str) -> APIResponse | JSONResponse | None:
    if project_id != PROJECT_ID:
        return err("NOT_FOUND", f"Project {project_id} not found", 404)
    return None


def _topological_order() -> list[str]:
    order: list[str] = []
    visited: set[str] = set()

    def visit(aid: str) -> None:
        if aid in visited:
            return
        visited.add(aid)
        rec = activity_store.get(aid)
        if rec:
            for pred in rec.get("predecessors", []):
                visit(pred)
        order.append(aid)

    for aid in activity_store:
        visit(aid)
    return order


# ---------------------------------------------------------------- dashboard


@app.get("/api/v1/projects/{project_id}/activities", response_model=APIResponse[dict])
def list_activities(project_id: str) -> APIResponse | JSONResponse:
    not_found = _require_project(project_id)
    if not_found is not None:
        return not_found
    return ok({"activities": list(activity_store.values())})


@app.get("/api/v1/projects/{project_id}/dashboard", response_model=APIResponse[dict])
def dashboard(project_id: str) -> APIResponse | JSONResponse:
    not_found = _require_project(project_id)
    if not_found is not None:
        return not_found
    if not activity_store:
        return err("NOT_SEEDED", "Seed the demo dataset first via POST /api/v1/demo/seed", 400)

    records = list(activity_store.values())
    total = len(records)
    completed = sum(1 for r in records if r["status"] == "COMPLETED")
    in_progress = sum(1 for r in records if r["status"] == "IN_PROGRESS")
    delayed = sum(1 for r in records if r["status"] == "DELAYED")
    at_risk = sum(
        1
        for r in records
        if r["status"] not in ("COMPLETED",)
        and r["activity_id"] in states_store
        and (
            states_store[r["activity_id"]].status is ExecutionStatus.CONFLICT_DETECTED
            or states_store[r["activity_id"]].trust_score < 70
        )
    )
    review_pending = sum(1 for link in links_store.values() if link["match_status"] in ("REVIEW_REQUIRED", "CONFLICT_DETECTED"))
    unmatched = sum(1 for link in links_store.values() if link["match_status"] == "UNMATCHED")
    auto_linked = sum(1 for link in links_store.values() if link["match_status"] == "AUTO_MATCHED")
    evaluated_states = [s for s in states_store.values() if s.has_evidence]
    avg_trust = round(sum(s.trust_score for s in evaluated_states) / len(evaluated_states), 1) if evaluated_states else 0.0

    weeks: list[dict] = []
    start = _parse_date(PROJECT["start_date"])
    end = _parse_date(PROJECT["planned_end_date"])
    cursor = start
    while cursor <= end:
        week_end = cursor + timedelta(days=6)
        total_duration = sum(float(r["planned_duration"]) for r in records)
        started = [r for r in records if _parse_date(r["planned_start"]) <= week_end]
        planned_pct = (
            sum(float(r["planned_duration"]) for r in started) / total_duration * 100
            if total_duration
            else 0.0
        )
        actual_pct = (
            sum(float(r["progress_percent"]) / 100 * float(r["planned_duration"]) for r in started)
            / total_duration
            * 100
            if total_duration
            else 0.0
        )
        weeks.append(
            {
                "week": cursor.isoformat(),
                "planned_pct": round(planned_pct, 1),
                "actual_pct": round(actual_pct, 1),
            }
        )
        cursor += timedelta(days=7)

    discipline_breakdown: list[dict] = []
    for discipline in sorted({r["discipline"] for r in records}):
        rows = [r for r in records if r["discipline"] == discipline]
        discipline_breakdown.append(
            {
                "discipline": discipline,
                "total": len(rows),
                "completed": sum(1 for r in rows if r["status"] == "COMPLETED"),
                "in_progress": sum(1 for r in rows if r["status"] == "IN_PROGRESS"),
                "delayed": sum(1 for r in rows if r["status"] == "DELAYED"),
                "at_risk": sum(1 for r in rows if r["activity_id"] in at_risk_ids(at_risk)),
            }
        )

    delay_trend: list[dict] = []
    cursor = start
    while cursor <= end:
        week_end = cursor + timedelta(days=6)
        active = [
            r
            for r in records
            if _parse_date(r["planned_start"]) <= week_end
            and (_parse_date(r["planned_start"]) + timedelta(days=float(r["planned_duration"]))) >= cursor
        ]
        delayed_rows = [r for r in active if r["status"] == "DELAYED"]
        delay_trend.append(
            {
                "week": cursor.isoformat(),
                "delayed_count": len(delayed_rows),
                "avg_delay_days": round(_avg_delay(delayed_rows), 1),
            }
        )
        cursor += timedelta(days=7)

    bands = {"90-100": 0, "70-89": 0, "50-69": 0, "0-49": 0}
    for state in evaluated_states:
        score = state.trust_score
        if score >= 90:
            bands["90-100"] += 1
        elif score >= 70:
            bands["70-89"] += 1
        elif score >= 50:
            bands["50-69"] += 1
        else:
            bands["0-49"] += 1

    recent_events = sorted(events_store, key=lambda e: e.timestamp, reverse=True)[:8]
    critical = sorted(
        (
            {
                "activity_id": r["activity_id"],
                "activity_name": r["activity_name"],
                "discipline": r["discipline"],
                "status": r["status"],
                "progress_percent": r["progress_percent"],
                "trust_score": states_store[r["activity_id"]].trust_score if r["activity_id"] in states_store else None,
                "variance_days": _variance_days(r),
            }
            for r in records
            if r["status"] in ("DELAYED", "AT_RISK")
            or (
                r["activity_id"] in states_store
                and states_store[r["activity_id"]].status is ExecutionStatus.CONFLICT_DETECTED
            )
        ),
        key=lambda c: -(c["variance_days"] or 0),
    )[:8]

    return ok(
        {
            "project": PROJECT,
            "kpis": {
                "total_activities": total,
                "completed": completed,
                "in_progress": in_progress,
                "delayed": delayed,
                "at_risk": at_risk,
                "review_pending": review_pending,
                "unmatched": unmatched,
                "auto_linked": auto_linked,
                "average_trust_score": avg_trust,
                "auto_link_rate": _success_rate(),
            },
            "progress_trend": weeks,
            "discipline_breakdown": discipline_breakdown,
            "delay_trend": delay_trend,
            "trust_distribution": [{"band": band, "count": count} for band, count in bands.items()],
            "recent_events": [
                {
                    "event_id": e.event_id,
                    "source_type": e.source_type.value,
                    "sentence": e.sentence,
                    "resolved_activity_id": e.resolved_activity_id,
                    "progress_percent": e.progress_percent,
                    "event_type": e.event_type.value,
                    "timestamp": e.timestamp.isoformat(),
                }
                for e in recent_events
            ],
            "open_conflicts": conflicts_store,
            "critical_activities": critical,
        }
    )


def at_risk_ids(_at_risk: int) -> set[str]:
    return {
        r["activity_id"]
        for r in activity_store.values()
        if r["activity_id"] in states_store
        and (
            states_store[r["activity_id"]].status is ExecutionStatus.CONFLICT_DETECTED
            or states_store[r["activity_id"]].trust_score < 70
        )
    }


def _avg_delay(rows: list[dict]) -> float:
    delays = [_variance_days(r) for r in rows]
    delays = [d for d in delays if d and d > 0]
    return sum(delays) / len(delays) if delays else 0.0


def _variance_days(rec: dict) -> int:
    planned_finish = _parse_date(rec["planned_finish"])
    actual_finish = _parse_ts(rec.get("actual_finish"))
    if actual_finish and planned_finish:
        return max(0, (actual_finish.date() - planned_finish).days)
    if rec.get("actual_start") and planned_finish and DEMO_TODAY > planned_finish:
        return (DEMO_TODAY - planned_finish).days
    return 0


# ---------------------------------------------------------------- events


@app.get("/api/v1/projects/{project_id}/events", response_model=APIResponse[dict])
def list_events(
    project_id: str,
    status: str | None = None,
    discipline: str | None = None,
) -> APIResponse | JSONResponse:
    not_found = _require_project(project_id)
    if not_found is not None:
        return not_found
    items = []
    for event in events_store:
        link = links_store.get(event.event_id, {})
        rec = activity_store.get(link.get("activity_id") or "", {})
        if status and link.get("match_status") != status:
            continue
        if discipline and rec.get("discipline") != discipline:
            continue
        items.append(
            {
                "event": event.model_dump(mode="json"),
                "link": link,
                "activity_code": rec.get("activity_id"),
                "activity_name": rec.get("activity_name"),
                "discipline": rec.get("discipline"),
            }
        )
    return ok({"events": items, "total": len(items)})


@app.get("/api/v1/events/{event_id}", response_model=APIResponse[dict])
def event_detail(event_id: str) -> APIResponse | JSONResponse:
    event = next((e for e in events_store if e.event_id == event_id), None)
    if event is None:
        return err("NOT_FOUND", f"Event {event_id} not found", 404)
    link = links_store.get(event_id, {})
    return ok(
        {
            "event": event.model_dump(mode="json"),
            "link": link,
            "candidates": candidates_store.get(event_id, []),
        }
    )


@app.get("/api/v1/events/{event_id}/candidates", response_model=APIResponse[dict])
def event_candidates(event_id: str) -> APIResponse | JSONResponse:
    if event_id not in candidates_store:
        return err("NOT_FOUND", f"Event {event_id} not found", 404)
    return ok({"event_id": event_id, "candidates": candidates_store[event_id]})


@app.get("/api/v1/events/{event_id}/trust", response_model=APIResponse[dict])
def event_trust(event_id: str) -> APIResponse | JSONResponse:
    event = next((e for e in events_store if e.event_id == event_id), None)
    if event is None:
        return err("NOT_FOUND", f"Event {event_id} not found", 404)
    link = links_store.get(event_id, {})
    state = states_store.get(link.get("activity_id") or "")
    if state is None:
        return err("NO_TRUST", "No fused execution state for this event", 404)
    return ok(
        {
            "event_id": event_id,
            "activity_id": state.activity_id,
            "total_score": state.trust_score,
            "components": {
                "evidence_agreement": state.breakdown.evidence_agreement,
                "activity_match": state.breakdown.activity_match,
                "temporal_consistency": state.breakdown.temporal_consistency,
                "source_reliability": state.breakdown.source_reliability,
                "historical_consistency": state.breakdown.historical_consistency,
            },
            "decision": state.status.value,
            "explanation": state.explanation,
            "conflict": state.conflict.model_dump(mode="json") if state.conflict else None,
        }
    )


# ---------------------------------------------------------------- review & schedule update


@app.get("/api/v1/projects/{project_id}/reviews", response_model=APIResponse[dict])
def list_reviews(project_id: str) -> APIResponse | JSONResponse:
    not_found = _require_project(project_id)
    if not_found is not None:
        return not_found
    pending = [
        {
            "event_id": link["event_id"],
            "activity_id": link["activity_id"],
            "match_status": link["match_status"],
            "trust_score": link["trust_score"],
            "event": next((e.model_dump(mode="json") for e in events_store if e.event_id == link["event_id"]), None),
        }
        for link in links_store.values()
        if link["match_status"] in ("REVIEW_REQUIRED", "CONFLICT_DETECTED")
    ]
    return ok({"pending": pending, "history": reviews_store, "pending_count": len(pending)})


@app.post("/api/v1/events/{event_id}/review", response_model=APIResponse[dict])
def review_event(event_id: str, payload: dict) -> APIResponse | JSONResponse:
    event = next((e for e in events_store if e.event_id == event_id), None)
    if event is None:
        return err("NOT_FOUND", f"Event {event_id} not found", 404)
    status = payload.get("status")
    if status not in ("APPROVED", "REJECTED", "REASSIGNED", "MARKED_NEW_ACTIVITY"):
        return err("VALIDATION_ERROR", "status must be APPROVED, REJECTED, REASSIGNED or MARKED_NEW_ACTIVITY", 422)
    link = links_store.get(event_id)
    if link is None:
        return err("NOT_FOUND", f"Link for event {event_id} not found", 404)

    selected = payload.get("selected_activity_id")
    if status in ("APPROVED", "REASSIGNED"):
        if not selected or selected not in activity_store:
            return err("VALIDATION_ERROR", "selected_activity_id must reference a schedule activity", 422)
        link["activity_id"] = selected

    old_status = link["match_status"]
    link["match_status"] = {
        "APPROVED": "MATCHED_BY_PLANNER",
        "REJECTED": "REJECTED",
        "REASSIGNED": "MATCHED_BY_PLANNER",
        "MARKED_NEW_ACTIVITY": "UNMATCHED",
    }[status]
    link["matched_by"] = payload.get("reviewer_id", "planner-ui")
    link["matched_at"] = _now()
    link["reason"] = payload.get("comments", "")

    reviews_store.append(
        {
            "id": str(uuid4()),
            "event_id": event_id,
            "reviewer_id": payload.get("reviewer_id", "planner-ui"),
            "status": status,
            "selected_activity_id": selected,
            "comments": payload.get("comments", ""),
            "reviewed_at": _now(),
        }
    )
    _audit("EXECUTION_EVENT", event_id, "MATCH_REVIEWED",
           old={"match_status": old_status},
           new={"match_status": link["match_status"], "activity_id": link["activity_id"]},
           reason=payload.get("comments", ""), performed_by=payload.get("reviewer_id", "planner-ui"))

    if status == "APPROVED" and link["activity_id"]:
        rec = activity_store[link["activity_id"]]
        old_value = {
            "progress_percent": rec["progress_percent"],
            "status": rec["status"],
            "actual_finish": rec.get("actual_finish"),
        }
        rec["progress_percent"] = event.progress_percent if event.progress_percent is not None else rec["progress_percent"]
        if event.timestamp:
            rec["actual_finish"] = event.timestamp.isoformat()
        _sync_activity_status(link["activity_id"])
        _audit("SCHEDULE_ACTIVITY", link["activity_id"], "SCHEDULE_UPDATED",
               old=old_value,
               new={"progress_percent": rec["progress_percent"], "status": rec["status"]},
               reason=f"Planner-approved execution event {event_id}",
               performed_by=payload.get("reviewer_id", "planner-ui"))
        state = states_store.get(link["activity_id"])
        if state:
            states_store[link["activity_id"]] = ExecutionState(
                **{**state.model_dump(mode="json"), "status": ExecutionStatus.AUTO_APPROVED}
            )

    return ok({"event_id": event_id, "match_status": link["match_status"], "activity_id": link["activity_id"]})


@app.post("/api/v1/activities/{activity_id}/update-execution", response_model=APIResponse[dict])
def update_execution(activity_id: str, payload: dict) -> APIResponse | JSONResponse:
    rec = activity_store.get(activity_id)
    if rec is None:
        return err("NOT_FOUND", f"Activity {activity_id} not found", 404)
    version = payload.get("version")
    if version is None or int(version) != int(rec["version"]):
        return err("CONFLICT", f"Stale update: expected version {rec['version']}, got {version}", 409)

    old_value = {
        "progress_percent": rec["progress_percent"],
        "status": rec["status"],
        "actual_start": rec.get("actual_start"),
        "actual_finish": rec.get("actual_finish"),
    }
    if payload.get("actual_start"):
        rec["actual_start"] = payload["actual_start"]
    if payload.get("actual_finish"):
        rec["actual_finish"] = payload["actual_finish"]
    if payload.get("progress_percent") is not None:
        rec["progress_percent"] = float(payload["progress_percent"])
    if payload.get("status"):
        rec["status"] = payload["status"]
    else:
        _sync_activity_status(activity_id)
    rec["version"] = int(rec["version"]) + 1

    _audit("SCHEDULE_ACTIVITY", activity_id, "SCHEDULE_UPDATED",
           old=old_value,
           new={
               "progress_percent": rec["progress_percent"],
               "status": rec["status"],
               "actual_start": rec.get("actual_start"),
               "actual_finish": rec.get("actual_finish"),
           },
           reason=payload.get("reason", "Execution update"),
           performed_by=payload.get("performed_by", "planner-ui"))
    return ok({"activity_id": activity_id, "version": rec["version"], "status": rec["status"]})


# ---------------------------------------------------------------- execution twin & impact


@app.get("/api/v1/activities/{activity_id}/execution-twin", response_model=APIResponse[dict])
def execution_twin(activity_id: str) -> APIResponse | JSONResponse:
    rec = activity_store.get(activity_id)
    if rec is None:
        return err("NOT_FOUND", f"Activity {activity_id} not found", 404)
    state = states_store.get(activity_id)
    planned_finish = _parse_date(rec["planned_finish"])
    actual_finish = _parse_ts(rec.get("actual_finish"))
    forecast_finish = actual_finish or (
        _parse_ts(rec.get("actual_start")) + timedelta(days=float(rec["planned_duration"]))
        if rec.get("actual_start")
        else None
    )
    variance = (
        max(0, (actual_finish.date() - planned_finish).days)
        if actual_finish
        else (max(0, (DEMO_TODAY - planned_finish).days) if rec.get("actual_start") and DEMO_TODAY > planned_finish else 0)
    )
    return ok(
        {
            "activity": {
                "activity_id": rec["activity_id"],
                "activity_name": rec["activity_name"],
                "discipline": rec["discipline"],
                "asset_id": rec.get("asset_id"),
                "location": rec.get("location"),
            },
            "planned": {
                "start": rec["planned_start"],
                "finish": rec["planned_finish"],
                "duration_days": rec["planned_duration"],
                "fact_type": "PLAN",
            },
            "actual": {
                "start": rec.get("actual_start"),
                "finish": rec.get("actual_finish"),
                "progress": rec["progress_percent"],
                "fact_type": "OBSERVED",
            },
            "forecast": {
                "finish": forecast_finish.isoformat() if forecast_finish else None,
                "fact_type": "FORECAST",
            },
            "variance": {"days": variance},
            "trust_score": state.trust_score if state else None,
            "status": rec["status"],
            "evidence_count": len(state.evidence_logs) if state else 0,
            "version": rec["version"],
        }
    )


@app.get("/api/v1/activities/{activity_id}/impact", response_model=APIResponse[dict])
def dependency_impact(activity_id: str) -> APIResponse | JSONResponse:
    rec = activity_store.get(activity_id)
    if rec is None:
        return err("NOT_FOUND", f"Activity {activity_id} not found", 404)
    planned_finish = _parse_date(rec["planned_finish"])
    actual_finish = _parse_ts(rec.get("actual_finish"))
    delay_days = 0
    if actual_finish and planned_finish:
        delay_days = max(0, (actual_finish.date() - planned_finish).days)
    elif rec.get("actual_start") and DEMO_TODAY > planned_finish:
        delay_days = (DEMO_TODAY - planned_finish).days

    affected: list[dict] = []
    visited: set[str] = set()
    queue = deque([activity_id])
    while queue:
        current = queue.popleft()
        for dep in dependency_graph:
            if dep["predecessor_id"] != current:
                continue
            succ = dep["successor_id"]
            if succ in visited:
                continue
            visited.add(succ)
            row = activity_store[succ]
            affected.append(
                {
                    "activity_id": succ,
                    "activity_code": succ,
                    "activity_name": row["activity_name"],
                    "discipline": row["discipline"],
                    "impact_days": delay_days,
                    "status": row["status"],
                    "fact_type": "CALCULATED",
                }
            )
            queue.append(succ)
    milestones = [a for a in affected if a["activity_id"].startswith("MIL-")]
    return ok(
        {
            "root_activity": activity_id,
            "delay_days": delay_days,
            "delay_fact_type": "OBSERVED" if actual_finish else "CALCULATED",
            "affected_activities": affected,
            "affected_milestones": milestones,
            "affected_count": len(affected),
        }
    )


# ---------------------------------------------------------------- conflicts, reports, audit


@app.get("/api/v1/projects/{project_id}/conflicts", response_model=APIResponse[dict])
def list_conflicts(project_id: str) -> APIResponse | JSONResponse:
    not_found = _require_project(project_id)
    if not_found is not None:
        return not_found
    return ok({"conflicts": conflicts_store, "open_count": sum(1 for c in conflicts_store if c["status"] == "OPEN")})


@app.post("/api/v1/conflicts/{conflict_id}/resolve", response_model=APIResponse[dict])
def resolve_conflict(conflict_id: str, payload: dict) -> APIResponse | JSONResponse:
    conflict = next((c for c in conflicts_store if c["id"] == conflict_id), None)
    if conflict is None:
        return err("NOT_FOUND", f"Conflict {conflict_id} not found", 404)
    conflict["status"] = "RESOLVED"
    conflict["resolved_at"] = _now()
    conflict["resolved_by"] = payload.get("resolved_by", "planner-ui")
    conflict["resolution"] = payload.get("resolution", "")
    _audit("CONFLICT", conflict_id, "CONFLICT_RESOLVED",
           old={"status": "OPEN"}, new={"status": "RESOLVED"},
           reason=payload.get("resolution", ""), performed_by=payload.get("resolved_by", "planner-ui"))
    return ok(conflict)


@app.get("/api/v1/projects/{project_id}/reports", response_model=APIResponse[dict])
def list_reports(project_id: str) -> APIResponse | JSONResponse:
    not_found = _require_project(project_id)
    if not_found is not None:
        return not_found
    return ok({"reports": reports_store, "total": len(reports_store)})


@app.get("/api/v1/reports/{report_id}", response_model=APIResponse[dict])
def report_detail(report_id: str) -> APIResponse | JSONResponse:
    report = next((r for r in reports_store if r["id"] == report_id), None)
    if report is None:
        return err("NOT_FOUND", f"Report {report_id} not found", 404)
    return ok(report)


@app.get("/api/v1/projects/{project_id}/audit", response_model=APIResponse[dict])
def list_audit(
    project_id: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> APIResponse | JSONResponse:
    not_found = _require_project(project_id)
    if not_found is not None:
        return not_found
    items = audit_log
    if entity_type:
        items = [a for a in items if a["entity_type"] == entity_type]
    if entity_id:
        items = [a for a in items if a["entity_id"] == entity_id]
    return ok({"audit": items, "total": len(items)})


# ---------------------------------------------------------------- what-if scenarios


@app.post("/api/v1/projects/{project_id}/scenarios", response_model=APIResponse[dict])
def create_scenario(project_id: str, payload: dict) -> APIResponse | JSONResponse:
    not_found = _require_project(project_id)
    if not_found is not None:
        return not_found
    if not activity_store:
        return err("NOT_SEEDED", "Seed the demo dataset first via POST /api/v1/demo/seed", 400)
    scenario_id = str(uuid4())
    scenarios_store[scenario_id] = {
        "id": scenario_id,
        "project_id": project_id,
        "name": payload.get("name", "Untitled scenario"),
        "description": payload.get("description", ""),
        "assumptions": payload.get("assumptions", {}),
        "baseline_snapshot": {
            aid: {
                "planned_finish": rec["planned_finish"],
                "actual_finish": rec.get("actual_finish"),
                "status": rec["status"],
            }
            for aid, rec in activity_store.items()
        },
        "result": None,
        "status": "CREATED",
        "created_at": _now(),
        "completed_at": None,
    }
    _audit("SCENARIO", scenario_id, "SCENARIO_CREATED", new={"name": payload.get("name")})
    return ok(scenarios_store[scenario_id])


@app.post("/api/v1/scenarios/{scenario_id}/run", response_model=APIResponse[dict])
def run_scenario(scenario_id: str) -> APIResponse | JSONResponse:
    scenario = scenarios_store.get(scenario_id)
    if scenario is None:
        return err("NOT_FOUND", f"Scenario {scenario_id} not found", 404)
    assumptions = scenario.get("assumptions", {})
    crews = {c["discipline"]: c["count"] for c in assumptions.get("additional_crews", [])}
    duration_pct = float(assumptions.get("duration_change_pct", 0))
    start_shift = int(assumptions.get("start_shift_days", 0))

    simulated: dict[str, dict] = {}
    for aid in _topological_order():
        rec = activity_store[aid]
        start = _parse_ts(rec.get("actual_start")) or _parse_date(rec["planned_start"])
        if start is None:
            continue
        if not isinstance(start, datetime):
            start = datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)
        start = start + timedelta(days=start_shift)
        duration = float(rec["planned_duration"]) * (1 + duration_pct / 100)
        if rec["discipline"] in crews:
            duration = duration / (1 + 0.35 * crews[rec["discipline"]])
        finish = start + timedelta(days=duration)
        for dep in dependency_graph:
            if dep["successor_id"] != aid:
                continue
            pred = simulated.get(dep["predecessor_id"])
            if pred:
                pred_finish = pred["finish"] + timedelta(hours=float(dep["lag_hours"]))
                if pred_finish > finish:
                    finish = pred_finish
        simulated[aid] = {"start": start, "finish": finish, "duration_days": round(duration, 1)}

    simulated_output = {
        aid: {"start": data["start"].isoformat(), "finish": data["finish"].isoformat(), "duration_days": data["duration_days"]}
        for aid, data in simulated.items()
    }

    milestone_results = []
    for aid in activity_store:
        if not aid.startswith("MIL-"):
            continue
        baseline_finish = _parse_ts(activity_store[aid].get("actual_finish")) or _parse_date(
            activity_store[aid]["planned_finish"]
        )
        if not isinstance(baseline_finish, datetime):
            baseline_finish = datetime.combine(baseline_finish, datetime.min.time(), tzinfo=timezone.utc)
        sim = simulated.get(aid)
        sim_finish = _parse_ts(sim["finish"]) if sim else None
        delta = (sim_finish.date() - baseline_finish.date()).days if sim_finish else 0
        milestone_results.append(
            {
                "milestone_id": aid,
                "milestone_name": activity_store[aid]["activity_name"],
                "baseline_finish": baseline_finish.isoformat(),
                "simulated_finish": sim_finish.isoformat() if sim_finish else None,
                "delta_days": delta,
                "fact_type": "SIMULATED",
            }
        )

    baseline_worst = max((m["delta_days"] for m in milestone_results), default=0)
    scenario["result"] = {
        "simulated_activities": simulated_output,
        "milestones": milestone_results,
        "recovery_days": -baseline_worst if baseline_worst < 0 else 0,
        "note": "SIMULATED / WHAT-IF — actual schedule unchanged",
    }
    scenario["status"] = "COMPLETED"
    scenario["completed_at"] = _now()
    _audit("SCENARIO", scenario_id, "SCENARIO_RUN", new={"status": "COMPLETED"})
    return ok(scenario)


@app.get("/api/v1/scenarios/{scenario_id}", response_model=APIResponse[dict])
def get_scenario(scenario_id: str) -> APIResponse | JSONResponse:
    scenario = scenarios_store.get(scenario_id)
    if scenario is None:
        return err("NOT_FOUND", f"Scenario {scenario_id} not found", 404)
    return ok(scenario)


# ---------------------------------------------------------------- institutional memory


@app.get("/api/v1/projects/{project_id}/history/similar", response_model=APIResponse[dict])
def history_similar(project_id: str, activity_type: str | None = None, discipline: str | None = None) -> APIResponse | JSONResponse:
    not_found = _require_project(project_id)
    if not_found is not None:
        return not_found
    rows = historical_store
    if discipline:
        rows = [r for r in rows if r["discipline"] == discipline]
    if activity_type:
        rows = [r for r in rows if activity_type.lower() in r["activity_type"].lower()]
    if not rows:
        return ok(
            {
                "sample_size": 0,
                "average_planned_duration_hours": 0.0,
                "average_actual_duration_hours": 0.0,
                "average_delay_hours": 0.0,
                "common_delay_causes": [],
                "similar_activities": [],
            }
        )
    causes: dict[str, int] = {}
    for row in rows:
        if row["delay_cause"] != "None":
            causes[row["delay_cause"]] = causes.get(row["delay_cause"], 0) + 1
    return ok(
        {
            "sample_size": len(rows),
            "average_planned_duration_hours": round(sum(r["planned_duration_hours"] for r in rows) / len(rows), 1),
            "average_actual_duration_hours": round(sum(r["actual_duration_hours"] for r in rows) / len(rows), 1),
            "average_delay_hours": round(sum(r["delay_hours"] for r in rows) / len(rows), 1),
            "common_delay_causes": [
                {"cause": cause, "count": count} for cause, count in sorted(causes.items(), key=lambda kv: -kv[1])
            ],
            "similar_activities": [
                {
                    "id": r["id"],
                    "discipline": r["discipline"],
                    "activity_type": r["activity_type"],
                    "planned_hours": r["planned_duration_hours"],
                    "actual_hours": r["actual_duration_hours"],
                    "delay_hours": r["delay_hours"],
                    "delay_cause": r["delay_cause"],
                    "contractor": r["contractor"],
                    "location": r["location"],
                }
                for r in rows[:10]
            ],
        }
    )
