import { describe, expect, it } from 'vitest';
import {
  HUE_RANGE,
  RD_PARAM_KEYS,
  RD_PARAM_SPECS,
  SATURATION_RANGE,
  type ParamSpec,
} from '../src/seed/params';
import { ALPHAS, RD_DIMENSION, seedToParams, seedToUnit } from '../src/seed/seedToParams';

function inRange(value: unknown, spec: ParamSpec): boolean {
  switch (spec.kind) {
    case 'continuous':
      return typeof value === 'number' && value >= spec.min && value <= spec.max;
    case 'integer':
      return (
        Number.isInteger(value) && (value as number) >= spec.min && (value as number) <= spec.max
      );
    case 'enum':
      return (spec.values as readonly unknown[]).includes(value);
  }
}

describe('seedToParams', () => {
  it('is deterministic: same n → identical output', () => {
    for (const n of [0, 1, 2, 42, 1023, 1024, 99999, 2 ** 40]) {
      expect(seedToParams(n)).toStrictEqual(seedToParams(n));
    }
  });

  it('different seeds give different snowflakes', () => {
    const a = JSON.stringify(seedToParams(7));
    const b = JSON.stringify(seedToParams(8));
    expect(a).not.toBe(b);
  });

  it('keeps every parameter within its range for the first 10 000 seeds', () => {
    for (let n = 0; n < 10_000; n++) {
      const p = seedToParams(n);
      for (const key of RD_PARAM_KEYS) {
        if (!inRange(p[key], RD_PARAM_SPECS[key])) {
          throw new Error(`seed ${n}: ${key}=${String(p[key])} out of range`);
        }
      }
      expect(p.hue).toBeGreaterThanOrEqual(HUE_RANGE.min);
      expect(p.hue).toBeLessThan(HUE_RANGE.max);
      expect(p.saturation).toBeGreaterThanOrEqual(SATURATION_RANGE.min);
      expect(p.saturation).toBeLessThan(SATURATION_RANGE.max);
      expect(p.seed).toBe(n);
    }
  });

  it('reaches every discrete value within the first 100 seeds', () => {
    const seen = new Map<string, Set<unknown>>();
    for (let n = 0; n < 100; n++) {
      const p = seedToParams(n);
      for (const key of RD_PARAM_KEYS) {
        const spec = RD_PARAM_SPECS[key];
        if (spec.kind === 'continuous') continue;
        if (!seen.has(key)) seen.set(key, new Set());
        seen.get(key)!.add(p[key]);
      }
    }
    for (const key of RD_PARAM_KEYS) {
      const spec = RD_PARAM_SPECS[key];
      if (spec.kind === 'integer') expect(seen.get(key)!.size).toBe(spec.max - spec.min + 1);
      if (spec.kind === 'enum') expect(seen.get(key)!.size).toBe(spec.values.length);
    }
  });
});

describe('R_d axis conditioning', () => {
  it(`uses one α per parameter from R_${RD_DIMENSION}`, () => {
    expect(ALPHAS).toHaveLength(RD_PARAM_KEYS.length);
    expect(RD_DIMENSION).toBeGreaterThanOrEqual(RD_PARAM_KEYS.length);
  });

  it('no α_k is close to a rational p/q with small q', () => {
    // A near-rational α makes u_k(n) cycle with period q instead of spreading.
    for (const a of ALPHAS) {
      for (let q = 1; q <= 30; q++) {
        const dist = Math.abs(a * q - Math.round(a * q)) / q;
        expect(dist * q * q).toBeGreaterThan(0.02);
      }
    }
  });
});

describe('uniformity of the first N seeds (bin check)', () => {
  const N = 1000;
  const BINS = 10;
  const expected = N / BINS;

  it(`each of the ${ALPHAS.length} R_d axes fills ${BINS} bins within ±10%`, () => {
    const counts = Array.from({ length: ALPHAS.length }, () => new Array<number>(BINS).fill(0));
    for (let n = 0; n < N; n++) {
      seedToUnit(n).forEach((u, k) => {
        counts[k]![Math.floor(u * BINS)]! += 1;
      });
    }
    for (const axis of counts) {
      for (const c of axis) expect(Math.abs(c - expected)).toBeLessThanOrEqual(expected * 0.1);
    }
  });

  it('hue covers the colour wheel evenly', () => {
    const counts = new Array<number>(BINS).fill(0);
    for (let n = 0; n < N; n++) counts[Math.floor((seedToParams(n).hue / 360) * BINS)]! += 1;
    for (const c of counts) expect(Math.abs(c - expected)).toBeLessThanOrEqual(expected * 0.1);
  });
});
