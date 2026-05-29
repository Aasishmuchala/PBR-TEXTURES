export type MapType = "basecolor" | "normal" | "roughness" | "metalness" | "height";

export interface GenerateOptions {
  material: string; // PATINA prompt
  resolution: number; // 2048 | 4096 | 8192
  upscaleFactor: 0 | 2 | 4;
  tilingMode: "both" | "horizontal" | "vertical";
  strength: number;
  seed?: number | null;
  normalConvention: "gl" | "dx";
  aoStrength: number;
  clampMetallic: boolean;
  smoothHeight: number;
  enhance: boolean; // deterministic detail boost (detail normals, sharpen, roughness contrast, imperfections)
  aiUpscale: boolean; // AI super-res on base color via Replicate
  upscaler: "clarity" | "esrgan"; // clarity = detail synthesis (richer), esrgan = sharpen (safe/fast)
  compress: boolean; // smaller zip: base color -> JPG, data maps stay lossless
}

export interface PatinaImage {
  url: string;
  map_type?: MapType;
}

export interface PatinaResult {
  images: PatinaImage[];
  seed?: number;
  prompt?: string;
}

export interface ProcessedSet {
  name: string;
  jobId: string;
  resolution: number;
  costEstimate: number;
  zipBytes: number;
  urls: {
    baseColor: string;
    normal: string;
    orm: string;
    height: string;
    zip: string;
  };
  manifest: unknown;
}

export type FalPhase = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface FalStatusResponse {
  status: FalPhase | string;
  queuePosition?: number;
  logs: string[];
}
