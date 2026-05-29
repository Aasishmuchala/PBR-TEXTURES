// Client-safe (no fal SDK import). fal's PATINA price:
// $0.01 base + $0.02/MP + $0.01/MP/map, billed on output megapixels.
export function estimateCost(resolution: number, nMaps = 5): number {
  const mp = (resolution * resolution) / 1_000_000;
  return Math.round((0.01 + 0.02 * mp + 0.01 * mp * nMaps) * 100) / 100;
}
