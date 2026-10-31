import {
  applyTextTransform,
  chooseFont,
  clipVisible,
  filterNeedsBake,
  isolationFor,
  mapBlend,
  overflows,
  parseColor,
  parseGradients,
  parseShadows,
  sortForPaint,
  trackingFromLetterSpacing,
  transformKind,
  type Finding,
  type Shadow,
} from "./model.ts";
import { paintBox, paintClippedText, paintMask, paintSolid, rgbaCss, type PaintSpec } from "./paint.ts";
import { drawLayer, trimCanvas } from "./proof.ts";
import type { Scene, SceneLayer, TextRun } from "./scene.ts";
import {
  clipPolygon,
  parseSvgPath,
  pathsForShape,
  polygonPath,
  shapeFromPaint,
  solidShape,
  type SceneShape,
} from "./vector.ts";

const SKIP = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "HEAD",
  "TITLE",
  "NOSCRIPT",
  "BR",
  "WBR",
  "TEMPLATE",
]);

type Cap = {
  doc: Document;
  frame: number | null;
  artW: number;
  artH: number;
  findings: Finding[];
  once: Set<string>;
  ids: number;
};

type Flags = {
  ignoreTransform?: boolean;
  ignoreFilter?: boolean;
};

export function wrapSource(html: string, width: number, height: number): string {
  const base = `html,body{margin:0;width:${width}px;height:${height}px;background:transparent}`;
  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) return html.replace(/<head[^>]*>/i, `$&<style>${base}</style>`);
    return html.replace(/<html[^>]*>/i, `$&<head><style>${base}</style></head>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}</style></head><body>${html}</body></html>`;
}

