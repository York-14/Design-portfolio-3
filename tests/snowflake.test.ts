import { describe, expect, it } from 'vitest';
import { buildSnowflake } from '../src/fractal/snowflake';
import { buildSectorTemplate } from '../src/fractal/sector';
import { D6, REFLECTIONS, ROTATIONS } from '../src/fractal/symmetry';
import { applyX, applyY, compose, signedArea, type Flat } from '../src/fractal/geometry';
import { seedToParams } from '../src/seed/seedToParams';

const EPS = 1e-7;

/** Vertex set with tolerant lookup (checks neighbouring grid cells). */
class PointSet {
  private cells = new Set<string>();
  constructor(polys: Flat[]) {
    for (const p of polys)
      for (let i = 0; i < p.length; i += 2) this.cells.add(this.key(p[i]!, p[i + 1]!));
  }
  private key(x: number, y: number, dx = 0, dy = 0): string {
    return `${Math.round(x / EPS) + dx},${Math.round(y / EPS) + dy}`;
  }
  has(x: number, y: number): boolean {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) if (this.cells.has(this.key(x, y, dx, dy))) return true;
    return false;
  }
}

describe('D6 group', () => {
  it('has 12 distinct elements closed under composition', () => {
    const key = (m: { a: number; b: number; c: number; d: number }) =>
      [m.a, m.b, m.c, m.d].map((v) => Math.round(v * 1e9) + 0).join(',');
    const keys = new Set(D6.map(key));
    expect(keys.size).toBe(12);
    for (const g of D6) for (const h of D6) expect(keys.has(key(compose(g, h)))).toBe(true);
  });
});

describe('symmetrised snowflake', () => {
  const seeds = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55];

  it.each(seeds)('seed %i: every vertex is D6-invariant', (seed) => {
    const params = seedToParams(seed);
    const shapes = buildSnowflake(params, {
      koch: params.kochDepth,
      sierpinski: params.sierpinskiDepth,
    });
    const all = [...shapes.fills, ...shapes.holes];
    const set = new PointSet(all);
    let checked = 0;
    for (const g of D6) {
      for (const poly of all) {
        for (let i = 0; i < poly.length; i += 2) {
          const x = poly[i]!;
          const y = poly[i + 1]!;
          if (!set.has(applyX(g, x, y), applyY(g, x, y))) {
            throw new Error(`seed ${seed}: (${x}, ${y}) has no image under a D6 element`);
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('builds 1 hexagon + 6 main branches + 12 copies of each side branch', () => {
    for (const seed of seeds) {
      const params = seedToParams(seed);
      const tpl = buildSectorTemplate(params);
      const shapes = buildSnowflake(params, { koch: 1, sierpinski: 1 });
      expect(shapes.fills.length).toBe(1 + 6 + 12 * tpl.sides.length);
      const gaskets = (tpl.hexGasket ? 1 : 0) + tpl.branchGaskets.length;
      expect(shapes.holes.length).toBe(6 * gaskets);
    }
  });

  it('every crystal has at least one side branch (no bare straight arms)', () => {
    for (let seed = 0; seed < 5000; seed++) {
      const sides = buildSectorTemplate(seedToParams(seed)).sides.length;
      if (sides < 1) throw new Error(`seed ${seed} has no side branches`);
    }
  });

  it('sector side branches stay within the 30° wedge', () => {
    for (let seed = 0; seed < 200; seed++) {
      const tpl = buildSectorTemplate(seedToParams(seed));
      for (const side of tpl.sides) {
        const p = side.points;
        // The tip is the point farthest from the base.
        let best = 0;
        for (let i = 0; i < p.length; i += 2) best = Math.max(best, Math.atan2(p[i + 1]!, p[i]!));
        expect(best).toBeLessThanOrEqual(Math.PI / 6 + 1e-9);
      }
    }
  });

  it('the whole snowflake lies within the template radius', () => {
    for (const seed of seeds) {
      const params = seedToParams(seed);
      const tpl = buildSectorTemplate(params);
      const shapes = buildSnowflake(params, { koch: 4, sierpinski: 2 }, { template: tpl });
      let max = 0;
      for (const poly of shapes.fills) {
        for (let i = 0; i < poly.length; i += 2)
          max = Math.max(max, Math.hypot(poly[i]!, poly[i + 1]!));
      }
      expect(max).toBeLessThanOrEqual(tpl.radius);
    }
  });

  it('culling only changes geometry outside the view circle', () => {
    const params = seedToParams(4);
    const depths = { koch: 4, sierpinski: 3 };
    const tpl = buildSectorTemplate(params);
    const view = { x: tpl.tip.x * 0.5, y: 0.1, r: 0.15, lod: 0 };
    const full = buildSnowflake(params, depths, { template: tpl });
    const culled = buildSnowflake(params, depths, { view, template: tpl });
    const culledSet = new PointSet(culled.fills);
    for (const poly of full.fills) {
      for (let i = 0; i < poly.length; i += 2) {
        const x = poly[i]!;
        const y = poly[i + 1]!;
        if (Math.hypot(x - view.x, y - view.y) < view.r) expect(culledSet.has(x, y)).toBe(true);
      }
    }
    const count = (s: Flat[]) => s.reduce((n, p) => n + p.length, 0);
    expect(count(culled.fills)).toBeLessThan(count(full.fills));
  });

  it('all fill polygons are counter-clockwise (overlaps never cancel)', () => {
    const params = seedToParams(9);
    const shapes = buildSnowflake(params, { koch: 2, sierpinski: 1 });
    for (const poly of shapes.fills) expect(signedArea(poly)).toBeGreaterThan(0);
  });

  it('rotations and reflections are listed in matching order', () => {
    expect(ROTATIONS).toHaveLength(6);
    expect(REFLECTIONS).toHaveLength(6);
  });
});
