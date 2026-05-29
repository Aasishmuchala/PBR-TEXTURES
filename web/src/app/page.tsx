"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Uploader } from "@/components/Uploader";
import { OptionsPanel } from "@/components/OptionsPanel";
import { ProgressTracker, type Stage } from "@/components/ProgressTracker";
import { ResultPanel } from "@/components/ResultPanel";
import { Bezel } from "@/components/ui/Bezel";
import { Eyebrow } from "@/components/ui/Eyebrow";
import {
  getClaudeOpusKey,
  getFalKey,
  getOpenRouterKey,
  getReplicateKey,
  hasFalKey,
} from "@/lib/keys";
import type { GenerateOptions, ProcessedSet } from "@/lib/types";

const MaterialPreview3D = dynamic(() => import("@/components/MaterialPreview3D"), {
  ssr: false,
  loading: () => (
    <div className="grid aspect-square w-full place-items-center rounded-2xl well text-sm text-white/50">
      Loading 3D preview…
    </div>
  ),
});

const DEFAULT_OPTIONS: GenerateOptions = {
  material: "",
  resolution: 4096,
  upscaleFactor: 2,
  tilingMode: "both",
  strength: 0.75,
  seed: null,
  normalConvention: "gl",
  aoStrength: 1,
  clampMetallic: true,
  smoothHeight: 0,
  enhance: true,
  aiUpscale: false,
  upscaler: "clarity",
  compress: false,
  opacity: false,
};

// Parse JSON, but degrade gracefully when a function returns a non-JSON error
// page (e.g. a 504 timeout "An error occurred…") instead of crashing on .json().
async function readJson(r: Response) {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      r.ok ? "Server returned a non-JSON response." : `${r.status} — ${text.slice(0, 160).trim()}`,
    );
  }
}

