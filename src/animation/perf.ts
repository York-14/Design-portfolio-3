/**
 * Frame-time governor.
 *
 * Geometry cost is controlled by two knobs: the minimum on-screen segment
 * length below which recursion stops (LOD), and a cap on the overview
 * recursion depth. When frames run over budget the governor coarsens LOD
 * first, then lowers the depth cap and drops the glow pass; when there is
 * headroom it walks back the other way. Hysteresis keeps it from oscillating.
 */
export interface Quality {
  minSegmentPx: number;
  maxBaseDepth: number;
  glow: boolean;
}

export interface GovernorOptions {
  /** Target frame budget in ms (60 fps ≈ 16.7 ms; leave room for the browser). */
  budgetMs: number;
  /** Frames between adjustments. */
  window: number;
  minSegmentPx: [min: number, max: number];
  maxBaseDepth: [min: number, max: number];
}

export const DEFAULT_GOVERNOR: GovernorOptions = {
  budgetMs: 12,
  window: 20,
  minSegmentPx: [1.5, 8],
  maxBaseDepth: [2, 6],
};

export class PerformanceGovernor {
  readonly quality: Quality;
  private avg = 0;
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

  /** Report how long the last frame took to build and draw. Returns true if quality changed. */
  record(ms: number): boolean {
    this.avg = this.frames === 0 && this.avg === 0 ? ms : this.avg * 0.9 + ms * 0.1;
    this.frames += 1;
    if (this.frames < this.opts.window) return false;
    this.frames = 0;

    const q = this.quality;
    const [segMin, segMax] = this.opts.minSegmentPx;
    const [depthMin, depthMax] = this.opts.maxBaseDepth;

    if (this.avg > this.opts.budgetMs) {
      if (q.minSegmentPx < segMax) q.minSegmentPx = Math.min(segMax, q.minSegmentPx * 1.35);
      else if (q.glow) q.glow = false;
      else if (q.maxBaseDepth > depthMin) q.maxBaseDepth -= 1;
      else return false;
      return true;
    }
    if (this.avg < this.opts.budgetMs * 0.45) {
      if (q.maxBaseDepth < depthMax) q.maxBaseDepth += 1;
      else if (!q.glow) q.glow = true;
      else if (q.minSegmentPx > segMin) q.minSegmentPx = Math.max(segMin, q.minSegmentPx / 1.35);
      else return false;
      return true;
    }
    return false;
  }
}
