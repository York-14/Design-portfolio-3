import type { EasingName } from './easing';

export const TRANSITION_MODES = ['hybrid', 'crossfade', 'morph'] as const;
export type TransitionMode = (typeof TRANSITION_MODES)[number];

/**
 * What happens to a crystal once it has grown.
 * - chaos: corners keep multiplying until the outline turns chaotic, then it dissolves
 * - zoom: endless self-similar zoom, then it melts back into a dot
 */
export const CYCLES = ['chaos', 'zoom'] as const;
export type Cycle = (typeof CYCLES)[number];

export interface PhaseSpec {
  /** Seconds. */
  duration: number;
  easing: EasingName;
}

export interface AnimationConfig {
  cycle: Cycle;
  /** A dot swells into a hexagon, arms sprout and recursion deepens 0 → max. */
  generate: PhaseSpec;
  /** Recursion deepens and the Koch bumps grow spikier until the outline tangles. */
  chaos: PhaseSpec;
  /** At the peak of chaos the crystal spreads, blurs and vanishes. */
  dissolve: PhaseSpec & { spread: number; blurPx: number };
  /** Overview → self-similar fixed point. */
  zoomIn: PhaseSpec;
  /** Endless zoom; `duration` is per self-similarity period (×3 or ×2). */
  infinite: PhaseSpec & { cycles: number };
  /** Back out to the overview. */
  zoomOut: PhaseSpec;
  /** Growth in reverse — back to a dot — while dimming to `floor` opacity. */
  fadeOut: PhaseSpec & { floor: number };
  /** Crystal n becomes crystal n + 1 (at the dot stage). */
  transition: PhaseSpec & { mode: TransitionMode };
}

export const DEFAULT_CONFIG: AnimationConfig = {
  cycle: 'chaos',
  generate: { duration: 6, easing: 'easeInOutSine' },
  chaos: { duration: 8, easing: 'easeInQuad' },
  dissolve: { duration: 2.4, easing: 'easeOutQuad', spread: 0.18, blurPx: 10 },
  zoomIn: { duration: 4.5, easing: 'easeInOutCubic' },
  infinite: { duration: 3.2, easing: 'linear', cycles: 3 },
  zoomOut: { duration: 4, easing: 'easeInOutCubic' },
  fadeOut: { duration: 2.6, easing: 'easeInOutSine', floor: 0.4 },
  transition: { duration: 1.6, easing: 'easeInOutSine', mode: 'hybrid' },
};

export const PHASES = [
  'generate',
  'chaos',
  'dissolve',
  'zoomIn',
  'infinite',
  'zoomOut',
  'fadeOut',
  'transition',
] as const;
export type Phase = (typeof PHASES)[number];

/** The phases of one crystal's life, in order, for each cycle. */
export const CYCLE_PHASES: Record<Cycle, readonly Phase[]> = {
  chaos: ['generate', 'chaos', 'dissolve'],
  zoom: ['generate', 'zoomIn', 'infinite', 'zoomOut', 'fadeOut', 'transition'],
};

export function phaseDuration(config: AnimationConfig, phase: Phase): number {
  return phase === 'infinite'
    ? config.infinite.duration * config.infinite.cycles
    : config[phase].duration;
}

/** Length of one crystal's life (one seed) in seconds. */
export function cycleDuration(config: AnimationConfig): number {
  return CYCLE_PHASES[config.cycle].reduce((s, p) => s + phaseDuration(config, p), 0);
}
