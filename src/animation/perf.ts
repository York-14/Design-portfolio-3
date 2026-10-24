/**
 * Frame-time governor.
 *
 * Geometry cost is controlled by two knobs: the minimum on-screen segment
 * length below which recursion stops (LOD), and a cap on the overview
 * recursion depth. When frames run over budget the governor coarsens LOD
 * first, then drops the glow pass and lowers the depth cap; when there is
 * headroom it walks back the other way. Hysteresis keeps it from oscillating.
 *
 * Two signals are watched: the CPU time spent building and issuing a frame,
 * and the interval between animation frames. Canvas2D rasterises
 * asynchronously on the GPU, so a GPU-bound page shows up only in the latter.
 */
export interface Quality {
  minSegmentPx: number;
  maxBaseDepth: number;
  glow: boolean;
}

export interface GovernorOptions {
  /** CPU budget per frame in ms (60 fps ≈ 16.7 ms; leave room for the browser). */
  budgetMs: number;
  /** Frame interval above which the page counts as too slow (20 ms ≈ 50 fps). */
  maxIntervalMs: number;
  /** Frames between adjustments. */
  window: number;
  minSegmentPx: [min: number, max: number];
  maxBaseDepth: [min: number, max: number];
}

export const DEFAULT_GOVERNOR: GovernorOptions = {
  budgetMs: 12,
  maxIntervalMs: 20,
  window: 20,
  minSegmentPx: [2, 8],
  maxBaseDepth: [2, 6],
};

export class PerformanceGovernor {
  readonly quality: Quality;
  private avg = 0;
  private avgInterval = 0;
  private frames = 0;
  private readonly opts: GovernorOptions;

  constructor(opts: GovernorOptions = DEFAULT_GOVERNOR) {
    this.opts = opts;
    this.quality = {
      minSegmentPx: opts.minSegmentPx[0],
      maxBaseDepth: opts.maxBaseDepth[1],
      glow: true,
    };
  }

  /** Smoothed frame cost in ms. */
  get averageMs(): number {
    return this.avg;
  }

  /**
   * Report the last frame's CPU cost and the time since the previous frame
   * (omit it when unknown). Returns true if the quality settings changed.
   */
  record(ms: number, intervalMs = 0): boolean {
    const first = this.avg === 0 && this.avgInterval === 0;
    this.avg = first ? ms : this.avg * 0.9 + ms * 0.1;
    this.avgInterval = first ? intervalMs : this.avgInterval * 0.9 + intervalMs * 0.1;
    this.frames += 1;
    if (this.frames < this.opts.window) return false;
    this.frames = 0;

    const q = this.quality;
    const [segMin, segMax] = this.opts.minSegmentPx;
    const [depthMin, depthMax] = this.opts.maxBaseDepth;

    const slow = this.avg > this.opts.budgetMs || this.avgInterval > this.opts.maxIntervalMs;
    const fast =
      this.avg < this.opts.budgetMs * 0.45 && this.avgInterval < this.opts.maxIntervalMs * 0.9;

    if (slow) {
      if (q.minSegmentPx < segMax) q.minSegmentPx = Math.min(segMax, q.minSegmentPx * 1.35);
      else if (q.glow) q.glow = false;
      else if (q.maxBaseDepth > depthMin) q.maxBaseDepth -= 1;
      else return false;
      return true;
    }
    if (fast) {
      if (q.maxBaseDepth < depthMax) q.maxBaseDepth += 1;
      else if (!q.glow) q.glow = true;
      else if (q.minSegmentPx > segMin) q.minSegmentPx = Math.max(segMin, q.minSegmentPx / 1.35);
      else return false;
      return true;
    }
    return false;
  }
}
