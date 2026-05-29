"""
pbr_maps.py — the deterministic image math that turns PATINA's raw maps into a
UE5-correct PBR set. THIS is the moat: every competitor stops at loose PNGs;
we derive AO, pack ORM the Unreal way, fix the normal convention, and emit a
16-bit height map.

Pure functions, no network. Depends only on numpy + Pillow.
"""
from __future__ import annotations

import base64
import json

import numpy as np
from PIL import Image, ImageFilter

# Pillow >= 9.1 renamed the resample enum; support both.
try:
    LANCZOS = Image.Resampling.LANCZOS
except AttributeError:  # pragma: no cover
    LANCZOS = Image.LANCZOS


# --------------------------------------------------------------------------- #
# I/O
# --------------------------------------------------------------------------- #
def load_rgb(path: str) -> np.ndarray:
    """Load as HxWx3 uint8."""
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.uint8)


def load_gray(path: str) -> np.ndarray:
    """Load as HxW uint8 (luminance)."""
    return np.asarray(Image.open(path).convert("L"), dtype=np.uint8)


def save_png(arr: np.ndarray, path: str) -> None:
    """Save an 8-bit array (HxW or HxWx3) as PNG."""
    Image.fromarray(np.ascontiguousarray(arr.astype(np.uint8))).save(path)


def save_height_16(height_u8: np.ndarray, path: str, smooth: float = 0.0) -> None:
    """
    Save a single-channel height map as a 16-bit grayscale PNG so UE imports it
    at 16-bit (kills displacement banding).

    NOTE on precision: PATINA returns 8-bit height, so this upcasts — the *range*
    is 16-bit but true precision is 8-bit. An optional gaussian `smooth` dithers
    the stair-steps so tessellation/Nanite displacement reads cleaner. For true
    16-bit precision you'd need a height source that emits >8-bit (future work).
    """
    h = height_u8.astype(np.float32) / 255.0
    if smooth > 0:
        img = Image.fromarray((h * 255).astype(np.uint8))
        h = np.asarray(img.filter(ImageFilter.GaussianBlur(radius=float(smooth))),
                       dtype=np.float32) / 255.0
    h16 = (np.clip(h, 0.0, 1.0) * 65535.0).astype(np.uint16)
    Image.fromarray(h16, mode="I;16").save(path)


# --------------------------------------------------------------------------- #
# Seamless-preserving resize (safety net only — PATINA already tiles)
# --------------------------------------------------------------------------- #
def seamless_resize(arr: np.ndarray, target: int, pad: int = 64) -> np.ndarray:
    """
    Resize a *seamless* texture to target x target while keeping the seam intact.
    Wrap-pads, resizes the padded image, then crops back the scaled border so the
    edges still match. Applied IDENTICALLY to every map preserves cross-map +
    tile consistency. No-op when already at target.
    """
    h, w = arr.shape[:2]
    if (w, h) == (target, target):
        return arr
    p = pad
    if arr.ndim == 3:
        padded = np.pad(arr, ((p, p), (p, p), (0, 0)), mode="wrap")
    else:
        padded = np.pad(arr, ((p, p), (p, p)), mode="wrap")
    s = target / float(w)
    new_w = int(round((w + 2 * p) * s))
    new_h = int(round((h + 2 * p) * s))
    im = Image.fromarray(padded).resize((new_w, new_h), LANCZOS)
    r = np.asarray(im)
    cx = int(round(p * s))
    cy = int(round(p * s))
    return r[cy:cy + target, cx:cx + target]


# --------------------------------------------------------------------------- #
# Ambient Occlusion derived from height (PATINA emits no AO)
# --------------------------------------------------------------------------- #
def ao_from_height(height_u8: np.ndarray, strength: float = 1.0,
                   res: int | None = None) -> np.ndarray:
    """
    Multi-scale cavity AO from a height map. A pixel that sits *below* its local
    neighborhood is occluded. Blur radii scale with resolution so the look is
    consistent at 2K vs 4K. Returns float AO in [0,1].

    This is detail/cavity AO baked into the texture — UE will still compute
    large-scale AO from geometry; this captures what the mesh can't.
    """
    h = height_u8.astype(np.float32) / 255.0
    res = res or max(height_u8.shape[:2])
    base = res / 2048.0
    src = Image.fromarray((h * 255).astype(np.uint8))

    ao = np.ones_like(h)
    for radius_px, weight in ((3.0, 0.6), (12.0, 0.5), (40.0, 0.4)):
        r = max(1.0, radius_px * base)
        blur = np.asarray(src.filter(ImageFilter.GaussianBlur(radius=r)),
                          dtype=np.float32) / 255.0
        occ = np.clip((blur - h), 0.0, 1.0) * strength * weight
        ao *= (1.0 - occ)
    return np.clip(ao, 0.0, 1.0)


