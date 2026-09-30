import type { TrustComponents } from "../api/types";

const MAXES: Record<keyof TrustComponents, number> = {
  evidence_agreement: 25,
  activity_match: 25,
  temporal_consistency: 20,
  source_reliability: 15,
  historical_consistency: 15,
};

const LABELS: Record<keyof TrustComponents, string> = {
  evidence_agreement: "Evidence Agreement",
  activity_match: "Activity Match",
  temporal_consistency: "Temporal Consistency",
  source_reliability: "Source Reliability",
  historical_consistency: "Historical Consistency",
};

function scoreColor(score: number) {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function barColor(score: number) {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-red-500";
}

export function TrustScore({
  score,
  breakdown,
  size = "md",
}: {
  score: number;
  breakdown: TrustComponents;
  size?: "md" | "lg";
}) {
  return (
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center">
        <div className={`font-bold tabular-nums ${size === "lg" ? "text-5xl" : "text-3xl"} ${scoreColor(score)}`}>
          {score}
          <span className="text-muted text-lg font-semibold">/100</span>
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mt-1">
          Execution Trust
        </div>
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        {(Object.keys(MAXES) as (keyof TrustComponents)[]).map((key) => {
          const value = breakdown[key];
          const max = MAXES[key];
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[11px] text-muted w-36 shrink-0 truncate">{LABELS[key]}</span>
              <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor((value / max) * 100)} transition-all duration-500`}
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold tabular-nums text-ink w-12 text-right">
                {value}/{max}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TrustDecision({ decision }: { decision: string }) {
  const styles: Record<string, string> = {
    AUTO_APPROVED: "bg-emerald-600 text-white",
    AUTO_MATCHED: "bg-emerald-600 text-white",
    REQUIRES_REVIEW: "bg-amber-500 text-white",
    REVIEW_REQUIRED: "bg-amber-500 text-white",
    CONFLICT_DETECTED: "bg-red-600 text-white",
    UNMATCHED: "bg-slate-500 text-white",
  };
  return (
    <span
      className={`inline-flex items-center px-3 py-1.5 rounded text-[12px] font-bold tracking-wide uppercase ${styles[decision] || "bg-slate-500 text-white"}`}
    >
      {decision === "AUTO_APPROVED" || decision === "AUTO_MATCHED"
        ? "Auto-Linked"
        : decision === "CONFLICT_DETECTED"
          ? "Conflict Detected"
          : decision === "UNMATCHED"
            ? "Unmatched / New Activity"
            : "Review Required"}
    </span>
  );
}
