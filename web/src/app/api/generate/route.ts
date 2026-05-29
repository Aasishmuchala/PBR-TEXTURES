import { NextRequest, NextResponse } from "next/server";
import { submit, uploadImage } from "@/lib/fal";
import type { GenerateOptions } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-fal-key") || process.env.FAL_KEY || "";
  if (!key) {
    return NextResponse.json({ error: "Missing fal key — add it in Settings." }, { status: 401 });
  }
  try {
    let imageUrl: string;
    let options: GenerateOptions;
    if ((req.headers.get("content-type") || "").includes("application/json")) {
      // Preferred: the browser already uploaded the image to fal; we get a URL.
      const body = (await req.json()) as { imageUrl?: string; options?: GenerateOptions };
      if (!body.imageUrl) return NextResponse.json({ error: "No image URL" }, { status: 400 });
      imageUrl = body.imageUrl;
      options = body.options as GenerateOptions;
    } else {
      // Fallback: multipart file upload (server-side fal upload). <4.5MB only.
      const form = await req.formData();
      const file = form.get("image");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
      }
      options = JSON.parse(String(form.get("options") ?? "{}")) as GenerateOptions;
      imageUrl = await uploadImage(key, await file.arrayBuffer(), file.name || "input.png", file.type || "image/png");
    }
    if (!options?.material) {
      return NextResponse.json({ error: "Missing material label" }, { status: 400 });
    }
    const requestId = await submit(key, imageUrl, options);
    return NextResponse.json({ requestId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
