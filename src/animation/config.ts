import type { EasingName } from './easing';

export const TRANSITION_MODES = ['hybrid', 'crossfade', 'morph'] as const;
export type TransitionMode = (typeof TRANSITION_MODES)[number];

export interface PhaseSpec {
  /** Seconds. */
  duration: number;
  easing: EasingName;
}

export interface AnimationConfig {
  /** Recursion levels 0 → max are drawn in. */
  generate: PhaseSpec;
  /** Overview → self-similar fixed point. */
  zoomIn: PhaseSpec;
  /** Endless zoom; `duration` is per self-similarity period (×3 or ×2). */
  infinite: PhaseSpec & { cycles: number };
  /** Back out to the overview. */
  zoomOut: PhaseSpec;
  /** Recursion recedes to level 0 and the crystal dims to `floor` opacity. */
  fadeOut: PhaseSpec & { floor: number };
  /** Crystal n becomes crystal n + 1. */
  transition: PhaseSpec & { mode: TransitionMode };
}

export const DEFAULT_CONFIG: AnimationConfig = {
  generate: { duration: 5, easing: 'easeInOutSine' },
  zoomIn: { duration: 4.5, easing: 'easeInOutCubic' },
  infinite: { duration: 3.2, easing: 'linear', cycles: 3 },
  zoomOut: { duration: 4, easing: 'easeInOutCubic' },
  fadeOut: { duration: 1.8, easing: 'easeInOutQuad', floor: 0.4 },
  transition: { duration: 2.6, easing: 'easeInOutSine', mode: 'hybrid' },
};

export const PHASES = [
  'generate',
  'zoomIn',
  'infinite',
  'zoomOut',
  'fadeOut',
  'transition',
] as const;
export type Phase = (typeof PHASES)[number];

export function phaseDuration(config: AnimationConfig, phase: Phase): number {
  return phase === 'infinite'
    ? config.infinite.duration * config.infinite.cycles
    : config[phase].duration;
}
