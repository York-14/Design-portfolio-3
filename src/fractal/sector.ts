import type { SnowflakeParams } from '../seed/params';
import type { Flat } from './geometry';
import { kochTemplate, type KochTemplate } from './koch';

const COS30 = Math.cos(Math.PI / 6);
const TAN30 = Math.tan(Math.PI / 6);

/** An open polyline whose flagged segments receive the Koch construction. */
export interface KochPath {
  points: Flat;
  koch: boolean[];
}

export type Triangle = [number, number, number, number, number, number];

/**
 * Everything that lives in the fundamental 1/12 sector (0° ≤ angle ≤ 30°).
 *
 * - `mainHalf` and `hexHalf` start/end on the mirror axis; mirroring closes them.
 * - `sides` are closed side-branch polygons strictly inside the sector.
 * - Gasket triangles are themselves mirror-symmetric about the x-axis, so they
 *   only need the six rotations.
 */
export interface SectorTemplate {
  mainHalf: KochPath;
  hexHalf: KochPath;
  sides: KochPath[];
  hexGasket: Triangle | null;
  branchGaskets: Triangle[];
  koch: KochTemplate;
  /** Tip of the main branch: a self-similar fixed point of the Koch outline. */
  tip: { x: number; y: number };
  /** Length of the single Koch segment that ends at the tip. */
  tipSegmentLength: number;
  /** Upper bound of |p| over the snowflake at this growth. */
  radius: number;
  /** Arm growth the template was built for: 0 = bare hexagon, 1 = full size. */
  arms: number;
}

/** Split segment A→B into equal pieces of roughly `grain` length (at least one). */
function subdivide(out: KochPath, bx: number, by: number, grain: number, koch: boolean): void {
  const ax = out.points[out.points.length - 2]!;
  const ay = out.points[out.points.length - 1]!;
  const pieces = Math.max(1, Math.min(10, Math.round(Math.hypot(bx - ax, by - ay) / grain)));
  for (let i = 1; i <= pieces; i++) {
    out.points.push(ax + ((bx - ax) * i) / pieces, ay + ((by - ay) * i) / pieces);
    out.koch.push(koch);
  }
}

function startPath(x: number, y: number): KochPath {
  return { points: [x, y], koch: [] };
}

/**
 * Build the fundamental sector.
 *
 * @param arms Arm growth in [0, 1]. Everything outside the central hexagon
 *   (branches, side branches, branch gaskets) is scaled by `arms` about the
 *   main branch's root on the hexagon edge, so arms sprout from a point and
 *   grow out as a whole — keeping their proportions and Koch detail.
 */
export function buildSectorTemplate(p: SnowflakeParams, arms = 1): SectorTemplate {
  const koch = kochTemplate(p.kochRatio, p.kochAngle);
  const w = p.mainWidth;
  const c = p.hexRadius;
  const L = p.mainLength;
  const grain = p.kochGrain * w;

  // Central hexagon: vertices at 30° + k·60°, edge midpoint on the x-axis.
  const hexHalf = startPath(c * COS30, 0);
  subdivide(hexHalf, c * COS30, c / 2, grain, true);

  // Main branch half outline: base on the hexagon edge → shoulder → tip.
  const r0 = c * COS30 * 0.98;
  const shoulderX = L * (1 - p.tipLength);
  const shoulderY = w * 0.8;
  const mainHalf = startPath(r0, 0);
  mainHalf.points.push(r0, w);
  mainHalf.koch.push(false);
  subdivide(mainHalf, shoulderX, shoulderY, grain, true);
  mainHalf.points.push(L, 0);
  mainHalf.koch.push(true);

  const halfWidthAt = (x: number) => w + ((shoulderY - w) * (x - r0)) / (shoulderX - r0);

  // Side branches, shrinking outward like a dendrite.
  const sides: KochPath[] = [];
  const phi = (p.sideAngle * Math.PI) / 180;
  const ux = Math.cos(phi);
  const uy = Math.sin(phi);
  for (let i = 0; i < p.sideCount; i++) {
    const t = p.sideStart + (p.sideSpread * (i + 0.5)) / p.sideCount;
    const x = r0 + t * (shoulderX - r0);
    // Keep the branch tip inside the 30° wedge so neighbouring sectors never collide.
    const maxLen = (x * TAN30) / (Math.sin(phi) - TAN30 * Math.cos(phi));
    const len = Math.min(p.sideLength * L * (1 - (0.5 * i) / p.sideCount), maxLen * 0.92);
    const ws = halfWidthAt(x) * 0.7;
    if (len < 2 * ws) continue;
    const vx = -uy;
    const vy = ux;
    const side = startPath(x - vx * ws, -vy * ws);
    subdivide(
      side,
      x + ux * len * 0.82 - vx * ws * 0.6,
      uy * len * 0.82 - vy * ws * 0.6,
      grain,
      true,
    );
    side.points.push(x + ux * len, uy * len);
    side.koch.push(true);
    side.points.push(x + ux * len * 0.82 + vx * ws * 0.6, uy * len * 0.82 + vy * ws * 0.6);
    side.koch.push(true);
    subdivide(side, x + vx * ws, vy * ws, grain, true);
    side.points.push(x - vx * ws, -vy * ws);
    side.koch.push(false);
    sides.push(side);
  }

  const showHex = p.sierpinskiPattern === 'hexagon' || p.sierpinskiPattern === 'both';
  const showBranch = p.sierpinskiPattern === 'branch' || p.sierpinskiPattern === 'both';

  const hexGasket: Triangle | null = showHex ? [0, 0, c * COS30, -c / 2, c * COS30, c / 2] : null;

  // Outward-pointing triangles inscribed in the main branch.
  const branchGaskets: Triangle[] = [];
  if (showBranch) {
    for (const t of [0.12, 0.58]) {
      const x = r0 + t * (shoulderX - r0);
      const h = Math.min(halfWidthAt(x), halfWidthAt(x + w * 2)) * 0.85;
      branchGaskets.push([x, -h, x + Math.sqrt(3) * h, 0, x, h]);
    }
  }

  const tipSegmentLength = Math.hypot(L - shoulderX, shoulderY);
  const radius = L + koch.bound * tipSegmentLength + 0.05;

  // Grow the arms out of the hexagon edge: (x, y) ↦ (r0 + s(x − r0), s·y).
  const s = Math.min(1, Math.max(0, arms));
  const grow = (pts: number[]) => {
    for (let i = 0; i < pts.length; i += 2) {
      pts[i] = r0 + s * (pts[i]! - r0);
      pts[i + 1] = s * pts[i + 1]!;
    }
  };
  if (s < 1) {
    grow(mainHalf.points);
    for (const side of sides) grow(side.points);
    for (const tri of branchGaskets) grow(tri);
  }

  return {
    mainHalf,
    hexHalf,
    sides,
    hexGasket,
    branchGaskets,
    koch,
    tip: { x: r0 + s * (L - r0), y: 0 },
    tipSegmentLength: s * tipSegmentLength,
    radius: Math.max(c + koch.bound * grain, r0 + s * (radius - r0)),
    arms: s,
  };
}
