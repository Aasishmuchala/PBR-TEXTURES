// Optional AI super-res for the base color via Replicate (Real-ESRGAN).
// Direct REST (no SDK dep): look up the model's latest version, upload the
// image to Replicate's file store, create a prediction, poll, download result.
// BYOK: the user's Replicate token is passed per request, never persisted.

const API = "https://api.replicate.com/v1";
const MODEL = "nightmareai/real-esrgan";

async function rjson(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`replicate ${path} ${r.status} ${body.slice(0, 200)}`);
  }
  return r.json();
}

async function uploadFile(token: string, png: Buffer): Promise<string> {
  const fd = new FormData();
  fd.append("content", new Blob([new Uint8Array(png)], { type: "image/png" }), "base.png");
  const r = await fetch(`${API}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!r.ok) throw new Error(`replicate /files ${r.status}`);
  const j = await r.json();
  const url = j?.urls?.get || j?.url;
  if (!url) throw new Error("replicate file upload returned no url");
  return url;
}

export async function upscaleBaseColor(token: string, png: Buffer, scale = 2): Promise<Buffer> {
  const model = await rjson(token, `/models/${MODEL}`);
  const version = model?.latest_version?.id;
  if (!version) throw new Error("could not resolve Real-ESRGAN version");

  const imageUrl = await uploadFile(token, png);

  let pred = await rjson(token, `/predictions`, {
    method: "POST",
    body: JSON.stringify({ version, input: { image: imageUrl, scale, face_enhance: false } }),
  });

  const start = Date.now();
  while (!["succeeded", "failed", "canceled"].includes(pred.status)) {
    if (Date.now() - start > 150_000) throw new Error("replicate upscale timed out");
    await new Promise((r) => setTimeout(r, 2000));
    pred = await rjson(token, `/predictions/${pred.id}`);
  }
  if (pred.status !== "succeeded") throw new Error(`replicate upscale ${pred.status}`);

  const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (typeof out !== "string") throw new Error("replicate upscale returned no image");
  const img = await fetch(out);
  if (!img.ok) throw new Error(`download upscaled image ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

// Detail-SYNTHESIS upscaler: invents believable micro-detail (not just sharpening).
// Moderate creativity + high resemblance keeps the material faithful.
export async function upscaleClarity(
  token: string,
  png: Buffer,
  material: string,
  scale = 2,
): Promise<Buffer> {
  const model = await rjson(token, `/models/philz1337x/clarity-upscaler`);
  const version = model?.latest_version?.id;
  if (!version) throw new Error("could not resolve clarity-upscaler version");

  const imageUrl = await uploadFile(token, png);
  let pred = await rjson(token, `/predictions`, {
    method: "POST",
    body: JSON.stringify({
      version,
      input: {
        image: imageUrl,
        prompt: `${material || "surface"}, seamless tileable PBR texture, high detail, sharp, 8k`,
        scale_factor: scale,
        creativity: 0.3,
        resemblance: 0.85,
        dynamic: 6,
        num_inference_steps: 18,
      },
    }),
  });

  const start = Date.now();
  while (!["succeeded", "failed", "canceled"].includes(pred.status)) {
    if (Date.now() - start > 180_000) throw new Error("clarity upscale timed out");
    await new Promise((r) => setTimeout(r, 2500));
    pred = await rjson(token, `/predictions/${pred.id}`);
  }
  if (pred.status !== "succeeded") throw new Error(`clarity upscale ${pred.status}`);

  const out = Array.isArray(pred.output) ? pred.output[pred.output.length - 1] : pred.output;
  if (typeof out !== "string") throw new Error("clarity upscale returned no image");
  const img = await fetch(out);
  if (!img.ok) throw new Error(`download clarity image ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}
