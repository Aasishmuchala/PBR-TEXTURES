import { NextRequest, NextResponse } from "next/server";
import { submit, uploadImage } from "@/lib/fal";
import type { GenerateOptions } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-fal-key") || process.env.FAL_KEY || "";
  if (!key) {
    return NextResponse.json({ error: "Missing fal key — add it in Settings." }, { status: 401 });
  }
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
    }
    const options = JSON.parse(String(form.get("options") ?? "{}")) as GenerateOptions;
    if (!options.material) {
      return NextResponse.json({ error: "Missing material label" }, { status: 400 });
    }
    const imageUrl = await uploadImage(
      key,
      await file.arrayBuffer(),
      file.name || "input.png",
      file.type || "image/png",
    );
    const requestId = await submit(key, imageUrl, options);
    return NextResponse.json({ requestId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
