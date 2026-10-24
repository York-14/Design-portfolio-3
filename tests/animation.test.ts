import { describe, expect, it } from 'vitest';
import { CHAOS_ANGLE, CHAOS_FLANK, CHAOS_RATIO, kochFlank } from '../src/animation/chaos';
import {
  CYCLE_PHASES,
  DEFAULT_CONFIG,
  cycleDuration,
  phaseDuration,
  type AnimationConfig,
} from '../src/animation/config';
import { EASINGS } from '../src/animation/easing';
import { depthForZoom, loopZoom, planZoom, zoomPath } from '../src/animation/infiniteZoom';
import { PerformanceGovernor } from '../src/animation/perf';
import { Timeline } from '../src/animation/timeline';
import {
  discreteDiffers,
  lerpHue,
  lerpParams,
  transitionLayers,
} from '../src/animation/transition';
import { kochTemplate } from '../src/fractal/koch';
import { buildSectorTemplate } from '../src/fractal/sector';
import { buildSnowflake } from '../src/fractal/snowflake';
import { seedToParams } from '../src/seed/seedToParams';

const OPTS = { viewRadius: 1.4, maxBaseDepth: 6 };

describe('easings', () => {
  it('map 0 → 0 and 1 → 1 and stay monotone', () => {
    for (const [name, f] of Object.entries(EASINGS)) {
      expect(f(0), name).toBeCloseTo(0, 12);
      expect(f(1), name).toBeCloseTo(1, 12);
      let prev = -Infinity;
      for (let t = 0; t <= 1; t += 0.01) {
        expect(f(t)).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = f(t);
      }
    }
  });
});

describe('infinite zoom', () => {
  const findSeed = (target: 'tip' | 'center') => {
    for (let n = 0; ; n++) {
      const p = seedToParams(n);
      const tpl = buildSectorTemplate(p);
      if (target === 'tip' && p.zoomTarget === 'tip') return { p, tpl };
      if (target === 'center' && p.zoomTarget === 'center' && tpl.hexGasket) return { p, tpl };
    }
  };

  it('dives into the Koch tip with ratio 2/(1−m) or the gasket centre with ratio 2', () => {
    const tip = findSeed('tip');
    const tipPlan = planZoom(tip.p, tip.tpl, 1.4);
    expect(tipPlan.kind).toBe('koch');
    expect(tipPlan.scale).toBeCloseTo(2 / (1 - tip.p.kochRatio), 12);
    expect([tipPlan.x, tipPlan.y]).toEqual([tip.p.mainLength, 0]);

    const centre = findSeed('center');
    const centrePlan = planZoom(centre.p, centre.tpl, 1.4);
    expect(centrePlan.kind).toBe('sierpinski');
    expect(centrePlan.scale).toBe(2);
    expect([centrePlan.x, centrePlan.y]).toEqual([0, 0]);
  });

  it('z₀ fits the screen inside the self-similar neighbourhood', () => {
    const { p, tpl } = findSeed('tip');
    const plan = planZoom(p, tpl, 1.4);
    expect(1.4 / plan.z0).toBeCloseTo(plan.rho, 12);
  });

  it('wrapping is seamless: zoom ×s and depth +1 on either side of the seam', () => {
    const { p, tpl } = findSeed('tip');
    const plan = planZoom(p, tpl, 1.4);
    const eps = 1e-9;
    const before = loopZoom(plan, 1 - eps);
    const after = loopZoom(plan, 1);
    expect(before / after).toBeCloseTo(plan.scale, 6);
    const dBefore = depthForZoom(p.kochDepth, before, plan.scale);
    const dAfter = depthForZoom(p.kochDepth, after, plan.scale);
    expect(dBefore - dAfter).toBeCloseTo(1, 6);
  });

  it('zoom path goes from the overview to the fixed point', () => {
    const { p, tpl } = findSeed('tip');
    const plan = planZoom(p, tpl, 1.4);
    expect(zoomPath(plan, 0)).toEqual({ cx: 0, cy: 0, zoom: 1 });
    const end = zoomPath(plan, 1);
    expect(end.cx).toBeCloseTo(plan.x, 12);
    expect(end.zoom).toBeCloseTo(plan.z0, 9);
  });
});

