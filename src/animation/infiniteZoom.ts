import type { SnowflakeParams } from '../seed/params';
import type { Flat } from '../fractal/geometry';
import { kochSegment } from '../fractal/koch';
import type { KochPath, SectorTemplate } from '../fractal/sector';
import { SIERPINSKI_SCALE } from '../fractal/sierpinski';

/**
 * Infinite zoom by renormalisation.
 *
 * Near a self-similar fixed point P with ratio s, the depth-(d+1) fractal seen
 * at zoom s·z is identical to the depth-d fractal seen at zoom z. So if depth
 * grows with zoom as d(z) = d₀ + log_s z, the frame at zoom z₀·s equals the
 * frame at z₀: we can wrap the zoom back by 1/s (and the depth by −1) without
 * any visible seam, forever, at constant cost.
 *
 * The seam is exact only while the whole screen stays inside P's
 * self-similar neighbourhood (radius ρ), which is what z₀ guarantees.
 */
export interface ZoomPlan {
  /** Fixed point the camera dives into. */
  x: number;
  y: number;
  /** Self-similarity ratio at that point (Koch 2/(1−m), = 3 classically; Sierpiński 2). */
  scale: number;
  /** Radius of the self-similar neighbourhood in world units. */
  rho: number;
  /** Zoom at which the screen fits inside the neighbourhood; the loop runs over [z₀, z₀·s). */
  z0: number;
  kind: 'koch' | 'sierpinski';
}

/**
 * @param viewRadius World-space radius of the screen's circumcircle at zoom 1.
 */
export function planZoom(
  params: SnowflakeParams,
  tpl: SectorTemplate,
  viewRadius: number,
): ZoomPlan {
  if (params.zoomTarget === 'center' && tpl.hexGasket) {
    // Six gasket triangles meet at the origin; their half-size corner copies
    // tile a hexagon of inradius (c/2)·cos 30° ≈ 0.433c around it.
    const rho = 0.4 * params.hexRadius;
    return { x: 0, y: 0, scale: SIERPINSKI_SCALE, rho, z0: viewRadius / rho, kind: 'sierpinski' };
  }
  const rho = kochTipRadius(tpl);
  return {
    x: tpl.tip.x,
    y: tpl.tip.y,
    scale: tpl.koch.scale,
    rho,
    z0: viewRadius / rho,
    kind: 'koch',
  };
}

/** Depth used to approximate the limit curve when measuring clearances. */
const PROBE_DEPTH = 6;

/**
 * Radius around the main-branch tip T inside which the snowflake is exactly
 * self-similar.
 *
 * Near T only the last Koch child of the tip segment (and its mirror image)
 * may appear: that child *is* the whole curve scaled by 1/s. So ρ is the
 * clearance between T and everything else — the tip segment's other three
 * children (measured on the curve itself; spiky templates can fold back
 * towards T) and every other segment of the sector (measured on its
 * bounding disk).
 */
export function kochTipRadius(tpl: SectorTemplate): number {
  const { koch, tip } = tpl;
  const pts = tpl.mainHalf.points;
  const n = pts.length / 2;
  const cx = pts[2 * (n - 2)]!;
  const cy = pts[2 * (n - 2) + 1]!;
  const dx = tip.x - cx;
  const dy = tip.y - cy;

  // Tip segment C→T: its first three children, with bumps on the left (+1).
  const t1 = (1 - koch.ratio) / 2;
  const t3 = (1 + koch.ratio) / 2;
  const h = koch.height;
  const q1x = cx + dx * t1;
  const q1y = cy + dy * t1;
  const px = cx + dx / 2 - dy * h;
  const py = cy + dy / 2 + dx * h;
  const q3x = cx + dx * t3;
  const q3y = cy + dy * t3;
  const others: Flat = [cx, cy];
  kochSegment(others, cx, cy, q1x, q1y, PROBE_DEPTH, 1, koch);
  kochSegment(others, q1x, q1y, px, py, PROBE_DEPTH, 1, koch);
  kochSegment(others, px, py, q3x, q3y, PROBE_DEPTH, 1, koch);
  let clearance = Infinity;
  for (let i = 0; i < others.length; i += 2) {
    clearance = Math.min(clearance, Math.hypot(others[i]! - tip.x, others[i + 1]! - tip.y));
  }

  // Everything else in the sector, via conservative disks. Mirror images of
  // these are equally far, since T lies on the mirror axis.
  const segmentClearance = (path: KochPath, skipLast: boolean) => {
    const p = path.points;
    const count = p.length / 2 - 1 - (skipLast ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const ax = p[2 * i]!;
      const ay = p[2 * i + 1]!;
      const bx = p[2 * i + 2]!;
      const by = p[2 * i + 3]!;
      const len = Math.hypot(bx - ax, by - ay);
      const r = path.koch[i] ? koch.bound * len : len / 2;
      const d = Math.hypot((ax + bx) / 2 - tip.x, (ay + by) / 2 - tip.y) - r;
      clearance = Math.min(clearance, d);
    }
  };
  segmentClearance(tpl.mainHalf, true);
  for (const side of tpl.sides) segmentClearance(side, false);

  // Margin for the depth-6 approximation of the limit curve; never collapse to zero.
  return Math.max(1e-3 * tpl.tipSegmentLength, 0.85 * clearance);
}

/** Renormalised zoom after `u` self-similarity periods: z₀·s^frac(u). */
export function loopZoom(plan: ZoomPlan, u: number): number {
  return plan.z0 * plan.scale ** (u - Math.floor(u));
}

/** Depth that keeps on-screen detail constant: d₀ + log_s(zoom). */
export function depthForZoom(baseDepth: number, zoom: number, scale: number): number {
  return baseDepth + Math.log(Math.max(1, zoom)) / Math.log(scale);
}

/**
 * Camera centre while zooming from the overview (zoom 1, centre 0) to the
 * fixed point (zoom z₀, centre P) with eased progress e ∈ [0, 1].
 *
 * Zoom is interpolated geometrically, and P's on-screen offset shrinks
 * linearly, so the target never leaves the screen.
 */
export function zoomPath(plan: ZoomPlan, e: number): { cx: number; cy: number; zoom: number } {
  const zoom = plan.z0 ** e;
  const k = (1 - e) / zoom;
  return { cx: plan.x - plan.x * k, cy: plan.y - plan.y * k, zoom };
}
