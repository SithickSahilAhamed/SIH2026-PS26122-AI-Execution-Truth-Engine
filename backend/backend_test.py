import json

import requests

B = "http://127.0.0.1:8100"
PID = "3f2a9c1e-5b7d-4a3f-9c2e-1d4b6a8c0e12"

r = requests.post(B + "/api/v1/demo/seed", timeout=30).json()
print("SEED:", json.dumps(r["data"]))

d = requests.get(f"{B}/api/v1/projects/{PID}/dashboard", timeout=30).json()["data"]
print("KPIs:", json.dumps(d["kpis"]))
print("disciplines:", len(d["discipline_breakdown"]), "weeks:", len(d["progress_trend"]))
print("recent_events:", len(d["recent_events"]), "conflicts:", len(d["open_conflicts"]), "critical:", len(d["critical_activities"]))

ev = requests.get(f"{B}/api/v1/projects/{PID}/events", timeout=30).json()["data"]
print("events total:", ev["total"])
e21 = [e for e in ev["events"] if e["link"].get("activity_id") == "PIP-L6-021"]
print("021 events:", len(e21), "link:", e21[0]["link"]["match_status"], e21[0]["link"]["trust_score"])
eid = e21[0]["event"]["event_id"]

t = requests.get(f"{B}/api/v1/events/{eid}/trust", timeout=30).json()["data"]
print("021 trust:", t["total_score"], t["decision"], t["components"])

c = requests.get(f"{B}/api/v1/events/{eid}/candidates", timeout=30).json()["data"]
print("021 candidates:", [(x["activity_code"], x["score"]) for x in c["candidates"]])

twin = requests.get(f"{B}/api/v1/activities/PIP-L6-021/execution-twin", timeout=30).json()["data"]
print("twin:", json.dumps({k: twin[k] for k in ("variance", "trust_score", "status", "evidence_count")}))

imp = requests.get(f"{B}/api/v1/activities/PIP-L6-021/impact", timeout=30).json()["data"]
print("impact: delay", imp["delay_days"], "affected", imp["affected_count"], "milestones", len(imp["affected_milestones"]))

sc = requests.post(
    f"{B}/api/v1/projects/{PID}/scenarios",
    json={"name": "Add 1 piping crew", "assumptions": {"additional_crews": [{"discipline": "PIPING", "count": 1}]}},
    timeout=30,
).json()["data"]
run = requests.post(f"{B}/api/v1/scenarios/{sc['id']}/run", timeout=30).json()["data"]
print("scenario:", run["status"], "milestones:", [(m["milestone_id"], m["delta_days"]) for m in run["result"]["milestones"]])

h = requests.get(f"{B}/api/v1/projects/{PID}/history/similar?discipline=PIPING", timeout=30).json()["data"]
print("history:", h["sample_size"], h["average_delay_hours"], [c["cause"] for c in h["common_delay_causes"][:3]])

a = requests.get(f"{B}/api/v1/projects/{PID}/audit", timeout=30).json()["data"]
print("audit entries:", a["total"])

cf = requests.get(f"{B}/api/v1/projects/{PID}/conflicts", timeout=30).json()["data"]
print("conflicts:", cf["open_count"])

rv = requests.get(f"{B}/api/v1/projects/{PID}/reviews", timeout=30).json()["data"]
print("pending reviews:", rv["pending_count"])

rp = requests.get(f"{B}/api/v1/projects/{PID}/reports", timeout=30).json()["data"]
print("reports:", rp["total"])

st = requests.get(f"{B}/api/v1/schedule/state", timeout=30).json()["data"]
print("state summary:", json.dumps(st["summary"]))