describe('transitions', () => {
  const a = seedToParams(10);
  const b = seedToParams(11);

  it('lerpHue takes the short way round', () => {
    expect(lerpHue(350, 10, 0.5)).toBeCloseTo(0, 9);
    expect(lerpHue(10, 350, 0.25)).toBeCloseTo(5, 9);
  });

  it('lerpParams keeps discrete values and hits both endpoints', () => {
    const mid = lerpParams(a, b, 0.5);
    expect(mid.sideCount).toBe(a.sideCount);
    expect(mid.mainLength).toBeCloseTo((a.mainLength + b.mainLength) / 2, 12);
    expect(lerpParams(a, b, 1).kochAngle).toBeCloseTo(b.kochAngle, 12);
  });

  it('hybrid uses one morphing layer unless a discrete parameter differs', () => {
    const depths = { koch: 0, sierpinski: 0 };
    const same = { ...b, sideCount: a.sideCount };
    expect(transitionLayers(a, same, 0.3, 'hybrid', depths)).toHaveLength(1);
    const other = { ...b, sideCount: (a.sideCount + 1) % 5 };
    expect(discreteDiffers(a, other, depths)).toBe(true);
    const layers = transitionLayers(a, other, 0.3, 'hybrid', depths);
    expect(layers).toHaveLength(2);
    expect(layers[0]!.alpha + layers[1]!.alpha).toBeCloseTo(1, 12);
    expect(layers[0]!.params.sideCount).toBe(a.sideCount);
    expect(layers[1]!.params.sideCount).toBe(other.sideCount);
    // Both layers share the same morphed continuous parameters.
    expect(layers[0]!.params.kochAngle).toBeCloseTo(layers[1]!.params.kochAngle, 12);
  });

  it('pattern differences only matter once holes are visible', () => {
    const other = {
      ...a,
      sierpinskiPattern: a.sierpinskiPattern === 'none' ? 'both' : 'none',
    } as const;
    expect(discreteDiffers(a, other, { koch: 0, sierpinski: 0 })).toBe(false);
    expect(discreteDiffers(a, other, { koch: 0, sierpinski: 1 })).toBe(true);
  });
});

const ZOOM: AnimationConfig = { ...DEFAULT_CONFIG, cycle: 'zoom' };

