import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { ensureJobDir } from "./jobs";

// Dual-mode output storage:
//  - On Vercel (BLOB_READ_WRITE_TOKEN present): upload to Vercel Blob -> public
//    CDN URL. Required because serverless functions can't return files >~4.5MB.
//  - Locally: write to /tmp and serve via /api/file (no size limit in dev).
export async function storeOutput(
  jobId: string,
  name: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { url } = await put(`${jobId}/${name}`, body, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return url;
  }
  const dir = await ensureJobDir(jobId);
  await fs.writeFile(path.join(dir, name), body);
  return `/api/file?job=${jobId}&name=${encodeURIComponent(name)}`;
}
