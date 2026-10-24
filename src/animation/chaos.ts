import type { SnowflakeParams } from '../seed/params';
import { kochRatioCap } from '../seed/params';

/**
 * The road to chaos.
 *
 * Once a crystal has grown, two things are pushed together:
 * - recursion deepens, so the number of corners keeps multiplying;
 * - the Koch bump turns spikier (smaller apex angle, wider base), so its
 *   flank grows from the tidy ≤ 0.36 of a segment towards 0.9 — far past the
 *   point where the curve starts folding over itself into a dense tangle.
 * D6 symmetry is kept throughout: the chaos is ordered chaos.
 */
export const CHAOS_ANGLE = 28;
/** Flank length (fraction of the segment) at full chaos; must stay < 1 for the curve to converge. */
export const CHAOS_FLANK = 0.9;
/** Extra recursion levels reached at full chaos. */
export const CHAOS_EXTRA_DEPTH = 2;

/** Bump ratio at full chaos: the widest base whose flank is CHAOS_FLANK at CHAOS_ANGLE. */
export const CHAOS_RATIO = kochRatioCap(CHAOS_ANGLE, CHAOS_FLANK);

/** Flank length of a Koch bump, as a fraction of its segment. */
export function kochFlank(ratio: number, apexAngleDeg: number): number {
  return ratio / 2 / Math.sin((apexAngleDeg * Math.PI) / 360);
}

/** `p` pushed towards chaos by c ∈ [0, 1] (c = 0 returns the crystal unchanged). */
export function chaosParams(p: SnowflakeParams, c: number): SnowflakeParams {
  if (c <= 0) return p;
  const k = Math.min(1, c);
  return {
    ...p,
    kochAngle: p.kochAngle + (CHAOS_ANGLE - p.kochAngle) * k,
    kochRatio: p.kochRatio + (CHAOS_RATIO - p.kochRatio) * k,
  };
}
