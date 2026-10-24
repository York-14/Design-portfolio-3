import { rdAlphas, rdPoint, vogel } from './golden';
import {
  HUE_RANGE,
  RD_PARAM_KEYS,
  kochRatioCap,
  RD_PARAM_SPECS,
  SATURATION_RANGE,
  mapContinuous,
  mapEnum,
  mapInteger,
  type ParamSpec,
  type SnowflakeParams,
} from './params';

/**
 * Dimension of the R_d sequence.
 *
 * We need one axis per R_d-driven parameter (18), but for d = 18 the axis
 * α_7 = 1/g^7 ≈ 0.76925 sits within 2·10⁻⁵ of 10/13, so that parameter would
 * repeat with period 13 instead of spreading out. d = 19 is the smallest
 * dimension ≥ 18 in which every used α_k stays far from small-denominator
 * rationals (verified in tests); its last axis is simply left unused.
 */
export const RD_DIMENSION = 19;

/** Vogel spiral period: the colour wheel is swept once every N seeds. */
export const VOGEL_PERIOD = 1024;

/** The α_k actually used, one per R_d-driven parameter. */
export const ALPHAS = rdAlphas(RD_DIMENSION).slice(0, RD_PARAM_KEYS.length);

/** The raw unit coordinates u_k(n) ∈ [0, 1)^d behind a seed. */
export function seedToUnit(n: number): number[] {
  return rdPoint(n, ALPHAS);
}

function mapSpec(u: number, spec: ParamSpec): number | string {
  switch (spec.kind) {
    case 'continuous':
      return mapContinuous(u, spec);
    case 'integer':
      return mapInteger(u, spec);
    case 'enum':
      return mapEnum(u, spec);
  }
}

/**
 * Deterministically map an integer seed to a snowflake.
 *
 * - Structural parameters: the n-th point of the R_d sequence, one axis each.
 * - Hue / saturation: the n-th point of the Vogel spiral read as a colour
 *   wheel (angle → hue, radius → saturation).
 *
 * Pure: the same n always yields the same object, and consecutive n explore
 * the parameter space evenly.
 */
export function seedToParams(n: number): SnowflakeParams {
  const u = seedToUnit(n);
  const mapped: Record<string, number | string> = {};
  RD_PARAM_KEYS.forEach((key, k) => {
    mapped[key] = mapSpec(u[k] as number, RD_PARAM_SPECS[key]);
  });

  // The bump ratio's upper bound depends on the apex angle: map u onto the
  // allowed interval rather than clamping, so its distribution stays even.
  const ratio = RD_PARAM_SPECS.kochRatio;
  const kRatio = RD_PARAM_KEYS.indexOf('kochRatio');
  const maxRatio = Math.min(ratio.max, kochRatioCap(mapped.kochAngle as number));
  mapped.kochRatio = ratio.min + (u[kRatio] as number) * (maxRatio - ratio.min);

  const { theta, r } = vogel(n, VOGEL_PERIOD);

  return {
    ...(mapped as Omit<SnowflakeParams, 'seed' | 'hue' | 'saturation'>),
    seed: n,
    hue: HUE_RANGE.min + (theta / 360) * (HUE_RANGE.max - HUE_RANGE.min),
    saturation: SATURATION_RANGE.min + r * (SATURATION_RANGE.max - SATURATION_RANGE.min),
  };
}
