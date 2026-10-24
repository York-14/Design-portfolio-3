import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  PHASES,
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
import { buildSectorTemplate } from '../src/fractal/sector';
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

describe('timeline', () => {
  const total = PHASES.reduce((s, p) => s + phaseDuration(DEFAULT_CONFIG, p), 0);

  it('runs the phases in order and advances to seed n+1', () => {
    const tl = new Timeline(5);
    const seen: string[] = [tl.phase];
    for (let t = 0; t < total + 0.1; t += 0.05) {
      tl.update(0.05);
      if (seen[seen.length - 1] !== tl.phase) seen.push(tl.phase);
    }
    expect(seen).toEqual([...PHASES, 'generate']);
    expect(tl.seed).toBe(6);
  });

  it('every phase boundary is continuous (camera, depth, opacity)', () => {
    const eps = 1e-6;
    let t = 0;
    for (const phase of PHASES) {
      t += phaseDuration(DEFAULT_CONFIG, phase);
      const left = new Timeline(3);
      left.update(t - eps);
      const right = new Timeline(3);
      right.update(t + eps);
      const a = left.frame(OPTS);
      const b = right.frame(OPTS);
      if (phase === 'infinite') {
        // The renormalisation seam: zoom ×s and depth +1 is the same picture.
        expect(a.camera.zoom / b.camera.zoom).toBeCloseTo(a.plan.scale, 3);
        const depth = a.plan.kind === 'koch' ? 'koch' : 'sierpinski';
        expect(a.layers[0]!.depths[depth] - b.layers[0]!.depths[depth]).toBeCloseTo(1, 3);
        continue;
      }
      expect(a.camera.zoom, phase).toBeCloseTo(b.camera.zoom, 3);
      expect(a.camera.cx, phase).toBeCloseTo(b.camera.cx, 3);
      const alpha = (f: typeof a) => f.layers.reduce((s, l) => s + l.alpha, 0);
      expect(alpha(a), phase).toBeCloseTo(alpha(b), 3);
      if (phase !== 'transition') {
        expect(a.layers[0]!.depths.koch, phase).toBeCloseTo(b.layers[0]!.depths.koch, 3);
      }
    }
  });

  it('frames are reproducible', () => {
    const a = new Timeline(42);
    const b = new Timeline(42);
    a.update(9.3);
    b.update(9.3);
    expect(a.frame(OPTS)).toStrictEqual(b.frame(OPTS));
  });

  it('phase durations are configurable', () => {
    const fast: AnimationConfig = {
      ...DEFAULT_CONFIG,
      generate: { duration: 0.5, easing: 'linear' },
    };
    const tl = new Timeline(0, fast);
    tl.update(0.6);
    expect(tl.phase).toBe('zoomIn');
  });

  it('jumpTo restarts at the generation phase', () => {
    const tl = new Timeline(0);
    tl.update(12);
    tl.jumpTo(99);
    expect([tl.seed, tl.phase, tl.elapsed]).toEqual([99, 'generate', 0]);
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
});