export async function prepareFrame(frame: HTMLIFrameElement, time: number) {
  const win = frame.contentWindow as (Window & { renderFrame?: (n: number) => void; __STILL_FRAME?: number }) | null;
  const doc = frame.contentDocument;
  if (!win || !doc?.body) throw new Error("The frame has no document yet.");
  win.__STILL_FRAME = time;
  if (doc.fonts?.ready) {
    await Promise.race([doc.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
  win.renderFrame?.(time);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return doc;
}

function note(cap: Cap, finding: Omit<Finding, "id">, key?: string) {
  const dedupe = key ?? `${finding.area}|${finding.title}|${finding.layerId ?? ""}`;
  if (cap.once.has(dedupe)) return;
  cap.once.add(dedupe);
  cap.findings.push({ ...finding, id: `f${cap.findings.length + 1}` });
}

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function numAttr(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function artBox(el: Element, doc: Document) {
  const origin = doc.documentElement.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height };
}

function readName(el: Element): string {
  return (
    el.getAttribute("data-clip") ||
    el.getAttribute("data-layer") ||
    el.id ||
    el.getAttribute("class")?.split(/\s+/).find(Boolean) ||
    el.tagName.toLowerCase()
  );
}

function clipName(el: Element, name: string): string {
  const from = numAttr(el.getAttribute("data-from"));
  if (from == null) return name;
  const end = from + (numAttr(el.getAttribute("data-duration")) ?? 0);
  return `${name}  f${from}–${end}`;
}

function radiiOf(style: CSSStyleDeclaration): [number, number, number, number] {
  const one = (value: string) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  };
  return [
    one(style.borderTopLeftRadius),
    one(style.borderTopRightRadius),
    one(style.borderBottomRightRadius),
    one(style.borderBottomLeftRadius),
  ];
}

function paintSpec(style: CSSStyleDeclaration, box: { w: number; h: number }): PaintSpec {
  const widths = [
    px(style.borderTopWidth),
    px(style.borderRightWidth),
    px(style.borderBottomWidth),
    px(style.borderLeftWidth),
  ];
  const colors = [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor];
  const styles = [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle];
  return {
    width: box.w,
    height: box.h,
    backgroundColor: style.backgroundColor,
    backgroundImage: style.backgroundImage,
    border: {
      top: widths[0],
      right: widths[1],
      bottom: widths[2],
      left: widths[3],
      color: colors[0] || "#000",
      style: styles[0] || "none",
    },
    radii: radiiOf(style),
  };
}

function bordersDiffer(style: CSSStyleDeclaration): boolean {
  const widths = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
  const colors = [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor];
  return new Set(widths).size > 1 || new Set(colors).size > 1;
}

function firstFamily(fontFamily: string): string {
  return (fontFamily.split(",")[0] ?? fontFamily).trim().replace(/^['"]+|['"]+$/g, "");
}

function cssFont(style: CSSStyleDeclaration): string {
  const slant = style.fontStyle === "italic" ? "italic" : "normal";
  return `${slant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function alignOf(value: string): "left" | "center" | "right" {
  if (value === "center") return "center";
  if (value === "right" || value === "end") return "right";
  return "left";
}

function clips(style: CSSStyleDeclaration): boolean {
  return [style.overflow, style.overflowX, style.overflowY].some((value) => overflows(value));
}

function backdropOf(style: CSSStyleDeclaration): string {
  const record = style as CSSStyleDeclaration & { backdropFilter?: string; webkitBackdropFilter?: string };
  return record.backdropFilter || record.webkitBackdropFilter || "none";
}

function parseOrigin(value: string, width: number, height: number): [number, number] {
  const [xs, ys] = value.split(/\s+/);
  const axis = (part: string | undefined, size: number) => {
    if (!part) return size / 2;
    if (part.endsWith("%")) return (parseFloat(part) / 100) * size;
    return parseFloat(part) || 0;
  };
  return [axis(xs, width), axis(ys ?? xs, height)];
}

function markFolded(layers: SceneLayer[]): SceneLayer[] {
  return layers.map((layer) => ({
    ...layer,
    folded: true,
    children: markFolded(layer.children),
  }));
}

function baseLayer(cap: Cap, el: Element, style: CSSStyleDeclaration, box: { x: number; y: number; w: number; h: number }): SceneLayer {
  const from = numAttr(el.getAttribute("data-from"));
  const visible = clipVisible(cap.frame, from, numAttr(el.getAttribute("data-duration")));
  if (!visible) {
    note(
      cap,
      {
        area: "groups",
        fate: "baked",
        title: "Timeline is closed",
        detail:
          "Remotion clips become groups with in and out points. The frame you picked shows one of them. The others stay in the Photoshop file as hidden layers — nothing tweens.",
      },
      "timeline",
    );
  }
  const opacity = Math.min(1, Math.max(0, px(style.opacity || "1") || 1));
  const blend = mapBlend(style.mixBlendMode || "normal");
  if (blend.fate !== "faithful") {
    note(cap, {
      area: "effects",
      fate: blend.fate,
      title: `Blend ${style.mixBlendMode}`,
      detail: blend.detail ?? `${style.mixBlendMode} → ${blend.ps}.`,
      layerId: undefined,
    }, `blend:${style.mixBlendMode}`);
  }
  return {
    id: `L${(cap.ids += 1)}`,
    name: clipName(el, readName(el)),
    kind: "pixel",
    hidden: !visible,
    opacity,
    blendMode: blend.ps,
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    box,
    children: [],
  };
}

async function rasterSvg(doc: Document, el: Element, w: number, h: number): Promise<HTMLCanvasElement | null> {
  const clone = el.cloneNode(true) as SVGElement;
  clone.setAttribute("width", String(Math.max(1, Math.round(w))));
  clone.setAttribute("height", String(Math.max(1, Math.round(h))));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = doc.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rasterImage(doc: Document, img: HTMLImageElement, w: number, h: number): HTMLCanvasElement | null {
  if (!img.complete || !img.naturalWidth) return null;
  const canvas = doc.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.getImageData(0, 0, 1, 1);
    return canvas;
  } catch {
    return null;
  }
}

function clipToRadii(doc: Document, canvas: HTMLCanvasElement, radii: [number, number, number, number]): HTMLCanvasElement {
  if (radii.every((radius) => radius < 0.5)) return canvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const mask = paintMask(doc, canvas.width, canvas.height, radii);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0);
  return canvas;
}

function guid() {
  return crypto.randomUUID();
}

function fileSlug(name: string) {
  const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (clean || "asset").slice(0, 40);
}

function pngBytes(canvas: HTMLCanvasElement): Uint8Array | null {
  try {
    const url = canvas.toDataURL("image/png");
    const body = url.split(",")[1];
    if (!body) return null;
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function paintVector(doc: Document, shape: SceneShape, box: { x: number; y: number; w: number; h: number }) {
  const canvas = doc.createElement("canvas");
  canvas.width = Math.max(1, Math.round(box.w));
  canvas.height = Math.max(1, Math.round(box.h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const paths = pathsForShape(shape, box);
  ctx.save();
  ctx.translate(-box.x, -box.y);
  ctx.beginPath();
  for (const path of paths) {
    path.knots.forEach((item, index) => {
      const [, , x, y] = item.points;
      if (index === 0) ctx.moveTo(x, y);
      else {
        const prev = path.knots[index - 1].points;
        ctx.bezierCurveTo(prev[4], prev[5], item.points[0], item.points[1], x, y);
      }
    });
    if (!path.open) ctx.closePath();
  }
  if (shape.fill?.type === "color") {
    ctx.fillStyle = rgbaCss(shape.fill.color);
    ctx.fill();
  }
  if (shape.stroke) {
    ctx.strokeStyle = rgbaCss(shape.stroke.color);
    ctx.lineWidth = shape.stroke.width;
    if (shape.stroke.dash.length) ctx.setLineDash(shape.stroke.dash);
    ctx.stroke();
  }
  ctx.restore();
  return canvas;
}

function smartOf(shell: SceneLayer, canvas: HTMLCanvasElement, file: { name: string; png?: Uint8Array; svg?: string; vector: boolean }, radii?: [number, number, number, number]): SceneLayer {
  const id = guid();
  return {
    ...shell,
    kind: "smart",
    canvas,
    smart: { id, placed: guid(), name: file.name, png: file.png, svg: file.svg, vector: file.vector },
    clipRadii: radii,
  };
}

function missingAsset(
  cap: Cap,
  el: Element,
  style: CSSStyleDeclaration,
  shell: SceneLayer,
  box: { x: number; y: number; w: number; h: number },
  kind: "image" | "svg",
): SceneLayer | null {
  const spec = paintSpec(style, box);
  const painted = paintBox(cap.doc, spec);
  const plateSpec = painted
    ? spec
    : {
        ...spec,
        backgroundColor: "rgba(244, 240, 232, 0.08)",
        border: { top: 1, right: 1, bottom: 1, left: 1, color: "#9c968c", style: "dashed" },
      };
  const canvas = painted ?? paintBox(cap.doc, plateSpec);
  if (!canvas) return null;
  const shape = shapeFromPaint(plateSpec, false);
  note(
    cap,
    {
      area: "effects",
      fate: shape ? "approximated" : "baked",
      title: kind === "image" ? "Blocked image kept its box" : "SVG that failed kept its box",
      detail: shape
        ? "The file’s pixels were not copied. The box is a live shape of its CSS fill and border, not a mask and not a smart object. Alt text, if any, is a type layer on top."
        : "The file’s pixels were not copied, and the box was too complex for a shape, so it is a bitmap plate.",
      layerId: shell.id,
    },
    `asset-plate:${kind}`,
  );
  const plate: SceneLayer = {
    ...shell,
    kind: shape ? "shape" : "pixel",
    shape: shape ?? undefined,
    canvas,
    left: box.x,
    top: box.y,
    width: canvas.width,
    height: canvas.height,
  };
  const alt = kind === "image" ? (el as HTMLImageElement).alt.trim() : "";
  if (!alt) return plate;
  const typeId = `L${(cap.ids += 1)}`;
  const text = textRun(cap, el, style, alt, typeId);
  if (!text) return plate;
  return {
    ...shell,
    kind: "group",
    canvas: undefined,
    children: [
      { ...plate, id: `L${(cap.ids += 1)}`, name: `${shell.name} plate` },
      {
        ...shell,
        id: typeId,
        name: `${shell.name} alt`,
        kind: "type",
        text,
        canvas: undefined,
        opacity: 1,
        blendMode: "normal",
        children: [],
      },
    ],
  };
}

function measureBaseline(doc: Document, el: Element, font: string, fontSize: number, fallback: number): number {
  const text = [...el.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
  if (!text) return fallback;
  const range = doc.createRange();
  range.selectNodeContents(text);
  const rect = range.getClientRects()[0];
  if (!rect) return fallback;
  const origin = doc.documentElement.getBoundingClientRect();
  const canvas = doc.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallback;
  ctx.font = font;
  const metrics = ctx.measureText("Hg");
  const asc = metrics.fontBoundingBoxAscent || fontSize * 0.8;
  const desc = metrics.fontBoundingBoxDescent || fontSize * 0.2;
  const em = asc + desc || fontSize;
  const top = rect.top - origin.top;
  return top + ((rect.height || fontSize) - em) / 2 + asc;
}

function hardWrap(doc: Document, font: string, text: string, maxWidth: number, letterSpacing: number, nowrap: boolean) {
  if (nowrap || maxWidth <= 0) return { text, wrapped: false };
  const canvas = doc.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { text, wrapped: false };
  ctx.font = font;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${letterSpacing}px`;
  const lines: string[] = [];
  let wrapped = false;
  for (const para of text.split("\n")) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(trial).width > maxWidth + 0.5) {
        lines.push(line);
        line = word;
        wrapped = true;
      } else line = trial;
    }
    if (line || !words.length) lines.push(line);
  }
  return { text: lines.join("\n"), wrapped };
}

function textClipped(style: CSSStyleDeclaration): boolean {
  const webkit = (style as CSSStyleDeclaration & { webkitBackgroundClip?: string }).webkitBackgroundClip;
  if (style.backgroundClip !== "text" && webkit !== "text") return false;
  const bg = parseColor(style.backgroundColor);
  if (bg && bg.a > 0.004) return true;
  return parseGradients(style.backgroundImage).length > 0;
}

function textRun(
  cap: Cap,
  el: Element,
  style: CSSStyleDeclaration,
  raw: string,
  layerId: string,
  silent = false,
): TextRun | null {
  const say: typeof note = (target, finding, key) => {
    if (!silent) note(target, finding, key);
  };
  const collapsed = /pre/.test(style.whiteSpace) ? raw.replace(/\s+$/g, "") : raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const transformed = applyTextTransform(collapsed, style.textTransform);
  if (style.textTransform !== "none") {
    say(
      cap,
      {
        area: "type",
        fate: "baked",
        title: "text-transform is baked into the letters",
        detail: "Photoshop type has no CSS text-transform, so the exported string is already uppercased, lowercased, or capitalized.",
        layerId,
      },
      "text-transform",
    );
  }
  const fontSize = px(style.fontSize) || 16;
  const family = firstFamily(style.fontFamily);
  const weight = parseInt(style.fontWeight, 10) || 400;
  const italic = style.fontStyle === "italic";
  const chosen = chooseFont(family, weight, italic);
  say(
    cap,
    {
      area: "type",
      fate: chosen.fate,
      title: chosen.fate === "faithful" ? `${family} stays live type` : `${family} → ${chosen.psName}`,
      detail: chosen.detail,
      layerId,
    },
    `font:${family}:${weight}:${italic}`,
  );
  const font = cssFont(style);
  const letter = style.letterSpacing === "normal" ? 0 : px(style.letterSpacing);
  const tracking = trackingFromLetterSpacing(letter, fontSize);
  if (letter !== 0) {
    say(
      cap,
      {
        area: "type",
        fate: "faithful",
        title: "Tracking is thousandths of an em",
        detail: `letter-spacing ${letter}px at ${fontSize}px becomes Photoshop tracking ${tracking}.`,
        layerId,
      },
      "tracking",
    );
  }
  const lineHeight = style.lineHeight === "normal" ? fontSize * 1.2 : px(style.lineHeight) || fontSize * 1.2;
  const box = artBox(el, cap.doc);
  const padL = px(style.paddingLeft) + px(style.borderLeftWidth);
  const padR = px(style.paddingRight) + px(style.borderRightWidth);
  const contentLeft = box.x + padL;
  const contentWidth = Math.max(1, box.w - padL - padR);
  const align = alignOf(style.textAlign);
  const wrapped = hardWrap(cap.doc, font, transformed, contentWidth, letter, style.whiteSpace === "nowrap" || style.whiteSpace === "pre");
  if (wrapped.wrapped) {
    say(
      cap,
      {
        area: "type",
        fate: "approximated",
        title: "Soft wrap became hard returns",
        detail: "The line breaks are frozen. Editing the copy in Photoshop will not reflow inside the CSS box.",
        layerId,
      },
      `wrap:${layerId}`,
    );
  }
  const anchorX = align === "center" ? contentLeft + contentWidth / 2 : align === "right" ? contentLeft + contentWidth : contentLeft;
  const deco = `${style.textDecorationLine || ""} ${style.textDecoration || ""}`;
  const clip = textClipped(style);
  let color = parseColor(style.color) ?? { r: 20, g: 19, b: 17, a: 1 };
  if (!silent && clip && color.a < 0.05) color = { r: 20, g: 19, b: 17, a: 1 };
  if (!silent && clip) {
    say(
      cap,
      {
        area: "type",
        fate: "dropped",
        title: "Gradient text stays a solid face",
        detail:
          "background-clip: text has no live Photoshop type style. A transparent fill is replaced with ink so the words survive. Clip a gradient to the type in Photoshop if you still want it.",
        layerId,
      },
      `clip-text:${layerId}`,
    );
  }
  say(
    cap,
    {
      area: "type",
      fate: "approximated",
      title: "Baseline is estimated",
      detail:
        "CSS line boxes and Photoshop’s em box are not the same number. The first baseline comes from canvas font metrics, so expect a pixel or two of drift.",
    },
    "baseline",
  );
  return {
    value: wrapped.text,
    psFont: chosen.psName,
    cssFont: font,
    fontSize,
    leading: lineHeight,
    tracking,
    align,
    color,
    fauxBold: chosen.fauxBold,
    fauxItalic: chosen.fauxItalic,
    underline: deco.includes("underline"),
    strike: deco.includes("line-through"),
    anchorX,
    baseline: measureBaseline(cap.doc, el, font, fontSize, box.y + padL + fontSize * 0.8),
  };
}

async function bakeSubtree(cap: Cap, el: Element, style: CSSStyleDeclaration, why: { filter: boolean; transform: boolean }): Promise<SceneLayer | null> {
  const previous = (el as HTMLElement).style.transform;
  let unBox = artBox(el, cap.doc);
  if (why.transform) {
    (el as HTMLElement).style.transform = "none";
    void el.getBoundingClientRect();
    unBox = artBox(el, cap.doc);
  }
  const inner = await captureElement(cap, el, { ignoreTransform: true, ignoreFilter: true });
  if (why.transform) (el as HTMLElement).style.transform = previous;
  if (!inner) return null;
  inner.opacity = 1;
  inner.blendMode = "normal";

  let plate = cap.doc.createElement("canvas");
  plate.width = cap.artW;
  plate.height = cap.artH;
  const ctx = plate.getContext("2d");
  if (!ctx) return null;
  drawLayer(ctx, inner, cap.doc, cap.artW, cap.artH);

  if (why.filter) {
    const next = cap.doc.createElement("canvas");
    next.width = cap.artW;
    next.height = cap.artH;
    const nextCtx = next.getContext("2d");
    if (nextCtx) {
      nextCtx.filter = style.filter;
      nextCtx.drawImage(plate, 0, 0);
      plate = next;
    }
    note(
      cap,
      {
        area: "effects",
        fate: "baked",
        title: "Filter is pixels, not a smart filter",
        detail: `${style.filter} was flattened with its subtree. Photoshop smart filters are not written into the file, so the blur or color filter cannot be reopened.`,
        layerId: inner.id,
      },
      `filter:${style.filter}`,
    );
  }
  if (why.transform) {
    const matrix = new DOMMatrix(style.transform);
    const [ox, oy] = parseOrigin(style.transformOrigin, unBox.w, unBox.h);
    const next = cap.doc.createElement("canvas");
    next.width = cap.artW;
    next.height = cap.artH;
    const nextCtx = next.getContext("2d");
    if (nextCtx) {
      const e = matrix.e + ox + unBox.x - matrix.a * (unBox.x + ox) - matrix.c * (unBox.y + oy);
      const f = matrix.f + oy + unBox.y - matrix.b * (unBox.x + ox) - matrix.d * (unBox.y + oy);
      nextCtx.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, e, f);
      nextCtx.drawImage(plate, 0, 0);
      plate = next;
    }
    note(
      cap,
      {
        area: "layout",
        fate: "baked",
        title: "Transform folded the subtree",
        detail:
          "A rotate, scale, or skew has no live matrix on a Photoshop pixel layer. The whole subtree is one raster, placed where the transformed box landed. Children below it are the structure that was folded in — they are not separate layers in the file.",
        layerId: inner.id,
      },
      "transform-bake",
    );
    if (!matrix.is2D) {
      note(
        cap,
        {
          area: "layout",
          fate: "dropped",
          title: "3D transform was flattened",
          detail: "Perspective and matrix3d do not survive. Only the 2D part of the matrix was burned in.",
        },
        "matrix3d",
      );
    }
  }
  const trimmed = trimCanvas(cap.doc, plate);
  if (!trimmed) return null;
  const box = artBox(el, cap.doc);
  const shell = baseLayer(cap, el, style, box);
  const folded = inner.kind === "group" ? markFolded(inner.children) : markFolded([inner]);
  return {
    ...shell,
    kind: "pixel",
    baked: true,
    left: trimmed.left,
    top: trimmed.top,
    width: trimmed.canvas.width,
    height: trimmed.canvas.height,
    canvas: trimmed.canvas,
    children: folded,
    opacity: Math.min(1, Math.max(0, parseFloat(style.opacity) || 1)),
    blendMode: mapBlend(style.mixBlendMode || "normal").ps,
  };
}

