"""Dump every API response the frontend needs into offlineSnapshot.json."""
import json
import os
import urllib.request

BASE = "http://127.0.0.1:8100"
PID = "3f2a9c1e-5b7d-4a3f-9c2e-1d4b6a8c0e12"
OFFLINE_SCENARIO_ID = "SCN-OFFLINE-001"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "src", "api", "offlineSnapshot.json")


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        payload = json.loads(r.read().decode())
    if not payload.get("success", True):
        raise RuntimeError(f"API error for {method} {path}: {payload.get('error')}")
    return payload["data"]


def main():
    routes = {}

    seed = call("POST", "/api/v1/demo/seed")
    routes[f"POST /api/v1/demo/seed"] = seed
    print(f"seed -> {seed}")

    fixed = [
        f"/api/v1/projects/{PID}/dashboard",
        f"/api/v1/projects/{PID}/events",
        f"/api/v1/projects/{PID}/reviews",
        f"/api/v1/projects/{PID}/activities",
        f"/api/v1/projects/{PID}/conflicts",
        f"/api/v1/projects/{PID}/reports",
        f"/api/v1/projects/{PID}/audit",
        f"/api/v1/projects/{PID}/history/similar",
        "/api/v1/config/thresholds",
        "/api/v1/demo/status",
    ]
    for path in fixed:
        routes[f"GET {path}"] = call("GET", path)

    events = routes[f"GET /api/v1/projects/{PID}/events"]["events"]
    for item in events:
        eid = item["event"]["event_id"]
        for suffix in ("", "/trust", "/candidates"):
            key = f"GET /api/v1/events/{eid}{suffix}"
            try:
                routes[key] = call("GET", f"/api/v1/events/{eid}{suffix}")
            except Exception as exc:  # noqa: BLE001
                print(f"  skip {key}: {exc}")

    activities = routes[f"GET /api/v1/projects/{PID}/activities"]["activities"]
    for activity in activities:
        aid = activity["activity_id"]
        for kind in ("execution-twin", "impact"):
            path = f"/api/v1/activities/{aid}/{kind}"
            try:
                routes[f"GET {path}"] = call("GET", path)
            except Exception as exc:  # noqa: BLE001
                print(f"  skip {path}: {exc}")

    created = call(
        "POST",
        f"/api/v1/projects/{PID}/scenarios",
        {
            "name": "Recover piping slippage",
            "assumptions": {
                "additional_crews": [{"discipline": "PIPING", "count": 2}],
                "duration_change_pct": -10,
                "start_shift_days": 0,
            },
        },
    )
    real_id = created["id"]
    run = call("POST", f"/api/v1/scenarios/{real_id}/run")
    created["id"] = OFFLINE_SCENARIO_ID
    run["id"] = OFFLINE_SCENARIO_ID
    routes[f"POST /api/v1/projects/{PID}/scenarios"] = created
    routes[f"POST /api/v1/scenarios/{OFFLINE_SCENARIO_ID}/run"] = run
    print(f"scenario run -> recovery_days={run['result']['recovery_days']}")

    snapshot = {"project_id": PID, "scenario_id": OFFLINE_SCENARIO_ID, "routes": routes}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {OUT} -> {os.path.getsize(OUT)} bytes, {len(routes)} routes")


if __name__ == "__main__":
    main()
