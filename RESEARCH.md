# Single-Image → 4K UE5 PBR Texture App: Architecture & Build Plan

**Prepared for:** solo founder, UE5-fluent (NYRA plugin author)
**Date:** 2026-05-29
**Author:** Lead architect (synthesis of 8 research tracks + live verification)

---

## 1. Executive summary

The hard part of this product — turn one casual photo into a clean, delit, seamless, multi-map PBR set — has a single best answer in 2026: **fal.ai PATINA's Material Extraction endpoint (`fal-ai/patina/material`)**. In one call it identifies the material, renders it flat (delights + deshadows), makes it seamlessly tileable, upscales, and returns Base Color + Normal + Roughness + Metalness + Height. That collapses five of your six pipeline stages into one API. I verified this live against fal's model page and launch blog: it's a FLUX.2-klein backbone with native `tiling_mode` and `upscale_factor`, native resolution **2048px** (8K only via the 4x upscale add-on), and it does **not** emit ambient occlusion.

**This resolves the one real contradiction in your research.** The "providers & pricing" track asserted *"no turnkey single-image-to-PBR-set API exists in 2026"* and routed you to self-host PBRify_Remix on Replicate. The "PBR extraction" track found PATINA, which **is** that turnkey API. PATINA wins decisively for the MVP. Self-hosting is a later moat play, not a starting point.

**The thing you must fix before writing code:** PATINA is **fal-exclusive**. Your provisioned access — Higgsfield account, Replicate key, OpenRouter, plus Pixa / Hugging Face / Supabase / Vercel MCPs — does **not** include a fal.ai key. fal is the keystone; provision it day one.

**Your moat is everything PATINA leaves on the floor, done in cheap deterministic code:** derive AO from height, channel-pack ORM the UE5 way (R=AO, G=Rough, B=Metal, **sRGB OFF**), emit **DirectX** normals, ship **16-bit** height, and wrap it all in a UE Material + Material Instance. The competitive track is unambiguous: no incumbent (WithPoly, Scenario, Substance, Meshy, Quixel) ships UE-native ORM-packed output behind a cheap API. That gap *is* the company, and it plugs straight into your NYRA plugin as an in-editor "generate material from photo" button.

**Cost reality:** ~$0.20-0.45 per native-4K set all-in with retries (PATINA dominates; classify is sub-cent; your packing is free compute). Fixed infra floor ~$55/mo (Vercel Pro $20 + Supabase Pro $25 + Trigger.dev Hobby $10), with a free-tier path to validate first.

---

## 2. The product in one paragraph

A user uploads one image. You gate it (resolution / perspective / watermark) in milliseconds, confirm the material category, send it to PATINA for delight + seamless + maps + upscale, then run your own deterministic post-process to derive AO, pack ORM, fix normal convention, and assemble a 16-bit height map. You render a live 3D tiled preview in-browser (react-three-fiber) so the user can confirm tiling and material response under an HDRI before paying, then deliver a UE5-ready zip — loose maps with correct compression/sRGB conventions **plus** a parent Material and per-set Material Instance — via a signed download URL. The same backend endpoint powers your NYRA UE5 plugin's in-editor generation.

---

## 3. End-to-end pipeline (chosen model/tool + fallback per step)

