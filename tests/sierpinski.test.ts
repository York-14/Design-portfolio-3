import { describe, expect, it } from 'vitest';
import { gasketHoles } from '../src/fractal/sierpinski';
import type { Flat } from '../src/fractal/geometry';

const TRI = [0, 0, 1, 0, 0.5, Math.sqrt(3) / 2] as const;

describe('Sierpiński gasket', () => {
  it('depth d removes (3^d − 1)/2 triangles', () => {
    for (let d = 0; d <= 6; d++) {
      const out: Flat[] = [];
      gasketHoles(out, ...TRI, d);
      expect(out.length).toBe((3 ** d - 1) / 2);
    }
  });

  it('removed area tends to the whole triangle: 1 − (3/4)^d', () => {
    const area = (t: Flat) =>
      Math.abs((t[2]! - t[0]!) * (t[5]! - t[1]!) - (t[4]! - t[0]!) * (t[3]! - t[1]!)) / 2;
    const total = area([...TRI]);
    const out: Flat[] = [];
    gasketHoles(out, ...TRI, 5);
    const removed = out.reduce((s, t) => s + area(t), 0);
    expect(removed / total).toBeCloseTo(1 - 0.75 ** 5, 12);
  });

  it('fractional depth opens the deepest holes partially', () => {
    const out: Flat[] = [];
    gasketHoles(out, ...TRI, 0.5);
    const hole = out[0]!;
    // Half-opened medial triangle: vertices halfway between centroid and midpoints.
    const gx = 0.5;
    const gy = Math.sqrt(3) / 6;
    expect(hole[0]).toBeCloseTo(gx + (0.5 - gx) * 0.5, 12);
    expect(hole[1]).toBeCloseTo(gy + (0 - gy) * 0.5, 12);
  });

  it('is self-similar at a corner with factor 2', () => {
    const deep: Flat[] = [];
    const shallow: Flat[] = [];
    gasketHoles(deep, ...TRI, 4);
    gasketHoles(shallow, ...TRI, 3);
    // Holes inside the corner triangle (0,0), (½,0), (¼,√3/4): x + y/√3 ≤ ½.
    const inCorner = (h: Flat) =>
      [0, 2, 4].every((i) => h[i]! + h[i + 1]! / Math.sqrt(3) <= 0.5 + 1e-9);
    const nearCorner = deep.filter(inCorner);
    const key = (h: Flat) => h.map((v) => v.toFixed(9)).join(',');
    const scaled = new Set(nearCorner.map((h) => key(h.map((v) => v * 2))));
    expect(scaled).toEqual(new Set(shallow.map(key)));
  });
});
