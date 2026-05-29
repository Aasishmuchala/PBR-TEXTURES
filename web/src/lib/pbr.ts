import sharp from "sharp";
import { PNG } from "pngjs";

// ---------------------------------------------------------------------------
// THE MOAT + Max-Realism enhancement.
//   - AO from height; ORM pack (R=AO,G=Rough,B=Metal) linear; DirectX normal
//   - detail normal from height (Sobel) blended into PATINA's normal
//   - PROCEDURAL IMPERFECTIONS: tileable noise -> grime in cavities + tonal
//     variation on albedo, roughness break-up (the "imperfection pass")
//   - unsharp + roughness contrast
//   - true 16-bit height (pngjs) for clean displacement
//   - seamless wrap-pad resize (used after AI super-res)
// ---------------------------------------------------------------------------

export interface RawMaps {
  basecolor?: Buffer;
  normal?: Buffer;
  roughness?: Buffer;
  metalness?: Buffer;
  height?: Buffer;
}

export interface UEMaps {
  baseColor: Buffer;
  normal: Buffer;
  orm: Buffer;
  height: Buffer;
  height16: boolean;
  baseColorExt: "png" | "jpg";
}

export interface BuildOptions {
  resolution: number;
  normalConvention: "gl" | "dx";
  aoStrength: number;
  clampMetallic: boolean;
  material: string;
  smoothHeight: number;
  enhance: boolean;
  compress: boolean;
}

const DIELECTRICS = [
  "wood", "stone", "rock", "concrete", "brick", "fabric", "cloth", "leather",
  "plaster", "ceramic", "tile", "sand", "dirt", "ground", "foliage", "bark",
  "paper", "plastic",
];
const isDielectric = (m: string) => DIELECTRICS.some((d) => (m || "").toLowerCase().includes(d));
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// deterministic PRNG + string hash (seed imperfections by material name)
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Tileable value-noise fbm. Periodic lattices (index wrap with %g) -> seamless.
function tileableNoise(R: number, seed: number): Float32Array {
  const octaves: Array<[number, number]> = [[4, 0.5], [8, 0.28], [16, 0.14], [32, 0.08]];
  const field = new Float32Array(R * R);
  let ampSum = 0;
  for (const [g, a] of octaves) {
    const rnd = mulberry32(seed + g * 1013904223);
    const lat = new Float32Array(g * g);
    for (let i = 0; i < g * g; i++) lat[i] = rnd();
    ampSum += a;
    for (let y = 0; y < R; y++) {
      const fy = (y / R) * g;
      const y0 = Math.floor(fy) % g;
      const y1 = (y0 + 1) % g;
      const ty = fy - Math.floor(fy);
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < R; x++) {
        const fx = (x / R) * g;
        const x0 = Math.floor(fx) % g;
        const x1 = (x0 + 1) % g;
        const tx = fx - Math.floor(fx);
        const sx = tx * tx * (3 - 2 * tx);
        const top = lat[y0 * g + x0] + (lat[y0 * g + x1] - lat[y0 * g + x0]) * sx;
        const bot = lat[y1 * g + x0] + (lat[y1 * g + x1] - lat[y1 * g + x0]) * sx;
        field[y * R + x] += a * (top + (bot - top) * sy);
      }
    }
  }
  for (let i = 0; i < R * R; i++) field[i] /= ampSum;
  return field;
}

async function grayRawAt(buf: Buffer, R: number, smooth = 0): Promise<Buffer> {
  let pipe = sharp(buf).greyscale().resize(R, R, { fit: "fill" });
  if (smooth > 0) pipe = pipe.blur(smooth);
  return pipe.raw().toBuffer();
}

