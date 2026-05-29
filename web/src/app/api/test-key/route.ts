import { NextRequest, NextResponse } from "next/server";
import { validateKey } from "@/lib/fal";
import { claudeOpusVision } from "@/lib/classify";

export const runtime = "nodejs";

const ONE_PX_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// Tests with the real vision shape the app uses; reports which model answered
// (opus, or a fallback if opus was transiently busy).
async function testClaudeOpus(key: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    const { model } = await claudeOpusVision(key, "reply ok", `data:image/png;base64,${ONE_PX_PNG}`, 5);
    return { valid: true, reason: `via ${model}` };
  } catch (e) {
    return { valid: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { provider, key, falKey } = (await req.json()) as {
      provider?: string;
      key?: string;
      falKey?: string;
    };
    const p = provider ?? (falKey ? "fal" : "");
    const k = key ?? falKey ?? "";
    if (!k) return NextResponse.json({ valid: false, reason: "No key provided" }, { status: 400 });
    const res = p === "claudeopus" ? await testClaudeOpus(k) : await validateKey(k);
    return NextResponse.json(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ valid: false, reason: msg }, { status: 500 });
  }
}
