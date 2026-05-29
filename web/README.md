# TextureForge — web app

Upload a photo → get a 4K **Unreal-Engine-ready** PBR texture set. Powered by
**fal.ai PATINA**, with the UE-native packing done locally. **Bring your own key.**

```
photo ─▶ PATINA (fal: delight · deshadow · seamless · 4K · 5 maps)
      ─▶ moat: AO-from-height · ORM pack (R=AO G=Rough B=Metal) · DirectX normal
      ─▶ live 3D preview (rotate, tile 1–6×)  ─▶ download UE zip (+ auto-import script)
```

## Run it

```powershell
cd pbr-texture-app\web
npm install
npm run dev
# open http://localhost:3000  →  Settings  →  paste your fal key  →  Test  →  Studio
```

That's it. No accounts, no database — your fal key lives in your browser
(localStorage) and is sent per-request to fal, never stored on a server.

- **fal key (required):** https://fal.ai/dashboard/keys — powers PATINA.
- **OpenRouter key (optional):** https://openrouter.ai/keys — enables the “Auto” button
  that names the material from your image.

## How it works

| Layer | What |
|---|---|
| `src/lib/fal.ts` | PATINA queue submit/status/result + image upload + key validation |
| `src/lib/pbr.ts` | **the moat** — AO from height, ORM pack, DirectX normal flip (sharp) |
| `src/lib/ue.ts` | UE naming, manifest, embedded `ue_import.py`, zip |
| `src/app/api/*` | generate · status · process · autolabel · test-key · file |
| `src/components/MaterialPreview3D.tsx` | react-three-fiber PBR preview (DX→GL flip for preview) |

The slow part (PATINA generation) runs on fal's queue, so the client polls
`/api/status` — no serverless timeout. Post-processing (`/api/process`) is fast
image math and writes outputs to a tmp dir served by `/api/file`.

## Deploy (Vercel)
Works on Vercel out of the box (sharp is supported; routes are Node runtime;
outputs go to `/tmp`). For a real product serving *other* users, add: accounts,
encrypted server-side keys, durable storage (R2), and Stripe billing — see
`../DECISIONS.md`.

## Known limits (v1, honest)
- **Height is 8-bit** here (PATINA's source is 8-bit anyway). The Python
  `../core-proof` writes a 16-bit container; porting that to the web is a tracked
  enhancement.
- Outputs in `/tmp` are **ephemeral** — download the zip; there's no library yet.
- BYOK in localStorage is right for personal use, not multi-tenant SaaS.

## Relationship to `../core-proof`
Same pipeline, two forms: `core-proof` is the offline Python CLI (canonical,
includes true 16-bit height); this `web` app is the BYOK product. Both share the
exact same UE-correctness rules (sRGB-off ORM, DirectX normals, ORM channel order).
