import { createFalClient } from "@fal-ai/client";
import type {
  FalStatusResponse,
  GenerateOptions,
  PatinaResult,
  MapType,
} from "./types";

export { estimateCost } from "./cost";

export const PATINA_ENDPOINT = "fal-ai/patina/material";

// Per-request client so each user's BYOK key is isolated (no global state race).
function client(key: string) {
  return createFalClient({ credentials: key });
}

export async function uploadImage(
  key: string,
  bytes: ArrayBuffer,
  filename: string,
  contentType: string,
): Promise<string> {
  const c = client(key);
  const file = new File([bytes], filename || "input.png", { type: contentType || "image/png" });
  return c.storage.upload(file);
}

export function buildArgs(imageUrl: string, o: GenerateOptions): Record<string, unknown> {
  const args: Record<string, unknown> = {
    image_url: imageUrl,
    prompt: o.material,
    tiling_mode: o.tilingMode,
    upscale_factor: o.upscaleFactor,
    strength: o.strength,
    maps: ["basecolor", "normal", "roughness", "metalness", "height"],
    output_format: "png",
  };
  if (o.seed !== null && o.seed !== undefined) args.seed = o.seed;
  return args;
}

export async function submit(key: string, imageUrl: string, o: GenerateOptions): Promise<string> {
  const c = client(key);
  const res = await c.queue.submit(PATINA_ENDPOINT, { input: buildArgs(imageUrl, o) });
  return res.request_id;
}

export async function status(key: string, requestId: string): Promise<FalStatusResponse> {
  const c = client(key);
  const s = (await c.queue.status(PATINA_ENDPOINT, { requestId, logs: true })) as unknown as Record<
    string,
    unknown
  >;
  const rawLogs = (s.logs as Array<{ message?: string }> | undefined) ?? [];
  return {
    status: String(s.status ?? "IN_PROGRESS"),
    queuePosition: typeof s.queue_position === "number" ? s.queue_position : undefined,
    logs: rawLogs.map((l) => l?.message ?? "").filter(Boolean),
  };
}

export async function result(key: string, requestId: string): Promise<PatinaResult> {
  const c = client(key);
  const r = await c.queue.result(PATINA_ENDPOINT, { requestId });
  return r.data as unknown as PatinaResult;
}

export function mapUrls(res: PatinaResult): Partial<Record<MapType, string>> {
  const out: Partial<Record<MapType, string>> = {};
  for (const img of res.images ?? []) {
    if (img.map_type && img.url) out[img.map_type] = img.url;
  }
  return out;
}

// Validate a key without spending credits: a status check on a bogus request id
// returns 401/403 for a bad key, but 404/422 for a good key with no such job.
export async function validateKey(key: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    await status(key, "00000000-0000-0000-0000-000000000000");
    return { valid: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = msg.toLowerCase();
    if (m.includes("401") || m.includes("403") || m.includes("unauthor") || m.includes("forbidden")) {
      return { valid: false, reason: "Key rejected by fal (401/403)." };
    }
    // 404 / 422 / "not found" => the key authenticated fine; the request just doesn't exist.
    return { valid: true };
  }
}
