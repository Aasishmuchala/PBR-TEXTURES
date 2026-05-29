import { NextRequest, NextResponse } from "next/server";
import { estimateCost, mapUrls, result } from "@/lib/fal";
import { buildUEMaps, extractOpacity, seamlessResizePng, type RawMaps } from "@/lib/pbr";
import { removeBackground, upscaleBaseColor, upscaleClarity } from "@/lib/replicate";
import { buildManifest, buildZip, slugify } from "@/lib/ue";
import { newJobId } from "@/lib/jobs";
import { storeOutput } from "@/lib/storage";
import type { GenerateOptions, ProcessedSet } from "@/lib/types";

export const runtime = "nodejs";
// Pro plan: up to 300s. Heavy 8K + AI upscale + bg-removal can take minutes.
export const maxDuration = 300;

type Body = { requestId: string; options: GenerateOptions & { name?: string } };

async function fetchBuf(url?: string): Promise<Buffer | undefined> {
  if (!url) return undefined;
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.error(`map download failed (${r.status}): ${url}`);
      return undefined; // degrade gracefully — buildUEMaps tolerates missing maps
    }
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.error("map download error:", e);
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-fal-key") || process.env.FAL_KEY || "";
  const replicateKey = req.headers.get("x-replicate-key") || process.env.REPLICATE_API_TOKEN || "";
  if (!key) {
    return NextResponse.json({ error: "Missing fal key — add it in Settings." }, { status: 401 });
  }
  try {
    const { requestId, options } = (await req.json()) as Body;
    if (!requestId) return NextResponse.json({ error: "missing requestId" }, { status: 400 });

    // Sanitize untrusted numeric options (prevent absurd allocations / bad input).
    options.resolution = [2048, 4096, 8192].includes(options.resolution) ? options.resolution : 4096;
    options.aoStrength = Math.max(0, Math.min(2, Number(options.aoStrength) || 1));
    options.smoothHeight = Math.max(0, Math.min(4, Number(options.smoothHeight) || 0));
    options.strength = Math.max(0.3, Math.min(1, Number(options.strength) || 0.75));

    const patina = await result(key, requestId);
    const urls = mapUrls(patina);

    const raw: RawMaps = {
      basecolor: await fetchBuf(urls.basecolor),
      normal: await fetchBuf(urls.normal),
      roughness: await fetchBuf(urls.roughness),
      metalness: await fetchBuf(urls.metalness),
      height: await fetchBuf(urls.height),
    };

    // Optional AI super-res on the base color (Replicate), kept seamless.
    // Clarity = detail synthesis (richer) with Real-ESRGAN as fallback.
    if (options.aiUpscale && replicateKey && raw.basecolor) {
      try {
        let up: Buffer;
        if (options.upscaler === "esrgan") {
          up = await upscaleBaseColor(replicateKey, raw.basecolor, 2);
        } else {
          try {
            up = await upscaleClarity(replicateKey, raw.basecolor, options.material, 2);
          } catch (e) {
            console.error("Clarity failed; trying Real-ESRGAN:", e);
            up = await upscaleBaseColor(replicateKey, raw.basecolor, 2);
          }
        }
        raw.basecolor = await seamlessResizePng(up, options.resolution);
      } catch (e) {
        console.error("AI upscale failed; using PATINA base color:", e);
      }
    }

    const name = slugify(options.name || options.material);
    const ueMaps = await buildUEMaps(raw, {
      resolution: options.resolution,
      normalConvention: options.normalConvention,
      aoStrength: options.aoStrength,
      clampMetallic: options.clampMetallic,
      material: options.material,
      smoothHeight: options.smoothHeight,
      enhance: options.enhance,
      compress: options.compress,
    });

    // Optional opacity/alpha map: background-remove the base color, take its alpha.
    let opacityBuf: Buffer | undefined;
    if (options.opacity && replicateKey && raw.basecolor) {
      try {
        const rgba = await removeBackground(replicateKey, raw.basecolor);
        opacityBuf = await extractOpacity(rgba, options.resolution);
      } catch (e) {
        console.error("opacity (bg-removal) failed; skipping:", e);
      }
    }

    const ext = ueMaps.baseColorExt;
    const bcFile = `T_${name}_BC.${ext}`;
    const manifest = buildManifest(name, options.material, options.resolution, patina.seed, ext, !!opacityBuf);
    const zip = await buildZip(name, ueMaps, manifest, ext, opacityBuf);

    const jobId = newJobId(name);
    const [baseColor, normal, orm, height, zipUrl] = await Promise.all([
      storeOutput(jobId, bcFile, ueMaps.baseColor, ext === "jpg" ? "image/jpeg" : "image/png"),
      storeOutput(jobId, `T_${name}_N.png`, ueMaps.normal, "image/png"),
      storeOutput(jobId, `T_${name}_ORM.png`, ueMaps.orm, "image/png"),
      storeOutput(jobId, `T_${name}_H.png`, ueMaps.height, "image/png"),
      storeOutput(jobId, `${name}_UE.zip`, zip, "application/zip"),
    ]);
    const opacity = opacityBuf
      ? await storeOutput(jobId, `T_${name}_O.png`, opacityBuf, "image/png")
      : undefined;

    const processed: ProcessedSet = {
      name,
      jobId,
      resolution: options.resolution,
      costEstimate: estimateCost(options.resolution),
      zipBytes: zip.length,
      urls: { baseColor, normal, orm, height, zip: zipUrl, ...(opacity ? { opacity } : {}) },
      manifest,
    };
    return NextResponse.json(processed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
