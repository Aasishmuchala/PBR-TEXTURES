"""
fal_patina.py — thin wrapper around fal.ai PATINA Material Extraction.

Endpoint: fal-ai/patina/material
One call does: identify -> flatten/delight -> deshadow -> seamless tile ->
optional upscale -> emit basecolor/normal/roughness/metalness/height.

Auth: fal_client reads the FAL_KEY environment variable automatically.
Get a key at https://fal.ai/dashboard/keys (you do NOT have one yet — this is
the keystone dependency for the whole MVP).
"""
from __future__ import annotations

import os

import requests

DEFAULT_MAPS = ["basecolor", "normal", "roughness", "metalness", "height"]
ENDPOINT = "fal-ai/patina/material"


def _on_queue_update(update) -> None:
    import fal_client
    if isinstance(update, fal_client.InProgress):
        for log in (getattr(update, "logs", None) or []):
            msg = log.get("message") if isinstance(log, dict) else str(log)
            if msg:
                print(f"   [fal] {msg}")


def extract_material(
    image_path: str,
    prompt: str,
    *,
    upscale_factor: int = 2,        # 0=none(2K), 2=4K, 4=8K. We want 4K -> 2.
    tiling_mode: str = "both",      # both | horizontal | vertical
    strength: float = 0.75,
    steps: int = 8,
    seed: int | None = None,
    maps: list[str] | None = None,
) -> tuple[dict[str, str], dict]:
    """
    Run PATINA on a local image. Returns ({map_type: url, ...}, raw_result).

    Raises a clear error if FAL_KEY is missing so the failure mode is obvious
    while you're still waiting on the key.
    """
    if not os.environ.get("FAL_KEY"):
        raise RuntimeError(
            "FAL_KEY is not set. PATINA is fal-exclusive and is the keystone of "
            "this pipeline. Get a key at https://fal.ai/dashboard/keys and put it "
            "in core-proof/.env (FAL_KEY=...). Nothing else can run without it."
        )

    import fal_client  # imported lazily so the module loads even pre-install

    print(f"   uploading {os.path.basename(image_path)} to fal ...")
    image_url = fal_client.upload_file(image_path)

    arguments = {
        "image_url": image_url,
        "prompt": prompt,
        "tiling_mode": tiling_mode,
        "upscale_factor": upscale_factor,
        "strength": strength,
        "num_inference_steps": steps,
        "maps": maps or DEFAULT_MAPS,
        "output_format": "png",      # lossless — never JPEG a normal/data map
    }
    if seed is not None:
        arguments["seed"] = seed

    print(f"   calling PATINA ({ENDPOINT}) prompt={prompt!r} "
          f"upscale={upscale_factor}x tiling={tiling_mode} ...")
    result = fal_client.subscribe(
        ENDPOINT,
        arguments=arguments,
        with_logs=True,
        on_queue_update=_on_queue_update,
    )

    urls: dict[str, str] = {}
    for img in result.get("images", []):
        mt = img.get("map_type")
        if mt and img.get("url"):
            urls[mt] = img["url"]

    missing = [m for m in (maps or DEFAULT_MAPS) if m not in urls]
    if missing:
        print(f"   WARNING: PATINA did not return: {missing} "
              f"(got: {sorted(urls)})")
    return urls, result


def download(url: str, dest_path: str) -> str:
    """Download a map URL to a local path. fal output URLs expire — grab them now."""
    r = requests.get(url, timeout=180)
    r.raise_for_status()
    with open(dest_path, "wb") as f:
        f.write(r.content)
    return dest_path


def estimate_cost(resolution: int, n_maps: int = 5) -> float:
    """
    fal's published PATINA price: $0.01 base + $0.02/MP + $0.01/MP/map,
    billed on OUTPUT megapixels. Returns USD estimate (verify vs real invoices).
    """
    mp = (resolution * resolution) / 1_000_000.0
    return round(0.01 + 0.02 * mp + 0.01 * mp * n_maps, 3)
