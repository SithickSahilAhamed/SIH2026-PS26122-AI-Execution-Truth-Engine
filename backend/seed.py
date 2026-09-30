"""Deterministic synthetic demo dataset for the Execution Truth Engine.

Generates 120+ L5/L6 schedule activities across six disciplines, 30+ heterogeneous
field reports (clean, messy, conflicting, duplicate, unknown, partial), historical
execution records and an audit trail. All data is synthetic demo data.
"""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta, timezone

from models import BaselineActivity, Discipline, FieldEvidence

random.seed(42)

PROJECT_START = date(2026, 9, 1)

DISCIPLINE_CONFIG: dict[str, dict] = {
    "CIVIL": {
        "prefix": "CIV",
        "count": 18,
        "asset_prefix": "C",
        "types": ["Foundation", "Excavation", "Concrete Pour", "Backfilling", "Structural Steel Erection"],
        "locations": ["Unit A", "Unit B", "Unit C"],
        "start_offset": 0,
    },
    "PIPING": {
        "prefix": "PIP",
        "count": 30,
        "asset_prefix": "P",
        "types": ["Spool Erection", "Weld Joint Completion", "Hydrotest", "Painting", "Insulation"],
        "locations": ["Unit B", "Unit A", "Tank Farm"],
        "start_offset": 9,
    },
    "MECHANICAL": {
        "prefix": "MEC",
        "count": 20,
        "asset_prefix": "V",
        "types": ["Equipment Installation", "Alignment", "Grouting", "Rotation Test"],
        "locations": ["Unit A", "Unit B", "Unit C"],
        "start_offset": 30,
    },
    "ELECTRICAL": {
        "prefix": "ELC",
        "count": 20,
        "asset_prefix": "E",
        "types": ["Cable Laying", "Termination", "Earthing", "Loop Energization"],
        "locations": ["Unit A", "Unit B", "Battery Limit"],
        "start_offset": 45,
    },
    "INSTRUMENTATION": {
        "prefix": "INS",
        "count": 15,
        "asset_prefix": "I",
        "types": ["Loop Check", "Calibration", "Cable Tray Installation", "Panel Testing"],
        "locations": ["Unit A", "Unit B", "Control Room"],
        "start_offset": 60,
    },
    "HSE": {
        "prefix": "HSE",
        "count": 15,
        "asset_prefix": "H",
        "types": ["Safety Inspection", "Permit to Work", "Fire Watch", "Toolbox Talk"],
        "locations": ["Unit A", "Unit B", "Unit C", "Tank Farm"],
        "start_offset": 5,
    },
}

MILESTONES = [
    ("MIL-L5-017", "Milestone M-17: Unit B Commissioning", "Unit B"),
    ("MIL-L5-018", "Milestone M-18: Tank Farm Ready", "Tank Farm"),
    ("MIL-L5-019", "Milestone M-19: Unit A Handover", "Unit A"),
    ("MIL-L5-020", "Milestone M-20: Project Completion", "All Units"),
]

DELAY_CAUSES = [
    "Material availability",
    "Welding rework",
    "Equipment availability",
    "Weather",
    "Manpower shortage",
    "Design change",
]

CONTRACTORS = ["Larsen & Toubro", "Punj Lloyd", "McNally Bharat", "Dilip Buildcon", "Oil India EPC"]


def _d(day_offset: int) -> date:
    return PROJECT_START + timedelta(days=day_offset)


