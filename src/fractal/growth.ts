import type { Flat } from './geometry';

/**
 * Crystal growth: how a snowflake comes into being (and melts away).
 *
 * growth ∈ [0, 1] runs through two stages:
 *  1. nucleus (0 → NUCLEUS_END): a point-like circle swells and its outline
 *     sharpens into the central hexagon — 0 corners, then 6;
 *  2. arms (NUCLEUS_END → 1): the branches sprout from the hexagon's edge
 *     midpoints and grow to full size while the Koch / Sierpiński recursion
 *     deepens, so corners keep multiplying as the crystal spreads.
 * Long, bare, straight arms never appear.
 */
export const NUCLEUS_END = 0.25;

/** Radius of the initial dot, in world units (the snowflake spans ≈ 1). */
export const DOT_RADIUS = 0.018;

const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const smoothstep = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/** Progress through the nucleus stage, [0, 1]. */
export function nucleusProgress(growth: number): number {
  return clamp01(growth / NUCLEUS_END);
}

/** Progress through the arm stage, [0, 1]; 0 until the hexagon is complete. */
export function armProgress(growth: number): number {
  return clamp01((growth - NUCLEUS_END) / (1 - NUCLEUS_END));
}

/** Angular step of the nucleus outline; divides 30° so the hexagon's corners are sampled exactly. */
const STEP_DEG = 2.5;
const COS30 = Math.cos(Math.PI / 6);

/**
 * The nucleus outline at stage progress t ∈ [0, 1]: a circle of radius
 * DOT_RADIUS at t = 0, the central hexagon (circumradius `hexRadius`,
 * vertices at 30° + k·60°) at t = 1. In between, the radius swells while the
 * outline is blended from round to hexagonal, so the six corners emerge.
 */
export function nucleusPolygon(hexRadius: number, t: number): Flat {
  const grow = 1 - (1 - clamp01(t)) ** 3;
  const R = DOT_RADIUS + (hexRadius - DOT_RADIUS) * grow;
  const sharp = smoothstep(0.3, 1, t);
  const circle = R * ((1 + COS30) / 2);
  const out: Flat = [];
  for (let deg = 0; deg < 360; deg += STEP_DEG) {
    // Angle to the nearest edge normal (edge midpoints sit at k·60°).
    const off = ((((deg + 30) % 60) + 60) % 60) - 30;
    const hex = (R * COS30) / Math.cos((off * Math.PI) / 180);
    const r = circle + (hex - circle) * sharp;
    const rad = (deg * Math.PI) / 180;
    out.push(r * Math.cos(rad), r * Math.sin(rad));
  }
  return out;
}
