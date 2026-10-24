import { DEFAULT_CONFIG, type AnimationConfig } from './animation/config';
import { PerformanceGovernor } from './animation/perf';
import { Timeline } from './animation/timeline';
import { drawSnowflake, type Camera } from './fractal/render';
import { buildSnowflake } from './fractal/snowflake';
import { Hud, formatSeed } from './ui/controls';
import { MAX_SEED, parseQuery, withSeed } from './ui/query';
import './style.css';

/** World radius that must fit on screen in the overview (snowflake + Koch bumps). */
const WORLD_RADIUS = 1.12;
/** Hard ceiling on recursion, independent of LOD, as a last line of defence. */
const DEPTH_CEILING = 18;

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const hudRoot = document.querySelector<HTMLElement>('#hud');
if (!canvas || !hudRoot) throw new Error('missing #stage or #hud');
const ctx = canvas.getContext('2d', { alpha: false });
const layer = document.createElement('canvas');
const layerCtx = layer.getContext('2d');
if (!ctx || !layerCtx) throw new Error('Canvas2D is not available');

const query = parseQuery(location.search);
const config: AnimationConfig = {
  ...DEFAULT_CONFIG,
  transition: { ...DEFAULT_CONFIG.transition, mode: query.transition },
};
const timeline = new Timeline(query.seed, config);
timeline.update(query.at);
const governor = new PerformanceGovernor();
let paused = query.paused;
let dpr = 1;
/** While paused, only redraw when something (seed, size) actually changed. */
let dirty = true;

const hud = new Hud(
  hudRoot,
  {
    prev: () => {
      timeline.jumpTo(Math.max(0, timeline.seed - 1));
      dirty = true;
    },
    next: () => {
      timeline.jumpTo(Math.min(MAX_SEED, timeline.seed + 1));
      dirty = true;
    },
    togglePause: () => {
      paused = !paused;
      hud.setPaused(paused);
    },
    save: savePng,
  },
  query.hud,
);
hud.setPaused(paused);

function resize(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  for (const c of [canvas!, layer]) {
    c.width = w;
    c.height = h;
  }
  dirty = true;
}

function drawBackground(c: CanvasRenderingContext2D, w: number, h: number): void {
  const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, '#0d1a3a');
  g.addColorStop(0.55, '#060c1f');
  g.addColorStop(1, '#010208');
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

let lastSeedInUrl = -1;

function render(intervalMs = 0): void {
  const start = performance.now();
  const w = canvas!.width;
  const h = canvas!.height;
  const baseScale = (Math.min(w, h) / 2) * (0.92 / WORLD_RADIUS);
  const viewRadius = Math.hypot(w, h) / 2 / baseScale;
  const quality = governor.quality;
  const frame = timeline.frame({ viewRadius, maxBaseDepth: quality.maxBaseDepth });

  drawBackground(ctx!, w, h);

  const scale = baseScale * frame.camera.zoom;
  const cam: Camera = { cx: frame.camera.cx, cy: frame.camera.cy, scale, width: w, height: h };
  const view = {
    x: cam.cx,
    y: cam.cy,
    r: viewRadius / frame.camera.zoom,
    lod: (quality.minSegmentPx * dpr) / scale,
  };

  for (const l of frame.layers) {
    if (l.alpha < 0.004) continue;
    const depths = {
      koch: Math.min(DEPTH_CEILING, l.depths.koch),
      sierpinski: Math.min(DEPTH_CEILING, l.depths.sierpinski),
    };
    const shapes = buildSnowflake(l.params, depths, { view, growth: l.growth });
    layerCtx!.clearRect(0, 0, w, h);
    drawSnowflake(
      layerCtx!,
      shapes,
      {
        hue: l.params.hue,
        saturation: l.params.saturation,
        lightness: l.params.lightness,
        lineWidth: l.params.lineWidth * dpr,
      },
      cam,
    );

    if (quality.glow) {
      ctx!.save();
      ctx!.filter = `blur(${(9 * dpr).toFixed(1)}px)`;
      ctx!.globalCompositeOperation = 'lighter';
      ctx!.globalAlpha = l.alpha * 0.75;
      ctx!.drawImage(layer, 0, 0);
      ctx!.restore();
    }
    ctx!.globalAlpha = l.alpha;
    ctx!.drawImage(layer, 0, 0);
    ctx!.globalAlpha = 1;
  }

  const frameMs = performance.now() - start;
  if (!paused) governor.record(frameMs, intervalMs);
  hud.update(frame, quality, governor.averageMs || frameMs);

  if (frame.seed !== lastSeedInUrl) {
    lastSeedInUrl = frame.seed;
    history.replaceState(null, '', withSeed(location.search, frame.seed));
    document.title = `Golden Angle Snowflakes ${formatSeed(frame.seed)}`;
  }
}

function savePng(): void {
  render();
  canvas!.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `snowflake-seed-${timeline.seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

let last = performance.now();
function tick(now: number): void {
  const intervalMs = now - last;
  last = now;
  if (!paused) timeline.update(Math.min(0.1, intervalMs / 1000));
  if (!paused || dirty) {
    // Long gaps (tab hidden, debugger) say nothing about rendering cost.
    render(intervalMs < 250 ? intervalMs : 0);
    dirty = false;
  }
  requestAnimationFrame(tick);
}

resize();
window.addEventListener('resize', resize);
requestAnimationFrame(tick);
