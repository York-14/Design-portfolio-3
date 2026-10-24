import type { SnowflakeParams } from '../seed/params';
import type { SectorTemplate } from '../fractal/sector';
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
  // The last Koch sub-segment into the tip has length (1 − m)/2 of the tip segment.
  const rho = 0.45 * ((1 - tpl.koch.ratio) / 2) * tpl.tipSegmentLength;
  return {
    x: tpl.tip.x,
    y: tpl.tip.y,
    scale: tpl.koch.scale,
    rho,
    z0: viewRadius / rho,
    kind: 'koch',
  };
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
