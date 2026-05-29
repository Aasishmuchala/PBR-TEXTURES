"use client";

import { useState } from "react";
import type { GenerateOptions } from "@/lib/types";
import { estimateCost } from "@/lib/cost";

const RES_OPTIONS: { label: string; resolution: number; upscaleFactor: 0 | 2 | 4; note: string }[] = [
  { label: "2K", resolution: 2048, upscaleFactor: 0, note: "native · cheapest" },
  { label: "4K", resolution: 4096, upscaleFactor: 2, note: "true 4K · recommended" },
  { label: "8K", resolution: 8192, upscaleFactor: 4, note: "premium" },
];

export function OptionsPanel({
  options,
  setOptions,
  onAutoLabel,
  autoLabelAvailable,
  autoLabeling,
  aiAvailable,
  disabled,
}: {
  options: GenerateOptions;
  setOptions: (o: GenerateOptions) => void;
  onAutoLabel: () => void;
  autoLabelAvailable: boolean;
  autoLabeling: boolean;
  aiAvailable: boolean;
  disabled?: boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  const set = <K extends keyof GenerateOptions>(k: K, v: GenerateOptions[K]) =>
    setOptions({ ...options, [k]: v });

  return (
    <div className="space-y-4">
      {/* material */}
      <div>
        <label className="label">
          Material
          {autoLabeling && <span className="ml-2 normal-case tracking-normal text-forge-accent">detecting…</span>}
        </label>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder={
              autoLabelAvailable
                ? "auto-detected from your photo — or type your own"
                : "e.g. weathered oak planks, rusted steel, mossy cobblestone"
            }
            value={options.material}
            onChange={(e) => set("material", e.target.value)}
            disabled={disabled}
          />
          {autoLabelAvailable && (
            <button
              type="button"
              className="btn-ghost whitespace-nowrap"
              onClick={onAutoLabel}
              disabled={disabled || autoLabeling}
              title="Re-detect the material from your image"
            >
              {autoLabeling ? "…" : "Detect"}
            </button>
          )}
        </div>
      </div>

      {/* resolution */}
      <div>
        <label className="label">Resolution</label>
        <div className="grid grid-cols-3 gap-2">
          {RES_OPTIONS.map((r) => {
            const active = options.resolution === r.resolution;
            return (
              <button
                key={r.label}
                type="button"
                disabled={disabled}
                onClick={() => setOptions({ ...options, resolution: r.resolution, upscaleFactor: r.upscaleFactor })}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-forge-accent bg-forge-accent/10"
                    : "border-forge-border hover:border-forge-muted"
                }`}
              >
                <div className="text-sm font-semibold">{r.label}</div>
                <div className="text-[10px] text-forge-muted">{r.note}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-forge-muted">
          Est. cost <span className="text-forge-text">~${estimateCost(options.resolution)}</span> / set
          · billed by fal on your key
        </p>
      </div>

      {/* tiling */}
      <div>
        <label className="label">Seamless tiling</label>
        <div className="grid grid-cols-3 gap-2">
          {(["both", "horizontal", "vertical"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => set("tilingMode", t)}
              className={`rounded-lg border px-3 py-1.5 text-xs capitalize transition-colors ${
                options.tilingMode === t
                  ? "border-forge-accent bg-forge-accent/10"
                  : "border-forge-border hover:border-forge-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* quality */}
      <div>
        <label className="label">Quality boost</label>
        <div className="space-y-2 rounded-2xl bg-black/[0.03] p-3.5 ring-1 ring-black/[0.05]">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={options.enhance}
              disabled={disabled}
              onChange={(e) => set("enhance", e.target.checked)}
            />
            <span>
              Enhance detail
              <span className="block text-[11px] text-forge-muted">
                detail normals from height · unsharp · roughness contrast — free
              </span>
            </span>
          </label>
          <label className={`flex items-start gap-2 text-sm ${aiAvailable ? "" : "opacity-60"}`}>
            <input
              type="checkbox"
              className="mt-0.5"
              checked={options.aiUpscale}
              disabled={disabled || !aiAvailable}
              onChange={(e) => set("aiUpscale", e.target.checked)}
            />
            <span>
              AI super-res
              <span className="block text-[11px] text-forge-muted">
                {aiAvailable
                  ? "invents real micro-detail, kept seamless · uses your Replicate token"
                  : "add a Replicate token in Settings to enable"}
              </span>
            </span>
          </label>
          {options.aiUpscale && aiAvailable && (
            <div className="ml-6 grid grid-cols-2 gap-2">
              {(
                [
                  ["clarity", "Clarity — max detail"],
                  ["esrgan", "ESRGAN — fast/safe"],
                ] as const
              ).map(([v, lbl]) => (
                <button
                  key={v}
                  type="button"
                  disabled={disabled}
                  onClick={() => set("upscaler", v)}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${
                    options.upscaler === v
                      ? "border-forge-accent bg-forge-accent/10"
                      : "border-forge-border hover:border-forge-muted"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={options.compress}
              disabled={disabled}
              onChange={(e) => set("compress", e.target.checked)}
            />
            <span>
              Compress output
              <span className="block text-[11px] text-forge-muted">
                smaller zip · base color → high-quality JPG, data maps stay lossless
              </span>
            </span>
          </label>
          <label className={`flex items-start gap-2 text-sm ${aiAvailable ? "" : "opacity-60"}`}>
            <input
              type="checkbox"
              className="mt-0.5"
              checked={options.opacity}
              disabled={disabled || !aiAvailable}
              onChange={(e) => set("opacity", e.target.checked)}
            />
            <span>
              Opacity / alpha map
              <span className="block text-[11px] text-forge-muted">
                {aiAvailable
                  ? "background removal → alpha (foliage, leaves, cutouts) · sets UE Masked · Replicate"
                  : "add a Replicate token in Settings to enable"}
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* advanced */}
      <div>
        <button
          type="button"
          className="text-xs text-forge-muted hover:text-forge-text"
          onClick={() => setAdvanced((a) => !a)}
        >
          {advanced ? "▾" : "▸"} Advanced
        </button>
        {advanced && (
          <div className="mt-3 space-y-4 rounded-2xl bg-black/[0.03] p-3.5 ring-1 ring-black/[0.05]">
            <div>
              <label className="label">Normal convention</label>
              <div className="grid grid-cols-2 gap-2">
                {(["gl", "dx"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={disabled}
                    onClick={() => set("normalConvention", c)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                      options.normalConvention === c
                        ? "border-forge-accent bg-forge-accent/10"
                        : "border-forge-border hover:border-forge-muted"
                    }`}
                  >
                    {c === "gl" ? "OpenGL → flip to DX (default)" : "Already DirectX"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-forge-muted">
                UE wants DirectX. If lighting looks inside-out, switch this.
              </p>
            </div>

            <Slider label={`AO strength · ${options.aoStrength.toFixed(2)}`} min={0} max={2} step={0.05} value={options.aoStrength} disabled={disabled} onChange={(v) => set("aoStrength", v)} />
            <Slider label={`PATINA strength · ${options.strength.toFixed(2)}`} min={0.3} max={1} step={0.05} value={options.strength} disabled={disabled} onChange={(v) => set("strength", v)} />
            <Slider label={`Height smoothing · ${options.smoothHeight.toFixed(1)}`} min={0} max={4} step={0.5} value={options.smoothHeight} disabled={disabled} onChange={(v) => set("smoothHeight", v)} />

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={options.clampMetallic}
                disabled={disabled}
                onChange={(e) => set("clampMetallic", e.target.checked)}
              />
              Clamp metallic to 0 on non-metals (wood/stone/fabric…)
            </label>

            <div>
              <label className="label">Seed (optional)</label>
              <input
                className="input"
                type="number"
                placeholder="random"
                value={options.seed ?? ""}
                disabled={disabled}
                onChange={(e) => set("seed", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  disabled,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-forge-accent"
      />
    </div>
  );
}
