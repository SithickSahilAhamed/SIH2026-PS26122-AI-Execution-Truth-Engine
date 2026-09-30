import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  FlaskConical,
  GitCompareArrows,
  ScanSearch,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, PROJECT_ID } from "../api/client";
import type {
  EventListItem,
  ExecutionTwin,
  ImpactAnalysis,
  MatchCandidate,
  Scenario,
} from "../api/types";
import { Button, Card, FactTag, StatusBadge } from "../components/ui";
import { TrustScore } from "../components/TrustScore";
import { DependencyGraph } from "../components/DependencyGraph";

const HERO_ACTIVITY = "PIP-L6-021";
const HERO_REPORT = "24-inch P-102 spool erection completed at Unit B. Hydrotest is pending.";

const STAGES = [
  { key: "report", label: "Field Report", icon: FileText },
  { key: "extraction", label: "Extraction", icon: ScanSearch },
  { key: "matching", label: "L5/L6 Matching", icon: GitCompareArrows },
  { key: "fusion", label: "Evidence Fusion", icon: CheckCircle2 },
  { key: "trust", label: "Trust", icon: ShieldCheck },
  { key: "conflict", label: "Conflict", icon: AlertTriangle },
  { key: "twin", label: "Execution Twin", icon: Workflow },
  { key: "impact", label: "Dependency Impact", icon: Workflow },
  { key: "whatif", label: "What-If", icon: FlaskConical },
  { key: "audit", label: "Audit", icon: FileText },
];

interface HeroData {
  events: EventListItem[];
  candidates: MatchCandidate[];
  trust: {
    total_score: number;
    components: { evidence_agreement: number; activity_match: number; temporal_consistency: number; source_reliability: number; historical_consistency: number };
    decision: string;
    explanation: string[];
    conflict: { spread_percent: number; agreement_percent: number; description: string } | null;
  } | null;
  twin: ExecutionTwin | null;
  impact: ImpactAnalysis | null;
  scenario: Scenario | null;
}

