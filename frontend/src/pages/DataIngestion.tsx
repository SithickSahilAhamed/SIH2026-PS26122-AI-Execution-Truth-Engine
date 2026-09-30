import { CheckCircle2, FileUp, Loader2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../api/client";
import type { ExtractedEvent, ProcessResult } from "../api/types";
import { Button, Card, CardHeader } from "../components/ui";
import { TruthStateBar } from "../components/TruthStateBar";

const PIPELINE = ["Uploaded", "Parsed", "Extracted", "Matched", "Validated"];
const ACCEPTED = [".pdf", ".xlsx", ".xls", ".csv", ".txt"];

export function DataIngestion() {
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ events: ExtractedEvent[]; unmatched_events: ExtractedEvent[]; conflict_activity_ids: string[]; processed_evidence_count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pipelineStage, setPipelineStage] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setProcessing(true);
    setError(null);
    setResult(null);
    setPipelineStage(1);
    try {
      const text = await file.text();
      setPipelineStage(2);
      const lower = file.name.toLowerCase();
      const source_type = lower.endsWith(".csv") || lower.endsWith(".xlsx") || lower.endsWith(".xls")
        ? "SPREADSHEET"
        : lower.endsWith(".txt")
          ? "SITE_DIARY"
          : "DPR";
      const evidence = await api.post<{ evidence_accepted: number }>("/api/v1/evidence/submit", [
        {
          evidence_id: `EV-UP-${Date.now()}`,
          source_type,
          raw_text: text,
          reported_progress_percent: null,
          reporter_id: "sup-uploaded",
          timestamp: new Date().toISOString(),
        },
      ]);
      setPipelineStage(3);
      const processed = await api.post<ProcessResult>("/api/v1/engine/process");
      setPipelineStage(4);
      setResult(processed);
      void evidence;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Processing failed");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="p-6 space-y-5 anim-fade-up max-w-5xl">
      <Card>
        <CardHeader
          title="Ingest Field Data"
          subtitle="Upload daily progress reports, discipline spreadsheets, site diaries or supervisor updates"
          right={
            <Button
              variant="ghost"
              onClick={async () => {
                await api.post("/api/v1/demo/seed");
                window.location.reload();
              }}
            >
              Reload demo dataset
            </Button>
          }
        />
        <div className="p-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-md py-12 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              dragOver ? "border-blue-500 bg-blue-50/50 dark:bg-blue-500/10" : "border-border hover:border-blue-400"
            }`}
          >
            <UploadCloud className="w-8 h-8 text-muted mb-3" />
            <div className="text-[13px] font-semibold text-ink">
              Drop field report here or <span className="text-blue-600">browse files</span>
            </div>
            <div className="text-[11px] text-muted mt-1">Accepted: PDF, XLSX, XLS, CSV, TXT</div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>

          <div className="mt-6">
            <TruthStateBar active={processing ? pipelineStage : result ? 5 : 0} labels={PIPELINE} />
          </div>

          {processing && (
            <div className="mt-4 flex items-center gap-2 text-[12px] text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Running extraction → matching → validation pipeline…
            </div>
          )}
          {error && <div className="mt-4 text-[12px] text-red-600 font-medium">{error}</div>}
        </div>
      </Card>

      {result && (
        <Card>
          <CardHeader
            title="Processing Result"
            subtitle={`${result.processed_evidence_count} evidence items → ${result.events.length} events extracted → ${result.conflict_activity_ids.length} conflicts flagged`}
          />
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Events Extracted", value: result.events.length },
              { label: "Auto-Linked", value: result.events.filter((e) => e.resolved_activity_id).length },
              { label: "Unmatched", value: result.unmatched_events.length },
              { label: "Conflicts", value: result.conflict_activity_ids.length },
            ].map((s) => (
              <div key={s.label} className="border border-border rounded-md p-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">{s.label}</div>
                <div className="text-[22px] font-bold text-ink mt-1 tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4 space-y-2">
            {result.events.slice(0, 6).map((e: ExtractedEvent) => (
              <div key={e.event_id} className="flex items-center gap-3 text-[12px] border border-border rounded px-3 py-2">
                <FileUp className="w-3.5 h-3.5 text-muted shrink-0" />
                <span className="mono text-[11px] font-semibold">{e.event_id}</span>
                <span className="text-muted truncate flex-1">{e.sentence}</span>
                {e.resolved_activity_id ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {e.resolved_activity_id}
                  </span>
                ) : (
                  <span className="text-slate-500 text-[11px] font-semibold shrink-0">Unmatched</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
