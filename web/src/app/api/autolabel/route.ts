import { NextRequest, NextResponse } from "next/server";
import { claudeOpusVision } from "@/lib/classify";

export const runtime = "nodejs";
export const maxDuration = 30;

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
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (j.choices?.[0]?.message?.content ?? "").toString();
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
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
    }
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const dataUrl = `data:${file.type || "image/png"};base64,${b64}`;

    // Preferred: claudeopus.pro (retry + opus->sonnet->haiku fallback inside the helper).
    if (coKey) {
      try {
        const { text, model } = await claudeOpusVision(coKey, PROMPT, dataUrl, 40);
        return NextResponse.json({ label: clean(text), via: `claudeopus.pro/${model}` });
      } catch (e) {
        if (!orKey) throw e; // no fallback available
      }
    }
    const label = clean(await openRouter(orKey, dataUrl));
    return NextResponse.json({ label, via: "openrouter" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
