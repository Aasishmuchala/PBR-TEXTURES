# PBR Textures — TextureForge

Turn a single photo into a **4K, Unreal-Engine-ready PBR texture set** — seamless, with
**Base Color · Normal (DirectX) · ORM · 16-bit Height** — packed exactly the way UE5 wants.

Powered by **fal.ai PATINA** for map extraction; the UE-native packing (AO from height, ORM
channel-pack, DirectX normals, 16-bit height) is done locally — that's the part competitors skip.

## Repository layout

| Path | What |
|---|---|
| **`web/`** | The BYOK web app (Next.js 14 + TS). Upload → PATINA → UE-correct packing → live 3D preview → download zip. Includes material **auto-classify** (Claude vision), **AI super-res** (Clarity/Real-ESRGAN), and optional **output compression**. |
| **`core-proof/`** | Offline Python CLI — the canonical pipeline (includes true 16-bit height). |
| `RESEARCH.md` | Full research report (engine selection, pipeline, market). |
| `DECISIONS.md` | Locked architecture decisions + roadmap. |
| `findings.json` | Raw per-area research data. |

## Quick start (web app)

```bash
cd web
npm install
npm run dev
# http://localhost:3000  →  Settings (paste your fal.ai key)  →  Studio
```

**Bring your own keys** — they're stored only in your browser (localStorage) and sent
per-request to the providers; nothing is persisted server-side.

- **fal.ai** (required) — PATINA map extraction · https://fal.ai/dashboard/keys
- **claudeopus.pro** (optional) — material auto-classify via Claude vision
- **Replicate** (optional) — AI super-res detail
- **OpenRouter** (optional) — fallback classifier

## How it works

```
photo → PATINA (delight · deshadow · seamless · 4K · 5 maps)
      → moat: AO-from-height · ORM pack (R=AO G=Rough B=Metal) · DirectX normal · 16-bit height
      → live 3D preview (rotate, tile)  → download UE-ready zip (maps + manifest + ue_import.py)
```

## License

Private project. Generated textures' commercial terms depend on the upstream provider (fal.ai PATINA).
