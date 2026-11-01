import type { BezierPath, Layer, Psd, VectorContent } from "ag-psd";
import { zipStore, type ZipEntry } from "./zip.ts";

const HOLD_FRAMES = 90;
const FPS = 30;

export type RemotionProject = {
  name: string;
  width: number;
  height: number;
  html: string;
  files: ZipEntry[];
  notes: string[];
};

type Style = Record<string, string | number>;

type Out = {
  notes: string[];
  assets: ZipEntry[];
  usesImage: boolean;
  seq: number;
};

function num(value: number) {
  const n = Math.round(value * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function textOf(value: string) {
  return new TextEncoder().encode(value);
}

function esc(value: string) {
  return value
    .replace(/&/g, "&\u0061mp;")
    .replace(/"/g, "&\u0071uot;")
    .replace(/</g, "&\u006ct;");
}

function jsxText(value: string) {
  return value
    .replace(/&/g, "&\u0061mp;")
    .replace(/</g, "&\u006ct;")
    .replace(/>/g, "&\u0067t;")
    .replace(/\{/g, "{'{'}");
}

function ident(name: string) {
  const parts = name
    .replace(/\.psd$/i, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  const id = parts.join("");
  return /^[A-Za-z]/.test(id) ? id : `Comp${id || "Photoshop"}`;
}

function note(out: Out, message: string) {
  if (!out.notes.includes(message)) out.notes.push(message);
}

function cssColor(color: unknown, alpha = 1) {
  const source = color && typeof color === "object" ? (color as { r?: number; g?: number; b?: number }) : {};
  const r = Math.round((source.r ?? 0) * 255);
  const g = Math.round((source.g ?? 0) * 255);
  const b = Math.round((source.b ?? 0) * 255);
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000;
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}

function units(value: { value?: number } | number | undefined) {
  if (typeof value === "number") return value;
  return value?.value ?? 0;
}

function htmlStyle(style: Style) {
  return Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value}`)
    .join(";");
}

function tsxStyle(style: Style) {
  const body = Object.entries(style)
    .map(([key, value]) => `${key}: ${typeof value === "number" ? value : JSON.stringify(value)}`)
    .join(", ");
  return `style={{ ${body} }}`;
}

function layerStyle(layer: Layer, z: number, extra: Style = {}): Style {
  const style: Style = {
    position: "absolute",
    zIndex: z,
    ...extra,
  };
  if (layer.hidden) style.opacity = 0;
  else if (layer.opacity != null && layer.opacity < 0.999) style.opacity = num(layer.opacity);
  const blend = layer.blendMode && layer.blendMode !== "normal" && layer.blendMode !== "pass through" ? layer.blendMode.replace(/\s+/g, "-") : "";
  if (blend) style.mixBlendMode = blend;
  return style;
}

function boxOf(layer: Layer) {
  if (layer.left != null && layer.top != null && layer.right != null && layer.bottom != null) {
    const width = layer.right - layer.left;
    const height = layer.bottom - layer.top;
    if (width >= 0.5 && height >= 0.5) return { left: layer.left, top: layer.top, width, height };
  }
  const paths = layer.vectorMask?.paths;
  if (!paths?.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (const knot of path.knots ?? []) {
      for (let index = 0; index < knot.points.length; index += 2) {
        minX = Math.min(minX, knot.points[index]);
        minY = Math.min(minY, knot.points[index + 1]);
        maxX = Math.max(maxX, knot.points[index]);
        maxY = Math.max(maxY, knot.points[index + 1]);
      }
    }
  }
  if (!Number.isFinite(minX) || maxX - minX < 0.5 || maxY - minY < 0.5) return null;
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

function pathD(paths: BezierPath[], originX: number, originY: number) {
  return paths
    .map((path) => {
      const knots = path.knots ?? [];
      if (!knots.length) return "";
      const anchor = (index: number) => [knots[index].points[2] - originX, knots[index].points[3] - originY];
      const incoming = (index: number) => [knots[index].points[0] - originX, knots[index].points[1] - originY];
      const outgoing = (index: number) => [knots[index].points[4] - originX, knots[index].points[5] - originY];
      const [x, y] = anchor(0);
      let d = `M ${num(x)} ${num(y)}`;
      const last = path.open ? knots.length : knots.length + 1;
      for (let index = 1; index < last; index++) {
        const current = index % knots.length;
        const prev = (index - 1) % knots.length;
        const [c1x, c1y] = outgoing(prev);
        const [c2x, c2y] = incoming(current);
        const [ax, ay] = anchor(current);
        d += ` C ${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(ax)} ${num(ay)}`;
      }
      if (!path.open) d += " Z";
      return d;
    })
    .filter(Boolean)
    .join(" ");
}

function clipValue(layer: Layer, width: number, height: number) {
  const mask = layer.vectorMask;
  if (mask && !mask.disable && mask.paths?.length) {
    const d = pathD(mask.paths, 0, 0);
    if (d) return `path('${d}')`;
  }
  const box = boxOf(layer);
  if (!box) return "";
  return `inset(${num(box.top)}px ${num(Math.max(0, width - (layer.right ?? width)))}px ${num(Math.max(0, height - (layer.bottom ?? height)))}px ${num(box.left)}px)`;
}

function fillPaint(fill: VectorContent | undefined, width: number, height: number, id: string) {
  if (!fill || fill.type === "color") {
    return { attr: fill?.type === "color" ? cssColor(fill.color) : "none", defs: "" };
  }
  if (fill.type !== "solid" || !fill.colorStops?.length) {
    return { attr: "#808080", defs: "" };
  }
  const stops = fill.colorStops;
  const css = (((fill.angle ?? 0) + 90) * Math.PI) / 180;
  const dx = Math.sin(css);
  const dy = -Math.cos(css);
  const x1 = num(width / 2 - dx * width / 2);
  const y1 = num(height / 2 - dy * height / 2);
  const x2 = num(width / 2 + dx * width / 2);
  const y2 = num(height / 2 + dy * height / 2);
  const marks = stops
    .map((stop, index) => {
      const opacity = fill.opacityStops?.[index]?.opacity ?? 1;
      return `<stop offset="${num((stop.location ?? 0) * 100)}%" stop-color="${cssColor(stop.color, opacity)}"/>`;
    })
    .join("");
  return {
    attr: `url(#${id})`,
    defs: `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${marks}</linearGradient></defs>`,
  };
}

function shadowFilter(layer: Layer) {
  const drops = layer.effects?.dropShadow?.filter((shadow) => shadow.enabled !== false) ?? [];
  if (!drops.length) return "";
  return drops
    .map((shadow) => {
      const radians = ((shadow.angle ?? 90) * Math.PI) / 180;
      const distance = units(shadow.distance);
      const ox = num(-Math.cos(radians) * distance);
      const oy = num(Math.sin(radians) * distance);
      return `drop-shadow(${ox}px ${oy}px ${num(units(shadow.size))}px ${cssColor(shadow.color, shadow.opacity ?? 1)})`;
    })
    .join(" ");
}

function fontFamily(name: string | undefined) {
  const face = (name ?? "").toLowerCase();
  if (face.includes("times")) return "Times New Roman";
  if (face.includes("georgia")) return "Georgia";
  if (face.includes("courier") || face.includes("mono")) return "Courier New";
  if (face.includes("verdana")) return "Verdana";
  if (face.includes("helvetica")) return "Helvetica";
  if (face.includes("arial") || !face) return "Arial";
  return name ?? "Arial";
}

function assetPath(out: Out, name: string, ext: string) {
  const base = name.toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "layer";
  const taken = out.assets.filter((entry) => entry.path.includes(`/${base}`)).length;
  const file = taken ? `${base}-${taken + 1}.${ext}` : `${base}.${ext}`;
  return { file, zip: `public/${file}` };
}

function dataUrl(bytes: Uint8Array, mime: string) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function pngBytes(canvas: unknown) {
  if (!canvas || typeof canvas !== "object" || !("toDataURL" in canvas)) return null;
  const url = (canvas as HTMLCanvasElement).toDataURL("image/png");
  const body = url.split(",")[1];
  if (!body) return null;
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isSvg(data: Uint8Array, name: string) {
  if (/\.svg$/i.test(name)) return true;
  const head = new TextDecoder().decode(data.slice(0, 180)).trimStart();
  return head.startsWith("<svg") || head.startsWith("<?xml");
}

function svgMarkup(source: string) {
  return source.replace(/<\?xml[^>]*>/i, "").replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = attrs.replace(/\s(?:width|height)\s*=\s*(['"]).*?\1/gi, "");
    return `<svg${cleaned} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
  });
}

type Built = { html: string; tsx: string };

function buildShape(layer: Layer, z: number, out: Out): Built {
  const box = boxOf(layer) ?? { left: 0, top: 0, width: 1, height: 1 };
  const paths = layer.vectorMask?.paths ?? [];
  const d = pathD(paths, box.left, box.top);
  const id = `fill-${++out.seq}`;
  const paint = fillPaint(layer.vectorFill, box.width, box.height, id);
  const stroke = layer.vectorStroke?.strokeEnabled ? layer.vectorStroke : null;
  const filter = shadowFilter(layer);
  if (layer.effects?.innerShadow?.some((shadow) => shadow.enabled !== false)) {
    note(out, `Inner shadow on “${layer.name ?? "shape"}” stays in Photoshop. The shape is still a vector.`);
  }
  const style = layerStyle(layer, z, {
    left: `${num(box.left)}px`,
    top: `${num(box.top)}px`,
    width: `${num(box.width)}px`,
    height: `${num(box.height)}px`,
    overflow: "visible",
  });
  if (filter) style.filter = filter;
  const strokeAttrs = stroke
    ? ` stroke="${cssColor(stroke.content?.type === "color" ? stroke.content.color : undefined, stroke.opacity ?? 1)}" stroke-width="${num(units(stroke.lineWidth))}"${stroke.lineDashSet?.length ? ` stroke-dasharray="${stroke.lineDashSet.map((dash) => num(units(dash))).join(" ")}"` : ""}`
    : "";
  const fillOpacity = layer.fillOpacity != null && layer.fillOpacity < 0.999 ? ` fill-opacity="${num(layer.fillOpacity)}"` : "";
  const body = `${paint.defs}<path d="${esc(d)}" fill="${paint.attr}"${fillOpacity}${strokeAttrs}/>`;
  const html = `<svg data-layer="${esc(layer.name || "Shape")}" viewBox="0 0 ${num(box.width)} ${num(box.height)}" style="${htmlStyle(style)}">${body}</svg>`;
  const tsx = `<svg data-layer="${esc(layer.name || "Shape")}" viewBox="0 0 ${num(box.width)} ${num(box.height)}" ${tsxStyle(style)}>${body}</svg>`;
  return { html, tsx };
}

function buildText(layer: Layer, z: number, out: Out): Built {
  const text = layer.text!;
  const styleRun = text.style ?? text.styleRuns?.[0]?.style;
  if ((text.styleRuns?.length ?? 0) > 1) note(out, `“${layer.name ?? "Type"}” has mixed styles. The project uses the first run.`);
  const size = styleRun?.fontSize ?? 16;
  const anchorX = text.transform?.[4] ?? layer.left ?? 0;
  const baseline = text.transform?.[5] ?? (layer.top ?? 0) + size;
  const align = text.paragraphStyle?.justification ?? "left";
  const shift = align === "center" ? "translateX(-50%)" : align === "right" ? "translateX(-100%)" : "";
  const decoration = [styleRun?.underline ? "underline" : "", styleRun?.strikethrough ? "line-through" : ""].filter(Boolean).join(" ");
  const style = layerStyle(layer, z, {
    left: `${num(anchorX)}px`,
    top: `${num(baseline - size * 0.8)}px`,
    fontFamily: fontFamily(styleRun?.font?.name),
    fontSize: `${num(size)}px`,
    lineHeight: `${num(styleRun?.leading || size * 1.15)}px`,
    letterSpacing: `${num(((styleRun?.tracking ?? 0) / 1000) * size)}px`,
    color: cssColor(styleRun?.fillColor),
    fontWeight: styleRun?.fauxBold ? 700 : 400,
    fontStyle: styleRun?.fauxItalic ? "italic" : "normal",
    whiteSpace: "pre",
    textAlign: align === "center" || align === "right" ? align : "left",
  });
  if (shift) style.transform = shift;
  if (decoration) style.textDecoration = decoration;
  const value = text.text ?? "";
  const html = `<div data-layer="${esc(layer.name || "Type")}" style="${htmlStyle(style)}">${esc(value)}</div>`;
  const tsx = `<div data-layer="${esc(layer.name || "Type")}" ${tsxStyle(style)}>${jsxText(value)}</div>`;
  return { html, tsx };
}

function buildSvg(layer: Layer, z: number, source: string, out: Out): Built {
  const placed = layer.placedLayer;
  const left = placed?.transform?.[0] ?? layer.left ?? 0;
  const top = placed?.transform?.[1] ?? layer.top ?? 0;
  const width = placed?.width ?? (layer.right != null && layer.left != null ? layer.right - layer.left : 1);
  const height = placed?.height ?? (layer.bottom != null && layer.top != null ? layer.bottom - layer.top : 1);
  const style = layerStyle(layer, z, {
    left: `${num(left)}px`,
    top: `${num(top)}px`,
    width: `${num(width)}px`,
    height: `${num(height)}px`,
  });
  const clip = layer.vectorMask && !layer.vectorMask.disable ? clipValue(layer, width + left, height + top) : "";
  if (clip.startsWith("inset(")) {
    style.overflow = "hidden";
    style.borderRadius = "0";
  }
  if (clip.startsWith("path(")) style.clipPath = clip;
  const markup = svgMarkup(source);
  note(out, `“${layer.name || "SVG"}” stays a vector. It is inlined, not flattened.`);
  const html = `<div data-layer="${esc(layer.name || "SVG")}" style="${htmlStyle(style)}">${markup}</div>`;
  const tsx = `<div data-layer="${esc(layer.name || "SVG")}" ${tsxStyle(style)}>${markup.replace(/\sclass=/g, " className=")}</div>`;
  return { html, tsx };
}

function buildImage(layer: Layer, z: number, file: string, bytes: Uint8Array, mime: string, out: Out): Built {
  const placed = layer.placedLayer;
  const left = placed?.transform?.[0] ?? layer.left ?? 0;
  const top = placed?.transform?.[1] ?? layer.top ?? 0;
  const width = placed?.width ?? (layer.right != null && layer.left != null ? layer.right - layer.left : 1);
  const height = placed?.height ?? (layer.bottom != null && layer.top != null ? layer.bottom - layer.top : 1);
  const style = layerStyle(layer, z, {
    left: `${num(left)}px`,
    top: `${num(top)}px`,
    width: `${num(width)}px`,
    height: `${num(height)}px`,
    objectFit: "fill",
  });
  const localClip = layer.vectorMask && !layer.vectorMask.disable ? pathD(layer.vectorMask.paths, left, top) : "";
  if (localClip) style.clipPath = `path('${localClip}')`;
  out.usesImage = true;
  const html = `<img data-layer="${esc(layer.name || "Image")}" alt="" src="${dataUrl(bytes, mime)}" style="${htmlStyle(style)}"/>`;
  const tsx = `<Img data-layer="${esc(layer.name || "Image")}" src={staticFile(${JSON.stringify(file)})} ${tsxStyle(style)} />`;
  return { html, tsx };
}

function buildLayer(layer: Layer, z: number, psd: Psd, out: Out): Built {
  if (layer.adjustment) {
    note(out, `Adjustment “${layer.name ?? "layer"}” has no Remotion equivalent. It was left out.`);
    return { html: "", tsx: "" };
  }
  if (layer.children) {
    const inner = buildLayers(layer.children, psd, out);
    const style = layerStyle(layer, z, { inset: "0" });
    const clip = clipValue(layer, psd.width, psd.height);
    if (layer.vectorMask && !layer.vectorMask.disable && clip) {
      style.clipPath = clip;
      note(out, `Group “${layer.name || "Group"}” keeps its vector mask as a clip.`);
    } else if (layer.mask && !layer.mask.disabled) {
      note(out, `Pixel mask on “${layer.name || "Group"}” is not a vector clip. The group is unmasked.`);
    }
    const html = `<div data-layer="${esc(layer.name || "Group")}" style="${htmlStyle(style)}">\n${inner.html}\n</div>`;
    const tsx = `<div data-layer="${esc(layer.name || "Group")}" ${tsxStyle(style)}>\n${inner.tsx}\n</div>`;
    return { html, tsx };
  }
  if (layer.vectorMask?.paths?.length && layer.vectorFill && !layer.text && !layer.placedLayer) return buildShape(layer, z, out);
  if (layer.text?.text != null) return buildText(layer, z, out);
  const placed = layer.placedLayer;
  const linked = placed ? psd.linkedFiles?.find((file) => file.id === placed.id) : undefined;
  if (linked?.data && isSvg(linked.data, linked.name || "")) {
    const saved = assetPath(out, linked.name || layer.name || "vector", "svg");
    out.assets.push({ path: saved.zip, data: linked.data });
    return buildSvg(layer, z, new TextDecoder().decode(linked.data), out);
  }
  if (linked?.data) {
    const saved = assetPath(out, linked.name || layer.name || "image", "png");
    out.assets.push({ path: saved.zip, data: linked.data });
    return buildImage(layer, z, saved.file, linked.data, "image/png", out);
  }
  const pixels = pngBytes(layer.canvas);
  if (pixels) {
    const saved = assetPath(out, layer.name || "pixels", "png");
    out.assets.push({ path: saved.zip, data: pixels });
    note(out, `“${layer.name || "Pixels"}” had no vectors. It is a raster in public/.`);
    return buildImage(layer, z, saved.file, pixels, "image/png", out);
  }
  if (layer.vectorMask?.paths?.length) return buildShape(layer, z, out);
  note(out, `“${layer.name || "Layer"}” had nothing readable to place.`);
  return { html: "", tsx: "" };
}

function buildClipStack(base: Layer, clipped: Layer[], z: number, psd: Psd, out: Out): Built {
  const clip = clipValue(base, psd.width, psd.height);
  const vector = Boolean(base.vectorMask && !base.vectorMask.disable && clip.startsWith("path("));
  if (!vector) {
    note(out, `“${base.name || "Layer"}” clips the layers above it. Without a vector mask, the clip is the layer box, not its pixel alpha.`);
  } else {
    note(out, `“${base.name || "Layer"}” clips the layers above it with its vector path.`);
  }
  const members = [base, ...clipped].map((layer, index) => buildLayer(layer, index + 1, psd, out));
  const style = layerStyle({ ...base, opacity: 1, hidden: false, blendMode: "normal" }, z, { inset: "0" });
  if (clip) style.clipPath = clip;
  const html = `<div data-clip="${esc(base.name || "Clip")}" style="${htmlStyle(style)}">\n${members.map((part) => part.html).filter(Boolean).join("\n")}\n</div>`;
  const tsx = `<div data-clip="${esc(base.name || "Clip")}" ${tsxStyle(style)}>\n${members.map((part) => part.tsx).filter(Boolean).join("\n")}\n</div>`;
  return { html, tsx };
}

function buildLayers(layers: Layer[] | undefined, psd: Psd, out: Out): Built {
  if (!layers?.length) return { html: "", tsx: "" };
  const parts: Built[] = [];
  let index = 0;
  let z = 1;
  while (index < layers.length) {
    const base = layers[index];
    index += 1;
    const clipped: Layer[] = [];
    while (index < layers.length && layers[index].clipping) {
      clipped.push(layers[index]);
      index += 1;
    }
    parts.push(clipped.length ? buildClipStack(base, clipped, z, psd, out) : buildLayer(base, z, psd, out));
    z += 1;
  }
  return {
    html: parts.map((part) => part.html).filter(Boolean).join("\n"),
    tsx: parts.map((part) => part.tsx).filter(Boolean).join("\n"),
  };
}

export function projectFromPsd(psd: Psd, filename = "FromPhotoshop.psd"): RemotionProject {
  const name = ident(filename);
  const width = Math.max(1, Math.round(psd.width));
  const height = Math.max(1, Math.round(psd.height));
  const out: Out = {
    notes: [
      `Canvas is ${width}×${height}, the same as the PSD.`,
      "The PSD has no timeline. This composition holds for 90 frames so each layer can be animated. Bottom of the panel is z-index 1.",
    ],
    assets: [],
    usesImage: false,
    seq: 0,
  };
  const built = buildLayers(psd.children, { ...psd, width, height }, out);
  const html = `<div data-remotion-comp="${esc(name)}" data-fps="${FPS}" data-duration="${HOLD_FRAMES}" data-width="${width}" data-height="${height}" style="position:relative;width:${width}px;height:${height}px;background:#ffffff">${built.html}</div>`;
  const imageImport = out.usesImage ? "\nimport { Img, staticFile } from \"remotion\";" : "";
  const composition = `import React from "react";
import { AbsoluteFill } from "remotion";${imageImport}

/** Layer order follows the Photoshop panel. The first painted layer is z-index 1. */
export const ${name}: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff" }}>
      ${built.tsx}
    </AbsoluteFill>
  );
};
`;
  const readme = `# ${name}

Photoshop file opened as a Remotion composition.

- Panel order is z-index. The bottom layer is 1. Later siblings paint above.
- Shapes are inline SVG, not pixels.
- SVG smart objects are inlined. Raster smart objects and painted pixels live in \`public/\` and are \`<Img>\` nodes.
- A clipping mask wraps the base layer and the layers clipped to it. A vector mask becomes \`clip-path: path(...)\`. A layer with no vector mask clips to its box.
- There were no keyframes in the PSD. The composition is ${HOLD_FRAMES} frames at ${FPS} fps so you can move these layers on a timeline.

${out.notes.map((line) => `- ${line}`).join("\n")}
`;
  const files: ZipEntry[] = [
    {
      path: "package.json",
      data: textOf(JSON.stringify({
        name: name.toLowerCase(),
        private: true,
        scripts: { start: "remotion studio", still: `remotion still ${name} out.png` },
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0", remotion: "^4.0.0" },
      }, null, 2)),
    },
    {
      path: "tsconfig.json",
      data: textOf(JSON.stringify({
        compilerOptions: {
          target: "ES2018",
          module: "ES2022",
          jsx: "react-jsx",
          strict: true,
          moduleResolution: "bundler",
          esModuleInterop: true,
          skipLibCheck: true,
        },
      }, null, 2)),
    },
    { path: "remotion.config.ts", data: textOf(`import { Config } from "@remotion/cli/config";\n\nConfig.setVideoImageFormat("jpeg");\n`) },
    { path: "src/index.ts", data: textOf(`import { registerRoot } from "remotion";\nimport { RemotionRoot } from "./Root";\n\nregisterRoot(RemotionRoot);\n`) },
    {
      path: "src/Root.tsx",
      data: textOf(`import React from "react";\nimport { Composition } from "remotion";\nimport { ${name} } from "./Composition";\n\nexport const RemotionRoot: React.FC = () => {\n  return (\n    <Composition\n      id="${name}"\n      component={${name}}\n      durationInFrames={${HOLD_FRAMES}}\n      fps={${FPS}}\n      width={${width}}\n      height={${height}}\n    />\n  );\n};\n`),
    },
    { path: "src/Composition.tsx", data: textOf(composition) },
    { path: "README.md", data: textOf(readme) },
    ...out.assets,
  ];
  return { name, width, height, html, files, notes: out.notes };
}

export async function projectFromPhotoshop(bytes: Uint8Array, filename: string) {
  const { readPsd } = await import("ag-psd");
  return projectFromPsd(readPsd(bytes), filename);
}

export function projectZip(project: RemotionProject) {
  return zipStore(project.files);
}