function svgSpace(el: Element, box: { w: number; h: number }) {
  const viewBox = el.getAttribute("viewBox");
  if (viewBox) {
    const [minX, minY, vw, vh] = viewBox.trim().split(/[\s,]+/).map(Number);
    if ([minX, minY, vw, vh].every((n) => Number.isFinite(n)) && vw > 0 && vh > 0) {
      return { minX, minY, sx: box.w / vw, sy: box.h / vh };
    }
  }
  return { minX: 0, minY: 0, sx: 1, sy: 1 };
}

function svgInk(el: Element): { fill: ReturnType<typeof parseColor>; stroke: ReturnType<typeof parseColor>; width: number } | null {
  const view = el.ownerDocument.defaultView;
  if (!view) return null;
  const style = view.getComputedStyle(el);
  const fillAttr = el.getAttribute("fill");
  const strokeAttr = el.getAttribute("stroke");
  if ((fillAttr && fillAttr.includes("url(")) || (strokeAttr && strokeAttr.includes("url("))) return null;
  if ((style.fill && style.fill.includes("url(")) || (style.stroke && style.stroke.includes("url("))) return null;
  const fill = fillAttr === "none" || style.fill === "none" ? null : parseColor(style.fill);
  const stroke = strokeAttr === "none" || style.stroke === "none" ? null : parseColor(style.stroke);
  const width = px(style.strokeWidth) || px(el.getAttribute("stroke-width") || "") || 1;
  return { fill, stroke, width };
}

