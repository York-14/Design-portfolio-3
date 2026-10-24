/**
 * Minimal 2D geometry on flat coordinate arrays.
 *
 * Polylines and polygons are stored as `[x0, y0, x1, y1, …]` so that the hot
 * recursive generators can push numbers without allocating point objects.
 */

export type Flat = number[];

/** A 2×2 linear map [a b; c d]. Every element of D6 fixes the origin, so no translation. */
export interface Mat2 {
  a: number;
  b: number;
  c: number;
  d: number;
}

export const IDENTITY: Mat2 = { a: 1, b: 0, c: 0, d: 1 };

/** Mirror across the x-axis (the centre line of the main branch). */
export const MIRROR_X: Mat2 = { a: 1, b: 0, c: 0, d: -1 };

export function rotation(rad: number): Mat2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { a: c, b: -s, c: s, d: c };
}

export function compose(m: Mat2, n: Mat2): Mat2 {
  return {
    a: m.a * n.a + m.b * n.c,
    b: m.a * n.b + m.b * n.d,
    c: m.c * n.a + m.d * n.c,
    d: m.c * n.b + m.d * n.d,
  };
}

/** Inverse of an orthogonal map (rotations and reflections): its transpose. */
export function transposeInverse(m: Mat2): Mat2 {
  return { a: m.a, b: m.c, c: m.b, d: m.d };
}

export function applyX(m: Mat2, x: number, y: number): number {
  return m.a * x + m.b * y;
}

export function applyY(m: Mat2, x: number, y: number): number {
  return m.c * x + m.d * y;
}

export function mapFlat(m: Mat2, src: Flat): Flat {
  const out = new Array<number>(src.length);
  for (let i = 0; i < src.length; i += 2) {
    const x = src[i]!;
    const y = src[i + 1]!;
    out[i] = m.a * x + m.b * y;
    out[i + 1] = m.c * x + m.d * y;
  }
  return out;
}

/** Reverse the point order of a flat array. */
export function reversePoints(src: Flat): Flat {
  const out = new Array<number>(src.length);
  const n = src.length / 2;
  for (let i = 0; i < n; i++) {
    out[2 * i] = src[2 * (n - 1 - i)]!;
    out[2 * i + 1] = src[2 * (n - 1 - i) + 1]!;
  }
  return out;
}

/** Shoelace signed area (positive for counter-clockwise in a y-up frame). */
export function signedArea(poly: Flat): number {
  let sum = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += poly[2 * i]! * poly[2 * j + 1]! - poly[2 * j]! * poly[2 * i + 1]!;
  }
  return sum / 2;
}

/** Append `src` to `dst`, skipping its first point if it coincides with dst's last point. */
export function appendJoined(dst: Flat, src: Flat, eps = 1e-12): void {
  let start = 0;
  if (dst.length >= 2 && src.length >= 2) {
    const dx = dst[dst.length - 2]! - src[0]!;
    const dy = dst[dst.length - 1]! - src[1]!;
    if (dx * dx + dy * dy <= eps * eps) start = 2;
  }
  for (let i = start; i < src.length; i++) dst.push(src[i]!);
}

/**
 * The part of the screen that matters for generation, in world units.
 * Geometry whose bound lies outside the circle is not refined, and segments
 * shorter than `lod` are not subdivided further.
 */
export interface ViewCircle {
  x: number;
  y: number;
  r: number;
  lod: number;
}

export function mapView(m: Mat2, view: ViewCircle): ViewCircle {
  return { x: applyX(m, view.x, view.y), y: applyY(m, view.x, view.y), r: view.r, lod: view.lod };
}
