import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { resolveJobFile } from "@/lib/jobs";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  png: "image/png",
  zip: "application/zip",
  json: "application/json",
  md: "text/markdown",
};

export async function GET(req: NextRequest) {
  const job = req.nextUrl.searchParams.get("job");
  const name = req.nextUrl.searchParams.get("name");
  if (!job || !name) return new NextResponse("bad request", { status: 400 });

  try {
    const filePath = resolveJobFile(job, name);
    const data = await fs.readFile(filePath);
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const headers = new Headers({
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    });
    if (ext === "zip") {
      headers.set("Content-Disposition", `attachment; filename="${name}"`);
    }
    return new NextResponse(Uint8Array.from(data), { headers });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
