import { FlaskConical, Play } from "lucide-react";
import { useState } from "react";
import { api, PROJECT_ID } from "../api/client";
import type { Discipline, Scenario } from "../api/types";
import { useApi } from "../hooks";
import { Button, Card, CardHeader, EmptyState, FactTag, SkeletonRows } from "../components/ui";

const DISCIPLINES: Discipline[] = ["CIVIL", "PIPING", "MECHANICAL", "ELECTRICAL", "INSTRUMENTATION", "HSE"];

export function WhatIfSimulator() {
  const [crewDiscipline, setCrewDiscipline] = useState<Discipline>("PIPING");
  const [crewCount, setCrewCount] = useState(1);
  const [durationPct, setDurationPct] = useState(0);
  const [startShift, setStartShift] = useState(0);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [running, setRunning] = useState(false);
  const { data: activitiesData } = useApi(() => api.get<{ activities: { activity_id: string; discipline: string; status: string }[] }>(`/api/v1/projects/${PROJECT_ID}/activities`));

  const delayed = (activitiesData?.activities || []).filter((a) => a.status === "DELAYED" || a.status === "AT_RISK");

  async function runScenario() {
    setRunning(true);
    try {
      const created = await api.post<Scenario>(`/api/v1/projects/${PROJECT_ID}/scenarios`, {
        name: `+${crewCount} ${crewDiscipline} crew`,
        assumptions: {
          additional_crews: [{ discipline: crewDiscipline, count: crewCount }],
          duration_change_pct: durationPct,
          start_shift_days: startShift,
        },
      });
      const result = await api.post<Scenario>(`/api/v1/scenarios/${created.id}/run`);
      setScenario(result);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 space-y-4 anim-fade-up">
      <Card>
        <CardHeader
          title="What-If Scenario"
          subtitle="SIMULATED / WHAT-IF — scenario results never modify actual project state"
          right={
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-dashed border-violet-400 text-violet-600 dark:text-violet-400 text-[11px] font-bold uppercase tracking-wide">
              <FlaskConical className="w-3.5 h-3.5" /> Simulated / What-If
            </span>
          }
        />
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted">Additional Crew Discipline</label>
              <select
                value={crewDiscipline}
                onChange={(e) => setCrewDiscipline(e.target.value as Discipline)}
                className="mt-1 w-full text-[12px] font-semibold px-2 py-1.5 rounded border border-border bg-surface text-ink"
              >
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted">Crew Count</label>
              <input
                type="number"
                min={0}
                max={5}
                value={crewCount}
                onChange={(e) => setCrewCount(Number(e.target.value))}
                className="mt-1 w-full text-[12px] font-semibold px-2 py-1.5 rounded border border-border bg-surface text-ink"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted">Duration Change %</label>
              <input
                type="number"
                value={durationPct}
                onChange={(e) => setDurationPct(Number(e.target.value))}
                className="mt-1 w-full text-[12px] font-semibold px-2 py-1.5 rounded border border-border bg-surface text-ink"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted">Start Shift (days)</label>
              <input
                type="number"
                value={startShift}
                onChange={(e) => setStartShift(Number(e.target.value))}
                className="mt-1 w-full text-[12px] font-semibold px-2 py-1.5 rounded border border-border bg-surface text-ink"
              />
            </div>
          </div>

          {delayed.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1.5">
                Evaluate recovery for
              </div>
              <div className="flex flex-wrap gap-1.5">
                {delayed.map((a) => (
                  <button
                    key={a.activity_id}
                    onClick={() => setCrewDiscipline((a.discipline as Discipline) || "PIPING")}
                    className="mono text-[10px] font-semibold px-2 py-1 rounded border border-border text-muted hover:text-ink"
                  >
                    {a.activity_id}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <Button onClick={runScenario} disabled={running}>
              <Play className="w-3.5 h-3.5" /> {running ? "Running simulation…" : "Run Scenario"}
            </Button>
          </div>
        </div>
      </Card>

      {scenario?.result && (
        <Card>
          <CardHeader
            title="Baseline vs Simulated"
            subtitle={scenario.name}
            right={<FactTag type="SIMULATED" />}
          />
          <div className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-border rounded-md p-4">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">Baseline</div>
                <div className="space-y-2">
                  {scenario.result.milestones.map((m) => (
                    <div key={m.milestone_id} className="flex items-center justify-between text-[12px]">
                      <span className="mono font-semibold">{m.milestone_id}</span>
                      <span className="text-muted mono">{m.baseline_finish.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-dashed border-violet-400 rounded-md p-4 bg-violet-50/40 dark:bg-violet-500/5">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-3">
                  Simulated / What-If
                </div>
                <div className="space-y-2">
                  {scenario.result.milestones.map((m) => (
                    <div key={m.milestone_id} className="flex items-center justify-between text-[12px]">
                      <span className="mono font-semibold">{m.milestone_id}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-muted mono">{m.simulated_finish?.slice(0, 10) || "—"}</span>
                        <span className={`font-bold tabular-nums ${m.delta_days < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-ink"}`}>
                          {m.delta_days > 0 ? `+${m.delta_days}d` : `${m.delta_days}d`}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="border border-border rounded-md px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">Projected Recovery</span>
                <div className="text-[18px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {scenario.result.recovery_days} days
                </div>
              </div>
              <div className="text-[11px] text-muted">
                Actual schedule unchanged — this is a simulation only.
              </div>
            </div>
          </div>
        </Card>
      )}

      {!scenario && !running && (
        <Card><EmptyState title="No scenario run yet" hint="Configure recovery levers and run the simulator." /></Card>
      )}
      {running && <Card><SkeletonRows rows={3} /></Card>}
    </div>
  );
}
