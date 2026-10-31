import { parseColor, parseGradients, type Rgba } from "./model.ts";
import type { PaintSpec } from "./paint.ts";

export type SceneKnot = { linked: boolean; points: number[] };

export type ScenePath = {
  open: boolean;
  knots: SceneKnot[];
};

export type SceneFill =
  | { type: "color"; color: Rgba }
  | { type: "linear" | "radial"; angle: number; stops: { color: Rgba; offset: number }[] };

export type SceneStroke = {
  color: Rgba;
  width: number;
  dash: number[];
};

export type SceneShape = {
  origin: "rect" | "round" | "ellipse" | "path";
  radii: [number, number, number, number];
  fill: SceneFill | null;
  stroke: SceneStroke | null;
  paths?: ScenePath[];
};

const KAPPA = 0.5522847498307936;

function knot(ix: number, iy: number, x: number, y: number, ox: number, oy: number, linked = true): SceneKnot {
  return { linked, points: [ix, iy, x, y, ox, oy] };
}

function clampRadii(radii: [number, number, number, number], w: number, h: number): [number, number, number, number] {
  const limit = Math.max(0, Math.min(w, h) / 2);
  return radii.map((radius) => Math.max(0, Math.min(radius, limit))) as [number, number, number, number];
}

export function roundRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radii: [number, number, number, number],
): ScenePath {
  const [tl, tr, br, bl] = clampRadii(radii, w, h);
  const right = x + w;
  const bottom = y + h;
  if (tl + tr + br + bl < 0.5) {
    return {
      open: false,
      knots: [knot(x, y, x, y, x, y, false), knot(right, y, right, y, right, y, false), knot(right, bottom, right, bottom, right, bottom, false), knot(x, bottom, x, bottom, x, bottom, false)],
    };
  }
  return {
    open: false,
    knots: [
      knot(x + tl - tl * KAPPA, y, x + tl, y, x + tl, y, tl > 0),
      knot(right - tr, y, right - tr, y, right - tr + tr * KAPPA, y, tr > 0),
      knot(right, y + tr - tr * KAPPA, right, y + tr, right, y + tr, tr > 0),
      knot(right, bottom - br, right, bottom - br, right, bottom - br + br * KAPPA, br > 0),
      knot(right - br + br * KAPPA, bottom, right - br, bottom, right - br, bottom, br > 0),
      knot(x + bl, bottom, x + bl, bottom, x + bl - bl * KAPPA, bottom, bl > 0),
      knot(x, bottom - bl + bl * KAPPA, x, bottom - bl, x, bottom - bl, bl > 0),
      knot(x, y + tl, x, y + tl, x, y + tl - tl * KAPPA, tl > 0),
    ],
  };
}

export function ellipsePath(x: number, y: number, w: number, h: number): ScenePath {
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return {
    open: false,
    knots: [
      knot(cx - kx, y, cx, y, cx + kx, y),
      knot(x + w, cy - ky, x + w, cy, x + w, cy + ky),
      knot(cx + kx, y + h, cx, y + h, cx - kx, y + h),
      knot(x, cy + ky, x, cy, x, cy - ky),
    ],
  };
}

export function pathsForShape(shape: SceneShape, box: { x: number; y: number; w: number; h: number }): ScenePath[] {
  if (shape.origin === "path" && shape.paths?.length) return shape.paths;
  if (shape.origin === "ellipse") return [ellipsePath(box.x, box.y, box.w, box.h)];
  return [roundRectPath(box.x, box.y, box.w, box.h, shape.radii)];
}

