import { describe, expect, it } from 'vitest';
import { kochPolyline, kochSegment, kochTemplate } from '../src/fractal/koch';
import type { Flat } from '../src/fractal/geometry';

const classic = kochTemplate(1 / 3, 60);

function length(poly: Flat): number {
  let sum = 0;
  for (let i = 0; i + 3 < poly.length; i += 2) {
    sum += Math.hypot(poly[i + 2]! - poly[i]!, poly[i + 3]! - poly[i + 1]!);
  }
  return sum;
}

describe('Koch construction', () => {
  it('classic template: bump height √3/6, self-similarity 3', () => {
    expect(classic.height).toBeCloseTo(Math.sqrt(3) / 6, 12);
    expect(classic.scale).toBeCloseTo(3, 12);
  });

  it('depth d produces 4^d segments and length (4/3)^d', () => {
    for (let d = 0; d <= 5; d++) {
      const out: Flat = [0, 0];
      kochSegment(out, 0, 0, 1, 0, d, 1, classic);
      expect(out.length / 2 - 1).toBe(4 ** d);
      expect(length(out)).toBeCloseTo((4 / 3) ** d, 9);
      expect(out.slice(-2)).toEqual([1, 0]);
    }
  });

  it('side = +1 raises bumps to the left, −1 to the right', () => {
    const left: Flat = [0, 0];
    const right: Flat = [0, 0];
    kochSegment(left, 0, 0, 1, 0, 1, +1, classic);
    kochSegment(right, 0, 0, 1, 0, 1, -1, classic);
    expect(left[5]).toBeGreaterThan(0);
    expect(right[5]).toBeLessThan(0);
  });

  it('fractional depth raises the deepest level partially', () => {
    const out: Flat = [0, 0];
    kochSegment(out, 0, 0, 1, 0, 0.5, 1, classic);
    expect(out[5]).toBeCloseTo(classic.height / 2, 12);
  });

  it('stays inside the bounding disk for extreme templates', () => {
    for (const [ratio, angle] of [
      [0.42, 30],
      [0.26, 90],
      [1 / 3, 60],
    ] as const) {
      const tpl = kochTemplate(ratio, angle);
      const out: Flat = [0, 0];
      kochSegment(out, 0, 0, 1, 0, 6, 1, tpl);
      for (let i = 0; i < out.length; i += 2) {
        expect(Math.hypot(out[i]! - 0.5, out[i + 1]!)).toBeLessThanOrEqual(tpl.bound + 1e-9);
      }
    }
  });

  it('is self-similar at its endpoint with factor 2/(1−m) (basis of the infinite zoom)', () => {
    const tpl = kochTemplate(0.3, 70);
    const s = tpl.scale;
    const deep: Flat = [0, 0];
    const shallow: Flat = [0, 0];
    kochSegment(deep, 0, 0, 1, 0, 5, 1, tpl);
    kochSegment(shallow, 0, 0, 1, 0, 4, 1, tpl);
    // Points of depth 5 near the endpoint, scaled up by s, are the depth-4 curve.
    const rho = 0.5 / s;
    const scaled: Flat = [];
    for (let i = 0; i < deep.length; i += 2) {
      if (Math.hypot(deep[i]!, deep[i + 1]!) < rho) scaled.push(deep[i]! * s, deep[i + 1]! * s);
    }
    const expected: Flat = [];
    for (let i = 0; i < shallow.length; i += 2) {
      if (Math.hypot(shallow[i]!, shallow[i + 1]!) < rho * s)
        expected.push(shallow[i]!, shallow[i + 1]!);
    }
    expect(scaled.length).toBe(expected.length);
    scaled.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
  });

  it('view culling leaves invisible segments straight and LOD stops tiny ones', () => {
    const far: Flat = [0, 0];
    kochSegment(far, 0, 0, 1, 0, 6, 1, classic, { x: 100, y: 100, r: 1, lod: 0 });
    expect(far).toEqual([0, 0, 1, 0]);

    const coarse: Flat = [0, 0];
    kochSegment(coarse, 0, 0, 1, 0, 6, 1, classic, { x: 0, y: 0, r: 10, lod: 0.2 });
    expect(coarse.length / 2 - 1).toBe(4 ** 2);
  });

  it('kochPolyline only refines flagged segments', () => {
    const out = kochPolyline([0, 0, 1, 0, 2, 0], [true, false], 1, 1, classic);
    expect(out.length / 2).toBe(1 + 4 + 1);
    expect(out.slice(-4)).toEqual([1, 0, 2, 0]);
  });
});