# --------------------------------------------------------------------------- #
# ORM channel-pack (the UE convention: R=AO, G=Roughness, B=Metallic, LINEAR)
# --------------------------------------------------------------------------- #
def _to_single(arr: np.ndarray) -> np.ndarray:
    return arr if arr.ndim == 2 else arr[..., 0]


def pack_orm(ao_f: np.ndarray, roughness_u8: np.ndarray,
             metallic_u8: np.ndarray) -> np.ndarray:
    """
    Pack the Unreal ORM texture: R = Ambient Occlusion, G = Roughness,
    B = Metallic. Import into UE with sRGB OFF (it's data, not color).
    """
    ao = (np.clip(ao_f, 0.0, 1.0) * 255.0).astype(np.uint8)
    rough = _to_single(roughness_u8).astype(np.uint8)
    metal = _to_single(metallic_u8).astype(np.uint8)
    return np.dstack([ao, rough, metal]).astype(np.uint8)


# --------------------------------------------------------------------------- #
# Normal convention
# --------------------------------------------------------------------------- #
def to_directx_normal(normal_rgb_u8: np.ndarray) -> np.ndarray:
    """
    Flip the green channel to convert an OpenGL (Y+) normal map to DirectX (Y-),
    which is what Unreal Engine expects. If your source is already DirectX, skip
    this (use --normal-convention dx on the CLI).
    """
    n = normal_rgb_u8.copy()
    n[..., 1] = 255 - n[..., 1]
    return n


def clamp_metallic(metal_u8: np.ndarray, material_class: str | None) -> np.ndarray:
    """
    Optional physically-plausible cleanup: real surfaces are almost binary metal
    vs dielectric. For known non-metals (wood/stone/fabric/concrete/brick/leather)
    we floor metallic to ~0 to kill the grey-metal haze PBR estimators often add.
    """
    if not material_class:
        return metal_u8
    dielectrics = ("wood", "stone", "rock", "concrete", "brick", "fabric",
                   "cloth", "leather", "plaster", "ceramic", "tile", "sand",
                   "dirt", "ground", "foliage", "bark", "paper", "plastic")
    cls = material_class.lower()
    if any(d in cls for d in dielectrics):
        m = _to_single(metal_u8).astype(np.float32)
        m = np.where(m < 60, 0.0, m)  # crush low-metal noise to pure dielectric
        return m.astype(np.uint8)
    return metal_u8


# --------------------------------------------------------------------------- #
# Optional: auto-label the material via OpenRouter (feeds PATINA's `prompt`)
# --------------------------------------------------------------------------- #
def auto_label(image_path: str, api_key: str,
               model: str = "google/gemini-2.5-flash-lite") -> str:
    """
    Ask a cheap vision model for a short material label, e.g. "weathered oak wood
    planks". In the full web app this is the classification step; here it's an
    optional convenience so you can run without typing --material.
    """
    import requests  # local import keeps the math module network-free by default

    mime = "image/png" if image_path.lower().endswith(".png") else "image/jpeg"
    with open(image_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    payload = {
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text":
                    "Identify the surface material in this image for a PBR texture "
                    "generator. Reply with ONLY a short noun phrase (3-6 words), no "
                    "punctuation. Example: 'weathered oak wood planks'."},
                {"type": "image_url",
                 "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ],
        }],
        "max_tokens": 30,
        "temperature": 0.2,
    }
    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}",
                 "Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=60,
    )
    resp.raise_for_status()
    label = resp.json()["choices"][0]["message"]["content"].strip().strip('"').strip(".")
    return label or "surface material"
