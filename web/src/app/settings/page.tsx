"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/Eyebrow";
import {
  getClaudeOpusKey,
  getFalKey,
  getOpenRouterKey,
  getReplicateKey,
  setClaudeOpusKey,
  setFalKey,
  setOpenRouterKey,
  setReplicateKey,
} from "@/lib/keys";

export default function SettingsPage() {
  const [fal, setFal] = useState("");
  const [openrouter, setOpenrouter] = useState("");
  const [replicate, setReplicate] = useState("");
  const [claudeopus, setClaudeopus] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ valid: boolean; reason?: string } | null>(null);
  const [coTesting, setCoTesting] = useState(false);
  const [coTest, setCoTest] = useState<{ valid: boolean; reason?: string } | null>(null);

  useEffect(() => {
    setFal(getFalKey());
    setOpenrouter(getOpenRouterKey());
    setReplicate(getReplicateKey());
    setClaudeopus(getClaudeOpusKey());
  }, []);

  function save() {
    setFalKey(fal);
    setOpenRouterKey(openrouter);
    setReplicateKey(replicate);
    setClaudeOpusKey(claudeopus);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  async function testKey() {
    setTesting(true);
    setTest(null);
    try {
      const r = await fetch("/api/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ falKey: fal }),
      });
      setTest(await r.json());
    } catch (e) {
      setTest({ valid: false, reason: e instanceof Error ? e.message : "request failed" });
    } finally {
      setTesting(false);
    }
  }

  async function testClaudeopus() {
    setCoTesting(true);
    setCoTest(null);
    try {
      const r = await fetch("/api/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "claudeopus", key: claudeopus }),
      });
      setCoTest(await r.json());
    } catch (e) {
      setCoTest({ valid: false, reason: e instanceof Error ? e.message : "request failed" });
    } finally {
      setCoTesting(false);
    }
  }

  const keyInput = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
  ) => (
    <input
      className="input font-mono"
      type={reveal ? "text" : "password"}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      spellCheck={false}
    />
  );

  return (
    <div className="mx-auto max-w-2xl animate-rise space-y-8">
      <header className="space-y-4 pt-4">
        <Eyebrow>Configuration</Eyebrow>
        <h1 className="text-[clamp(32px,5vw,52px)] font-extrabold leading-[0.96] tracking-[-0.03em]">
          Keys
        </h1>
        <p className="max-w-[52ch] text-sm leading-relaxed text-forge-muted">
          Bring your own keys. They&apos;re stored only in this browser and sent per-request
          to fal — never saved on a server.
        </p>
      </header>

      {/* fal */}
      <section className="card space-y-3 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold tracking-tight">
            fal.ai API key <span className="text-forge-accent">· required</span>
          </h2>
          <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer" className="text-xs text-forge-accent hover:underline">
            Get a key ↗
          </a>
        </div>
        <p className="text-xs leading-relaxed text-forge-muted">
          Powers PATINA — delight, deshadow, seamless tiling, 4K upscale, and the 5 PBR maps
          in one call.
        </p>
        <div className="flex gap-2">
          {keyInput(fal, setFal, "key_xxxxxxxx:xxxxxxxx")}
          <button className="btn-ghost shrink-0" onClick={() => setReveal((r) => !r)} type="button">
            {reveal ? "Hide" : "Show"}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-ghost" onClick={testKey} disabled={!fal || testing} type="button">
            {testing ? "Testing…" : "Test key"}
          </button>
          {test && (
            <span className={`text-sm ${test.valid ? "text-emerald-600" : "text-forge-accent"}`}>
              {test.valid ? "✓ Key works" : `✗ ${test.reason ?? "invalid"}`}
            </span>
          )}
        </div>
      </section>

      {/* replicate */}
      <section className="card space-y-3 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold tracking-tight">
            Replicate API token <span className="text-forge-muted">· optional</span>
          </h2>
          <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noreferrer" className="text-xs text-forge-accent hover:underline">
            Get a token ↗
          </a>
        </div>
        <p className="text-xs leading-relaxed text-forge-muted">
          Enables <span className="text-forge-text">AI super-res</span> — Clarity / Real-ESRGAN
          adds crisp detail to the base color, kept seamless.
        </p>
        {keyInput(replicate, setReplicate, "r8_…")}
      </section>

      {/* claudeopus */}
      <section className="card space-y-3 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold tracking-tight">
            claudeopus.pro key <span className="text-forge-muted">· material auto-classify</span>
          </h2>
          <a href="https://www.claudeopus.pro/" target="_blank" rel="noreferrer" className="text-xs text-forge-accent hover:underline">
            Get a key ↗
          </a>
        </div>
        <p className="text-xs leading-relaxed text-forge-muted">
          When set, the <span className="text-forge-text">Material</span> field auto-detects from
          your photo on upload (Claude vision). The preferred classifier.
        </p>
        {keyInput(claudeopus, setClaudeopus, "sk-ant-co-…")}
        <div className="flex items-center gap-3">
          <button className="btn-ghost" onClick={testClaudeopus} disabled={!claudeopus || coTesting} type="button">
            {coTesting ? "Testing…" : "Test key"}
          </button>
          {coTest && (
            <span className={`text-sm ${coTest.valid ? "text-emerald-600" : "text-forge-accent"}`}>
              {coTest.valid ? `✓ works ${coTest.reason ?? ""}`.trim() : `✗ ${coTest.reason ?? "invalid"}`}
            </span>
          )}
        </div>
      </section>

      {/* openrouter */}
      <section className="card space-y-3 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold tracking-tight">
            OpenRouter API key <span className="text-forge-muted">· optional</span>
          </h2>
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-xs text-forge-accent hover:underline">
            Get a key ↗
          </a>
        </div>
        <p className="text-xs leading-relaxed text-forge-muted">
          Fallback material classifier — used only if no claudeopus.pro key is set.
        </p>
        {keyInput(openrouter, setOpenrouter, "sk-or-v1-…")}
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save} type="button">
          Save keys
        </button>
        {saved && <span className="text-sm text-emerald-600">✓ Saved to this browser</span>}
        <Link href="/" className="ml-auto text-sm text-forge-muted hover:text-forge-text">
          ← Back to Studio
        </Link>
      </div>
    </div>
  );
}