describe.each([
  ['chaos', DEFAULT_CONFIG],
  ['zoom', ZOOM],
] as const)('timeline (%s cycle)', (cycle, config) => {
  const phases = CYCLE_PHASES[cycle];
  const total = cycleDuration(config);

  it('runs the phases in order and advances to seed n+1', () => {
    const tl = new Timeline(5, config);
    const seen: string[] = [tl.phase];
    for (let t = 0; t < total + 0.1; t += 0.05) {
      tl.update(0.05);
      if (seen[seen.length - 1] !== tl.phase) seen.push(tl.phase);
    }
    expect(seen).toEqual([...phases, 'generate']);
    expect(tl.seed).toBe(6);
  });

  it('every phase boundary is continuous (camera, depth, opacity)', () => {
    const eps = 1e-6;
    let t = 0;
    for (const phase of phases) {
      t += phaseDuration(config, phase);
      const left = new Timeline(3, config);
      left.update(t - eps);
      const right = new Timeline(3, config);
      right.update(t + eps);
      const a = left.frame(OPTS);
      const b = right.frame(OPTS);
      const alpha = (f: typeof a) => f.layers.reduce((s, l) => s + l.alpha, 0);
      expect(alpha(a), phase).toBeCloseTo(alpha(b), 3);
      if (phase === 'dissolve') {
        // Nothing is left on screen: the next crystal starts from scratch.
        expect(alpha(a)).toBeCloseTo(0, 3);
        continue;
      }
      if (phase === 'infinite') {
        // The renormalisation seam: zoom ×s and depth +1 is the same picture.
        expect(a.camera.zoom / b.camera.zoom).toBeCloseTo(a.plan.scale, 3);
        const depth = a.plan.kind === 'koch' ? 'koch' : 'sierpinski';
        expect(a.layers[0]!.depths[depth] - b.layers[0]!.depths[depth]).toBeCloseTo(1, 3);
        continue;
      }
      expect(a.camera.zoom, phase).toBeCloseTo(b.camera.zoom, 3);
      expect(a.camera.cx, phase).toBeCloseTo(b.camera.cx, 3);
      if (phase !== 'transition') {
        expect(a.layers[0]!.depths.koch, phase).toBeCloseTo(b.layers[0]!.depths.koch, 3);
        expect(a.layers[0]!.params.kochAngle, phase).toBeCloseTo(b.layers[0]!.params.kochAngle, 3);
      }
    }
  });

  it('frames are reproducible', () => {
    const a = new Timeline(42, config);
    const b = new Timeline(42, config);
    a.update(9.3);
    b.update(9.3);
    expect(a.frame(OPTS)).toStrictEqual(b.frame(OPTS));
  });

  it('phase durations are configurable', () => {
    const fast: AnimationConfig = { ...config, generate: { duration: 0.5, easing: 'linear' } };
    const tl = new Timeline(0, fast);
    tl.update(0.6);
    expect(tl.phase).toBe(phases[1]);
  });

  it('jumpTo restarts at the generation phase', () => {
    const tl = new Timeline(0, config);
    tl.update(12);
    tl.jumpTo(99);
    expect([tl.seed, tl.phase, tl.elapsed]).toEqual([99, 'generate', 0]);
  });
});

describe('chaos cycle', () => {
  const c = DEFAULT_CONFIG;
  const at = (t: number, seed = 8) => {
    const tl = new Timeline(seed);
    tl.update(t);
    return tl.frame(OPTS);
  };

  it('is the default: grow → chaos → dissolve', () => {
    expect(DEFAULT_CONFIG.cycle).toBe('chaos');
    expect(CYCLE_PHASES.chaos).toEqual(['generate', 'chaos', 'dissolve']);
  });

  it('pushes the Koch bump towards a long, spiky flank while depth keeps rising', () => {
    let prevFlank = 0;
    let prevDepth = 0;
    for (let k = 0; k <= 10; k++) {
      const f = at(c.generate.duration + (c.chaos.duration * k) / 10 - (k === 10 ? 1e-6 : 0));
      const l = f.layers[0]!;
      const flank = kochFlank(l.params.kochRatio, l.params.kochAngle);
      expect(flank).toBeGreaterThanOrEqual(prevFlank - 1e-12);
      expect(l.depths.koch).toBeGreaterThanOrEqual(prevDepth - 1e-12);
      prevFlank = flank;
      prevDepth = l.depths.koch;
    }
    expect(prevFlank).toBeCloseTo(CHAOS_FLANK, 3);
    // The chaotic template still contracts, so the curve is well defined.
    expect(() => kochTemplate(CHAOS_RATIO, CHAOS_ANGLE)).not.toThrow();
  });

  it('dissolve spreads, blurs and fades the crystal to nothing', () => {
    const start = c.generate.duration + c.chaos.duration;
    const mid = at(start + c.dissolve.duration / 2).layers[0]!;
    const end = at(start + c.dissolve.duration - 1e-6);
    expect(mid.blur).toBeGreaterThan(0);
    expect(end.layers[0]!.alpha).toBeLessThan(0.01);
    expect(end.camera.zoom).toBeGreaterThan(1);
  });

  it('the next seed fades in from a dot', () => {
    const f = at(cycleDuration(c) + 0.01);
    expect(f.seed).toBe(9);
    expect(f.phase).toBe('generate');
    expect(f.layers[0]!.growth).toBeLessThan(0.01);
    expect(f.layers[0]!.alpha).toBeLessThan(0.1);
  });

  it('corners multiply on the road to chaos (whole flake, segment budget not binding)', () => {
    const corners = (k: number) => {
      const l = at(c.generate.duration + (c.chaos.duration * k) / 4, 4).layers[0]!;
      const shapes = buildSnowflake(l.params, l.depths, { maxSegments: 400_000 });
      return shapes.fills.reduce((n, f) => n + f.length / 2, 0);
    };
    expect(corners(1)).toBeGreaterThan(corners(0));
    expect(corners(3)).toBeGreaterThan(corners(1));
  });
});

