/**
 * Golden-ratio low-discrepancy sequences.
 *
 * Everything here is a pure function of an integer index `n`; no pseudo-random
 * generator is involved. Successive indices fill the target space evenly
 * because the golden ratio is the "most irrational" number (its continued
 * fraction is all ones), so its multiples modulo 1 never cluster.
 */

/** φ = (1 + √5) / 2 */
export const PHI = (1 + Math.sqrt(5)) / 2;

/** Golden angle as a fraction of a full turn: 1 − 1/φ ≈ 0.381966 */
export const GOLDEN_ANGLE_TURNS = 1 - 1 / PHI;

/** Golden angle in degrees: 360° · (1 − 1/φ) ≈ 137.5077° */
export const GOLDEN_ANGLE_DEG = 360 * GOLDEN_ANGLE_TURNS;

/** Fractional part, always in [0, 1) (also for negative inputs). */
export function frac(x: number): number {
  const f = x - Math.floor(x);
  // Guard against `1 - ε` rounding up to exactly 1.
  return f >= 1 ? 0 : f;
}

/**
 * n·α mod 1, computed without building the full product.
 *
 * Splitting n into high and low parts keeps the product's magnitude small, so
 * the fractional part keeps its precision for large seeds.
 */
export function fracMul(n: number, alpha: number): number {
  if (!Number.isSafeInteger(n)) throw new RangeError(`seed must be a safe integer, got ${n}`);
  const SPLIT = 65536;
  const hi = Math.floor(n / SPLIT);
  const lo = n - hi * SPLIT;
  return frac(frac(hi * frac(SPLIT * alpha)) + frac(lo * alpha));
}

export interface VogelPoint {
  /** Angle in degrees, [0, 360) */
  theta: number;
  /** Radius, [0, 1) */
  r: number;
}

/**
 * Vogel's sunflower spiral: θ_n = n·GA mod 360°, r_n = √(n / N).
 *
 * The index wraps every `period` steps so that r stays in [0, 1); within one
 * period the points cover the unit disk with (nearly) uniform area density.
 */
export function vogel(n: number, period = 1024): VogelPoint {
  const theta = 360 * fracMul(n, GOLDEN_ANGLE_TURNS);
  const k = ((n % period) + period) % period;
  return { theta, r: Math.sqrt(k / period) };
}

/**
 * The generalised golden ratio g_d: the unique positive real root of
 * x^(d+1) = x + 1 (g_1 = φ, g_2 ≈ 1.3247 is the plastic number).
 */
export function generalizedGoldenRatio(d: number): number {
  if (!Number.isInteger(d) || d < 1) throw new RangeError(`dimension must be ≥ 1, got ${d}`);
  // Newton's method on f(x) = x^(d+1) − x − 1, starting right of the root.
  let x = 2;
  for (let i = 0; i < 64; i++) {
    const fx = x ** (d + 1) - x - 1;
    const dfx = (d + 1) * x ** d - 1;
    const next = x - fx / dfx;
    if (Math.abs(next - x) < 1e-15) return next;
    x = next;
  }
  return x;
}

/** α_k = 1 / g^k for k = 1..d (Roberts' R_d sequence). */
export function rdAlphas(d: number): number[] {
  const g = generalizedGoldenRatio(d);
  return Array.from({ length: d }, (_, i) => frac(1 / g ** (i + 1)));
}

/** u_k(n) = frac(0.5 + n·α_k): the n-th point of the R_d sequence in [0, 1)^d. */
export function rdPoint(n: number, alphas: readonly number[]): number[] {
  return alphas.map((a) => frac(0.5 + fracMul(n, a)));
}
