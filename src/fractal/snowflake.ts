import type { SnowflakeParams } from '../seed/params';
import {
  appendJoined,
  mapFlat,
  mapView,
  reversePoints,
  signedArea,
  transposeInverse,
  type Flat,
  type Mat2,
  type ViewCircle,
} from './geometry';
import { kochPolyline } from './koch';
import { buildSectorTemplate, type KochPath, type SectorTemplate, type Triangle } from './sector';
import { gasketHoles } from './sierpinski';
import { REFLECTIONS, ROTATIONS } from './symmetry';

export interface SnowflakeShapes {
  /** Closed counter-clockwise polygons to fill and stroke. */
  fills: Flat[];
  /** Closed polygons to cut out of the fills. */
  holes: Flat[];
}

export interface Depths {
  koch: number;
  sierpinski: number;
}

/**
 * Generate the whole snowflake from its 1/12 sector.
 *
 * Only the fundamental sector is ever constructed; the remaining eleven
 * copies are its images under D6. When a `view` is given, each copy is
 * refined only where it is visible: the view circle is pulled back into the
 * sector frame (g⁻¹ = gᵀ), so culling and LOD stay exact under symmetry.
 */
export function buildSnowflake(
  params: SnowflakeParams,
  depths: Depths,
  view?: ViewCircle,
  template: SectorTemplate = buildSectorTemplate(params),
): SnowflakeShapes {
  const tpl = template;

  // If the view circle swallows the whole snowflake, culling never fires and
  // one sector computation can be shared by all twelve copies.
  const culls = view !== undefined && Math.hypot(view.x, view.y) + tpl.radius > view.r;
  const cache = new Map<unknown, unknown>();
  const inSector = <T>(key: object, g: Mat2, make: (v?: ViewCircle) => T): T => {
    if (!view) return memo(cache, key, () => make(undefined));
    if (!culls) return memo(cache, key, () => make(view));
    return make(mapView(transposeInverse(g), view));
  };

  const kochOf = (path: KochPath, side: number) => (v?: ViewCircle) =>
    kochPolyline(path.points, path.koch, depths.koch, side, tpl.koch, v);

  const fills: Flat[] = [];
  const holes: Flat[] = [];

  // Main branches: half outline (bumps on the left, i.e. +y) + its mirror image.
  const mainKoch = kochOf(tpl.mainHalf, +1);
  for (let k = 0; k < 6; k++) {
    const rot = ROTATIONS[k]!;
    const ref = REFLECTIONS[k]!;
    const upper = mapFlat(rot, inSector(tpl.mainHalf, rot, mainKoch));
    const lower = mapFlat(ref, inSector(tpl.mainHalf, ref, mainKoch));
    const poly = upper.slice();
    appendJoined(poly, reversePoints(lower));
    fills.push(dropClosingPoint(poly));
  }

  // Central hexagon: 12 half-edges joined around the centre.
  const hexKoch = kochOf(tpl.hexHalf, -1);
  const hex: Flat = [];
  for (let k = 0; k < 6; k++) {
    const rot = ROTATIONS[k]!;
    const ref = REFLECTIONS[k]!;
    appendJoined(hex, reversePoints(mapFlat(ref, inSector(tpl.hexHalf, ref, hexKoch))));
    appendJoined(hex, mapFlat(rot, inSector(tpl.hexHalf, rot, hexKoch)));
  }
  fills.unshift(dropClosingPoint(hex));

  // Side branches: closed polygons, twelve copies each.
  for (const side of tpl.sides) {
    const outward = signedArea(side.points) > 0 ? -1 : +1;
    const sideKoch = kochOf(side, outward);
    for (const g of [...ROTATIONS, ...REFLECTIONS]) {
      fills.push(dropClosingPoint(mapFlat(g, inSector(side, g, sideKoch))));
    }
  }

  // Sierpiński gaskets: axial triangles, six rotations each.
  const gaskets: Triangle[] = [...(tpl.hexGasket ? [tpl.hexGasket] : []), ...tpl.branchGaskets];
  for (const tri of gaskets) {
    const make = (v?: ViewCircle) => {
      const out: Flat[] = [];
      gasketHoles(out, ...tri, depths.sierpinski, v);
      return out;
    };
    for (const rot of ROTATIONS) {
      for (const h of inSector(tri, rot, make)) holes.push(mapFlat(rot, h));
    }
  }

  // Reflections flip orientation. Normalise every fill to counter-clockwise so
  // overlapping branches add up under the non-zero fill rule instead of cancelling.
  for (let i = 0; i < fills.length; i++) {
    if (signedArea(fills[i]!) < 0) fills[i] = reversePoints(fills[i]!);
  }

  return { fills, holes };
}

function memo<T>(cache: Map<unknown, unknown>, key: unknown, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

function dropClosingPoint(poly: Flat): Flat {
  const n = poly.length;
  if (
    n >= 4 &&
    Math.abs(poly[0]! - poly[n - 2]!) < 1e-12 &&
    Math.abs(poly[1]! - poly[n - 1]!) < 1e-12
  ) {
    poly.length = n - 2;
  }
  return poly;
}
