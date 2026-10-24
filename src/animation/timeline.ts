import type { SnowflakeParams } from '../seed/params';
import { seedToParams } from '../seed/seedToParams';
import { armProgress } from '../fractal/growth';
import { buildSectorTemplate, type SectorTemplate } from '../fractal/sector';
import { SIERPINSKI_SCALE } from '../fractal/sierpinski';
import type { Depths } from '../fractal/snowflake';
import { DEFAULT_CONFIG, PHASES, phaseDuration, type AnimationConfig, type Phase } from './config';
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
 * The phase state machine: generate → zoomIn → infinite → zoomOut → fadeOut
 * → transition → (seed + 1) generate → …
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

  get phase(): Phase {
    return PHASES[this.phaseIndex]!;
  }

  /** Advance by dt seconds, rolling over phases (and seeds) as needed. */
  update(dt: number): void {
    this.elapsed += Math.max(0, dt);
    for (;;) {
      const duration = phaseDuration(this.config, this.phase);
      if (this.elapsed < duration) return;
      this.elapsed -= duration;
      this.phaseIndex = (this.phaseIndex + 1) % PHASES.length;
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
    switch (phase) {
      case 'generate':
        layers = single(grown(e), floor + (1 - floor) * e, e);
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

    return { seed: this.seed, phase, progress, layers, camera, plan };
  }
}
