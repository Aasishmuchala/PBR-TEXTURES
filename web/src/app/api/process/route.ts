import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { estimateCost, mapUrls, result } from "@/lib/fal";
import { buildUEMaps, seamlessResizePng, type RawMaps } from "@/lib/pbr";
import { upscaleBaseColor, upscaleClarity } from "@/lib/replicate";
import { buildManifest, buildZip, slugify } from "@/lib/ue";
import { ensureJobDir, newJobId } from "@/lib/jobs";
import type { GenerateOptions, ProcessedSet } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = { requestId: string; options: GenerateOptions & { name?: string } };

async function fetchBuf(url?: string): Promise<Buffer | undefined> {
  if (!url) return undefined;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
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

    const ext = ueMaps.baseColorExt;
    const bcFile = `T_${name}_BC.${ext}`;
    const manifest = buildManifest(name, options.material, options.resolution, patina.seed, ext);
    const zip = await buildZip(name, ueMaps, manifest, ext);

    const jobId = newJobId(name);
    const dir = await ensureJobDir(jobId);
    await Promise.all([
      fs.writeFile(path.join(dir, bcFile), ueMaps.baseColor),
      fs.writeFile(path.join(dir, `T_${name}_N.png`), ueMaps.normal),
      fs.writeFile(path.join(dir, `T_${name}_ORM.png`), ueMaps.orm),
      fs.writeFile(path.join(dir, `T_${name}_H.png`), ueMaps.height),
      fs.writeFile(path.join(dir, `${name}_UE.zip`), zip),
    ]);

    const fileUrl = (n: string) => `/api/file?job=${jobId}&name=${encodeURIComponent(n)}`;
    const processed: ProcessedSet = {
      name,
      jobId,
      resolution: options.resolution,
      costEstimate: estimateCost(options.resolution),
      zipBytes: zip.length,
      urls: {
        baseColor: fileUrl(bcFile),
        normal: fileUrl(`T_${name}_N.png`),
        orm: fileUrl(`T_${name}_ORM.png`),
        height: fileUrl(`T_${name}_H.png`),
        zip: fileUrl(`${name}_UE.zip`),
      },
      manifest,
    };
    return NextResponse.json(processed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
