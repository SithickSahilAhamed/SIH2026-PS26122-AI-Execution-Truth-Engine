import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GitCompareArrows,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import type { AuditEntry } from "../api/types";

const STAGES = [
  { key: "SOURCE", label: "Source", icon: FileText, actions: ["EVENT_CREATED"] },
  { key: "EXTRACTED", label: "Extracted Event", icon: ScanSearch, actions: ["EVENT_CREATED"] },
  { key: "MATCHED", label: "Candidate Match", icon: GitCompareArrows, actions: ["EVENT_MATCHED"] },
  { key: "TRUST", label: "Trust Score", icon: ShieldCheck, actions: ["EVENT_MATCHED"] },
  { key: "DECISION", label: "Planner Decision", icon: ClipboardCheck, actions: ["MATCH_REVIEWED", "CONFLICT_CREATED", "CONFLICT_RESOLVED"] },
  { key: "UPDATED", label: "Schedule Update", icon: CheckCircle2, actions: ["SCHEDULE_UPDATED", "SCENARIO_CREATED", "SCENARIO_RUN"] },
];

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="flex items-center w-full overflow-x-auto pb-2">
      {STAGES.map((stage, index) => {
        const stageEntries = entries.filter((e) => stage.actions.includes(e.action));
        const done = stageEntries.length > 0;
        return (
          <div key={stage.key} className="flex items-center flex-1 min-w-[150px]">
            <div className="flex flex-col items-center gap-1.5 w-full">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  done
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "border-border text-muted"
                }`}
              >
                <stage.icon className="w-4 h-4" />
              </div>
              <span
                className={`text-[9px] font-semibold tracking-widest uppercase ${done ? "text-emerald-600 dark:text-emerald-400" : "text-muted"}`}
              >
                {stage.label}
              </span>
              <span className="mono text-[10px] text-muted">{stageEntries.length} events</span>
            </div>
            {index < STAGES.length - 1 && <ArrowRight className="w-4 h-4 text-border shrink-0 -mt-6" />}
          </div>
        );
      })}
    </div>
  );
}