describe('performance governor', () => {
  it('degrades under load and recovers with headroom', () => {
    const gov = new PerformanceGovernor();
    const start = { ...gov.quality };
    for (let i = 0; i < 400; i++) gov.record(40);
    expect(gov.quality.minSegmentPx).toBeGreaterThan(start.minSegmentPx);
    expect(gov.quality.maxBaseDepth).toBeLessThan(start.maxBaseDepth);
    expect(gov.quality.glow).toBe(false);
    for (let i = 0; i < 2000; i++) gov.record(1);
    expect(gov.quality).toEqual(start);
  });

  it('treats a slow frame interval as overload even when CPU time is low (GPU-bound)', () => {
    const gov = new PerformanceGovernor();
    const start = gov.quality.minSegmentPx;
    for (let i = 0; i < 100; i++) gov.record(2, 33);
    expect(gov.quality.minSegmentPx).toBeGreaterThan(start);
  });

  it('holds steady inside the hysteresis band', () => {
    const gov = new PerformanceGovernor();
    const start = { ...gov.quality };
    for (let i = 0; i < 400; i++) gov.record(8, 16.7);
    expect(gov.quality).toEqual(start);
  });
});

describe('renormalisation seam on real geometry', () => {
  // The frame at (zoom z₀·s, depth d + 1) must equal the frame at (z₀, d)
  // inside the screen circle, compared in screen coordinates.
  const screenPoints = (
    seed: number,
    zoom: number,
    depths: { koch: number; sierpinski: number },
    plan: ReturnType<typeof planZoom>,
  ) => {
    const params = seedToParams(seed);
    const r = 1.4 / zoom;
    const shapes = buildSnowflake(params, depths, {
      view: { x: plan.x, y: plan.y, r, lod: 0.004 / zoom },
    });
    const pts: [number, number][] = [];
    for (const poly of [...shapes.fills, ...shapes.holes]) {
      for (let i = 0; i < poly.length; i += 2) {
        const x = (poly[i]! - plan.x) * zoom;
        const y = (poly[i + 1]! - plan.y) * zoom;
        if (Math.hypot(x, y) < 1.4 * 0.9) pts.push([x, y]);
      }
    }
    return pts;
  };

  const check = (seed: number) => {
    const params = seedToParams(seed);
    const tpl = buildSectorTemplate(params);
    const plan = planZoom(params, tpl, 1.4);
    const at = (z: number) => ({
      koch: depthForZoom(2, z, tpl.koch.scale),
      sierpinski: depthForZoom(2, z, 2),
    });
    const a = screenPoints(seed, plan.z0, at(plan.z0), plan);
    const b = screenPoints(seed, plan.z0 * plan.scale, at(plan.z0 * plan.scale), plan);
    const key = ([x, y]: [number, number]) => `${x.toFixed(5)},${y.toFixed(5)}`;
    const setA = new Set(a.map(key));
    const setB = new Set(b.map(key));
    // Both directions: anything extra on either side would be a visible seam.
    const onlyA = a.filter((p) => !setB.has(key(p)));
    const onlyB = b.filter((p) => !setA.has(key(p)));
    expect(a.length).toBeGreaterThan(10);
    expect(onlyA.length / a.length, `seed ${seed}`).toBeLessThan(0.01);
    expect(onlyB.length / b.length, `seed ${seed}`).toBeLessThan(0.01);
    return plan.kind;
  };

  it('holds for Koch tips and Sierpiński centres across seeds', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 24; seed++) kinds.add(check(seed));
    expect(kinds).toEqual(new Set(['koch', 'sierpinski']));
  });
});
