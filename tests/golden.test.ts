import { describe, expect, it } from 'vitest';
import {
  GOLDEN_ANGLE_DEG,
  PHI,
  frac,
  fracMul,
  generalizedGoldenRatio,
  rdAlphas,
  rdPoint,
  vogel,
} from '../src/seed/golden';

describe('golden constants', () => {
  it('φ satisfies φ² = φ + 1', () => {
    expect(PHI * PHI).toBeCloseTo(PHI + 1, 14);
  });

  it('golden angle ≈ 137.5077°', () => {
    expect(GOLDEN_ANGLE_DEG).toBeCloseTo(137.50776, 4);
  });
});

describe('frac / fracMul', () => {
  it('frac stays in [0, 1) including negatives', () => {
    for (const x of [-3.25, -1, 0, 0.5, 7.999999, 1e9 + 0.25]) {
      const f = frac(x);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    expect(frac(-0.25)).toBeCloseTo(0.75, 12);
  });

  it('fracMul matches exact arithmetic for small n', () => {
    for (let n = 0; n < 2000; n += 37) {
      expect(fracMul(n, 0.381966)).toBeCloseTo(frac(n * 0.381966), 9);
    }
  });

  it('fracMul rejects non-integer seeds', () => {
    expect(() => fracMul(1.5, 0.3)).toThrow(RangeError);
  });
});

describe('Vogel spiral', () => {
  it('advances by exactly one golden angle per step', () => {
    for (let n = 0; n < 50; n++) {
      const d = (vogel(n + 1).theta - vogel(n).theta + 360) % 360;
      expect(d).toBeCloseTo(GOLDEN_ANGLE_DEG, 6);
    }
  });

  it('r_n = √(n/N) and wraps every period', () => {
    expect(vogel(256, 1024).r).toBeCloseTo(0.5, 12);
    expect(vogel(1024 + 256, 1024).r).toBeCloseTo(0.5, 12);
    expect(vogel(0).r).toBe(0);
  });

  it('fills the unit disk evenly (equal-area sector × annulus bins)', () => {
    const N = 1024;
    const angBins = 8;
    const radBins = 4;
    const counts = new Array<number>(angBins * radBins).fill(0);
    for (let n = 0; n < N; n++) {
      const { theta, r } = vogel(n, N);
      const a = Math.floor((theta / 360) * angBins);
      const b = Math.floor(r * r * radBins); // r² bins have equal area
      counts[b * angBins + a]! += 1;
    }
    const expected = N / (angBins * radBins);
    for (const c of counts) expect(Math.abs(c - expected)).toBeLessThanOrEqual(expected * 0.25);
  });
});

describe('R_d sequence', () => {
  it('g_d is the positive root of x^(d+1) = x + 1', () => {
    for (const d of [1, 2, 3, 8, 18]) {
      const g = generalizedGoldenRatio(d);
      expect(g ** (d + 1)).toBeCloseTo(g + 1, 12);
      expect(g).toBeGreaterThan(1);
    }
    expect(generalizedGoldenRatio(1)).toBeCloseTo(PHI, 14);
    expect(generalizedGoldenRatio(2)).toBeCloseTo(1.324717957244746, 14); // plastic number
  });

  it('α_k = 1/g^k', () => {
    const g = generalizedGoldenRatio(5);
    rdAlphas(5).forEach((a, i) => expect(a).toBeCloseTo(1 / g ** (i + 1), 14));
  });

  it('u_k(n) = frac(0.5 + n·α_k)', () => {
    const alphas = rdAlphas(3);
    const p = rdPoint(10, alphas);
    alphas.forEach((a, k) => expect(p[k]).toBeCloseTo(frac(0.5 + 10 * a), 12));
  });
});
