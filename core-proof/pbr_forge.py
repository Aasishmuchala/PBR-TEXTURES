"""
pbr_forge.py — OFFLINE CORE-PROOF for the 4K PBR texture app (Slice 1).

One photo in  ->  UE5-ready PBR set out. No web server, no queue, no billing —
just the part that has to be correct before any of that matters:

    upload photo
      -> PATINA (delight + deshadow + seamless + 4K upscale + 5 maps)
      -> derive AO from height            (PATINA emits no AO)
      -> pack ORM  R=AO G=Rough B=Metal   (UE convention, linear)
      -> flip normal to DirectX           (what UE wants)
      -> write 16-bit height
      -> name T_<name>_{BC,N,ORM,H}.png + manifest + UE import script
      -> zip

Goal of this slice: import the output into YOUR UE5 project and confirm it
looks right. That de-risks ~80% of the product.

USAGE (after `pip install -r requirements.txt` and setting FAL_KEY in .env):

    python pbr_forge.py path\to\photo.jpg --material "weathered oak planks"
    python pbr_forge.py path\to\photo.jpg --auto-label        # uses OpenRouter
    python pbr_forge.py photo.jpg -m "rusted steel" --resolution 8192 --upscale 4
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile

import fal_patina as fp
import pbr_maps as pm

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except Exception:
    pass  # dotenv optional; env vars may already be set


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", text.strip()).strip("_")
    return (s or "Material")[:40]


def parse_args(argv):
    p = argparse.ArgumentParser(description="Offline core-proof: photo -> UE5 PBR set via fal PATINA.")
    p.add_argument("image", help="path to the source photo")
    p.add_argument("-m", "--material", default=None,
                   help="material label, e.g. 'weathered oak planks' (PATINA prompt)")
    p.add_argument("--auto-label", action="store_true",
                   help="auto-generate the material label via OpenRouter (needs OPENROUTER_API_KEY)")
    p.add_argument("--name", default=None, help="asset base name (default: from material label)")
    p.add_argument("-o", "--out", default="output", help="output directory root")
    p.add_argument("--resolution", type=int, default=4096,
                   help="final square resolution (default 4096 = true 4K)")
    p.add_argument("--upscale", type=int, choices=[0, 2, 4], default=2,
                   help="PATINA upscale_factor: 0=2K, 2=4K, 4=8K (default 2)")
    p.add_argument("--tiling", choices=["both", "horizontal", "vertical"], default="both")
    p.add_argument("--strength", type=float, default=0.75, help="PATINA transform strength")
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--normal-convention", choices=["gl", "dx"], default="gl",
                   help="source normal convention. 'gl' (default) flips green to DirectX for UE; "
                        "'dx' leaves it untouched. Verify once visually and lock it in.")
    p.add_argument("--ao-strength", type=float, default=1.0)
    p.add_argument("--smooth-height", type=float, default=0.0,
                   help="gaussian radius to dither 8-bit height banding before 16-bit save")
    p.add_argument("--no-clamp-metallic", action="store_true",
                   help="disable flooring metallic to 0 on known dielectrics")
    p.add_argument("--no-zip", action="store_true")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv or sys.argv[1:])

    if not os.path.isfile(args.image):
        print(f"ERROR: image not found: {args.image}")
        return 2

    # 1. Material label (PATINA's required prompt) ---------------------------
    label = args.material
    if not label and args.auto_label:
        key = os.environ.get("OPENROUTER_API_KEY")
        if not key:
            print("ERROR: --auto-label needs OPENROUTER_API_KEY in .env")
            return 2
        print("-> auto-labelling material via OpenRouter ...")
        label = pm.auto_label(args.image, key)
        print(f"   label: {label!r}")
    if not label:
        print("ERROR: provide --material \"...\" or --auto-label")
        return 2

    name = slugify(args.name or label)
    out_dir = os.path.join(args.out, name)
    os.makedirs(out_dir, exist_ok=True)
    print(f"-> material={label!r}  name={name}  -> {out_dir}")

    est = fp.estimate_cost(args.resolution, n_maps=5)
    print(f"-> estimated fal cost for this run: ~${est} "
          f"(resolution {args.resolution}, 5 maps)")

    # 2. PATINA — the heavy lift --------------------------------------------
    tmp = tempfile.mkdtemp(prefix="patina_")
    try:
        urls, raw = fp.extract_material(
            args.image, label,
            upscale_factor=args.upscale,
            tiling_mode=args.tiling,
            strength=args.strength,
            seed=args.seed,
        )
        if "basecolor" not in urls:
            print("ERROR: PATINA returned no basecolor map; aborting.")
            return 1

        local = {}
        for mt, url in urls.items():
            dest = os.path.join(tmp, f"{mt}.png")
            print(f"   downloading {mt} ...")
            fp.download(url, dest)
            local[mt] = dest

        # 3. Post-process into UE-correct maps -------------------------------
        res = args.resolution
        print("-> post-processing (AO / ORM / normal / 16-bit height) ...")

        # Base color (sRGB)
        bc = pm.seamless_resize(pm.load_rgb(local["basecolor"]), res)
        pm.save_png(bc, os.path.join(out_dir, f"T_{name}_BC.png"))

        # Normal -> DirectX (UE), linear
        if "normal" in local:
            nrm = pm.seamless_resize(pm.load_rgb(local["normal"]), res)
            if args.normal_convention == "gl":
                nrm = pm.to_directx_normal(nrm)
            pm.save_png(nrm, os.path.join(out_dir, f"T_{name}_N.png"))

        # Height (16-bit) + AO source
        ao_f = None
        if "height" in local:
            h = pm.seamless_resize(pm.load_gray(local["height"]), res)
            pm.save_height_16(h, os.path.join(out_dir, f"T_{name}_H.png"),
                              smooth=args.smooth_height)
            ao_f = pm.ao_from_height(h, strength=args.ao_strength, res=res)

        # ORM pack (R=AO, G=Rough, B=Metal), linear
        if "roughness" in local and "metalness" in local:
            rough = pm.seamless_resize(pm.load_gray(local["roughness"]), res)
            metal = pm.seamless_resize(pm.load_gray(local["metalness"]), res)
            if not args.no_clamp_metallic:
                metal = pm.clamp_metallic(metal, label)
            if ao_f is None:  # no height -> neutral AO
                import numpy as np
                ao_f = np.ones((res, res), dtype="float32")
            orm = pm.pack_orm(ao_f, rough, metal)
            pm.save_png(orm, os.path.join(out_dir, f"T_{name}_ORM.png"))

        # 4. Manifest + UE import script + recipe ----------------------------
        manifest = {
            "name": name,
            "material_label": label,
            "resolution": res,
            "normal_convention": "DirectX (UE-ready)",
            "files": {
                "base_color": f"T_{name}_BC.png",
                "normal": f"T_{name}_N.png",
                "orm": f"T_{name}_ORM.png",
                "height": f"T_{name}_H.png",
            },
            "ue_import": {
                "T_{0}_BC".format(name): {"srgb": True, "compression": "TC_Default"},
                "T_{0}_N".format(name): {"srgb": False, "compression": "TC_Normalmap",
                                         "flip_green": False, "note": "already DirectX"},
                "T_{0}_ORM".format(name): {"srgb": False, "compression": "TC_Masks",
                                           "channels": "R=AO G=Roughness B=Metallic"},
                "T_{0}_H".format(name): {"srgb": False, "compression": "TC_Grayscale",
                                         "note": "16-bit; use for tessellation/Nanite displacement"},
            },
            "fal_seed": raw.get("seed"),
        }
        with open(os.path.join(out_dir, "manifest.json"), "w") as f:
            json.dump(manifest, f, indent=2)

        # copy the UE-side importer next to the maps (it auto-finds manifest.json)
        here = os.path.dirname(os.path.abspath(__file__))
        ue_src = os.path.join(here, "ue_import.py")
        if os.path.isfile(ue_src):
            shutil.copy(ue_src, os.path.join(out_dir, "ue_import.py"))

        _write_recipe(out_dir, name)

    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # 5. Zip -----------------------------------------------------------------
    if not args.no_zip:
        zip_path = shutil.make_archive(out_dir, "zip", out_dir)
        print(f"-> zipped: {zip_path}")

    print("\nDONE. Files in:", out_dir)
    print("Next: in Unreal, run  ue_import.py  (Tools > Execute Python Script, or")
    print("      Output Log cmd:  py \"<path>\\ue_import.py\")  — or follow IMPORT_RECIPE.md")
    return 0


def _write_recipe(out_dir: str, name: str) -> None:
    recipe = f"""# UE5 import recipe — {name}

