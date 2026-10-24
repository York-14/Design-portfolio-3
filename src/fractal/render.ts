import type { Flat } from './geometry';
import type { SnowflakeShapes } from './snowflake';

/** World → device-pixel mapping. World y points up; canvas y points down. */
export interface Camera {
  /** World point shown at the centre of the canvas. */
  cx: number;
  cy: number;
  /** Device pixels per world unit. */
  scale: number;
  width: number;
  height: number;
}

export interface SnowflakeStyle {
  hue: number;
  saturation: number;
  lightness: number;
  /** Stroke width in device pixels. */
  lineWidth: number;
}

function tracePath(ctx: CanvasRenderingContext2D, poly: Flat, cam: Camera): void {
  const ox = cam.width / 2 - cam.cx * cam.scale;
  const oy = cam.height / 2 + cam.cy * cam.scale;
  const s = cam.scale;
  ctx.moveTo(ox + poly[0]! * s, oy - poly[1]! * s);
  for (let i = 2; i < poly.length; i += 2) ctx.lineTo(ox + poly[i]! * s, oy - poly[i + 1]! * s);
  ctx.closePath();
}

/**
 * Draw the snowflake into `ctx`, which should be a dedicated, cleared layer:
 * holes are punched out with `destination-out`, so anything already on the
 * layer would be cut as well.
 */
export function drawSnowflake(
  ctx: CanvasRenderingContext2D,
  shapes: SnowflakeShapes,
  style: SnowflakeStyle,
  cam: Camera,
): void {
  const { hue: h, saturation: s, lightness: l } = style;
  const centreX = cam.width / 2 - cam.cx * cam.scale;
  const centreY = cam.height / 2 + cam.cy * cam.scale;

  const fill = ctx.createRadialGradient(centreX, centreY, 0, centreX, centreY, cam.scale * 1.1 + 1);
  fill.addColorStop(0, `hsla(${h + 25}, ${s}%, ${Math.min(92, l + 12)}%, 0.55)`);
  fill.addColorStop(0.45, `hsla(${h}, ${s}%, ${l * 0.7}%, 0.38)`);
  fill.addColorStop(1, `hsla(${h - 20}, ${s}%, ${l * 0.5}%, 0.3)`);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 1. Fill all branches as one path: overlaps share the same translucent tint.
  ctx.beginPath();
  for (const poly of shapes.fills) tracePath(ctx, poly, cam);
  ctx.fillStyle = fill;
  ctx.fill('nonzero');

  ctx.strokeStyle = `hsl(${h}, ${s * 0.75}%, ${Math.min(94, l + 14)}%)`;
  ctx.lineWidth = style.lineWidth;
  ctx.stroke();

  // 2. Punch the Sierpiński holes through fill and stroke alike…
  if (shapes.holes.length > 0) {
    ctx.beginPath();
    for (const poly of shapes.holes) tracePath(ctx, poly, cam);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.fill('nonzero');

    // 3. …and outline them.
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `hsl(${h + 15}, ${s * 0.8}%, ${Math.min(94, l + 6)}%)`;
    ctx.lineWidth = style.lineWidth * 0.7;
    ctx.stroke();
  }
  ctx.restore();
}
