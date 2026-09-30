import { ArrowDown, Flag } from "lucide-react";
import type { ImpactAnalysis } from "../api/types";
import { FactTag, StatusBadge } from "./ui";

export function DependencyGraph({ impact }: { impact: ImpactAnalysis }) {
  return (
    <div className="space-y-0">
      <div className="border border-blue-300 dark:border-blue-500/40 bg-blue-50/60 dark:bg-blue-500/5 rounded-md p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="mono text-[13px] font-bold text-ink">{impact.root_activity}</div>
            <div className="text-[11px] text-muted mt-0.5">Root Activity — Observed Actual</div>
          </div>
          <div className="text-right">
            <div className="text-[20px] font-bold text-red-600 dark:text-red-400 tabular-nums">
              +{impact.delay_days}d
            </div>
            <FactTag type={impact.delay_fact_type} />
          </div>
        </div>
      </div>

      {impact.affected_activities.length > 0 && (
        <>
          <div className="flex justify-center py-1">
            <ArrowDown className="w-4 h-4 text-muted" />
          </div>
          <div className="space-y-2 pl-6 border-l-2 border-border ml-4">
            {impact.affected_activities.map((a) => (
              <div
                key={a.activity_id}
                className="border border-border rounded-md bg-surface p-3 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[12px] font-semibold text-ink">{a.activity_code}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="text-[11px] text-muted truncate mt-0.5">{a.activity_name}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[15px] font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                    +{a.impact_days}d
                  </span>
                  <FactTag type={a.fact_type} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {impact.affected_milestones.length > 0 && (
        <>
          <div className="flex justify-center py-1">
            <ArrowDown className="w-4 h-4 text-muted" />
          </div>
          <div className="space-y-2">
            {impact.affected_milestones.map((m) => (
              <div
                key={m.activity_id}
                className="border border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/5 rounded-md p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Flag className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <div>
                    <div className="mono text-[13px] font-bold text-ink">{m.activity_code}</div>
                    <div className="text-[11px] text-muted">{m.activity_name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[18px] font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                    +{m.impact_days}d
                  </div>
                  <FactTag type={m.fact_type} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
