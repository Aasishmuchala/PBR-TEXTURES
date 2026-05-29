import { NextRequest, NextResponse } from "next/server";
import { claudeOpusVision } from "@/lib/classify";

export const runtime = "nodejs";
export const maxDuration = 120; // opus-4-7 vision + fallback chain can be slow

const PROMPT =
  "You are classifying a surface material for a PBR texture generator. " +
  "Look at the image and reply with ONLY a short noun phrase (3-6 words) naming the " +
  "material, no punctuation. Examples: 'weathered oak wood planks', 'rusted corrugated " +
  "steel', 'mossy granite cobblestone'.";

const clean = (s: string) => s.replace(/^["']|["'.]+$/g, "").trim();

async function openRouter(key: string, dataUrl: string): Promise<string> {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      max_tokens: 40,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!r.ok) throw new Error(`openrouter ${r.status} ${(await r.text().catch(() => "")).slice(0, 140)}`);
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  const c = j.choices?.[0]?.message?.content;
  return typeof c === "string"
    ? c
    : Array.isArray(c)
      ? c.map((p) => (typeof p === "string" ? p : (p as { text?: string })?.text ?? "")).join(" ")
      : "";
}

export async function POST(req: NextRequest) {
  const coKey = req.headers.get("x-claudeopus-key") || process.env.CLAUDEOPUS_API_KEY || "";
  const orKey = req.headers.get("x-openrouter-key") || process.env.OPENROUTER_API_KEY || "";
  if (!coKey && !orKey) {
    return NextResponse.json(
      { error: "No classifier key — add a claudeopus.pro or OpenRouter key in Settings." },
      { status: 401 },
    );
  }
  try {
    // imageRef is either a public URL (browser uploaded to fal) or a data URL
    // (multipart fallback). Both work as an OpenAI-style image_url.
    let imageRef: string;
    if ((req.headers.get("content-type") || "").includes("application/json")) {
      const body = (await req.json()) as { imageUrl?: string };
      if (!body.imageUrl) return NextResponse.json({ error: "No image URL" }, { status: 400 });
      imageRef = body.imageUrl;
    } else {
      const form = await req.formData();
      const file = form.get("image");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
      }
      const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      imageRef = `data:${file.type || "image/png"};base64,${b64}`;
    }

    // Preferred: claudeopus.pro (retry + opus->sonnet->haiku fallback inside the helper).
    if (coKey) {
      try {
        const { text, model } = await claudeOpusVision(coKey, PROMPT, imageRef, 40);
        return NextResponse.json({ label: clean(text), via: `claudeopus.pro/${model}` });
      } catch (e) {
        if (!orKey) throw e; // no fallback available
      }
    }
    const label = clean(await openRouter(orKey, imageRef));
    return NextResponse.json({ label, via: "openrouter" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