def generate_activities() -> list[BaselineActivity]:
    activities: list[BaselineActivity] = []
    tails: dict[str, str] = {}

    for discipline, cfg in DISCIPLINE_CONFIG.items():
        chain: list[str] = []
        for index in range(cfg["count"]):
            level = 6 if index % 3 == 2 else 5
            code = f"{cfg['prefix']}-L{level}-{index + 1:03d}"
            asset = f"{cfg['asset_prefix']}-{101 + index:03d}"
            activity_type = cfg["types"][index % len(cfg["types"])]
            location = cfg["locations"][index % len(cfg["locations"])]
            duration = random.choice([2, 3, 3, 4, 5, 6, 8])
            start_offset = cfg["start_offset"] + index * 4
            name = f"{activity_type} {asset}"
            line = None
            if discipline == "PIPING" and activity_type == "Spool Erection":
                line = str(24 + index % 3)
                name = f"Erect Line {line}-{asset}"
            activity = BaselineActivity(
                activity_id=code,
                activity_name=name,
                discipline=Discipline[discipline],
                asset_id=asset,
                line_number=line,
                location=location,
                planned_start=_d(start_offset),
                planned_finish=_d(start_offset + duration),
                planned_duration=float(duration),
                predecessors=[chain[-1]] if chain else [],
            )
            activities.append(activity)
            chain.append(code)
        tails[discipline] = chain[-1]

    for code, name, location in MILESTONES:
        duration = 2
        start_offset = 150 + MILESTONES.index((code, name, location)) * 10
        predecessors = []
        if code == "MIL-L5-017":
            predecessors = [tails["PIPING"], tails["ELECTRICAL"], tails["INSTRUMENTATION"]]
        elif code == "MIL-L5-018":
            predecessors = [tails["PIPING"], tails["MECHANICAL"]]
        elif code == "MIL-L5-019":
            predecessors = [tails["CIVIL"], tails["ELECTRICAL"]]
        else:
            predecessors = ["MIL-L5-017", "MIL-L5-018", "MIL-L5-019"]
        activities.append(
            BaselineActivity(
                activity_id=code,
                activity_name=name,
                discipline=Discipline.OTHER,
                asset_id=None,
                line_number=None,
                location=location,
                planned_start=_d(start_offset),
                planned_finish=_d(start_offset + duration),
                planned_duration=float(duration),
                predecessors=predecessors,
            )
        )

    by_id = {a.activity_id: a for a in activities}
    by_id["PIP-L5-002"].asset_id = "P-131"
    by_id["PIP-L6-003"].asset_id = "P-132"
    by_id["PIP-L5-020"].asset_id = "P-133"
    by_id["PIP-L6-021"].activity_name = "Erect Line 24-P-102"
    by_id["PIP-L6-021"].asset_id = "P-102"
    by_id["PIP-L6-021"].line_number = "24"
    by_id["PIP-L6-021"].location = "Unit B"
    by_id["PIP-L6-021"].planned_start = date(2026, 9, 22)
    by_id["PIP-L6-021"].planned_finish = date(2026, 9, 24)
    by_id["PIP-L6-021"].planned_duration = 3.0
    by_id["PIP-L5-022"].activity_name = "Erect Line 24-P-103"
    by_id["PIP-L5-022"].asset_id = "P-103"
    by_id["PIP-L5-022"].line_number = "24"
    by_id["PIP-L5-022"].location = "Unit B"
    by_id["PIP-L5-022"].planned_start = date(2026, 9, 24)
    by_id["PIP-L5-022"].planned_finish = date(2026, 9, 26)
    by_id["PIP-L5-022"].planned_duration = 3.0
    by_id["PIP-L6-018"].activity_name = "Erect Line 24-P-120"
    by_id["PIP-L6-018"].asset_id = "P-120"
    by_id["PIP-L6-018"].line_number = "24"
    by_id["PIP-L6-018"].location = "Unit A"
    by_id["PIP-L6-018"].planned_start = date(2026, 9, 18)
    by_id["PIP-L6-018"].planned_finish = date(2026, 9, 21)
    by_id["PIP-L6-018"].planned_duration = 3.0
    return activities


def _ts(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 9, 1, hour, minute, tzinfo=timezone.utc) + timedelta(days=day)


