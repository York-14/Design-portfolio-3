export type Easing = (t: number) => number;

const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

export const EASINGS = {
  linear: (t: number) => clamp01(t),
  easeInQuad: (t: number) => clamp01(t) ** 2,
  easeOutQuad: (t: number) => 1 - (1 - clamp01(t)) ** 2,
  easeInOutQuad: (t: number) => {
    const x = clamp01(t);
    return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
  },
  easeInCubic: (t: number) => clamp01(t) ** 3,
  easeOutCubic: (t: number) => 1 - (1 - clamp01(t)) ** 3,
  easeInOutCubic: (t: number) => {
    const x = clamp01(t);
    return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
  },
  easeInOutSine: (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2,
} satisfies Record<string, Easing>;

export type EasingName = keyof typeof EASINGS;

export function isEasingName(name: string): name is EasingName {
  return Object.hasOwn(EASINGS, name);
}
