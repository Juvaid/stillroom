import { parseColor, parseGradients, type Gradient, type Rgba } from "./model.ts";

export type PaintSpec = {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImage: string;
  border: {
    top: number;
    right: number;
    bottom: number;
    left: number;
    color: string;
    style: string;
  };
  radii: [number, number, number, number];
};

export function rgbaCss(color: Rgba): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

export function visiblePaint(spec: PaintSpec): boolean {
  const bg = parseColor(spec.backgroundColor);
  if (bg && bg.a > 0.004) return true;
  if (parseGradients(spec.backgroundImage).length > 0) return true;
  return spec.border.top + spec.border.right + spec.border.bottom + spec.border.left > 0.4;
}

function clampRadius(radii: [number, number, number, number], w: number, h: number) {
  const limit = Math.max(0, Math.min(w, h) / 2);
  return radii.map((radius) => Math.max(0, Math.min(radius, limit))) as [number, number, number, number];
}

export function traceRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: [number, number, number, number],
) {
  const [tl, tr, br, bl] = clampRadius(radii, w, h);
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.arcTo(x + w, y, x + w, y + h, tr);
  ctx.arcTo(x + w, y + h, x, y + h, br);
  ctx.arcTo(x, y + h, x, y, bl);
  ctx.arcTo(x, y, x + w, y, tl);
  ctx.closePath();
}

function fillGradient(ctx: CanvasRenderingContext2D, gradient: Gradient, w: number, h: number) {
  let brush: CanvasGradient;
  if (gradient.kind === "radial") {
    brush = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
  } else {
    const rad = ((gradient.angle - 90) * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const half = Math.abs((w / 2) * dx) + Math.abs((h / 2) * dy);
    brush = ctx.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half);
  }
  const stops = gradient.stops.length ? gradient.stops : [];
  stops.forEach((stop, index) => {
    const offset = Number.isFinite(stop.offset) ? stop.offset : index / Math.max(1, stops.length - 1);
    brush.addColorStop(Math.min(1, Math.max(0, offset)), rgbaCss(stop.color));
  });
  ctx.fillStyle = brush;
  ctx.fillRect(0, 0, w, h);
}

export function paintBox(doc: Document, spec: PaintSpec): HTMLCanvasElement | null {
  if (!visiblePaint(spec) || spec.width < 0.5 || spec.height < 0.5) return null;
  const width = Math.max(1, Math.round(spec.width));
  const height = Math.max(1, Math.round(spec.height));
  const canvas = doc.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  traceRound(ctx, 0, 0, width, height, spec.radii);
  ctx.clip();
  const bg = parseColor(spec.backgroundColor);
  if (bg && bg.a > 0) {
    ctx.fillStyle = rgbaCss(bg);
    ctx.fillRect(0, 0, width, height);
  }
  const gradients = parseGradients(spec.backgroundImage);
  for (let i = gradients.length - 1; i >= 0; i -= 1) fillGradient(ctx, gradients[i], width, height);

  const border = spec.border;
  const amount = Math.max(border.top, border.right, border.bottom, border.left);
  if (amount > 0 && border.style !== "none" && border.style !== "hidden") {
    ctx.save();
    const inset = amount / 2;
    traceRound(
      ctx,
      inset,
      inset,
      Math.max(0, width - amount),
      Math.max(0, height - amount),
      spec.radii.map((radius) => Math.max(0, radius - inset)) as [number, number, number, number],
    );
    ctx.strokeStyle = border.color;
    ctx.lineWidth = amount;
    if (border.style === "dashed") ctx.setLineDash([amount * 2.2, amount * 1.4]);
    if (border.style === "dotted") ctx.setLineDash([amount * 0.4, amount * 1.2]);
    ctx.stroke();
    ctx.restore();
  }
  return canvas;
}

export function paintSolid(
  doc: Document,
  width: number,
  height: number,
  radii: [number, number, number, number],
): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#000";
  traceRound(ctx, 0, 0, canvas.width, canvas.height, radii);
  ctx.fill();
  return canvas;
}

export function paintMask(
  doc: Document,
  width: number,
  height: number,
  radii: [number, number, number, number],
): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#fff";
  traceRound(ctx, 0, 0, canvas.width, canvas.height, radii);
  ctx.fill();
  return canvas;
}

type ClippedText = {
  value: string;
  cssFont: string;
  fontSize: number;
  leading: number;
  tracking: number;
  align: "left" | "center" | "right";
  anchorX: number;
  baseline: number;
  underline: boolean;
  strike: boolean;
};

/** Gradient (or any background) clipped to the glyphs, the way background-clip: text paints. */
export function paintClippedText(
  doc: Document,
  width: number,
  height: number,
  backgroundColor: string,
  backgroundImage: string,
  text: ClippedText,
  originX: number,
  originY: number,
  pad: { top: number; right: number; bottom: number; left: number },
): HTMLCanvasElement | null {
  if (width < 0.5 || height < 0.5 || !text.value.trim()) return null;
  const canvas = doc.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const innerW = Math.max(1, canvas.width - pad.left - pad.right);
  const innerH = Math.max(1, canvas.height - pad.top - pad.bottom);
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, innerW, innerH);
  ctx.clip();
  const bg = parseColor(backgroundColor);
  if (bg && bg.a > 0) {
    ctx.fillStyle = rgbaCss(bg);
    ctx.fillRect(pad.left, pad.top, innerW, innerH);
  }
  const gradients = parseGradients(backgroundImage);
  for (let i = gradients.length - 1; i >= 0; i -= 1) {
    ctx.save();
    ctx.translate(pad.left, pad.top);
    fillGradient(ctx, gradients[i], innerW, innerH);
    ctx.restore();
  }
  ctx.restore();

  const mask = doc.createElement("canvas");
  mask.width = canvas.width;
  mask.height = canvas.height;
  const maskCtx = mask.getContext("2d");
  if (!maskCtx) return null;
  maskCtx.font = text.cssFont;
  maskCtx.fillStyle = "#000";
  maskCtx.textAlign = text.align;
  maskCtx.textBaseline = "alphabetic";
  if ("letterSpacing" in maskCtx) {
    maskCtx.letterSpacing = `${(text.tracking / 1000) * text.fontSize}px`;
  }
  const thickness = Math.max(1, Math.round(text.fontSize / 12));
  for (const [index, line] of text.value.split("\n").entries()) {
    const x = text.anchorX - originX;
    const y = text.baseline - originY + index * text.leading;
    maskCtx.fillText(line, x, y);
    if (!text.underline && !text.strike) continue;
    const measured = maskCtx.measureText(line).width;
    let left = x;
    if (text.align === "center") left -= measured / 2;
    else if (text.align === "right") left -= measured;
    if (text.underline) maskCtx.fillRect(left, y + Math.round(text.fontSize * 0.15), measured, thickness);
    if (text.strike) maskCtx.fillRect(left, y - Math.round(text.fontSize * 0.3), measured, thickness);
  }
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0);
  return canvas;
}
