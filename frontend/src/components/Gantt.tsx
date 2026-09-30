import type { Activity } from "../api/types";

const DEMO_TODAY = new Date("2026-12-15T00:00:00Z");

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const ACTUAL_COLORS: Record<string, string> = {
  COMPLETED: "bg-blue-600",
  IN_PROGRESS: "bg-blue-500",
  DELAYED: "bg-red-500",
  AT_RISK: "bg-amber-500",
  NOT_STARTED: "bg-slate-300 dark:bg-slate-600",
  BLOCKED: "bg-red-400",
};

export function Gantt({
  activities,
  selectedId,
  onSelect,
  height = 34,
}: {
  activities: Activity[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const dates = activities.flatMap((a) =>
    [a.planned_start, a.planned_finish, a.actual_start, a.actual_finish]
      .map(parseDate)
      .filter((d): d is Date => d !== null),
  );
  if (dates.length === 0) return null;
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  const span = Math.max(1, max.getTime() - min.getTime());
  const pct = (d: Date) => ((d.getTime() - min.getTime()) / span) * 100;
  const todayPct = ((DEMO_TODAY.getTime() - min.getTime()) / span) * 100;

  const weeks: number[] = [];
  const cursor = new Date(min);
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay());
  while (cursor.getTime() <= max.getTime()) {
    weeks.push(pct(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="flex">
          <div className="w-64 shrink-0 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted border-b border-border">
            Activity
          </div>
          <div className="flex-1 relative border-b border-border">
            <div className="flex justify-between px-2 py-2 text-[10px] text-muted">
              <span>{min.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
              <span>{max.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>
          </div>
        </div>
        {weeks.map((w, i) => (
          <div key={i} className="absolute top-0 bottom-0" style={{ left: `calc(16rem + (100% - 16rem) * ${w / 100})` }}>
            <div className="w-px h-full bg-border/50" />
          </div>
        ))}
        {activities.map((a) => {
          const ps = parseDate(a.planned_start);
          const pf = parseDate(a.planned_finish);
          const as = parseDate(a.actual_start);
          const af = parseDate(a.actual_finish);
          const selected = a.activity_id === selectedId;
          return (
            <div
              key={a.activity_id}
              className={`flex items-center border-b border-border/60 cursor-pointer transition-colors ${
                selected ? "bg-blue-50/60 dark:bg-blue-500/5" : "hover:bg-surface2"
              }`}
              style={{ height }}
              onClick={() => onSelect?.(a.activity_id)}
            >
              <div className="w-64 shrink-0 px-4 flex items-center gap-2 min-w-0">
                <span className="mono text-[11px] font-semibold text-ink truncate">{a.activity_id}</span>
                <span className="text-[11px] text-muted truncate">{a.activity_name}</span>
              </div>
              <div className="flex-1 relative h-full">
                {ps && pf && (
                  <div
                    className="absolute h-2 rounded-sm bg-slate-200 dark:bg-slate-700 top-1/2 -translate-y-1/2"
                    style={{ left: `${pct(ps)}%`, width: `${Math.max(0.5, pct(pf) - pct(ps))}%` }}
                    title={`Planned: ${a.planned_start} → ${a.planned_finish}`}
                  />
                )}
                {as && af && (
                  <div
                    className={`absolute h-2.5 rounded-sm top-1/2 -translate-y-1/2 ${ACTUAL_COLORS[a.status] || "bg-blue-500"}`}
                    style={{ left: `${pct(as)}%`, width: `${Math.max(0.5, pct(af) - pct(as))}%` }}
                    title={`Actual: ${a.actual_start} → ${a.actual_finish}`}
                  />
                )}
                {as && !af && (
                  <div
                    className={`absolute h-2.5 rounded-sm top-1/2 -translate-y-1/2 ${ACTUAL_COLORS[a.status] || "bg-blue-500"}`}
                    style={{ left: `${pct(as)}%`, width: `${Math.max(0.5, pct(DEMO_TODAY) - pct(as))}%` }}
                    title={`Actual start: ${a.actual_start} → in progress (to today)`}
                  />
                )}
                {todayPct >= 0 && todayPct <= 100 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-400/70"
                    style={{ left: `${todayPct}%` }}
                    title="Today (demo)"
                  />
                )}
              </div>
            </div>
          );
        })}
        <div className="flex">
          <div className="w-64 shrink-0" />
          <div className="flex-1 flex items-center gap-4 px-4 py-2 text-[10px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm bg-slate-200 dark:bg-slate-700" /> Planned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-sm bg-blue-600" /> Actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-sm bg-red-500" /> Delayed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-sm bg-amber-500" /> At Risk
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-px h-3 bg-red-400" /> Today
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
