import os from "os";
import path from "path";
import { promises as fs } from "fs";

// Outputs live in a tmp dir (writable locally and on Vercel's /tmp). They're
// ephemeral — the client downloads the zip; we don't need durable storage in v1.
const ROOT = path.join(os.tmpdir(), "textureforge");

export function jobRoot(): string {
  return ROOT;
}

export async function ensureJobDir(jobId: string): Promise<string> {
  const dir = path.join(ROOT, jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function newJobId(seed: string): string {
  const clean = seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "job";
  return `${clean}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Resolve a file inside a job dir, guarding against path traversal.
export function resolveJobFile(jobId: string, name: string): string {
  const base = path.join(ROOT, jobId);
  const resolved = path.normalize(path.join(base, name));
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error("invalid file path");
  }
  return resolved;
}
