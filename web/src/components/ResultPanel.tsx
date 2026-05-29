"use client";

import type { ProcessedSet } from "@/lib/types";

const MAPS: { key: keyof ProcessedSet["urls"]; label: string; tag: string }[] = [
  { key: "baseColor", label: "Base Color", tag: "sRGB" },
  { key: "normal", label: "Normal", tag: "DirectX" },
  { key: "orm", label: "ORM", tag: "R·G·B" },
  { key: "height", label: "Height", tag: "16-bit" },
  { key: "opacity", label: "Opacity", tag: "alpha" },
];

export function ResultPanel({ result }: { result: ProcessedSet }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">{result.name}</h3>
          <p className="text-xs text-forge-muted">
            {result.resolution}² · UE5-ready · {(result.zipBytes / 1e6).toFixed(1)} MB · ~$
            {result.costEstimate} fal cost
          </p>
        </div>
        <a
          href={result.urls.zip}
          download
          className="group inline-flex items-center gap-2.5 rounded-full bg-forge-text py-1.5 pl-5 pr-1.5 text-sm font-medium text-forge-bg transition-transform duration-500 ease-spring hover:shadow-lift active:scale-[0.98]"
        >
          <span>Download UE zip</span>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15 transition-transform duration-500 ease-spring group-hover:translate-y-0.5">
            ↓
          </span>
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MAPS.filter((m) => result.urls[m.key]).map((m) => (
          <a
            key={m.key}
            href={result.urls[m.key]}
            download
            className="group overflow-hidden rounded-2xl bg-forge-panel ring-1 ring-black/[0.06] transition-shadow duration-500 ease-spring hover:shadow-softer"
          >
            <div className="aspect-square overflow-hidden bg-[#17161a]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.urls[m.key]}
                alt={m.label}
                className="h-full w-full object-cover transition-transform duration-700 ease-spring group-hover:scale-105"
              />
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-medium">{m.label}</span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-forge-muted">{m.tag}</span>
            </div>
          </a>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-forge-muted">
        The zip includes the 4 maps, <span className="font-mono">manifest.json</span>,{" "}
        <span className="font-mono">ue_import.py</span> (run inside UE to auto-build the
        material), and an import recipe.
      </p>
    </div>
  );
}