function shapeLayerFrom(
  shell: SceneLayer,
  shape: SceneShape,
  box: { x: number; y: number; w: number; h: number },
  doc: Document,
  name: string,
  id: string,
): SceneLayer {
  return {
    ...shell,
    id,
    name,
    kind: "shape",
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    box,
    shape,
    canvas: paintVector(doc, shape, box),
    children: [],
    opacity: 1,
    blendMode: "normal",
  };
}

function explodeSvg(cap: Cap, el: Element, shell: SceneLayer, box: { x: number; y: number; w: number; h: number }): SceneLayer[] | null {
  const kids = [...el.children];
  if (!kids.length) return null;
  if (kids.some((kid) => !["rect", "circle", "ellipse", "path", "polygon", "polyline", "line"].includes(kid.tagName.toLowerCase()))) return null;
  if (kids.some((kid) => kid.getAttribute("transform"))) return null;
  const space = svgSpace(el, box);
  const X = (value: number) => box.x + (value - space.minX) * space.sx;
  const Y = (value: number) => box.y + (value - space.minY) * space.sy;
  const layers: SceneLayer[] = [];
  for (const kid of kids) {
    const ink = svgInk(kid);
    if (!ink || (!ink.fill && !ink.stroke)) return null;
    const tag = kid.tagName.toLowerCase();
    const stroke = ink.stroke ? { color: ink.stroke, width: ink.width, dash: [] as number[] } : null;
    const fill = ink.fill ? { type: "color" as const, color: ink.fill } : null;
    let shape: SceneShape | null = null;
    let bounds = { x: box.x, y: box.y, w: box.w, h: box.h };
    if (tag === "rect") {
      const x = parseFloat(kid.getAttribute("x") || "0");
      const y = parseFloat(kid.getAttribute("y") || "0");
      const w = parseFloat(kid.getAttribute("width") || "0");
      const h = parseFloat(kid.getAttribute("height") || "0");
      const rx = parseFloat(kid.getAttribute("rx") || kid.getAttribute("ry") || "0");
      const ry = parseFloat(kid.getAttribute("ry") || kid.getAttribute("rx") || "0");
      if (!(w > 0) || !(h > 0)) return null;
      bounds = { x: X(x), y: Y(y), w: w * space.sx, h: h * space.sy };
      const radius = ((rx || 0) * space.sx + (ry || 0) * space.sy) / (rx && ry ? 2 : 1);
      const radii = [radius, radius, radius, radius] as [number, number, number, number];
      shape = { origin: radius > 0.5 ? "round" : "rect", radii, fill, stroke };
    } else if (tag === "circle" || tag === "ellipse") {
      const cx = parseFloat(kid.getAttribute("cx") || "0");
      const cy = parseFloat(kid.getAttribute("cy") || "0");
      const rx = tag === "circle" ? parseFloat(kid.getAttribute("r") || "0") : parseFloat(kid.getAttribute("rx") || "0");
      const ry = tag === "circle" ? rx : parseFloat(kid.getAttribute("ry") || "0");
      if (!(rx > 0) || !(ry > 0)) return null;
      bounds = { x: X(cx - rx), y: Y(cy - ry), w: rx * 2 * space.sx, h: ry * 2 * space.sy };
      shape = { origin: "ellipse", radii: [bounds.w / 2, bounds.w / 2, bounds.w / 2, bounds.w / 2], fill, stroke };
    } else if (tag === "line") {
      const x1 = parseFloat(kid.getAttribute("x1") || "0");
      const y1 = parseFloat(kid.getAttribute("y1") || "0");
      const x2 = parseFloat(kid.getAttribute("x2") || "0");
      const y2 = parseFloat(kid.getAttribute("y2") || "0");
      const path = polygonPath([{ x: X(x1), y: Y(y1) }, { x: X(x2), y: Y(y2) }], true);
      if (!path || !stroke) return null;
      bounds = { x: Math.min(X(x1), X(x2)), y: Math.min(Y(y1), Y(y2)), w: Math.max(1, Math.abs(X(x2) - X(x1))), h: Math.max(1, Math.abs(Y(y2) - Y(y1))) };
      shape = { origin: "path", radii: [0, 0, 0, 0], fill: null, stroke, paths: [path] };
    } else if (tag === "polygon" || tag === "polyline") {
      const raw = kid.getAttribute("points") || "";
      const nums = raw.trim().split(/[\s,]+/).map(Number);
      if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) return null;
      const points = [];
      for (let i = 0; i < nums.length - 1; i += 2) points.push({ x: X(nums[i]), y: Y(nums[i + 1]) });
      const path = polygonPath(points, tag === "polyline");
      if (!path) return null;
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(1, Math.max(...xs) - Math.min(...xs)), h: Math.max(1, Math.max(...ys) - Math.min(...ys)) };
      shape = { origin: "path", radii: [0, 0, 0, 0], fill: tag === "polyline" ? null : fill, stroke, paths: [path] };
    } else if (tag === "path") {
      const parsed = parseSvgPath(kid.getAttribute("d") || "");
      if (!parsed) return null;
      const paths = parsed.map((path) => ({
        open: path.open,
        knots: path.knots.map((item) => ({
          linked: item.linked,
          points: item.points.map((value, index) => (index % 2 === 0 ? X(value) : Y(value))),
        })),
      }));
      const anchors = paths.flatMap((path) => path.knots.map((item) => ({ x: item.points[2], y: item.points[3] })));
      const xs = anchors.map((point) => point.x);
      const ys = anchors.map((point) => point.y);
      bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(1, Math.max(...xs) - Math.min(...xs)), h: Math.max(1, Math.max(...ys) - Math.min(...ys)) };
      shape = { origin: "path", radii: [0, 0, 0, 0], fill: paths.some((path) => !path.open) ? fill : null, stroke, paths };
    }
    if (!shape) return null;
    layers.push(shapeLayerFrom(shell, shape, bounds, cap.doc, kid.getAttribute("data-layer") || tag, `L${(cap.ids += 1)}`));
  }
  return layers.length ? layers : null;
}

