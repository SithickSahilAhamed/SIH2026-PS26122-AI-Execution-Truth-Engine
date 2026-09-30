import { Check } from "lucide-react";

const STAGES = ["SOURCE", "EXTRACTED", "MATCHED", "VERIFIED", "UPDATED"] as const;

export function TruthStateBar({
  active,
  labels,
}: {
  active: number;
  labels?: string[];
}) {
  return (
    <div className="flex items-center w-full">
      {STAGES.map((stage, index) => {
        const done = index < active;
        const current = index === active;
        return (
          <div key={stage} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${
                  done
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : current
                      ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10"
                      : "border-border text-muted"
                }`}
              >
                {done ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                ) : (
                  <span className="text-[10px] font-bold">{index + 1}</span>
                )}
              </div>
              <span
                className={`text-[9px] font-semibold tracking-widest uppercase whitespace-nowrap ${
                  current ? "text-blue-600 dark:text-blue-400" : done ? "text-emerald-600 dark:text-emerald-400" : "text-muted"
                }`}
              >
                {labels?.[index] || stage}
              </span>
            </div>
            {index < STAGES.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-1.5 -mt-4 rounded ${
                  index < active ? "bg-emerald-500" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