def generate_reports(activities: list[BaselineActivity]) -> list[dict]:
    by_id = {a.activity_id: a for a in activities}
    reports: list[dict] = []
    counter = 0

    def add(source_type: str, raw_text: str, progress: float | None, reporter: str, timestamp: datetime) -> None:
        nonlocal counter
        counter += 1
        reports.append(
            {
                "evidence_id": f"EV-{counter:03d}",
                "source_type": source_type,
                "raw_text": raw_text,
                "reported_progress_percent": progress,
                "reporter_id": reporter,
                "timestamp": timestamp.isoformat(),
            }
        )

    hero = by_id["PIP-L6-021"]
    add("DPR", "24 inch P-102 spool erection completed at Unit B. Hydrotest pending.", None, "sup-ahmed", _ts(23, 16, 45))
    add("SPREADSHEET", "PIP-L6-021 | P-102 | Erection | 100 | 2026-09-24", 100.0, "planner-das", _ts(23, 18, 0))
    add("VOICE_TRANSCRIPT", "boss, erection for piping line P-102 is only 60 percent done as of now", None, "sup-borah", _ts(23, 20, 0))

    a22 = by_id["PIP-L5-022"]
    add("DPR", "Line 24-P-103 spool erection completed at Unit B on 25 Sep.", None, "sup-ahmed", _ts(24, 17, 0))
    add("SPREADSHEET", "PIP-L6-022 | P-103 | Erection | 100 | 2026-09-25", 100.0, "planner-das", _ts(24, 18, 0))

    a18 = by_id["PIP-L6-018"]
    add("DPR", "PIP-L6-018 erection of line 24-P-120 completed. 100 percent.", None, "sup-ahmed", _ts(17, 15, 30))

    mec = by_id["MEC-L6-003"]
    mec_start = mec.planned_start
    add("DPR", f"{mec.activity_id} installation of {mec.asset_id} completed at {mec.location}.", None, "sup-das", datetime.combine(mec_start + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc).replace(hour=16))
    add("SUPERVISOR_UPDATE", f"{mec.asset_id} installation around 75 percent, alignment pending", None, "sup-roy", datetime.combine(mec_start + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc).replace(hour=19))

    elc = by_id["ELC-L6-018"]
    elc_start = elc.planned_start
    add("SPREADSHEET", f"{elc.activity_id} | {elc.asset_id} | Cable Laying | 90 | {elc_start + timedelta(days=2)}", 90.0, "planner-das", datetime.combine(elc_start + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc).replace(hour=12))
    add("VOICE_TRANSCRIPT", f"cable laying for {elc.asset_id} maybe 40 percent, drums not available", None, "sup-borah", datetime.combine(elc_start + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc).replace(hour=21))

    clean_targets = ["PIP-L6-024", "PIP-L6-027", "CIV-L6-006", "CIV-L6-012", "MEC-L6-009", "MEC-L6-015", "ELC-L6-006", "ELC-L6-012", "INS-L6-003", "INS-L6-009", "HSE-L6-006", "HSE-L6-012"]
    for code in clean_targets:
        activity = by_id[code]
        start = activity.planned_start
        add("DPR", f"{code} {activity.activity_name.lower()} completed at {activity.location}.", None, "sup-ahmed", datetime.combine(start + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc).replace(hour=16))
        add("SPREADSHEET", f"{code} | {activity.asset_id} | Work | 100 | {start + timedelta(days=2)}", 100.0, "planner-das", datetime.combine(start + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc).replace(hour=18))

    messy_targets = ["PIP-L6-030", "CIV-L6-009", "MEC-L6-018", "ELC-L6-015", "INS-L6-012"]
    for code in messy_targets:
        activity = by_id[code]
        start = activity.planned_start
        add("VOICE_TRANSCRIPT", f"{activity.asset_id} work in progress at {activity.location}, about 50 percent done", None, "sup-das", datetime.combine(start + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc).replace(hour=17))

    partial_targets = ["PIP-L6-015", "MEC-L6-006", "ELC-L6-009"]
    for code in partial_targets:
        activity = by_id[code]
        start = activity.planned_start
        add("DPR", f"{activity.asset_id} erection 60 percent complete, welding remaining", None, "sup-roy", datetime.combine(start + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc).replace(hour=15))

    add("DPR", "X-999 structural steel erection completed at Unit D.", None, "sup-ahmed", _ts(30, 16, 0))
    add("VOICE_TRANSCRIPT", "hydrotest for line P-102 is still pending, not started", None, "sup-borah", _ts(23, 20, 30))
    add("DPR", "24 inch P-102 spool erection completed at Unit B.", None, "sup-ahmed", _ts(23, 16, 45))
    add("SUPERVISOR_UPDATE", "P-102 spool erection 100 percent, cleared for hydrotest", None, "sup-das", _ts(23, 19, 0))
    add("DPR", "PIP-L6-021 erection completed. Progress 100%.", None, "sup-ahmed", _ts(23, 16, 50))
    return reports


def generate_historical() -> list[dict]:
    records: list[dict] = []
    for index in range(42):
        discipline = random.choice(list(DISCIPLINE_CONFIG.keys()))
        cfg = DISCIPLINE_CONFIG[discipline]
        activity_type = random.choice(cfg["types"])
        planned = random.choice([16, 24, 32, 40, 48])
        delay = random.choice([0, 0, 4, 8, 12, 16, 24, 32])
        actual = planned + delay
        records.append(
            {
                "id": f"HIS-{index + 1:03d}",
                "discipline": discipline,
                "activity_type": activity_type,
                "planned_duration_hours": float(planned),
                "actual_duration_hours": float(actual),
                "delay_hours": float(delay),
                "delay_cause": random.choice(DELAY_CAUSES) if delay > 0 else "None",
                "contractor": random.choice(CONTRACTORS),
                "location": random.choice(cfg["locations"]),
            }
        )
    return records


def build_dependencies(activities: list[BaselineActivity]) -> list[dict]:
    return [
        {"predecessor_id": a.predecessors[0], "successor_id": a.activity_id, "dependency_type": "FS", "lag_hours": 0}
        for a in activities
        if a.predecessors
    ]


__all__ = [
    "build_dependencies",
    "generate_activities",
    "generate_historical",
    "generate_reports",
]
