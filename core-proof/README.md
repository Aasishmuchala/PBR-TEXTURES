# Core-Proof — photo → UE5 PBR set (Slice 1)

The offline heart of the 4K PBR texture app. Proves the part that has to be
correct before any web/queue/billing work matters: turn one photo into a
**Unreal-Engine-ready** PBR material set and confirm it looks right in UE5.

```
photo ──▶ PATINA (fal.ai)                          ──▶ derive AO from height
          delight · deshadow · seamless · 4K · 5 maps    pack ORM (R=AO G=Rough B=Metal)
                                                          flip normal → DirectX
                                                          16-bit height
                                                     ──▶ T_<name>_{BC,N,ORM,H}.png
                                                          + manifest + UE importer + zip
```

## Why this slice first
Per the research synthesis, this single script **de-risks ~80% of the product**.
If the maps import clean and look right on a mesh in *your* UE5 project, the rest
is plumbing (upload page, job queue, storage, Stripe). If they don't, no amount
of web app saves you.

## Setup

```powershell
# from this folder
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env
# then edit .env and paste your FAL_KEY   (https://fal.ai/dashboard/keys)
```

> **You don't have a fal.ai key yet** — PATINA is fal-exclusive and is the
> keystone. Provision one before running. (Your Replicate/OpenRouter keys and
> the Higgsfield MCP do **not** reach PATINA.)

## Run

```powershell
# explicit material label
python pbr_forge.py "C:\path\to\photo.jpg" --material "weathered oak planks"

# let OpenRouter name the material (needs OPENROUTER_API_KEY)
python pbr_forge.py "C:\path\to\photo.jpg" --auto-label

# 8K premium set
python pbr_forge.py "C:\path\to\photo.jpg" -m "rusted steel" --resolution 8192 --upscale 4
```

Output lands in `output/<Name>/` with the four textures, `manifest.json`,
`IMPORT_RECIPE.md`, a copy of `ue_import.py`, and a `.zip`.

## Bring it into UE5
Open the output folder's `ue_import.py` **inside Unreal**
(Tools ▸ Execute Python Script, or `py "<path>\ue_import.py"` in the Output Log
Cmd). It imports the textures with correct sRGB/compression and builds
`M_<name>` + `MI_<name>`. Drop the MI on a sphere/plane and check it.

**What to verify (the whole point of this slice):**
1. Tiles seamlessly (set the mesh material to repeat 4×4).
2. Lighting reads correctly — if it looks inside-out, the normal convention is
   flipped: re-run with `--normal-convention dx`.
3. Roughness/metallic respond right under a moving light (not washed out → that
   means ORM got imported sRGB-ON; the importer sets it OFF).
4. Height drives believable displacement (enable Nanite displacement / tessellation).

## Cost
fal bills PATINA at `$0.01 + $0.02/MP + $0.01/MP/map` on **output** megapixels:
- **4096 (true 4K), 5 maps ≈ $1.18 / set**
- 2048, 5 maps ≈ $0.30 / set
- 8192, 5 maps ≈ $4.5 / set

True-4K is ~4× the 2K cost — the lever behind your pay-per-texture pricing.
Verify against real fal invoices on your first runs.

## Files
| File | Role |
|---|---|
| `pbr_forge.py` | CLI orchestrator (run this) |
| `fal_patina.py` | PATINA call + download + cost estimate |
| `pbr_maps.py` | the moat: AO-from-height, ORM pack, DirectX normal, 16-bit height |
| `ue_import.py` | run **inside UE5** to auto-import + build material |

## Known limits (honest)
- **Height precision:** PATINA returns 8-bit height; we upcast to 16-bit (range,
  not true precision). `--smooth-height 1.5` dithers banding. A >8-bit height
  source is future work.
- **AO** is cavity/detail AO derived from height, not a ground-truth bake.
- **Normal convention** assumes PATINA = OpenGL and flips to DirectX. Verify once
  visually, then trust it.
- `ue_import.py` material-graph build targets UE 5.3–5.5; if the graph API differs
  on your version it still imports the textures and you wire 6 nodes by hand
  (`IMPORT_RECIPE.md`).
