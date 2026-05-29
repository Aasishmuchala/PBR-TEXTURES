"use client";

export type Stage = "idle" | "submitting" | "running" | "processing" | "done" | "error";

const STEPS: { key: Stage; label: string }[] = [
  { key: "submitting", label: "Upload" },
  { key: "running", label: "PATINA" },
  { key: "processing", label: "UE pack" },
  { key: "done", label: "Done" },
];

const ORDER: Stage[] = ["submitting", "running", "processing", "done"];

export function ProgressTracker({
  stage,
  queuePosition,
  logs,
}: {
  stage: Stage;
  queuePosition?: number;
  logs: string[];
}) {
  const activeIdx = ORDER.indexOf(stage);

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const done = activeIdx > i;
          const active = activeIdx === i;
          return (
            <div key={s.key} className="flex flex-1 items-center gap-2">
              <div
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                      ? "bg-forge-accent text-forge-bg"
                      : "bg-black/[0.06] text-forge-muted"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-xs ${active ? "text-forge-text" : "text-forge-muted"}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`h-px flex-1 ${done ? "bg-emerald-500/50" : "bg-black/[0.08]"}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-forge-accent" />
        <span className="text-forge-muted">
          {stage === "submitting" && "Uploading image & queuing on fal…"}
          {stage === "running" &&
            (queuePosition && queuePosition > 0
              ? `In queue (position ${queuePosition})…`
              : "PATINA is extracting maps (delight · seamless · upscale)…")}
          {stage === "processing" && "Deriving AO, packing ORM, fixing normals, zipping…"}
        </span>
      </div>

      {logs.length > 0 && (
        <pre className="mt-3 max-h-28 overflow-auto rounded-xl bg-black/[0.04] p-2.5 font-mono text-[11px] leading-relaxed text-forge-muted ring-1 ring-black/[0.05]">
          {logs.slice(-8).join("\n")}
        </pre>
      )}
    </div>
  );
}