async function captureElement(cap: Cap, el: Element, flags: Flags): Promise<SceneLayer | null> {
  const view = cap.doc.defaultView;
  if (!view || SKIP.has(el.tagName)) return null;
  const style = view.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") {
    note(
      cap,
      {
        area: "groups",
        fate: "dropped",
        title: "Hidden boxes are omitted",
        detail: "display: none and visibility: hidden never become layers. opacity: 0 still does, so you can fade a group back up in Photoshop.",
      },
      "display-none",
    );
    return null;
  }
  if (style.position === "fixed" || style.position === "sticky") {
    note(
      cap,
      {
        area: "layout",
        fate: "baked",
        title: "Fixed and sticky are frozen to the frame",
        detail: "They are placed where they sat in this viewport. Photoshop will not restick them when the document scrolls.",
      },
      "fixed",
    );
  }
  if (style.display.includes("flex") || style.display.includes("grid")) {
    note(
      cap,
      {
        area: "layout",
        fate: "baked",
        title: "Flex and grid are positions, not layout",
        detail: "Every child is an absolute pixel box from this frame. Changing the type in Photoshop will not reflow the row.",
      },
      "flex",
    );
  }
  const complex = transformKind(style.transform) === "complex";
  if (!flags.ignoreTransform && complex) return bakeSubtree(cap, el, style, { filter: !flags.ignoreFilter && filterNeedsBake(style.filter), transform: true });
  if (!flags.ignoreFilter && filterNeedsBake(style.filter)) return bakeSubtree(cap, el, style, { filter: true, transform: false });

  const box = artBox(el, cap.doc);
  if (box.w < 0.5 && box.h < 0.5 && !(el.textContent || "").trim()) return null;
  const shell = baseLayer(cap, el, style, box);
  const groupInfo = isolationFor({
    opacity: shell.opacity,
    blendMode: style.mixBlendMode || "normal",
    isolation: style.isolation || "auto",
    filter: "none",
    backdrop: backdropOf(style),
    clipPath: style.clipPath || "none",
    maskImage: style.maskImage || "none",
    transform: transformKind(style.transform),
    willChange: style.willChange || "auto",
  });
  if (groupInfo.isolated && groupInfo.reason) {
    note(
      cap,
      {
        area: "groups",
        fate: "faithful",
        title: "Stacking group is isolated",
        detail: `${shell.name} is a Normal folder, not Pass Through, because of ${groupInfo.reason}. Child blends stay inside the group, then the group fades — the same order CSS uses.`,
        layerId: shell.id,
      },
      `iso:${groupInfo.reason}`,
    );
  }
  if (backdropOf(style) !== "none") {
    note(
      cap,
      {
        area: "effects",
        fate: "dropped",
        title: "Backdrop filter is not in the file",
        detail: "backdrop-filter samples whatever is already painted behind the element. Photoshop has no live equivalent, so the frost is missing. The element’s own pixels are still here.",
        layerId: shell.id,
      },
      "backdrop",
    );
  }

  const tag = el.tagName.toUpperCase();
  if (tag === "SVG") {
    const pieces = explodeSvg(cap, el, shell, box);
    if (pieces?.length) {
      note(
        cap,
        {
          area: "effects",
          fate: "faithful",
          title: "SVG is live shapes",
          detail: "Rects, ellipses, and paths became Photoshop shape layers. Rasterize them in Photoshop when you want pixels. They are not smart objects and not masks.",
          layerId: shell.id,
        },
        "svg-shape",
      );
      if (pieces.length === 1) {
        return { ...pieces[0], id: shell.id, name: shell.name, hidden: shell.hidden, opacity: shell.opacity * pieces[0].opacity };
      }
      return { ...shell, kind: "group", children: pieces, canvas: undefined };
    }
    const canvas = await rasterSvg(cap.doc, el, box.w, box.h);
    if (!canvas) return missingAsset(cap, el, style, shell, box, "svg");
    const xml = new XMLSerializer().serializeToString(el);
    note(
      cap,
      {
        area: "effects",
        fate: "faithful",
        title: "SVG is a vector smart object",
        detail: "This drawing was too nested to split into shapes, so the SVG file is embedded. Double-click it in Photoshop, or rasterize the smart object. The proof shows a bitmap of the same file.",
        layerId: shell.id,
      },
      "svg-smart",
    );
    return smartOf(shell, canvas, { name: `${fileSlug(shell.name)}.svg`, svg: xml, vector: true });
  }
  if (tag === "IMG") {
    const canvas = rasterImage(cap.doc, el as HTMLImageElement, box.w, box.h);
    if (!canvas) return missingAsset(cap, el, style, shell, box, "image");
    const png = pngBytes(canvas);
    const radii = radiiOf(style);
    const rounded = radii.some((radius) => radius >= 0.5);
    if (!png) {
      note(
        cap,
        {
          area: "effects",
          fate: "baked",
          title: "Image stayed pixels",
          detail: "The bitmap could not be packed into a smart object, so it was written as a plain pixel layer.",
          layerId: shell.id,
        },
        `img-pixel:${shell.id}`,
      );
      return { ...shell, kind: "pixel", canvas: rounded ? clipToRadii(cap.doc, canvas, radii) : canvas, left: box.x, top: box.y };
    }
    note(
      cap,
      {
        area: "effects",
        fate: "faithful",
        title: "Image is a smart object",
        detail: rounded
          ? "The photo is embedded. You can edit it, replace it, or rasterize it in Photoshop. The corner radius is a vector mask on that smart object, not baked into the file."
          : "The photo is embedded at the size it was drawn. It is not a linked file on disk. Rasterize it in Photoshop when you want a plain pixel layer.",
        layerId: shell.id,
      },
      "img-smart",
    );
    const proof = rounded ? clipToRadii(cap.doc, canvas, radii) : canvas;
    return smartOf(shell, proof, { name: `${fileSlug(shell.name)}.png`, png, vector: false }, rounded ? radii : undefined);
  }

  const clipped = textClipped(style);
  const rawSpec = paintSpec(style, box);
  const spec = clipped
    ? { ...rawSpec, backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "none" }
    : rawSpec;
  if (bordersDiffer(style) && spec.border.top + spec.border.right + spec.border.bottom + spec.border.left > 0) {
    note(
      cap,
      {
        area: "effects",
        fate: "approximated",
        title: "Per-side borders use one stroke",
        detail: "CSS can color each side. The fill layer strokes a single width and color — the top side — because a Photoshop stroke is one setting.",
        layerId: shell.id,
      },
      `border:${shell.id}`,
    );
  }
  let canvas = paintBox(cap.doc, spec);
  const shadows = parseShadows(style.boxShadow);
  let fillOpacity = 1;
  if (!canvas && !clipped && shadows.length && box.w > 0.5 && box.h > 0.5) {
    canvas = paintSolid(cap.doc, box.w, box.h, spec.radii);
    fillOpacity = 0;
    note(
      cap,
      {
        area: "effects",
        fate: "approximated",
        title: "Shadow-only box uses Fill 0%",
        detail: "A transparent CSS box still casts a shadow. The layer is a live shape with Fill set to 0%, so the shadow follows the vector. Rasterize the shape in Photoshop if you want pixels.",
        layerId: shell.id,
      },
      "shadow-only",
    );
  }
  if (clipped && shadows.length) {
    note(
      cap,
      {
        area: "effects",
        fate: "dropped",
        title: "Box shadow on clipped type was left out",
        detail:
          "The background is the letterfill, not a box. A box-shadow would have framed a rectangle that is not in the still, so it was not written.",
        layerId: shell.id,
      },
      `clip-shadow:${shell.id}`,
    );
  } else if (shadows.length) {
    note(
      cap,
      {
        area: "effects",
        fate: shadows.some((shadow) => shadow.spread !== 0) ? "approximated" : "faithful",
        title: "Box shadow is a live layer style",
        detail: shadows.some((shadow) => shadow.spread !== 0)
          ? "Offset, blur, and color become Drop Shadow or Inner Shadow. Spread is written as choke in pixels, which is close but not CSS spread. The angle is the light opposite the offset — 90° casts straight down."
          : "Offset, blur, and color become a live Drop Shadow or Inner Shadow. 90° casts the shadow straight down. The shadow follows the layer’s alpha, which matches an opaque rounded shape.",
      },
      shadows.some((shadow) => shadow.spread !== 0) ? "shadow-spread" : "shadow-live",
    );
  }

  const childEls = [...el.children].filter((child) => !SKIP.has(child.tagName));
  const directText = childEls.length
    ? ""
    : [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("");
  const textShadows = directText.trim() ? parseShadows(style.textShadow) : [];
  if (textShadows.length) {
    note(
      cap,
      {
        area: "effects",
        fate: "faithful",
        title: clipped ? "Text shadow follows the glyph pixels" : "Text shadow is a type-layer shadow",
        detail: clipped
          ? "The letters are pixels, and the shadow is a live layer style on that alpha, so it still follows the word."
          : "text-shadow becomes a drop shadow on the live type layer, so it follows the glyphs rather than the box.",
      },
      "text-shadow",
    );
  }

  const parts: SceneLayer[] = [];
  let consumedClip = false;
  if (canvas) {
    let shape = shapeFromPaint(spec, bordersDiffer(style));
    if (!shape && fillOpacity === 0) shape = solidShape(box, spec.radii, { r: 0, g: 0, b: 0, a: 1 });
    const polygon = shape && !childEls.length && !directText.trim() ? clipPolygon(style.clipPath || "", box) : null;
    if (shape && polygon) {
      shape = { ...shape, origin: "path", paths: [polygon], radii: [0, 0, 0, 0] };
      consumedClip = true;
    }
    if (shape) {
      const gradient = shape.fill?.type === "linear" || shape.fill?.type === "radial";
      note(
        cap,
        {
          area: "effects",
          fate: gradient || shape.stroke?.dash.length || shape.origin === "path" ? "approximated" : "faithful",
          title: "CSS box is a live shape",
          detail: gradient
            ? "The fill is a Photoshop shape with a gradient. The angle is converted from CSS. Rasterize the layer in Photoshop when you want pixels."
            : shape.origin === "path"
              ? "A polygon clip became the shape outline. It is not a mask. Rasterize it in Photoshop when you want pixels."
              : "Filled boxes, pills, and circles are shape layers, so the corner radius stays editable. Rasterize them in Photoshop when you want pixels.",
        },
        gradient ? "shape-gradient" : shape.origin === "path" ? "shape-path" : "shape-live",
      );
    } else {
      note(
        cap,
        {
          area: "effects",
          fate: "baked",
          title: "This fill stayed pixels",
          detail: "The paint was more than one color, one gradient, and a stroke, so it could not become a shape. It is a bitmap.",
          layerId: shell.id,
        },
        `shape-raster:${shell.id}`,
      );
    }
    parts.push({
      ...shell,
      id: childEls.length || directText.trim() ? `L${(cap.ids += 1)}` : shell.id,
      name: childEls.length || directText.trim() ? `${shell.name} fill` : shell.name,
      kind: shape ? "shape" : "pixel",
      shape: shape ?? undefined,
      canvas: shape?.origin === "path" && shape.fill?.type === "color" ? paintVector(cap.doc, shape, box) : canvas,
      left: box.x,
      top: box.y,
      width: canvas.width,
      height: canvas.height,
      shadows,
      fillOpacity,
      opacity: 1,
      blendMode: "normal",
    });
  }

  const ordered = sortForPaint(childEls, (child) => {
    const childStyle = view.getComputedStyle(child);
    return {
      domIndex: childEls.indexOf(child),
      position: childStyle.position,
      zIndex: childStyle.zIndex,
      cssOrder: parseInt(childStyle.order, 10) || 0,
    };
  });
  for (const child of ordered) {
    const layer = await captureElement(cap, child, {});
    if (layer) parts.push(layer);
  }

  if (directText.trim() && clipped) {
    const typeId = `L${(cap.ids += 1)}`;
    const layout = textRun(cap, el, style, directText, typeId, true);
    const glyphs = layout
      ? paintClippedText(
          cap.doc,
          box.w,
          box.h,
          style.backgroundColor,
          style.backgroundImage,
          layout,
          box.x,
          box.y,
          {
            top: px(style.paddingTop) + px(style.borderTopWidth),
            right: px(style.paddingRight) + px(style.borderRightWidth),
            bottom: px(style.paddingBottom) + px(style.borderBottomWidth),
            left: px(style.paddingLeft) + px(style.borderLeftWidth),
          },
        )
      : null;
    if (layout && glyphs) {
      const id = parts.length ? typeId : shell.id;
      note(
        cap,
        {
          area: "type",
          fate: "baked",
          title: "Gradient text is burned into the glyphs",
          detail:
            "background-clip: text has no live Photoshop type style. The letters are a pixel layer filled with that gradient, so the still matches. The words are not editable.",
          layerId: id,
        },
        `clip-text:${id}`,
      );
      parts.push({
        ...shell,
        id,
        name: parts.length ? `${shell.name} type` : shell.name,
        kind: "pixel",
        canvas: glyphs,
        left: box.x,
        top: box.y,
        width: glyphs.width,
        height: glyphs.height,
        shadows: textShadows,
        opacity: 1,
        blendMode: "normal",
        text: undefined,
      });
    } else {
      const text = textRun(cap, el, style, directText, typeId);
      if (text) {
        parts.push({
          ...shell,
          id: parts.length ? typeId : shell.id,
          name: parts.length ? `${shell.name} type` : shell.name,
          kind: "type",
          text,
          shadows: textShadows,
          opacity: 1,
          blendMode: "normal",
          canvas: undefined,
        });
      }
    }
  } else if (directText.trim()) {
    const typeId = `L${(cap.ids += 1)}`;
    const text = textRun(cap, el, style, directText, typeId);
    if (text) {
      parts.push({
        ...shell,
        id: parts.length ? typeId : shell.id,
        name: parts.length ? `${shell.name} type` : shell.name,
        kind: "type",
        text,
        shadows: textShadows,
        opacity: 1,
        blendMode: "normal",
        canvas: undefined,
      });
    }
  }

  for (const pseudo of ["::before", "::after"] as const) {
    const pseudoStyle = view.getComputedStyle(el, pseudo);
    const content = pseudoStyle.content;
    if (!content || content === "none" || content === "normal" || content === '""' || content === "''") continue;
    const width = pseudoStyle.width.endsWith("px") ? px(pseudoStyle.width) : 0;
    const height = pseudoStyle.height.endsWith("px") ? px(pseudoStyle.height) : 0;
    if (pseudoStyle.position === "absolute" && width > 0 && height > 0) {
      const left = pseudoStyle.left.endsWith("px") ? px(pseudoStyle.left) : null;
      const top = pseudoStyle.top.endsWith("px") ? px(pseudoStyle.top) : null;
      const right = pseudoStyle.right.endsWith("px") ? px(pseudoStyle.right) : null;
      const bottom = pseudoStyle.bottom.endsWith("px") ? px(pseudoStyle.bottom) : null;
      const x = left != null ? box.x + left : box.x + box.w - (right ?? 0) - width;
      const y = top != null ? box.y + top : box.y + box.h - (bottom ?? 0) - height;
      const pseudoSpec = paintSpec(pseudoStyle, { w: width, h: height });
      const pseudoCanvas = paintBox(cap.doc, pseudoSpec);
      if (pseudoCanvas) {
        parts.push({
          ...shell,
          id: `L${(cap.ids += 1)}`,
          name: `${shell.name} ${pseudo === "::before" ? "before" : "after"}`,
          kind: "pixel",
          left: x,
          top: y,
          width: pseudoCanvas.width,
          height: pseudoCanvas.height,
          box: { x, y, w: width, h: height },
          canvas: pseudoCanvas,
          opacity: Math.min(1, parseFloat(pseudoStyle.opacity) || 1),
          children: [],
        });
        note(
          cap,
          {
            area: "groups",
            fate: "approximated",
            title: "Pseudo-element became a real layer",
            detail: "Photoshop has no ::before or ::after. An absolutely positioned pseudo with a set size is promoted to its own pixel layer. Its box is measured from the parent border, not the padding edge.",
          },
          "pseudo-live",
        );
        continue;
      }
    }
    note(
      cap,
      {
        area: "groups",
        fate: "dropped",
        title: "Generated content was dropped",
        detail: `${pseudo} on ${shell.name} has no element box we can place. Content like counters, quotes, and in-flow pseudos do not become layers.`,
        layerId: shell.id,
      },
      `pseudo-drop:${shell.id}:${pseudo}`,
    );
  }

  if (!parts.length) return null;

  const needsClip = clips(style) && parts.length > (canvas ? 1 : 0);
  const clipPath = style.clipPath && style.clipPath !== "none";
  if (clipPath && !consumedClip) {
    note(
      cap,
      {
        area: "groups",
        fate: "dropped",
        title: "clip-path is not a mask yet",
        detail: `${style.clipPath} was not converted. A polygon on a single shape becomes that shape’s outline. Overflow hidden with a border radius is still the only raster mask.`,
        layerId: shell.id,
      },
      "clip-path",
    );
  }

  if (parts.length === 1 && !needsClip && !groupInfo.isolated) {
    const only = parts[0];
    const hoistedBlend =
      shell.blendMode !== "normal" && shell.blendMode !== "pass through"
        ? shell.blendMode
        : only.blendMode === "pass through"
          ? "normal"
          : only.blendMode;
    return {
      ...only,
      id: shell.id,
      name: shell.name,
      hidden: shell.hidden,
      opacity: shell.opacity * only.opacity,
      blendMode: hoistedBlend,
    };
  }

  let children = parts;
  let mask: SceneLayer["mask"];
  if (needsClip) {
    const fill = canvas ? children[0] : null;
    const clipped = canvas ? children.slice(1) : children;
    if (clipped.length) {
      const maskCanvas = paintMask(cap.doc, box.w, box.h, spec.radii);
      const clipGroup: SceneLayer = {
        ...shell,
        id: `L${(cap.ids += 1)}`,
        name: `${shell.name} clip`,
        kind: "group",
        opacity: 1,
        blendMode: "pass through",
        children: clipped,
        mask: { canvas: maskCanvas, left: box.x, top: box.y, width: maskCanvas.width, height: maskCanvas.height },
      };
      children = fill ? [fill, clipGroup] : [clipGroup];
      mask = undefined;
      note(
        cap,
        {
          area: "groups",
          fate: "faithful",
          title: "Overflow is a raster mask",
          detail:
            "The folder clips children to the rounded border box. The fill and its shadow sit outside that mask, because CSS does not clip an element’s own box-shadow.",
          layerId: shell.id,
        },
        "mask",
      );
    }
  }

  if (parts.length > 1 || needsClip) {
    const drift = Math.abs(box.x - Math.round(box.x)) + Math.abs(box.y - Math.round(box.y));
    if (drift > 0.2) {
      note(
        cap,
        {
          area: "layout",
          fate: "approximated",
          title: "Subpixels snap in the PSD",
          detail: "Layer edges in a PSD are whole pixels. A box sitting on a fraction is rounded, so a hairline can shift by half a pixel.",
        },
        "subpixel",
      );
    }
  }

  return {
    ...shell,
    kind: "group",
    blendMode: groupInfo.passThrough ? "pass through" : groupInfo.blendMode,
    children,
    mask,
    canvas: undefined,
    shadows: undefined,
  };
}

