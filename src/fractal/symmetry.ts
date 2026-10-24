import { IDENTITY, MIRROR_X, compose, rotation, type Mat2 } from './geometry';

/** The six rotations of D6, by k·60°. */
export const ROTATIONS: readonly Mat2[] = Array.from({ length: 6 }, (_, k) =>
  k === 0 ? IDENTITY : rotation((k * Math.PI) / 3),
);

/** The six reflections of D6: rotation ∘ mirror across the x-axis. */
export const REFLECTIONS: readonly Mat2[] = ROTATIONS.map((r) => compose(r, MIRROR_X));

/** All twelve elements of the dihedral group D6. */
export const D6: readonly Mat2[] = [...ROTATIONS, ...REFLECTIONS];