Generated by pbr_forge.py. Two ways to bring this into Unreal Engine 5:

## A. Automated (recommended)
Run `ue_import.py` inside UE (it sits in this folder and auto-finds manifest.json):
- Editor menu: **Tools > Execute Python Script...** -> pick `ue_import.py`, or
- Output Log, switch to **Cmd**, run: `py "{out_dir}\\ue_import.py"`

It imports the four textures with correct settings and builds `M_{name}` + `MI_{name}`.

## B. Manual
Import the PNGs, then set **per texture**:

| Texture | sRGB | Compression | Notes |
|---|---|---|---|
| `T_{name}_BC`  | **ON**  | Default (BC7/DXT) | base color / albedo |
| `T_{name}_N`   | OFF | Normalmap | already DirectX — leave *Flip Green* OFF |
| `T_{name}_ORM` | OFF | Masks | **R=AO, G=Roughness, B=Metallic** |
| `T_{name}_H`   | OFF | Grayscale | 16-bit; tessellation / Nanite displacement |

Material wiring:
- `BC` RGB        -> **Base Color**
- `N`  RGB        -> **Normal**
- `ORM` **R**     -> **Ambient Occlusion**
- `ORM` **G**     -> **Roughness**
- `ORM` **B**     -> **Metallic**
- `H` (optional)  -> Nanite displacement / World Position Offset / Bump Offset

### The 3 gotchas that make textures look wrong in UE
1. ORM or Normal imported with **sRGB ON** -> washed-out roughness/metallic, bad lighting. Keep sRGB **OFF**.
2. Normal **green channel** inverted -> lighting looks inside-out. This set is DirectX; if it looks wrong, toggle *Flip Green Channel*.
3. Height as **8-bit** -> stair-step displacement. This set is 16-bit; keep it that way.
"""
    with open(os.path.join(out_dir, "IMPORT_RECIPE.md"), "w") as f:
        f.write(recipe)


if __name__ == "__main__":
    raise SystemExit(main())