export function HeroDemo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stage, setStage] = useState(0);
  const [data, setData] = useState<HeroData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStage(0);
    setData(null);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const [eventsRes, twin, impact] = await Promise.all([
          api.get<{ events: EventListItem[] }>(`/api/v1/projects/${PROJECT_ID}/events`),
          api.get<ExecutionTwin>(`/api/v1/activities/${HERO_ACTIVITY}/execution-twin`),
          api.get<ImpactAnalysis>(`/api/v1/activities/${HERO_ACTIVITY}/impact`),
        ]);
        const heroEvents = eventsRes.events.filter((e) => e.link.activity_id === HERO_ACTIVITY);
        if (heroEvents.length === 0) {
          throw new Error(`No events linked to ${HERO_ACTIVITY} — seed the demo dataset first.`);
        }
        const eventId = heroEvents[0].event.event_id;
        const [candidatesRes, trustRes] = await Promise.all([
          api
            .get<{ candidates: MatchCandidate[] }>(`/api/v1/events/${eventId}/candidates`)
            .catch(() => ({ candidates: [] as MatchCandidate[] })),
          api.get<HeroData["trust"]>(`/api/v1/events/${eventId}/trust`).catch(() => null),
        ]);
        const scenario = await api
          .post<Scenario>(`/api/v1/projects/${PROJECT_ID}/scenarios`, {
            name: "Hero: +1 piping crew",
            assumptions: { additional_crews: [{ discipline: "PIPING", count: 1 }] },
          })
          .then((s) => api.post<Scenario>(`/api/v1/scenarios/${s.id}/run`))
          .catch(() => null);
        setData({
          events: heroEvents,
          candidates: candidatesRes.candidates,
          trust: trustRes,
          twin,
          impact,
          scenario,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load hero demo data");
      } finally {
        setLoading(false);
      }
    })();
  }, [open ]);

  if (!open) return null;

  const current = STAGES[stage];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-lg w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div>
            <div className="text-[14px] font-bold text-ink">Hero Demo — End-to-End Flow</div>
            <div className="text-[11px] text-muted mt-0.5">
              REPORT → VERIFY → UNDERSTAND → IMPACT → RECOVER
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-muted hover:text-ink hover:bg-surface2" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border flex items-center gap-1 overflow-x-auto">
          {STAGES.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <button
                onClick={() => setStage(i)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap transition-colors ${
                  i === stage
                    ? "bg-blue-600 text-white"
                    : i < stage
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted hover:text-ink"
                }`}
              >
                <s.icon className="w-3 h-3" />
                {s.label}
              </button>
              {i < STAGES.length - 1 && <ChevronRight className="w-3 h-3 text-border mx-0.5" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="space-y-3">
              <div className="skeleton h-24" />
              <div className="skeleton h-24" />
              <div className="skeleton h-24" />
            </div>
          ) : error ? (
            <div className="border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 rounded-md p-4 text-[12px] text-red-700 dark:text-red-300">
              <span className="font-bold">Could not load hero demo: </span>
              {error}
            </div>
          ) : (
            <StageContent stage={current.key} data={data} />
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <Button variant="ghost" onClick={() => setStage((s) => Math.max(0, s - 1))} disabled={stage === 0}>
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </Button>
          <span className="text-[11px] text-muted">
            Step {stage + 1} of {STAGES.length}
          </span>
          {stage < STAGES.length - 1 ? (
            <Button onClick={() => setStage((s) => s + 1)}>
              Next <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button variant="success" onClick={onClose}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Complete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StageContent({ stage, data }: { stage: string; data: HeroData | null }) {
  if (!data) return null;

  switch (stage) {
    case "report":
      return (
        <div className="space-y-3">
          <StageTitle icon={FileText} title="Messy Reality" subtitle="A field supervisor files a daily progress report" />
          <div className="border border-border rounded-md bg-surface2 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">Daily Progress Report — DPR</div>
            <p className="text-[14px] text-ink leading-relaxed">"{HERO_REPORT}"</p>
            <div className="flex items-center gap-3 mt-3 text-[11px] text-muted">
              <span>Source: DPR</span>
              <span>Reporter: sup-ahmed</span>
              <span>24 Sep 2026, 16:45</span>
            </div>
          </div>
        </div>
      );

    case "extraction": {
      const ev = data.events[0]?.event;
      return (
        <div className="space-y-3">
          <StageTitle icon={ScanSearch} title="AI Extraction" subtitle="Unstructured text → canonical execution event" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { label: "Discipline", value: ev?.discipline || "PIPING" },
              { label: "Asset", value: ev?.mentioned_asset_id || "P-102" },
              { label: "Activity Type", value: ev?.event_type || "COMPLETE" },
              { label: "Location", value: ev?.location || "Unit B" },
              { label: "Progress", value: `${ev?.progress_percent ?? 100}%` },
              { label: "Confidence", value: `${((ev?.extraction_confidence || 0.75) * 100).toFixed(0)}%` },
            ].map((f) => (
              <div key={f.label} className="border border-border rounded-md p-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">{f.label}</div>
                <div className="text-[15px] font-bold text-ink mt-1 mono">{f.value}</div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-muted">
            <FactTag type="FACT" /> Raw text preserved · <FactTag type="INFERENCE" /> Structured fields extracted
          </div>
        </div>
      );
    }

    case "matching":
      return (
        <div className="space-y-3">
          <StageTitle icon={GitCompareArrows} title="L5/L6 Semantic Matching" subtitle="Hybrid: structured signals + semantic similarity" />
          <div className="space-y-2">
            {data.candidates.map((c, i) => (
              <div key={c.activity_id} className="border border-border rounded-md p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="mono text-[10px] font-bold text-muted border border-border rounded px-1.5 py-0.5">#{i + 1}</span>
                  <div>
                    <span className="mono text-[12px] font-bold text-ink">{c.activity_code}</span>
                    <span className="text-[11px] text-muted ml-2">{c.activity_name}</span>
                  </div>
                </div>
                <span className={`text-[16px] font-bold tabular-nums ${c.score >= 90 ? "text-emerald-600 dark:text-emerald-400" : "text-muted"}`}>
                  {c.score}%
                </span>
              </div>
            ))}
          </div>
          <div className="border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 rounded-md p-3 text-[12px] text-emerald-700 dark:text-emerald-400">
            <strong>{HERO_ACTIVITY}</strong> — Erect Line 24-P-102 matched via asset P-102 + discipline PIPING + semantic
            similarity. Trust {data.trust?.total_score}/100.
          </div>
        </div>
      );

    case "fusion":
      return (
        <div className="space-y-3">
          <StageTitle icon={CheckCircle2} title="Evidence Fusion" subtitle="Multiple sources corroborate the execution claim" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {["DPR", "Spreadsheet", "Supervisor Update"].map((s) => (
              <div key={s} className="border border-border rounded-md p-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[12px] font-semibold text-ink">{s}</span>
              </div>
            ))}
          </div>
          <div className="text-[12px] text-muted">
            {data.events.length} evidence items fused for {HERO_ACTIVITY}. Cross-source agreement computed before any
            schedule update.
          </div>
        </div>
      );

    case "trust":
      return (
        <div className="space-y-3">
          <StageTitle icon={ShieldCheck} title="Execution Trust Score" subtitle="Explainable confidence — every point accounted for" />
          {data.trust && <TrustScore score={data.trust.total_score} breakdown={data.trust.components} size="lg" />}
          <ul className="space-y-1.5">
            {data.trust?.explanation.map((line, i) => (
              <li key={i} className="text-[12px] text-ink flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-600 shrink-0" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      );

    case "conflict":
      return (
        <div className="space-y-3">
          <StageTitle icon={AlertTriangle} title="Conflict Detected" subtitle="A second evidence source contradicts the first" />
          <div className="border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 rounded-md p-4">
            <div className="flex items-center gap-2 text-[13px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">
              <AlertTriangle className="w-4 h-4" /> Conflict Detected
            </div>
            <div className="text-[12px] text-red-700/90 dark:text-red-300/90 mt-2">
              {data.trust?.conflict?.description || "Evidence disagrees on PIP-L6-021: claims range 60%–100%."}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { s: "DPR", c: "100%" },
                { s: "Spreadsheet", c: "100%" },
                { s: "Voice", c: "60%" },
              ].map((x) => (
                <div key={x.s} className="bg-surface border border-border rounded px-2 py-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold">{x.s}</span>
                  <span className="text-[12px] font-bold tabular-nums">{x.c}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[12px] font-semibold text-red-700 dark:text-red-400">
              Evidence agreement: {data.trust?.conflict?.agreement_percent || 67}% — planner review forced. No source auto-selected.
            </div>
          </div>
        </div>
      );

    case "twin":
      return (
        <div className="space-y-3">
          <StageTitle icon={Workflow} title="Execution Twin Updated" subtitle="Approved evidence updates the activity's execution state" />
          {data.twin && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <TwinPanel title="Planned" fact="PLAN" rows={[["Finish", data.twin.planned.finish], ["Duration", `${data.twin.planned.duration_days}d`]]} />
              <TwinPanel
                title="Actual"
                fact="OBSERVED"
                rows={[
                  ["Finish", data.twin.actual.finish?.slice(0, 10) || "—"],
                  ["Progress", `${data.twin.actual.progress}%`],
                ]}
                highlight
              />
              <TwinPanel
                title="Forecast"
                fact="FORECAST"
                rows={[
                  ["Projected Finish", data.twin.forecast.finish?.slice(0, 10) || "—"],
                  ["Trust", data.twin.trust_score !== null ? `${data.twin.trust_score}/100` : "—"],
                ]}
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <StatusBadge status={data.twin?.status || "AT_RISK"} />
            <span className="text-[12px] text-muted">
              Variance: <strong className="text-red-600 dark:text-red-400">+{data.twin?.variance.days || 0} days</strong> ·
              Evidence sources: {data.twin?.evidence_count || 0}
            </span>
          </div>
        </div>
      );

    case "impact":
      return (
        <div className="space-y-3">
          <StageTitle icon={Workflow} title="Dependency Impact" subtitle="Delay propagates through the dependency graph" />
          {data.impact && <DependencyGraph impact={data.impact} />}
          <div className="text-[11px] text-muted">
            <FactTag type="OBSERVED" /> Root delay · <FactTag type="CALCULATED" /> Downstream propagation ·{" "}
            <FactTag type="FORECAST" /> Milestone impact
          </div>
        </div>
      );

    case "whatif":
      return (
        <div className="space-y-3">
          <StageTitle icon={FlaskConical} title="What-If Scenario" subtitle="SIMULATED / WHAT-IF — actual schedule unchanged" />
          {data.scenario?.result && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-border rounded-md p-4">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">Baseline</div>
                {data.scenario.result.milestones.map((m) => (
                  <div key={m.milestone_id} className="flex justify-between text-[12px] py-1">
                    <span className="mono font-semibold">{m.milestone_id}</span>
                    <span className="text-muted mono">{m.baseline_finish.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
              <div className="border border-dashed border-violet-400 rounded-md p-4 bg-violet-50/40 dark:bg-violet-500/5">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-2">
                  Simulated: +1 Piping Crew
                </div>
                {data.scenario.result.milestones.map((m) => (
                  <div key={m.milestone_id} className="flex justify-between text-[12px] py-1">
                    <span className="mono font-semibold">{m.milestone_id}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted mono">{m.simulated_finish?.slice(0, 10)}</span>
                      <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {m.delta_days > 0 ? `+${m.delta_days}d` : `${m.delta_days}d`}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );

    case "audit":
      return (
        <div className="space-y-3">
          <StageTitle icon={FileText} title="Audit Trail Created" subtitle="Every step of this flow is traceable" />
          <div className="space-y-2">
            {[
              { s: "Source", d: "DPR — sup-ahmed — 24 Sep 2026 16:45" },
              { s: "Extracted Event", d: `${data.events[0]?.event.event_id || "EVT-…"} — COMPLETE — P-102 — 100%` },
              { s: "Candidate Match", d: `${HERO_ACTIVITY} — score ${data.candidates[0]?.score || 0}%` },
              { s: "Trust Score", d: `${data.trust?.total_score}/100 — ${data.trust?.decision.replace(/_/g, " ")}` },
              { s: "Planner Decision", d: "Review required — conflict flagged" },
              { s: "Schedule Update", d: `${HERO_ACTIVITY} — versioned, audited` },
            ].map((row) => (
              <div key={row.s} className="flex items-center gap-3 border border-border rounded-md px-3 py-2.5">
                <ArrowRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted w-32 shrink-0">{row.s}</span>
                <span className="text-[12px] text-ink mono">{row.d}</span>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

function StageTitle({ icon: Icon, title, subtitle }: { icon: typeof FileText; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-md bg-navy flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5 w-4 h-4 text-white" />
      </div>
      <div>
        <div className="text-[15px] font-bold text-ink">{title}</div>
        <div className="text-[11px] text-muted">{subtitle}</div>
      </div>
    </div>
  );
}

function TwinPanel({
  title,
  fact,
  rows,
  highlight,
}: {
  title: string;
  fact: "PLAN" | "OBSERVED" | "FORECAST";
  rows: string[][];
  highlight?: boolean;
}) {
  return (
    <div className={`border rounded-md p-3 ${highlight ? "border-blue-300 dark:border-blue-500/40 bg-blue-50/40 dark:bg-blue-500/5" : "border-border"}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-ink">{title}</span>
        <FactTag type={fact} />
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between text-[12px]">
            <span className="text-muted">{label}</span>
            <span className="font-semibold text-ink mono">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