function flipGreenCopy(rgb: Buffer, R: number): Buffer {
  const o = Buffer.from(rgb);
  for (let i = 0; i < R * R; i++) o[i * 3 + 1] = 255 - o[i * 3 + 1];
  return o;
}
function flatNormalGL(R: number): Buffer {
  const b = Buffer.alloc(R * R * 3);
  for (let i = 0; i < R * R; i++) {
    b[i * 3] = 128;
    b[i * 3 + 1] = 128;
    b[i * 3 + 2] = 255;
  }
  return b;
}
function detailNormalFromHeight(h: Buffer, R: number, strength: number): Buffer {
  const out = Buffer.alloc(R * R * 3);
  const at = (x: number, y: number) =>
    h[(y < 0 ? 0 : y >= R ? R - 1 : y) * R + (x < 0 ? 0 : x >= R ? R - 1 : x)];
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const dx = ((at(x + 1, y) - at(x - 1, y)) / 255) * strength;
      const dy = ((at(x, y + 1) - at(x, y - 1)) / 255) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const i = (y * R + x) * 3;
      out[i] = clamp255((nx * 0.5 + 0.5) * 255);
      out[i + 1] = clamp255((ny * 0.5 + 0.5) * 255);
      out[i + 2] = clamp255((nz * 0.5 + 0.5) * 255);
    }
  }
  return out;
}
function blendNormalsGL(base: Buffer, detail: Buffer, R: number): Buffer {
  const out = Buffer.alloc(R * R * 3);
  for (let i = 0; i < R * R; i++) {
    const bx = base[i * 3] / 127.5 - 1, by = base[i * 3 + 1] / 127.5 - 1, bz = base[i * 3 + 2] / 127.5 - 1;
    const dx = detail[i * 3] / 127.5 - 1, dy = detail[i * 3 + 1] / 127.5 - 1;
    let rx = bx + dx, ry = by + dy, rz = bz;
    const l = Math.hypot(rx, ry, rz) || 1;
    rx /= l; ry /= l; rz /= l;
    out[i * 3] = clamp255((rx * 0.5 + 0.5) * 255);
    out[i * 3 + 1] = clamp255((ry * 0.5 + 0.5) * 255);
    out[i * 3 + 2] = clamp255((rz * 0.5 + 0.5) * 255);
  }
  return out;
}

async function aoFromHeightRaw(h: Buffer, R: number, strength: number): Promise<Buffer> {
  const base = R / 2048;
  const n = R * R;
  const ao = new Float32Array(n).fill(1);
  for (const [radius, weight] of [[3, 0.6], [12, 0.5], [40, 0.4]] as Array<[number, number]>) {
    const sigma = Math.min(800, Math.max(0.5, radius * base * 0.5));
    const blur = await sharp(h, { raw: { width: R, height: R, channels: 1 } }).blur(sigma).raw().toBuffer();
    for (let i = 0; i < n; i++) {
      const diff = (blur[i] - h[i]) / 255;
      ao[i] *= 1 - (diff > 0 ? Math.min(1, diff) * strength * weight : 0);
    }
  }
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) out[i] = clamp255(clamp01(ao[i]) * 255);
  return out;
}

// 16-bit grayscale PNG (upcast 8->16). Throws if pngjs path fails -> caller falls back.
function encodeHeight16(h: Buffer, R: number, compress: boolean): Buffer {
  const data = Buffer.alloc(R * R * 2);
  for (let i = 0; i < R * R; i++) data.writeUInt16BE(Math.min(65535, h[i] * 257), i * 2);
  const png = new PNG({ width: R, height: R, colorType: 0, bitDepth: 16, inputColorType: 0, inputHasAlpha: false });
  png.data = data;
  return PNG.sync.write(png, {
    colorType: 0,
    bitDepth: 16,
    inputColorType: 0,
    inputHasAlpha: false,
    deflateLevel: compress ? 9 : 6,
  });
}

export async function seamlessResizePng(png: Buffer, target: number, pad = 64): Promise<Buffer> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height, p = pad;
  const pw = w + 2 * p, ph = h + 2 * p;
  const padded = Buffer.alloc(pw * ph * ch);
  for (let y = 0; y < ph; y++) {
    const sy = (((y - p) % h) + h) % h;
    for (let x = 0; x < pw; x++) {
      const sx = (((x - p) % w) + w) % w;
      const si = (sy * w + sx) * ch, di = (y * pw + x) * ch;
      for (let c = 0; c < ch; c++) padded[di + c] = data[si + c];
    }
  }
  const s = target / w;
  const ntw = Math.round(pw * s), nth = Math.round(ph * s);
  const resized = await sharp(padded, { raw: { width: pw, height: ph, channels: ch } })
    .resize(ntw, nth, { fit: "fill" }).raw().toBuffer();
  const cx = Math.round(p * s), cy = Math.round(p * s);
  const out = Buffer.alloc(target * target * ch);
  for (let y = 0; y < target; y++) {
    const sy = y + cy;
    for (let x = 0; x < target; x++) {
      const si = ((sy) * ntw + (x + cx)) * ch, di = (y * target + x) * ch;
      for (let c = 0; c < ch; c++) out[di + c] = resized[si + c];
    }
  }
  return sharp(out, { raw: { width: target, height: target, channels: ch } }).png().toBuffer();
}