export function shapeFromPaint(spec: PaintSpec, _unevenBorder = false): SceneShape | null {
  if (spec.width < 0.5 || spec.height < 0.5) return null;
  if (/url\(|repeating-|conic-gradient/i.test(spec.backgroundImage)) return null;
  const gradients = parseGradients(spec.backgroundImage);
  if (gradients.length > 1) return null;
  const bg = parseColor(spec.backgroundColor);
  const gradient = gradients[0];
  if (gradient && bg && bg.a > 0.004) return null;
  const amount = Math.max(spec.border.top, spec.border.right, spec.border.bottom, spec.border.left);
  const strokeOn = amount > 0.4 && spec.border.style !== "none" && spec.border.style !== "hidden";
  if (strokeOn && (spec.border.style === "double" || spec.border.style === "groove" || spec.border.style === "ridge" || spec.border.style === "inset" || spec.border.style === "outset")) {
    return null;
  }
  const strokeColor = strokeOn ? parseColor(spec.border.color) : null;
  if (strokeOn && !strokeColor) return null;
  if (!gradient && !(bg && bg.a > 0.004) && !strokeOn) return null;
  const radii = clampRadii(spec.radii, spec.width, spec.height);
  const ellipse = radii.every((radius) => radius >= spec.width / 2 - 0.6 && radius >= spec.height / 2 - 0.6);
  const round = !ellipse && radii.some((radius) => radius > 0.5);
  const dash =
    spec.border.style === "dashed" ? [amount * 2.2, amount * 1.4] : spec.border.style === "dotted" ? [amount * 0.4, amount * 1.2] : [];
  return {
    origin: ellipse ? "ellipse" : round ? "round" : "rect",
    radii,
    fill: gradient
      ? { type: gradient.kind, angle: gradient.angle, stops: gradient.stops.map((stop) => ({ color: stop.color, offset: stop.offset })) }
      : bg && bg.a > 0.004
        ? { type: "color", color: bg }
        : null,
    stroke: strokeColor ? { color: strokeColor, width: amount, dash } : null,
  };
}

export function solidShape(
  box: { w: number; h: number },
  radii: [number, number, number, number],
  color: Rgba,
): SceneShape {
  const clamped = clampRadii(radii, box.w, box.h);
  const ellipse = clamped.every((radius) => radius >= box.w / 2 - 0.6 && radius >= box.h / 2 - 0.6);
  return {
    origin: ellipse ? "ellipse" : clamped.some((radius) => radius > 0.5) ? "round" : "rect",
    radii: clamped,
    fill: { type: "color", color },
    stroke: null,
  };
}

function tokens(d: string): string[] {
  return d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
}

function reflect(anchor: number, control: number) {
  return 2 * anchor - control;
}

export function parseSvgPath(d: string): ScenePath[] | null {
  const parts = tokens(d);
  if (!parts.length) return null;
  const paths: ScenePath[] = [];
  let knots: SceneKnot[] = [];
  let open = true;
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevX = 0;
  let prevY = 0;
  let cmd = "";
  const read = () => Number(parts[i++]);
  const push = (path: ScenePath) => {
    if (path.knots.length) paths.push(path);
  };
  const curve = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    const last = knots[knots.length - 1];
    if (last) {
      last.points[4] = x1;
      last.points[5] = y1;
    }
    knots.push(knot(x2, y2, x, y, x, y));
    prevX = x2;
    prevY = y2;
    cx = x;
    cy = y;
  };
  while (i < parts.length) {
    if (/[a-zA-Z]/.test(parts[i])) cmd = parts[i++];
    if (!cmd) return null;
    const rel = cmd === cmd.toLowerCase();
    const op = cmd.toUpperCase();
    if (op === "M") {
      if (knots.length) push({ open, knots });
      knots = [];
      open = true;
      cx = (rel ? cx : 0) + read();
      cy = (rel ? cy : 0) + read();
      sx = cx;
      sy = cy;
      knots.push(knot(cx, cy, cx, cy, cx, cy, false));
      prevX = cx;
      prevY = cy;
      cmd = rel ? "l" : "L";
      continue;
    }
    if (op === "Z") {
      open = false;
      if (knots.length) {
        const first = knots[0];
        const last = knots[knots.length - 1];
        last.points[4] = last.points[2];
        last.points[5] = last.points[3];
        first.points[0] = first.points[2];
        first.points[1] = first.points[3];
        if (Math.hypot(last.points[2] - first.points[2], last.points[3] - first.points[3]) > 0.01) {
          knots.push(knot(sx, sy, sx, sy, sx, sy, false));
        }
      }
      cx = sx;
      cy = sy;
      push({ open, knots });
      knots = [];
      open = true;
      continue;
    }
    if (op === "L") {
      const x = (rel ? cx : 0) + read();
      const y = (rel ? cy : 0) + read();
      knots.push(knot(x, y, x, y, x, y, false));
      cx = x;
      cy = y;
      prevX = x;
      prevY = y;
      continue;
    }
    if (op === "H") {
      const x = (rel ? cx : 0) + read();
      knots.push(knot(x, cy, x, cy, x, cy, false));
      cx = x;
      prevX = x;
      prevY = cy;
      continue;
    }
    if (op === "V") {
      const y = (rel ? cy : 0) + read();
      knots.push(knot(cx, y, cx, y, cx, y, false));
      cy = y;
      prevX = cx;
      prevY = y;
      continue;
    }
    if (op === "C") {
      const x1 = (rel ? cx : 0) + read();
      const y1 = (rel ? cy : 0) + read();
      const x2 = (rel ? cx : 0) + read();
      const y2 = (rel ? cy : 0) + read();
      const x = (rel ? cx : 0) + read();
      const y = (rel ? cy : 0) + read();
      curve(x1, y1, x2, y2, x, y);
      continue;
    }
    if (op === "S") {
      const x2 = (rel ? cx : 0) + read();
      const y2 = (rel ? cy : 0) + read();
      const x = (rel ? cx : 0) + read();
      const y = (rel ? cy : 0) + read();
      curve(reflect(cx, prevX), reflect(cy, prevY), x2, y2, x, y);
      continue;
    }
    if (op === "Q") {
      const c1x = (rel ? cx : 0) + read();
      const c1y = (rel ? cy : 0) + read();
      const x = (rel ? cx : 0) + read();
      const y = (rel ? cy : 0) + read();
      curve(cx + (2 / 3) * (c1x - cx), cy + (2 / 3) * (c1y - cy), x + (2 / 3) * (c1x - x), y + (2 / 3) * (c1y - y), x, y);
      continue;
    }
    return null;
  }
  if (knots.length) push({ open, knots });
  return paths.length ? paths : null;
}

export function polygonPath(points: { x: number; y: number }[], open: boolean): ScenePath | null {
  if (points.length < (open ? 2 : 3)) return null;
  return {
    open,
    knots: points.map((point) => knot(point.x, point.y, point.x, point.y, point.x, point.y, false)),
  };
}

export function clipPolygon(clip: string, box: { x: number; y: number; w: number; h: number }): ScenePath | null {
  const match = clip.trim().match(/^polygon\((.*)\)$/i);
  if (!match) return null;
  const bits = match[1].split(",").map((part) => part.trim()).filter(Boolean);
  const points = bits.map((bit) => {
    const pair = bit.split(/\s+/);
    if (pair.length < 2) return null;
    const axis = (raw: string, size: number, origin: number) => {
      if (raw.endsWith("%")) return origin + (parseFloat(raw) / 100) * size;
      return origin + parseFloat(raw);
    };
    const x = axis(pair[0], box.w, box.x);
    const y = axis(pair[1], box.h, box.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  });
  if (points.some((point) => !point)) return null;
  return polygonPath(points as { x: number; y: number }[], false);
}
