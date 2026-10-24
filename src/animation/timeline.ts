import type { SnowflakeParams } from '../seed/params';
import { seedToParams } from '../seed/seedToParams';
import { armProgress } from '../fractal/growth';
import { buildSectorTemplate, type SectorTemplate } from '../fractal/sector';
import { SIERPINSKI_SCALE } from '../fractal/sierpinski';
import type { Depths } from '../fractal/snowflake';
import { chaosParams, CHAOS_EXTRA_DEPTH } from './chaos';
import {
  CYCLE_PHASES,
  DEFAULT_CONFIG,
  phaseDuration,
  type AnimationConfig,
  type Phase,
} from './config';
import { EASINGS } from './easing';
import { depthForZoom, loopZoom, planZoom, zoomPath, type ZoomPlan } from './infiniteZoom';
import { transitionLayers, type Layer } from './transition';

export interface CameraState {
  cx: number;
  cy: number;
  zoom: number;
}

export interface FrameState {
  seed: number;
  cycle: AnimationConfig['cycle'];
  phase: Phase;
  /** Linear progress through the current phase, [0, 1]. */
  progress: number;
  layers: Layer[];
  camera: CameraState;
  plan: ZoomPlan;
}

export interface FrameOptions {
  /** World-space radius of the screen's circumcircle at zoom 1. */
  viewRadius: number;
  /** Upper bound on the overview recursion depth (set by the performance governor). */
  maxBaseDepth: number;
}

interface SeedCache {
  seed: number;
  params: SnowflakeParams;
  tpl: SectorTemplate;
}

/**
 * The phase state machine. One crystal's life is one cycle (see CYCLE_PHASES):
 * - chaos: generate → chaos → dissolve → (seed + 1) generate → …
 * - zoom:  generate → zoomIn → infinite → zoomOut → fadeOut → transition → …
 *
 * It only advances time; `frame()` is a pure function of (seed, phase,
 * elapsed, options), which keeps every frame reproducible.
 */
export class Timeline {
  seed: number;
  phaseIndex = 0;
  elapsed = 0;
  readonly config: AnimationConfig;
  private cache: SeedCache[] = [];

  constructor(seed: number, config: AnimationConfig = DEFAULT_CONFIG) {
    this.seed = seed;
    this.config = config;
  }

  get phases(): readonly Phase[] {
    return CYCLE_PHASES[this.config.cycle];
  }

  get phase(): Phase {
    return this.phases[this.phaseIndex]!;
  }

  /** Advance by dt seconds, rolling over phases (and seeds) as needed. */
  update(dt: number): void {
    this.elapsed += Math.max(0, dt);
    for (;;) {
      const duration = phaseDuration(this.config, this.phase);
      if (this.elapsed < duration) return;
      this.elapsed -= duration;
      this.phaseIndex = (this.phaseIndex + 1) % this.phases.length;
      if (this.phaseIndex === 0) this.seed += 1;
    }
  }

  /** Jump straight to the start of `seed`'s generation phase. */
  jumpTo(seed: number): void {
    this.seed = seed;
    this.phaseIndex = 0;
    this.elapsed = 0;
  }

  private entry(seed: number): SeedCache {
    let hit = this.cache.find((c) => c.seed === seed);
    if (!hit) {
      const params = seedToParams(seed);
      hit = { seed, params, tpl: buildSectorTemplate(params) };
      this.cache = [hit, ...this.cache].slice(0, 4);
    }
    return hit;
  }

  frame(opts: FrameOptions): FrameState {
    const { params, tpl } = this.entry(this.seed);
    const cfg = this.config;
    const phase = this.phase;
    const progress = Math.min(1, this.elapsed / phaseDuration(cfg, phase));
    const e = EASINGS[cfg[phase].easing](progress);
    const plan = planZoom(params, tpl, opts.viewRadius);

    const dk = Math.min(params.kochDepth, opts.maxBaseDepth);
    const ds = Math.min(params.sierpinskiDepth, opts.maxBaseDepth);
    const depthsAt = (zoom: number): Depths => ({
      koch: depthForZoom(dk, zoom, tpl.koch.scale),
      sierpinski: depthForZoom(ds, zoom, SIERPINSKI_SCALE),
    });
    const floor = cfg.fadeOut.floor;
    const overview: CameraState = { cx: 0, cy: 0, zoom: 1 };
    const single = (depths: Depths, alpha: number, growth = 1): Layer[] => [
      { params, depths, growth, alpha },
    ];
    // While growing, recursion deepens together with the arms, so corners
    // multiply as the crystal spreads (see fractal/growth.ts).
    const grown = (growth: number): Depths => {
      const s = armProgress(growth);
      return { koch: dk * s, sierpinski: ds * s };
    };

    let layers: Layer[];
    let camera = overview;
    // Chaos at its peak: what `dissolve` starts from.
    const chaotic = (c: number): Pick<Layer, 'params' | 'depths'> => ({
      params: chaosParams(params, c),
      depths: { koch: dk + CHAOS_EXTRA_DEPTH * c, sierpinski: ds + CHAOS_EXTRA_DEPTH * c },
    });

    switch (phase) {
      case 'generate': {
        // In the zoom cycle the previous crystal hands over a dim dot; after a
        // dissolve there is nothing left, so the new dot fades in from zero.
        const alpha = cfg.cycle === 'zoom' ? floor + (1 - floor) * e : Math.min(1, progress / 0.15);
        layers = single(grown(e), alpha, e);
        break;
      }
      case 'chaos':
        layers = [{ ...chaotic(e), growth: 1, alpha: 1 }];
        break;
      case 'dissolve':
        // Spread out, blur and vanish.
        camera = { cx: 0, cy: 0, zoom: 1 + cfg.dissolve.spread * e };
        layers = [{ ...chaotic(1), growth: 1, alpha: 1 - e, blur: cfg.dissolve.blurPx * e }];
        break;
      case 'zoomIn':
      case 'zoomOut':
        camera = zoomPath(plan, phase === 'zoomIn' ? e : 1 - e);
        layers = single(depthsAt(camera.zoom), 1);
        break;
      case 'infinite': {
        const zoom = loopZoom(plan, cfg.infinite.cycles * e);
        camera = { cx: plan.x, cy: plan.y, zoom };
        layers = single(depthsAt(zoom), 1);
        break;
      }
      case 'fadeOut':
        // Growth in reverse: the crystal melts back into a dot.
        layers = single(grown(1 - e), 1 - (1 - floor) * e, 1 - e);
        break;
      case 'transition': {
        const next = this.entry(this.seed + 1).params;
        layers = transitionLayers(
          params,
          next,
          e,
          cfg.transition.mode,
          { koch: 0, sierpinski: 0 },
          floor,
          0,
        );
        break;
      }
    }

    return { seed: this.seed, cycle: cfg.cycle, phase, progress, layers, camera, plan };
  }
}
