"use client";

// Downscale + JPEG-encode an image in the browser before upload. Vercel
// serverless functions reject request bodies over ~4.5MB (413), and big phone
// photos blow past that. PATINA extracts at ~2048px natively, so capping the
// longest edge at 2048 loses no real quality and keeps the upload tiny.
export async function downscaleImage(file: File, maxDim = 2048, quality = 0.92): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "input";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close?.();
  }
}
