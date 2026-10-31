import { rgbaCss } from "./paint.ts";
import type { Scene, SceneLayer } from "./scene.ts";
import type { Shadow } from "./model.ts";

const COMPOSITE: Record<string, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  "color dodge": "color-dodge",
  "color burn": "color-burn",
  "hard light": "hard-light",
  "soft light": "soft-light",
  difference: "difference",
  exclusion: "exclusion",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
  "linear dodge": "lighter",
  "pass through": "source-over",
};

function compositeOf(mode: string): GlobalCompositeOperation {
  return COMPOSITE[mode] ?? "source-over";
}

function shadowPlate(doc: Document, source: HTMLCanvasElement, shadow: Shadow): HTMLCanvasElement {
  const pad = Math.ceil(shadow.blur * 2 + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + 4);
  const canvas = doc.createElement("canvas");
  canvas.width = source.width + pad * 2;
  canvas.height = source.height + pad * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.shadowColor = rgbaCss(shadow.color);
  ctx.shadowBlur = shadow.blur;
  ctx.shadowOffsetX = shadow.offsetX;
  ctx.shadowOffsetY = shadow.offsetY;
  ctx.drawImage(source, pad, pad);
  ctx.shadowColor = "transparent";
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(source, pad, pad);
  return canvas;
}

function drawShadows(
  ctx: CanvasRenderingContext2D,
  doc: Document,
  source: HTMLCanvasElement,
  left: number,
  top: number,
  shadows: Shadow[],
) {
  for (const shadow of shadows) {
    if (shadow.inset) continue;
    const plate = shadowPlate(doc, source, shadow);
    const pad = Math.ceil(shadow.blur * 2 + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + 4);
    ctx.drawImage(plate, left - pad, top - pad);
  }
}

function drawText(ctx: CanvasRenderingContext2D, layer: SceneLayer) {
  const text = layer.text;
  if (!text) return;
  ctx.save();
  ctx.font = text.cssFont;
  ctx.fillStyle = rgbaCss({ ...text.color, a: 1 });
  ctx.textAlign = text.align;
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) {
    ctx.letterSpacing = `${(text.tracking / 1000) * text.fontSize}px`;
  }
  const shadow = layer.shadows?.find((item) => !item.inset);
  if (shadow) {
    ctx.shadowColor = rgbaCss(shadow.color);
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }
  text.value.split("\n").forEach((line, index) => {
    ctx.fillText(line, text.anchorX, text.baseline + index * text.leading);
  });
  if (text.underline || text.strike) {
    ctx.shadowColor = "transparent";
    const thickness = Math.max(1, Math.round(text.fontSize / 12));
    text.value.split("\n").forEach((line, index) => {
      const measured = ctx.measureText(line).width;
      const y = text.baseline + index * text.leading;
      let x = text.anchorX;
      if (text.align === "center") x -= measured / 2;
      else if (text.align === "right") x -= measured;
      if (text.underline) ctx.fillRect(x, y + Math.round(text.fontSize * 0.15), measured, thickness);
      if (text.strike) ctx.fillRect(x, y - Math.round(text.fontSize * 0.3), measured, thickness);
    });
  }
  ctx.restore();
}

export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: SceneLayer,
  doc: Document,
  width: number,
  height: number,
) {
  if (layer.hidden || layer.opacity <= 0) return;

  if (layer.baked && layer.canvas) {
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = compositeOf(layer.blendMode);
    ctx.drawImage(layer.canvas, layer.left, layer.top);
    ctx.restore();
    return;
  }

  if (layer.kind === "group") {
    const pass = layer.blendMode === "pass through" && layer.opacity >= 0.999 && !layer.mask;
    if (pass) {
      for (const child of layer.children) drawLayer(ctx, child, doc, width, height);
      return;
    }
    const plate = doc.createElement("canvas");
    plate.width = Math.max(1, width);
    plate.height = Math.max(1, height);
    const inner = plate.getContext("2d");
    if (!inner) return;
    for (const child of layer.children) drawLayer(inner, child, doc, width, height);
    if (layer.mask) {
      inner.globalCompositeOperation = "destination-in";
      inner.drawImage(layer.mask.canvas, layer.mask.left, layer.mask.top);
    }
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = compositeOf(layer.blendMode);
    ctx.drawImage(plate, 0, 0);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = compositeOf(layer.blendMode);
  if (layer.canvas && layer.shadows?.length) {
    drawShadows(ctx, doc, layer.canvas, layer.left, layer.top, layer.shadows);
  }
  if (layer.canvas && (layer.fillOpacity ?? 1) > 0.01) {
    ctx.drawImage(layer.canvas, layer.left, layer.top);
  }
  if (layer.text) drawText(ctx, layer);
  ctx.restore();
}

export function renderProof(scene: Scene, doc: Document): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.width = scene.width;
  canvas.height = scene.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  for (const layer of scene.layers) drawLayer(ctx, layer, doc, scene.width, scene.height);
  return canvas;
}

export function trimCanvas(
  doc: Document,
  source: HTMLCanvasElement,
): { canvas: HTMLCanvasElement; left: number; top: number } | null {
  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx || source.width < 1 || source.height < 1) return null;
  const data = ctx.getImageData(0, 0, source.width, source.height).data;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (data[(y * source.width + x) * 4 + 3] > 3) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const canvas = doc.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(source, minX, minY, width, height, 0, 0, width, height);
  return { canvas, left: minX, top: minY };
}