export async function captureFrame(
  doc: Document,
  opts: { width: number; height: number; frame: number | null },
): Promise<Scene> {
  const comp = doc.querySelector("[data-remotion-comp]");
  const cap: Cap = {
    doc,
    frame: comp ? opts.frame : opts.frame,
    artW: Math.max(1, Math.round(opts.width)),
    artH: Math.max(1, Math.round(opts.height)),
    findings: [],
    once: new Set(),
    ids: 0,
  };
  if (comp) {
    cap.frame = opts.frame;
    note(
      cap,
      {
        area: "groups",
        fate: "baked",
        title: "The Remotion project is closed",
        detail: `Comp “${comp.getAttribute("data-remotion-comp") || "still"}” is not a timeline. Sequences are folders named with their frame range. Scrub the frame to choose which clips are visible; export writes that one still.`,
      },
      "comp",
    );
  }
  note(
    cap,
    {
      area: "layout",
      fate: "faithful",
      title: "72 ppi — one CSS pixel is one point",
      detail: "The document is 72 pixels per inch so Photoshop type sizes match the CSS pixel sizes. Positions are border boxes in this frame.",
    },
    "ppi",
  );

  const view = doc.defaultView;
  const layers: SceneLayer[] = [];
  if (view) {
    const bodyStyle = view.getComputedStyle(doc.body);
    const bodySpec = paintSpec(bodyStyle, { w: opts.width, h: opts.height });
    const bodyCanvas = paintBox(doc, bodySpec);
    if (bodyCanvas) {
      layers.push({
        id: `L${(cap.ids += 1)}`,
        name: "artboard",
        kind: "pixel",
        hidden: false,
        opacity: 1,
        blendMode: "normal",
        left: 0,
        top: 0,
        width: bodyCanvas.width,
        height: bodyCanvas.height,
        box: { x: 0, y: 0, w: opts.width, h: opts.height },
        canvas: bodyCanvas,
        children: [],
      });
    }
    const kids = [...doc.body.children].filter((el) => !SKIP.has(el.tagName));
    const ordered = sortForPaint(kids, (el) => {
      const style = view.getComputedStyle(el);
      return {
        domIndex: kids.indexOf(el),
        position: style.position,
        zIndex: style.zIndex,
        cssOrder: parseInt(style.order, 10) || 0,
      };
    });
    for (const el of ordered) {
      try {
        const layer = await captureElement(cap, el, {});
        if (layer) layers.push(layer);
      } catch (error) {
        note(cap, {
          area: "groups",
          fate: "dropped",
          title: "A layer failed to read",
          detail: error instanceof Error ? error.message : "That element was skipped.",
        }, `fail:${el.tagName}`);
      }
    }
  }

  const order = ["groups", "layout", "type", "effects"] as const;
  const findings = [...cap.findings].sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area));
  return {
    width: cap.artW,
    height: cap.artH,
    frame: comp ? opts.frame : null,
    duration: numAttr(comp?.getAttribute("data-duration") ?? null),
    fps: numAttr(comp?.getAttribute("data-fps") ?? null),
    comp: comp?.getAttribute("data-remotion-comp") ?? null,
    layers,
    findings,
  };
}
