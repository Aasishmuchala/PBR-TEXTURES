"use client";

import { createFalClient } from "@fal-ai/client";

// Upload the image straight from the browser to fal storage using the user's
// (BYOK) fal key, returning a public URL. This bypasses our serverless function
// entirely, so there's no 4.5MB request-body limit — any file size works, and
// PATINA gets the full-resolution source (no lossy client downscale).
export async function uploadToFal(key: string, file: File): Promise<string> {
  const client = createFalClient({ credentials: key });
  return client.storage.upload(file);
}