| # | Stage | Primary (decision) | Fallback / upgrade | Why |
|---|-------|--------------------|--------------------|-----|
| 0 | Upload + auth + signed URL | Supabase Auth + Storage; Vercel Route Handler mints URL, creates job row, enqueues, returns immediately | — | Never run pipeline in the request |
| 1 | **Gate (deterministic)** | Sharp/onnxruntime in edge fn: width/height/MP, EXIF, square-ness, FFT edge-wrap tileability bool. Hard-reject <512px | — | Free; never burn an LLM on facts a library returns |
| 2 | **Material confirm + perceptual gate** | `prithivMLmods/Minc-Materials-23` (SigLIP2, self-host on HF Inference Endpoint) for the label; **OpenRouter `google/gemini-2.5-flash-lite`** on a 768px thumb for capture-type/gloss/watermark + strict JSON | Upgrade LLM to `google/gemini-3.1-flash-lite` if eval shows weak perspective judgment | Zero-shot LLMs are weak material namers (~40%); fine-tuned SigLIP ~90% |
| 3 | **Delight + seamless + maps + upscale** | **`fal-ai/patina/material`** — ONE call: flatten, deshadow, tile, upscale, emit 5 maps | If PATINA albedo still carries light on a hard input, prepend a delighter (free `ccareaga/Intrinsic` HF Space or self-host RGB↔X) and feed the cleaned swatch | The keystone. Collapses 5 stages into 1 |
| 4 | **AO derivation (you build this)** | Cavity/AO pass from PATINA's Height via Sharp/OpenCV in an edge fn | — | No AI material model emits AO — this is on you |
| 5 | **ORM pack + convention fix (you build this)** | Pack R=AO/G=Rough/B=Metal, sRGB OFF; ensure DirectX normal (flip green if needed); write Height as 16-bit PNG/EXR | — | This is the UE-native moat |
| 6 | **Optional extra upscale to 8K (paid tier)** | PATINA `upscale_factor: 4` (albedo-safe; it's the same generative model). For self-hosted open-model path only: Clarity on albedo, Lanczos/Real-ESRGAN on data maps, then re-tile | Topaz High-Fidelity API as premium upsell | PATINA already upscales; per-map AI upscaling breaks cross-map consistency |
| 7 | UE5 export/pack | Pure code in edge fn: name with `T_/_BC/_N/_ORM/_H` suffixes, emit M_PBR_Master + MI_ for the user's UE version, zip to R2, return signed URL | Loose maps + 1-page import recipe as universal fallback | `.uasset` is version-locked; always include raw files |

**One important simplification the research over-engineered:** the "seamless tiling" track designed an elaborate np.roll + image-quilting + circular-VAE system to guarantee per-map seamlessness. **You mostly don't need it for the PATINA path** — PATINA outputs seamless tiles natively (`tiling_mode: both`). Keep the geometric re-tile pass in your back pocket **only** for (a) the self-hosted open-model tier, and (b) re-tiling after any *external* upscaler that isn't PATINA, because those do destroy edges. Build it in week 4, not week 1.

---

## 4. Recommended tech stack

See the structured `recommendedStack` table. In prose: Next.js 15 (App Router) on Vercel for the thin frontend/BFF; react-three-fiber + drei for the in-browser PBR preview; **Trigger.dev** as the durable, no-timeout orchestrator (the answer to "where does a multi-minute pipeline run"); Replicate (your key) as the thin async GPU layer for self-hosted models + data-map upscaling; **fal.ai** (NEW key needed) for PATINA; Supabase for Postgres state-machine + Auth + Realtime progress + Storage of user *inputs*; **Cloudflare R2** for the heavy multi-file 4K *outputs* (zero egress — decisive for a download-heavy product, and aligned now that Cloudflare owns Replicate); Stripe credits with pre-authorize-then-settle metering; OpenRouter + a self-hosted SigLIP2 for classify/gate.

---

## 5. Provider/model choice per step, with cost

| Step | Provider · model slug | Unit price | Per-4K-set cost |
|------|----------------------|-----------|------------------|
| Gate | Supabase edge fn (Sharp/onnx) | infra | ~$0 |
| Material label | HF Inference Endpoint · `prithivMLmods/Minc-Materials-23` | scale-to-zero GPU, sub-second | <$0.001 |
| Perceptual gate | OpenRouter · `google/gemini-2.5-flash-lite` ($0.10/$0.40 per 1M) on 768px thumb | ~$0.0002 | ~$0.0002 |
| **Core maps** | **fal · `fal-ai/patina/material`** | $0.01 base + $0.02/MP + $0.01/MP/map; +$0.016/MP/map for 4x | **$0.08 (1K) · ~$0.16-0.30 (native 2K, 5 maps) · ~$0.61 (2K→8K 4x)** |
| AO + ORM pack | Supabase edge fn | infra | ~$0 |
| Data-map upscale (self-host tier only) | Replicate · `nightmareai/real-esrgan` / `zsxkib/aura-sr-v2` ($0.095) + Lanczos | few cents | $0-0.10 |
| Albedo creative upscale (premium) | Replicate · `philz1337x/clarity-upscaler` ($0.017) or `cjwbw/supir` (~$0.054) | per run | $0.02-0.05 |
| Export/zip | Supabase edge fn + R2 put | infra | ~$0 |

**Provider verdicts:**
- **fal — ADD THIS KEY. Keystone.** Without it there is no MVP as designed.
- **Replicate — keep.** Best for the self-hosted open-model moat tier and data-map upscaling. Bills active GPU-time on public models; private deployments bill boot+idle+active (~10x cold) — favor public/keep-warm. Outputs delete ~1h after completion: your webhook MUST copy to R2 immediately.
- **OpenRouter — keep.** Cheap brain for gate/classify only.
- **Higgsfield — DROP from core path.** Zero PBR/seamless capability; it's a creative image/video tool. Keep only as a synthetic-albedo source if you ever add a text-to-material tier.
- **Pixa MCP — fallback upscaler only.** No PBR decomposition, no tiling. Don't put it on the critical path.
- **Hugging Face MCP — model discovery + secondary host** for the SigLIP2 classifier, the `ccareaga/Intrinsic` delighter, and future MatE/SuperMat tracking.
- **Supabase + Vercel MCPs — your rails.** Already connected; use them.

---

## 6. Cost model

**Per native-4K set (MVP path = PATINA + your packing):**
- PATINA at native 2048px, 5 maps, no extra upscale: **~$0.16-0.30**
- + classify/gate: ~$0.0003
- + AO/ORM/export: ~$0 (your compute)
- + retry padding (cold starts, the occasional re-run): ~20-40%
- **All-in: ~$0.20-0.45 per set.** For a "true 4K" you generate at 2K-native and 2x-upscale, or accept PATINA's 2048 as "4K-ish" and upscale the albedo only. Be honest in marketing: PATINA is *generative* (FLUX.2 backbone), so output is a plausible reconstruction, not a photometric capture — validate/clamp metalness on non-metal inputs.
- **8K premium tier:** PATINA 4x ≈ $0.61/set — gate behind a paid plan.

**Monthly fixed infra:** Vercel Pro $20 + Supabase Pro $25 + Trigger.dev Hobby $10 = **~$55/mo** before variable GPU/API. R2 storage ~$0.015/GB-mo, **$0 egress** (the reason to use it over Supabase Storage's $0.09/GB egress for downloads). HF Inference Endpoint for the classifier: scale-to-zero or a small always-on (~$0-50/mo depending on traffic). Free-tier path exists on every service to validate before paying.

**Pricing strategy (from competitive track):** anchors are WithPoly $20/mo, Scenario $28-99, Meshy $20-60, Substance $25-60, Quixel free-in-UE. With a ~$0.30 unit cost, **pay-per-texture in credits** (e.g. $1-2 per 4K set, or a credit pack) plus a free low-res/watermarked tier undercuts subscriptions while staying bespoke and UE-native. Stripe pre-authorize-then-settle prevents losing money on expensive runs.

---

## 7. Build roadmap (MVP-first)

See structured `buildRoadmap`. The throughline: **prove PATINA + your ORM packer produces a material that drops into UE5 correctly, end-to-end, before building any orchestration, billing, or UI polish.** Slice 1 is a script, not a web app.

---

## 8. Competitive positioning & differentiation

No incumbent owns **single photo → verified-seamless → true-4K → UE5-native (ORM-packed) → API → cents**. Closest rivals: WithPoly (free, full map set, 8K, but text-first, no UE packing, **no public API**) and Scenario (full PBR + API, but Unity-leaning, studio-priced, no UE ORM/Datasmith). Meshy/Tripo are object-centric (baked to mesh, weak at tiling). Substance is the quality bar but GUI/subscription with no automatable image-to-material API. Quixel/Fab is a library, not a generator.

**Your five wedges:** (1) **UE-native output** — correct ORM packing + ready Material/MI; rivals ship loose PNGs and leave the sRGB-OFF/Linear-Masks trap to the user. (2) **Tiling surfaces, not objects** — PATINA-native seamless + live tiled 3D preview. (3) **Honest 4K** — and a clear story about generative-vs-photometric. (4) **API-first** — the same endpoint powers your NYRA plugin (in-editor generate-from-photo) and a B2B line no rival plugs into cleanly. (5) **Price** — pay-per-texture in cents undercuts every subscription.

**Long-term moat (post-PMF):** self-host and fine-tune the open SVBRDF lineage on Replicate/HF for a path off PATINA dependency. Use `gvecchio/StableMaterials` (OpenRAIL, commercial-OK, tileable, LCM fast path) as the licensable base; track **MatE** (arXiv 2512.18312, Dec 2025) which is purpose-built for "one casual photo → tileable PBR" and will likely beat PATINA on real non-flat captures once weights ship. **Do NOT ship Ubisoft CHORD in the paid product** — its license is research-only/copyleft, a hard commercial blocker; use it only as an internal quality benchmark.

---

## 9. Risks & open questions

**Risks (honest):**
- **Single-vendor keystone.** PATINA is fal-only and closed; fal uptime/pricing/roadmap is a dependency you can't second-source today. Mitigation: keep the self-hosted StableMaterials path warm as an escape hatch, and abstract the "make maps" step behind one interface.
- **Generative ≠ faithful.** PATINA reconstructs a plausible material; on unusual inputs it can hallucinate detail or misfire metalness. Mitigation: clamp metallic by material class (from the classifier), and expose the 3D preview *before* charging.
- **Research thin/fast-moving in two places:** PATINA's exact commercial-output license wasn't documented on the pages I checked — **verify the output usage rights with fal before you resell textures** (open question below). And MatE/SuperMat have no confirmed public weights yet — treat as "track," not "build."
- **`.uasset` version lock.** You must build per UE version (5.4/5.5/…); always ship raw maps + import recipe as the universal fallback. This is a support-surface risk for a solo founder.
- **Replicate 1-hour output deletion + cold starts.** Webhook must copy to R2 instantly; niche models add 20-60s billed cold-start (~$0.02-0.08/run) — pad credit reservations.
- **Orchestrator is one more vendor.** Trigger.dev is the right call, but if you want zero extra vendors at launch, Supabase Queues (pgmq) + pg_cron + an edge worker does the same async pattern — you just hand-roll retries/observability.

**Open questions for you — answer these before we start (see `openQuestions`).**

---

## 10. Appendix: notable raw findings per area (with URLs)

- **PATINA Material Extraction** (verified live): image-to-material with delight/deshadow/seamless/upscale; 5 maps, **no AO**; native 2048px, 8K via 4x; $0.01 base + $0.02/MP + $0.01/MP/map; FLUX.2-klein backbone. https://fal.ai/models/fal-ai/patina/material · https://blog.fal.ai/introducing-patina/ · sample library: https://pbr.directory/
- **PATINA is fal-exclusive** for the material-extraction endpoint (not on Replicate/WaveSpeed): https://blog.fal.ai/introducing-patina/
- **Cloudflare → Replicate** acquisition announced Nov 2025, closing early 2026 — validates R2+Replicate alignment: https://www.structureresearch.net/2026/01/13/cloudflare-acquires-replicate-simplifying-ai-model-deployment-on-cloud/
- **Zero-shot LLMs are weak material namers** (CLIP 38%, GPT-4V ~43% vs fine-tuned SigLIP ~90%): use a dedicated classifier. `prithivMLmods/Minc-Materials-23`: https://huggingface.co/prithivMLmods/Minc-Materials-23
- **Cheapest vision LLM** for the gate: `google/gemini-2.5-flash-lite` https://openrouter.ai/google/gemini-2.5-flash-lite
- **No AI material model emits AO** (PATINA/CHORD/StableMaterials/DualMat all omit it) — derive from height, pack ORM yourself. UE5 ORM/sRGB rules (Epic): R=AO/G=Rough/B=Metal, Masks compression, **sRGB OFF**; Normal = DirectX/BC5; Height 16-bit.
- **Per-map AI upscaling breaks cross-map consistency** (MUJICA arXiv:2508.09802, PBR-SR arXiv:2506.02846) — creative upscale albedo only; deterministic for data maps.
- **Commercial-licensable open base** for the future moat: `gvecchio/StableMaterials` (OpenRAIL) https://huggingface.co/gvecchio/StableMaterials . **Avoid** Ubisoft CHORD in product (research-only license): https://github.com/ubisoft/ubisoft-laforge-chord . Track MatE: https://arxiv.org/abs/2512.18312
- **Serverless timeout constraint** drives the whole architecture: Vercel 300s (Hobby) / ~800s (Pro), Supabase edge ~150-400s → durable orchestrator (Trigger.dev https://trigger.dev/pricing) firing Replicate async + webhooks.
- **Delighting insurance** if PATINA albedo carries light: free `ccareaga/Intrinsic` HF Space, or self-host RGB↔X https://github.com/zheng95z/rgbx
- **Closest rivals:** WithPoly https://withpoly.com (no API), Scenario https://www.scenario.com/features/generate-textures (Unity-leaning, no UE packing).