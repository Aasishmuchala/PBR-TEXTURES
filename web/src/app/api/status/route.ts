import { NextRequest, NextResponse } from "next/server";
import { status } from "@/lib/fal";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-fal-key") || process.env.FAL_KEY || "";
  const requestId = req.nextUrl.searchParams.get("requestId");
  if (!key || !requestId) {
    return NextResponse.json({ error: "missing key or requestId" }, { status: 400 });
  }
  try {
    const s = await status(key, requestId);
    return NextResponse.json(s);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