export async function buildUEMaps(maps: RawMaps, opts: BuildOptions): Promise<UEMaps> {
  const R = opts.resolution;
  if (!maps.basecolor) throw new Error("PATINA returned no base color map");

  // 1. Height (raw) — needed for detail normal, AO, cavity grime.
  const heightSmooth = opts.smoothHeight || (opts.enhance ? 0.6 : 0);
  const heightGray = maps.height
    ? await grayRawAt(maps.height, R, heightSmooth)
    : Buffer.alloc(R * R).fill(128);

  // 2. Imperfection noise field (tileable).
  const noise = opts.enhance ? tileableNoise(R, hashStr(opts.material || "texture")) : null;

  // 3. Base Color — unsharp + saturation, then procedural grime/tonal variation.
  let bcPipe = sharp(maps.basecolor).resize(R, R, { fit: "fill" });
  if (opts.enhance) bcPipe = bcPipe.sharpen({ sigma: 1.1 }).modulate({ saturation: 1.06 });
  const bc = await bcPipe.removeAlpha().raw().toBuffer();
  if (opts.enhance && noise) {
    for (let i = 0; i < R * R; i++) {
      const cavity = 1 - heightGray[i] / 255;
      const n = noise[i];
      const f = (0.92 + 0.16 * n) * (1 - 0.18 * cavity * n); // tonal variation * crevice grime
      bc[i * 3] = clamp255(bc[i * 3] * f);
      bc[i * 3 + 1] = clamp255(bc[i * 3 + 1] * f);
      bc[i * 3 + 2] = clamp255(bc[i * 3 + 2] * f);
    }
  }
  const bcImg = sharp(bc, { raw: { width: R, height: R, channels: 3 } });
  const baseColorExt: "png" | "jpg" = opts.compress ? "jpg" : "png";
  const baseColor = opts.compress
    ? await bcImg.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    : await bcImg.png().toBuffer();

  // 4. Height PNG — try 16-bit, fall back to 8-bit.
  let height: Buffer;
  let height16 = true;
  try {
    height = encodeHeight16(heightGray, R, opts.compress);
  } catch {
    height16 = false;
    height = await sharp(heightGray, { raw: { width: R, height: R, channels: 1 } })
      .png(opts.compress ? { compressionLevel: 9 } : {})
      .toBuffer();
  }

  // 5. Normal — to GL, blend detail from height, then -> DX.
  let glNormal: Buffer;
  if (maps.normal) {
    const baseN = await sharp(maps.normal).removeAlpha().resize(R, R, { fit: "fill" }).raw().toBuffer();
    glNormal = opts.normalConvention === "gl" ? baseN : flipGreenCopy(baseN, R);
  } else {
    glNormal = flatNormalGL(R);
  }
  if (opts.enhance && maps.height) {
    glNormal = blendNormalsGL(glNormal, detailNormalFromHeight(heightGray, R, 1.5), R);
  }
  const normal = await sharp(flipGreenCopy(glNormal, R), { raw: { width: R, height: R, channels: 3 } })
    .png(opts.compress ? { compressionLevel: 9 } : {})
    .toBuffer();

  // 6. AO.
  const ao = maps.height ? await aoFromHeightRaw(heightGray, R, opts.aoStrength) : Buffer.alloc(R * R).fill(255);

  // 7. ORM pack with roughness contrast + imperfection break-up.
  const rough = maps.roughness ? await grayRawAt(maps.roughness, R) : Buffer.alloc(R * R).fill(128);
  const metal = maps.metalness ? await grayRawAt(maps.metalness, R) : Buffer.alloc(R * R).fill(0);
  if (opts.clampMetallic && isDielectric(opts.material)) {
    for (let i = 0; i < metal.length; i++) if (metal[i] < 60) metal[i] = 0;
  }
  const orm = Buffer.alloc(R * R * 3);
  for (let i = 0; i < R * R; i++) {
    let r = rough[i];
    if (opts.enhance) {
      let v = (r / 255 - 0.5) * 1.25 + 0.5; // contrast
      if (noise) v += (noise[i] - 0.5) * 0.14 + (1 - heightGray[i] / 255) * 0.08; // break-up + cavity rougher
      r = clamp255(clamp01(v) * 255);
    }
    orm[i * 3] = ao[i];
    orm[i * 3 + 1] = r;
    orm[i * 3 + 2] = metal[i];
  }
  const ormPng = await sharp(orm, { raw: { width: R, height: R, channels: 3 } })
    .png(opts.compress ? { compressionLevel: 9 } : {})
    .toBuffer();

  return { baseColor, normal, orm: ormPng, height, height16, baseColorExt };
}
