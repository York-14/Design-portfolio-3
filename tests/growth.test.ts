import { describe, expect, it } from 'vitest';
import { DOT_RADIUS, NUCLEUS_END, armProgress, nucleusPolygon } from '../src/fractal/growth';
import { applyX, applyY, type Flat } from '../src/fractal/geometry';
import { buildSnowflake } from '../src/fractal/snowflake';
import { D6 } from '../src/fractal/symmetry';
import { Timeline } from '../src/animation/timeline';
import { DEFAULT_CONFIG, type AnimationConfig } from '../src/animation/config';
import { seedToParams } from '../src/seed/seedToParams';

/** Vertices where the outline turns by more than 20°. */
function corners(poly: Flat): number {
  const n = poly.length / 2;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n;
    const b = (i + 1) % n;
    const ux = poly[2 * i]! - poly[2 * a]!;
    const uy = poly[2 * i + 1]! - poly[2 * a + 1]!;
    const vx = poly[2 * b]! - poly[2 * i]!;
    const vy = poly[2 * b + 1]! - poly[2 * i + 1]!;
    if (Math.hypot(ux, uy) < 1e-9 || Math.hypot(vx, vy) < 1e-9) continue;
    const turn = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
    if (turn > (20 * Math.PI) / 180) count++;
  }
  return count;
}

const shapesAt = (seed: number, growth: number) => {
  const p = seedToParams(seed);
  const s = armProgress(growth);
  return buildSnowflake(
    p,
    { koch: p.kochDepth * s, sierpinski: p.sierpinskiDepth * s },
    { growth },
  );
};
const totalCorners = (seed: number, growth: number) =>
  shapesAt(seed, growth).fills.reduce((n, f) => n + corners(f), 0);
const maxRadius = (seed: number, growth: number) => {
  let r = 0;
  for (const f of shapesAt(seed, growth).fills) {
    for (let i = 0; i < f.length; i += 2) r = Math.max(r, Math.hypot(f[i]!, f[i + 1]!));
  }
  return r;
};

describe('crystal growth', () => {
  it('starts as a point-like circle with no corners', () => {
    const shapes = shapesAt(3, 0);
    expect(shapes.fills).toHaveLength(1);
    expect(shapes.holes).toHaveLength(0);
    const dot = shapes.fills[0]!;
    for (let i = 0; i < dot.length; i += 2) {
      const r = Math.hypot(dot[i]!, dot[i + 1]!);
      expect(r).toBeCloseTo(DOT_RADIUS * ((1 + Math.cos(Math.PI / 6)) / 2), 12);
    }
    expect(corners(dot)).toBe(0);
  });

  it('the nucleus sharpens into exactly the central hexagon', () => {
    const p = seedToParams(5);
    const hex = nucleusPolygon(p.hexRadius, 1);
    expect(corners(hex)).toBe(6);
    // …which is what the arm stage starts from (arms of size zero).
    const start = buildSnowflake(p, { koch: 0, sierpinski: 0 }, { growth: NUCLEUS_END });
    expect(start.fills).toHaveLength(1);
    expect(corners(start.fills[0]!)).toBe(6);
    const rMax = (f: Flat) =>
      Math.max(...f.filter((_, i) => i % 2 === 0).map((x, j) => Math.hypot(x, f[2 * j + 1]!)));
    expect(rMax(start.fills[0]!)).toBeCloseTo(rMax(hex), 9);
  });

  it.each([0, 4, 7, 12, 21])(
    'seed %i: corners only ever increase and the crystal only grows',
    (seed) => {
      let prevCorners = -1;
      let prevRadius = 0;
      for (let g = 0; g <= 1.0001; g += 0.05) {
        const c = totalCorners(seed, Math.min(1, g));
        const r = maxRadius(seed, Math.min(1, g));
        expect(c, `growth ${g.toFixed(2)}`).toBeGreaterThanOrEqual(prevCorners);
        expect(r, `growth ${g.toFixed(2)}`).toBeGreaterThanOrEqual(prevRadius - 1e-9);
        prevCorners = c;
        prevRadius = r;
      }
      expect(totalCorners(seed, 1)).toBeGreaterThan(totalCorners(seed, NUCLEUS_END) * 4);
    },
  );

  it('stays D6-symmetric at every stage', () => {
    for (const g of [0, 0.1, NUCLEUS_END, 0.4, 0.7, 1]) {
      const shapes = shapesAt(9, g);
      const all = [...shapes.fills, ...shapes.holes];
      const keys = new Set<string>();
      const key = (x: number, y: number) => `${Math.round(x * 1e6) + 0},${Math.round(y * 1e6) + 0}`;
      for (const p of all) for (let i = 0; i < p.length; i += 2) keys.add(key(p[i]!, p[i + 1]!));
      let missing = 0;
      for (const m of D6) {
        for (const p of all) {
          for (let i = 0; i < p.length; i += 2) {
            const x = applyX(m, p[i]!, p[i + 1]!);
            const y = applyY(m, p[i]!, p[i + 1]!);
            if (!keys.has(key(x, y))) missing++;
          }
        }
      }
      // Rounding at the 1e-6 grid boundary may miss a handful of points.
      expect(missing, `growth ${g}`).toBeLessThan(5);
    }
  });
});

describe('growth in the timeline', () => {
  const opts = { viewRadius: 1.4, maxBaseDepth: 6 };

  it('every seed begins as a dot', () => {
    const f = new Timeline(17).frame(opts);
    expect(f.phase).toBe('generate');
    expect(f.layers[0]!.growth).toBeCloseTo(0, 12);
  });

  it('zoom cycle: melts back to a dot before the next seed, and the hand-over happens at the dot', () => {
    const c: AnimationConfig = { ...DEFAULT_CONFIG, cycle: 'zoom' };
    const tl = new Timeline(17, c);
    tl.update(
      c.generate.duration +
        c.zoomIn.duration +
        c.infinite.duration * c.infinite.cycles +
        c.zoomOut.duration,
    );
    expect(tl.phase).toBe('fadeOut');
    expect(tl.frame(opts).layers[0]!.growth).toBeCloseTo(1, 9);
    tl.update(c.fadeOut.duration + c.transition.duration / 2);
    const mid = tl.frame(opts);
    expect(mid.phase).toBe('transition');
    for (const l of mid.layers) expect(l.growth).toBe(0);
  });
});
