import type { SnowflakeParams } from '../seed/params';
import { RD_PARAM_KEYS, RD_PARAM_SPECS } from '../seed/params';
import { armProgress } from '../fractal/growth';
import type { Depths } from '../fractal/snowflake';
import type { TransitionMode } from './config';

export interface Layer {
  params: SnowflakeParams;
  depths: Depths;
  /** Crystal growth in [0, 1]; see fractal/growth.ts. */
  growth: number;
  alpha: number;
  /** Extra blur in CSS pixels (used while dissolving). */
  blur?: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Shortest-arc hue interpolation in degrees. */
export function lerpHue(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + d * t) % 360) + 360) % 360;
}

/**
 * Interpolate the continuous parameters of `a` towards `b`; discrete ones
 * (depths, counts, patterns) are kept from `a`.
 */
export function lerpParams(a: SnowflakeParams, b: SnowflakeParams, t: number): SnowflakeParams {
  const out: SnowflakeParams = { ...a };
  const rec = out as unknown as Record<string, unknown>;
  for (const key of RD_PARAM_KEYS) {
    if (RD_PARAM_SPECS[key].kind === 'continuous') {
      rec[key] = lerp(a[key] as number, b[key] as number, t);
    }
  }
  out.saturation = lerp(a.saturation, b.saturation, t);
  out.hue = lerpHue(a.hue, b.hue, t);
  return out;
}

/** Do a and b differ in a discrete parameter that changes geometry at this depth and growth? */
export function discreteDiffers(
  a: SnowflakeParams,
  b: SnowflakeParams,
  depths: Depths,
  growth = 1,
): boolean {
  // Before the arms sprout, every crystal is a dot or a hexagon.
  if (armProgress(growth) <= 0) return false;
  if (a.sideCount !== b.sideCount) return true;
  if (depths.sierpinski > 0 && a.sierpinskiPattern !== b.sierpinskiPattern) return true;
  return false;
}

/**
 * The layers to draw at progress t ∈ [0, 1] of a transition a → b.
 *
 * - crossfade: two fixed crystals, opacity swaps
 * - morph: one crystal whose continuous parameters glide; discrete ones snap at t = ½
 * - hybrid: morph the continuous parameters, and only where a discrete
 *   parameter differs, cross-fade between the two (both still morphing)
 */
export function transitionLayers(
  a: SnowflakeParams,
  b: SnowflakeParams,
  t: number,
  mode: TransitionMode,
  depths: Depths,
  alpha = 1,
  growth = 1,
): Layer[] {
  switch (mode) {
    case 'crossfade':
      return [
        { params: a, depths, growth, alpha: alpha * (1 - t) },
        { params: b, depths, growth, alpha: alpha * t },
      ];
    case 'morph': {
      const params = t < 0.5 ? lerpParams(a, b, t) : lerpParams(b, a, 1 - t);
      return [{ params, depths, growth, alpha }];
    }
    case 'hybrid':
      if (!discreteDiffers(a, b, depths, growth)) {
        return [{ params: lerpParams(a, b, t), depths, growth, alpha }];
      }
      return [
        { params: lerpParams(a, b, t), depths, growth, alpha: alpha * (1 - t) },
        { params: lerpParams(b, a, 1 - t), depths, growth, alpha: alpha * t },
      ];
  }
}
