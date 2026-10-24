import type { Flat, ViewCircle } from './geometry';

/** Self-similarity factor of the Sierpiński gasket at any of its corners. */
export const SIERPINSKI_SCALE = 2;

/**
 * Collect the holes of a Sierpiński gasket on triangle abc.
 *
 * Each level removes the medial triangle and recurses into the three corner
 * triangles. As with the Koch curve, a fractional `depth` opens the deepest
 * level's holes by frac(depth) (scaled about their centroid).
 */
export function gasketHoles(
  out: Flat[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  depth: number,
  view?: ViewCircle,
): void {
  if (depth <= 0) return;
  const gx = (ax + bx + cx) / 3;
  const gy = (ay + by + cy) / 3;
  if (view) {
    const r = Math.sqrt(
      Math.max(
        (ax - gx) ** 2 + (ay - gy) ** 2,
        (bx - gx) ** 2 + (by - gy) ** 2,
        (cx - gx) ** 2 + (cy - gy) ** 2,
      ),
    );
    // A hole half the size of the triangle smaller than the LOD is invisible.
    if (r < view.lod) return;
    const ox = gx - view.x;
    const oy = gy - view.y;
    if (ox * ox + oy * oy > (view.r + r) ** 2) return;
  }

  const abx = (ax + bx) / 2;
  const aby = (ay + by) / 2;
  const bcx = (bx + cx) / 2;
  const bcy = (by + cy) / 2;
  const cax = (cx + ax) / 2;
  const cay = (cy + ay) / 2;

  const k = Math.min(1, depth);
  out.push([
    gx + (abx - gx) * k,
    gy + (aby - gy) * k,
    gx + (bcx - gx) * k,
    gy + (bcy - gy) * k,
    gx + (cax - gx) * k,
    gy + (cay - gy) * k,
  ]);

  const next = depth - 1;
  gasketHoles(out, ax, ay, abx, aby, cax, cay, next, view);
  gasketHoles(out, abx, aby, bx, by, bcx, bcy, next, view);
  gasketHoles(out, cax, cay, bcx, bcy, cx, cy, next, view);
}