export default function Studio() {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [options, setOptions] = useState<GenerateOptions>(DEFAULT_OPTIONS);
  const [stage, setStage] = useState<Stage>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [queuePos, setQueuePos] = useState<number | undefined>(undefined);
  const [result, setResult] = useState<ProcessedSet | null>(null);
  const [error, setError] = useState("");
  const [keyOk, setKeyOk] = useState(true);
  const [classifyAvailable, setClassifyAvailable] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [autoLabeling, setAutoLabeling] = useState(false);
  const [inputWarning, setInputWarning] = useState("");
  const poll = useRef({ cancel: false });

  useEffect(() => {
    setKeyOk(hasFalKey());
    setClassifyAvailable(getClaudeOpusKey().length > 0 || getOpenRouterKey().length > 0);
    setAiAvailable(getReplicateKey().length > 0);
  }, []);

  const falHeaders = (): Record<string, string> => ({ "x-fal-key": getFalKey() });

  function selectImage(f: File) {
    const url = URL.createObjectURL(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return url;
    });
    setImage(f);
    setResult(null);
    setError("");
    setStage("idle");
    setInputWarning("");

    const probe = new Image();
    probe.onload = () => {
      const w = probe.naturalWidth;
      const h = probe.naturalHeight;
      const ar = w / h;
      const warns: string[] = [];
      if (Math.min(w, h) < 1024) warns.push(`Low-res input (${w}×${h}) — use ≥1024px for crisp 4K.`);
      if (ar < 0.75 || ar > 1.34) warns.push("Very non-square — flat, top-down square surfaces tile best.");
      setInputWarning(warns.join(" "));
    };
    probe.src = url;

    // auto-classify the material straight from the photo
    void classify(f);
  }

  async function classify(file?: File) {
    const f = file ?? image;
    if (!f || !classifyAvailable) return;
    setAutoLabeling(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("image", f);
      const r = await fetch("/api/autolabel", {
        method: "POST",
        headers: {
          "x-claudeopus-key": getClaudeOpusKey(),
          "x-openrouter-key": getOpenRouterKey(),
        },
        body: fd,
      });
      const j = await readJson(r);
      if (j.label) setOptions((o) => ({ ...o, material: j.label }));
      else if (j.error) setError(j.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "classify failed");
    } finally {
      setAutoLabeling(false);
    }
  }

  async function generate() {
    if (!image) return setError("Add a photo first.");
    if (!hasFalKey()) return setKeyOk(false);
    if (!options.material.trim()) return setError("Describe the material (or hit Auto).");

    setError("");
    setResult(null);
    setLogs([]);
    setQueuePos(undefined);
    setStage("submitting");
    poll.current.cancel = false;

    try {
      const fd = new FormData();
      fd.append("image", image);
      fd.append("options", JSON.stringify(options));
      const sub = await fetch("/api/generate", { method: "POST", headers: falHeaders(), body: fd });
      const subj = await readJson(sub);
      if (!sub.ok || !subj.requestId) throw new Error(subj.error || "submit failed");

      setStage("running");
      await runPoll(subj.requestId as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }

  async function runPoll(requestId: string) {
    const start = Date.now();
    while (!poll.current.cancel) {
      if (Date.now() - start > 8 * 60 * 1000)
        throw new Error("Timed out waiting for PATINA (8 min). Please try again.");
      await new Promise((r) => setTimeout(r, 2500));
      if (poll.current.cancel) return;
      const r = await fetch(`/api/status?requestId=${encodeURIComponent(requestId)}`, {
        headers: falHeaders(),
      });
      const s = await readJson(r);
      if (s.error) throw new Error(s.error);
      if (typeof s.queuePosition === "number") setQueuePos(s.queuePosition);
      if (Array.isArray(s.logs) && s.logs.length) setLogs(s.logs);
      if (s.status === "COMPLETED") return processResult(requestId);
      if (s.status === "FAILED") throw new Error("PATINA job failed");
    }
  }

  async function processResult(requestId: string) {
    setStage("processing");
    const r = await fetch("/api/process", {
      method: "POST",
      headers: {
        ...falHeaders(),
        "x-replicate-key": getReplicateKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requestId, options: { ...options, name: options.material } }),
    });
    const j = await readJson(r);
    if (!r.ok) throw new Error(j.error || "post-processing failed");
    setResult(j as ProcessedSet);
    setStage("done");
  }

  function reset() {
    poll.current.cancel = true;
    setStage("idle");
    setResult(null);
    setError("");
  }

  const busy = stage === "submitting" || stage === "running" || stage === "processing";

  return (
    <div className="space-y-10">
      {/* hero */}
      <header className="animate-rise space-y-5 pt-4">
        <Eyebrow>Photo → PBR · Unreal Engine 5</Eyebrow>
        <h1 className="max-w-[16ch] text-[clamp(40px,6.5vw,76px)] font-extrabold leading-[0.95] tracking-[-0.035em]">
          Turn a photo into a 4K{" "}
          <span className="text-forge-accent">material</span>.
        </h1>
        <p className="max-w-[52ch] text-base leading-relaxed text-forge-muted">
          One image in. A seamless, Unreal-ready PBR set out — Base Color, Normal,
          ORM, and 16-bit Height — packed the way UE5 wants it.
        </p>
      </header>

      {!keyOk && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-forge-muted">
            No fal.ai key yet — PATINA can&apos;t run without it.
          </p>
          <Link href="/settings" className="btn-primary">
            Add key in Settings
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT — inputs */}
        <Bezel className="space-y-6 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <Eyebrow>Source</Eyebrow>
          </div>
          <Uploader preview={preview} onSelect={selectImage} disabled={busy} />
          <p className="text-[11px] leading-relaxed text-forge-muted">
            Best input: a <span className="text-forge-text">flat, top-down, evenly-lit surface</span>{" "}
            (not a single object) · ≥1024px · roughly square.
          </p>
          {inputWarning && <p className="text-[11px] text-forge-accent">⚠ {inputWarning}</p>}

          <OptionsPanel
            options={options}
            setOptions={setOptions}
            onAutoLabel={() => classify()}
            autoLabelAvailable={classifyAvailable}
            autoLabeling={autoLabeling}
            aiAvailable={aiAvailable}
            disabled={busy}
          />

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={generate}
              disabled={busy || !image}
              className="group inline-flex flex-1 items-center justify-between gap-3 rounded-full bg-forge-text py-1.5 pl-5 pr-1.5 text-sm font-medium text-forge-bg transition-transform duration-500 ease-spring hover:shadow-lift active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>{busy ? "Forging…" : "Forge textures"}</span>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15 transition-transform duration-500 ease-spring group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </button>
            {(busy || result) && (
              <button className="btn-ghost" onClick={reset} type="button">
                Reset
              </button>
            )}
          </div>
          {error && <p className="text-sm text-forge-accent">⚠ {error}</p>}
        </Bezel>

        {/* RIGHT — output */}
        <div className="space-y-6">
          {busy && <ProgressTracker stage={stage} queuePosition={queuePos} logs={logs} />}

          {stage === "done" && result ? (
            <Bezel className="animate-rise space-y-6 p-5 sm:p-6">
              <Eyebrow>Result</Eyebrow>
              <MaterialPreview3D urls={result.urls} />
              <ResultPanel result={result} />
            </Bezel>
          ) : (
            !busy && (
              <Bezel className="grid min-h-[360px] place-items-center p-10 text-center">
                <div className="space-y-3">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-black/[0.04] text-2xl ring-1 ring-black/[0.05]">
                    ◷
                  </div>
                  <p className="text-sm leading-relaxed text-forge-muted">
                    Your 4K PBR set and an interactive 3D preview
                    <br />
                    will appear here after forging.
                  </p>
                </div>
              </Bezel>
            )
          )}
        </div>
      </div>
    </div>
  );
}
