/**
 * The parameter space of a snowflake and how each unit coordinate u ∈ [0, 1)
 * maps into it.
 */

export const SIERPINSKI_PATTERNS = ['none', 'hexagon', 'branch', 'both'] as const;
export type SierpinskiPattern = (typeof SIERPINSKI_PATTERNS)[number];

export const ZOOM_TARGETS = ['tip', 'center'] as const;
export type ZoomTarget = (typeof ZOOM_TARGETS)[number];

export interface SnowflakeParams {
  seed: number;

  /** Koch recursion depth reached at the end of the generation phase. */
  kochDepth: number;
  /** Apex angle of the Koch bump in degrees (60° is the classic curve). */
  kochAngle: number;
  /**
   * Fraction of a segment replaced by the bump's base (1/3 is classic).
   * Capped by {@link kochRatioCap} so spiky bumps do not fold over each other.
   */
  kochRatio: number;
  /** Koch base-segment length in units of the main branch width. */
  kochGrain: number;

  sierpinskiDepth: number;
  sierpinskiPattern: SierpinskiPattern;

  /** Main branch length relative to the unit radius. */
  mainLength: number;
  /** Main branch half-width. */
  mainWidth: number;
  /** Length of the pointed tip relative to the main branch length. */
  tipLength: number;
  /** Circumradius of the central hexagon. */
  hexRadius: number;

  sideCount: number;
  /** Angle between side branches and the main branch, degrees. */
  sideAngle: number;
  /** Position of the first side branch along the main branch, 0..1. */
  sideStart: number;
  /** Fraction of the main branch spanned by the side branches. */
  sideSpread: number;
  /** Length of the first (longest) side branch relative to the main branch. */
  sideLength: number;

  /** Stroke width in CSS pixels. */
  lineWidth: number;

  hue: number;
  saturation: number;
  lightness: number;

  zoomTarget: ZoomTarget;
}

export interface ContinuousSpec {
  kind: 'continuous';
  min: number;
  max: number;
}

export interface IntegerSpec {
  kind: 'integer';
  min: number;
  max: number;
}

export interface EnumSpec<T extends string = string> {
  kind: 'enum';
  values: readonly T[];
}

export type ParamSpec = ContinuousSpec | IntegerSpec | EnumSpec;

const cont = (min: number, max: number): ContinuousSpec => ({ kind: 'continuous', min, max });
const int = (min: number, max: number): IntegerSpec => ({ kind: 'integer', min, max });

/**
 * Parameters driven by the R_d sequence, in the order of their dimension k.
 * Hue and saturation are not listed: they come from the Vogel spiral.
 */
export const RD_PARAM_SPECS = {
  kochDepth: int(2, 4),
  kochAngle: cont(30, 90),
  kochRatio: cont(0.12, 0.42),
  kochGrain: cont(1.0, 2.4),
  sierpinskiDepth: int(2, 5),
  sierpinskiPattern: { kind: 'enum', values: SIERPINSKI_PATTERNS },
  mainLength: cont(0.78, 0.98),
  mainWidth: cont(0.035, 0.07),
  tipLength: cont(0.06, 0.16),
  hexRadius: cont(0.14, 0.26),
  sideCount: int(0, 4),
  sideAngle: cont(35, 75),
  sideStart: cont(0.22, 0.4),
  sideSpread: cont(0.3, 0.5),
  sideLength: cont(0.18, 0.42),
  lineWidth: cont(0.8, 2.2),
  lightness: cont(58, 80),
  zoomTarget: { kind: 'enum', values: ZOOM_TARGETS },
} as const satisfies Partial<Record<keyof SnowflakeParams, ParamSpec>>;

export type RdParamKey = keyof typeof RD_PARAM_SPECS;
export const RD_PARAM_KEYS = Object.keys(RD_PARAM_SPECS) as RdParamKey[];

/** Longest allowed bump flank, as a fraction of the segment (classic Koch: 1/3). */
export const KOCH_MAX_FLANK = 0.36;

/**
 * Largest bump ratio m for a given apex angle θ that keeps the flank length
 * (m/2) / sin(θ/2) within {@link KOCH_MAX_FLANK}. Longer flanks make the
 * curve fold over itself into an unreadable tangle.
 */
export function kochRatioCap(apexAngleDeg: number): number {
  return 2 * KOCH_MAX_FLANK * Math.sin((apexAngleDeg * Math.PI) / 360);
}

/** Ranges of the Vogel-driven colour parameters. */
export const HUE_RANGE = { min: 0, max: 360 } as const;
export const SATURATION_RANGE = { min: 35, max: 90 } as const;

/** Linear map of u ∈ [0, 1) onto [min, max). */
export function mapContinuous(u: number, spec: ContinuousSpec): number {
  return spec.min + u * (spec.max - spec.min);
}

/** Map u ∈ [0, 1) onto the integers min..max with equal-width bins. */
export function mapInteger(u: number, spec: IntegerSpec): number {
  const count = spec.max - spec.min + 1;
  return spec.min + Math.min(count - 1, Math.floor(u * count));
}

/** Map u ∈ [0, 1) onto one of the enum values with equal-width bins. */
export function mapEnum<T extends string>(u: number, spec: EnumSpec<T>): T {
  const i = Math.min(spec.values.length - 1, Math.floor(u * spec.values.length));
  return spec.values[i] as T;
}
