import type { Flat, ViewCircle } from './geometry';

/**
 * Generalised Koch curve.
 *
 * Each segment A→B is replaced by four: the outer pieces keep (1 − m)/2 of
 * the length each, and the middle m is raised into an isosceles bump with the
 * given apex angle. m = 1/3 with a 60° apex is the classic Koch curve.
 */
export interface KochTemplate {
  ratio: number;
  /** Bump height as a fraction of the segment length. */
  height: number;
  /** Radius (per unit segment length) of a disk around the midpoint that contains the whole curve. */
  bound: number;
  /** Self-similarity factor at either endpoint: 2 / (1 − m). */
  scale: number;
}

export function kochTemplate(ratio: number, apexAngleDeg: number): KochTemplate {
  const half = ratio / 2;
  const height = half / Math.tan((apexAngleDeg * Math.PI) / 360);

  // Child segments of the unit segment (0,0)→(1,0). The curve lies inside the
  // disk of radius R·len around the midpoint iff every child's disk does:
  // d_i + R·l_i ≤ R  ⇒  R = max(1/2, max_i d_i / (1 − l_i)).
  const pts = [0, 0, 0.5 - half, 0, 0.5, height, 0.5 + half, 0, 1, 0];
  let bound = 0.5;
  for (let i = 0; i < 4; i++) {
    const ax = pts[2 * i]!;
    const ay = pts[2 * i + 1]!;
    const bx = pts[2 * i + 2]!;
    const by = pts[2 * i + 3]!;
    const len = Math.hypot(bx - ax, by - ay);
    const dist = Math.hypot((ax + bx) / 2 - 0.5, (ay + by) / 2);
    if (len >= 1) throw new RangeError('Koch template does not contract');
    bound = Math.max(bound, dist / (1 - len));
  }

  return { ratio, height, bound, scale: 2 / (1 - ratio) };
}

/**
 * Append the Koch curve over A→B to `out`, excluding A and including B.
 *
 * `depth` may be fractional: ⌊depth⌋ levels are fully raised and the next
 * level's bumps are raised by frac(depth). `side` = +1 puts bumps on the left
 * of A→B, −1 on the right.
 */
export function kochSegment(
  out: Flat,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  depth: number,
  side: number,
  tpl: KochTemplate,
  view?: ViewCircle,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  if (depth <= 0) {
    out.push(bx, by);
    return;
  }
  if (view) {
    const len2 = dx * dx + dy * dy;
    if (len2 < view.lod * view.lod) {
      out.push(bx, by);
      return;
    }
    const mx = ax + dx / 2 - view.x;
    const my = ay + dy / 2 - view.y;
    const reach = view.r + tpl.bound * Math.sqrt(len2);
    if (mx * mx + my * my > reach * reach) {
      out.push(bx, by);
      return;
    }
  }

  const amount = Math.min(1, depth);
  const t1 = (1 - tpl.ratio) / 2;
  const t3 = (1 + tpl.ratio) / 2;
  const h = tpl.height * amount * side;
  const q1x = ax + dx * t1;
  const q1y = ay + dy * t1;
  const q3x = ax + dx * t3;
  const q3y = ay + dy * t3;
  // Left normal of (dx, dy) is (−dy, dx).
  const px = ax + dx / 2 - dy * h;
  const py = ay + dy / 2 + dx * h;
  const next = depth - 1;
  kochSegment(out, ax, ay, q1x, q1y, next, side, tpl, view);
  kochSegment(out, q1x, q1y, px, py, next, side, tpl, view);
  kochSegment(out, px, py, q3x, q3y, next, side, tpl, view);
  kochSegment(out, q3x, q3y, bx, by, next, side, tpl, view);
}

/**
 * Apply the Koch construction to the flagged segments of an open polyline.
 * The result starts with the polyline's first point.
 */
export function kochPolyline(
  points: Flat,
  kochFlags: readonly boolean[],
  depth: number,
  side: number,
  tpl: KochTemplate,
  view?: ViewCircle,
): Flat {
  const out: Flat = [points[0]!, points[1]!];
  for (let i = 0; i + 3 < points.length; i += 2) {
    const ax = points[i]!;
    const ay = points[i + 1]!;
    const bx = points[i + 2]!;
    const by = points[i + 3]!;
    if (kochFlags[i / 2]) kochSegment(out, ax, ay, bx, by, depth, side, tpl, view);
    else out.push(bx, by);
  }
  return out;
}
