import type { BlendMode, Layer, LinkedFile, Psd, UnitsValue, VectorContent } from "ag-psd";
import { lightAngle, shadowDistance, type Shadow } from "./model.ts";
import type { Scene, SceneLayer } from "./scene.ts";
import { pathsForShape, roundRectPath, type SceneFill, type ScenePath, type SceneStroke } from "./vector.ts";

function pixels(value: number): UnitsValue {
  return { units: "Pixels", value: Math.round(value * 100) / 100 };
}

function effect(shadow: Shadow) {
  return {
    present: true,
    enabled: true,
    showInDialog: true,
    blendMode: "normal" as const,
    color: { r: shadow.color.r, g: shadow.color.g, b: shadow.color.b },
    opacity: Math.min(1, Math.max(0, shadow.color.a)),
    angle: lightAngle(shadow.offsetX, shadow.offsetY),
    useGlobalLight: false,
    distance: pixels(shadowDistance(shadow.offsetX, shadow.offsetY)),
    size: pixels(Math.max(0, shadow.blur)),
    choke: pixels(Math.max(0, shadow.spread)),
    antialiased: true,
    layerConceals: true,
  };
}

function effectInfo(shadows: Shadow[] | undefined) {
  if (!shadows?.length) return undefined;
  const dropShadow = shadows.filter((shadow) => !shadow.inset).map(effect);
  const innerShadow = shadows.filter((shadow) => shadow.inset).map(effect);
  return {
    ...(dropShadow.length ? { dropShadow } : {}),
    ...(innerShadow.length ? { innerShadow } : {}),
  };
}

function blendOf(mode: string): BlendMode {
  if (mode === "pass through") return "pass through";
  return mode as BlendMode;
}

function vectorContent(fill: SceneFill): VectorContent {
  if (fill.type === "color") {
    return { type: "color", color: { r: fill.color.r, g: fill.color.g, b: fill.color.b } };
  }
  return {
    type: "solid",
    name: "CSS gradient",
    smoothness: 4096,
    colorStops: fill.stops.map((stop) => ({
      color: { r: stop.color.r, g: stop.color.g, b: stop.color.b },
      location: Math.min(1, Math.max(0, stop.offset)),
      midpoint: 0.5,
    })),
    opacityStops: fill.stops.map((stop) => ({
      opacity: Math.min(1, Math.max(0, stop.color.a)),
      location: Math.min(1, Math.max(0, stop.offset)),
      midpoint: 0.5,
    })),
    style: fill.type,
    angle: (fill.angle - 90 + 360) % 360,
    align: true,
    scale: 100,
    reverse: false,
  };
}

function vectorStroke(stroke: SceneStroke) {
  return {
    strokeEnabled: true,
    fillEnabled: true,
    lineWidth: pixels(stroke.width),
    lineDashOffset: pixels(0),
    miterLimit: 4,
    lineCapType: "butt" as const,
    lineJoinType: "miter" as const,
    lineAlignment: "inside" as const,
    scaleLock: false,
    strokeAdjust: false,
    lineDashSet: stroke.dash.map((value) => pixels(value)),
    blendMode: "normal" as const,
    opacity: Math.min(1, Math.max(0, stroke.color.a)),
    content: { type: "color" as const, color: { r: stroke.color.r, g: stroke.color.g, b: stroke.color.b } },
    resolution: 72,
  };
}

function maskFromPaths(paths: ScenePath[]) {
  return {
    paths: paths.map((path, index) => ({
      open: path.open,
      operation: index === 0 ? ("combine" as const) : ("combine" as const),
      fillRule: "non-zero" as const,
      knots: path.knots.map((item) => ({ linked: item.linked, points: item.points })),
    })),
    fillStartsWithAllPixels: false,
  };
}

function shapeLayer(layer: SceneLayer): Layer {
  const shape = layer.shape!;
  const box = { x: layer.left, y: layer.top, w: layer.width, h: layer.height };
  const paths = pathsForShape(shape, box);
  const live = shape.origin === "rect" || shape.origin === "round" || shape.origin === "ellipse";
  const result: Layer = {
    name: layer.name,
    left: Math.round(layer.left),
    top: Math.round(layer.top),
    right: Math.round(layer.left + layer.width),
    bottom: Math.round(layer.top + layer.height),
    opacity: layer.opacity,
    hidden: layer.hidden,
    blendMode: blendOf(layer.blendMode) === "pass through" ? "normal" : blendOf(layer.blendMode),
    effects: effectInfo(layer.shadows),
    fillOpacity: layer.fillOpacity,
    usingAlignedRendering: live,
    vectorMask: maskFromPaths(paths),
  };
  if (shape.fill) result.vectorFill = vectorContent(shape.fill);
  if (shape.stroke) {
    const stroke = vectorStroke(shape.stroke);
    stroke.fillEnabled = Boolean(shape.fill) && (layer.fillOpacity ?? 1) > 0;
    result.vectorStroke = stroke;
  } else if (shape.fill) {
    result.vectorStroke = { strokeEnabled: false, fillEnabled: (layer.fillOpacity ?? 1) > 0 };
  }
  if (live) {
    result.vectorOrigination = {
      keyDescriptorList: [
        {
          keyOriginType: shape.origin === "ellipse" ? 5 : shape.origin === "round" ? 2 : 1,
          keyOriginResolution: 72,
          keyOriginRRectRadii: {
            topLeft: pixels(shape.radii[0]),
            topRight: pixels(shape.radii[1]),
            bottomRight: pixels(shape.radii[2]),
            bottomLeft: pixels(shape.radii[3]),
          },
          keyOriginShapeBoundingBox: {
            top: pixels(layer.top),
            left: pixels(layer.left),
            bottom: pixels(layer.top + layer.height),
            right: pixels(layer.left + layer.width),
          },
        },
      ],
    };
  }
  return result;
}

function toLayer(layer: SceneLayer, files: LinkedFile[]): Layer {
  const blend = blendOf(layer.blendMode);
  if (layer.baked && layer.canvas) {
    return {
      name: layer.name,
      left: Math.round(layer.left),
      top: Math.round(layer.top),
      canvas: layer.canvas,
      opacity: layer.opacity,
      hidden: layer.hidden,
      blendMode: blend === "pass through" ? "normal" : blend,
      layerColor: "red",
    };
  }
  if (layer.kind === "group") {
    const group: Layer = {
      name: layer.name,
      children: layer.children.filter((child) => !child.folded).map((child) => toLayer(child, files)),
      opacity: layer.opacity,
      hidden: layer.hidden,
      blendMode: blend,
      opened: true,
      layerColor: "blue",
    };
    if (layer.mask) {
      group.mask = {
        canvas: layer.mask.canvas,
        left: Math.round(layer.mask.left),
        top: Math.round(layer.mask.top),
        defaultColor: 0,
        disabled: false,
        positionRelativeToLayer: false,
      };
    }
    return group;
  }
  if (layer.kind === "shape" && layer.shape) return shapeLayer(layer);
  if (layer.kind === "smart" && layer.smart) {
    const smart = layer.smart;
    const bytes = smart.png ?? (smart.svg ? new TextEncoder().encode(smart.svg) : undefined);
    if (bytes) {
      files.push({ id: smart.id, name: smart.name, data: bytes });
      const left = Math.round(layer.left);
      const top = Math.round(layer.top);
      const right = left + Math.max(1, Math.round(layer.width));
      const bottom = top + Math.max(1, Math.round(layer.height));
      const placed: Layer = {
        name: layer.name,
        opacity: layer.opacity,
        hidden: layer.hidden,
        blendMode: blend === "pass through" ? "normal" : blend,
        effects: effectInfo(layer.shadows),
        placedLayer: {
          id: smart.id,
          placed: smart.placed,
          type: smart.vector ? "vector" : "raster",
          transform: [left, top, right, top, right, bottom, left, bottom],
          width: Math.max(1, Math.round(layer.width)),
          height: Math.max(1, Math.round(layer.height)),
          resolution: { value: 72, units: "Density" },
        },
      };
      if (layer.clipRadii?.some((radius) => radius > 0.5)) {
        placed.vectorMask = maskFromPaths([roundRectPath(left, top, right - left, bottom - top, layer.clipRadii)]);
      }
      return placed;
    }
  }
  if (layer.text) {
    const text = layer.text;
    return {
      name: layer.name,
      opacity: layer.opacity * (text.color.a < 1 ? text.color.a : 1),
      hidden: layer.hidden,
      blendMode: blend === "pass through" ? "normal" : blend,
      effects: effectInfo(layer.shadows),
      layerColor: "yellow",
      text: {
        text: text.value,
        transform: [1, 0, 0, 1, text.anchorX, text.baseline],
        antiAlias: "smooth",
        shapeType: "point",
        useFractionalGlyphWidths: true,
        style: {
          font: { name: text.psFont },
          fontSize: text.fontSize,
          leading: Math.max(1, text.leading),
          tracking: text.tracking,
          autoKerning: true,
          fauxBold: text.fauxBold,
          fauxItalic: text.fauxItalic,
          fillColor: { r: text.color.r, g: text.color.g, b: text.color.b },
          underline: text.underline,
          strikethrough: text.strike,
        },
        paragraphStyle: { justification: text.align },
      },
    };
  }
  if (layer.canvas) {
    return {
      name: layer.name,
      left: Math.round(layer.left),
      top: Math.round(layer.top),
      canvas: layer.canvas,
      opacity: layer.opacity,
      fillOpacity: layer.fillOpacity,
      hidden: layer.hidden,
      blendMode: blend === "pass through" ? "normal" : blend,
      effects: effectInfo(layer.shadows),
    };
  }
  return { name: layer.name, hidden: true, opacity: 0 };
}

export function sceneToPsd(scene: Scene): Psd {
  const linkedFiles: LinkedFile[] = [];
  const children = scene.layers.map((layer) => toLayer(layer, linkedFiles));
  return {
    width: Math.max(1, Math.round(scene.width)),
    height: Math.max(1, Math.round(scene.height)),
    children,
    ...(linkedFiles.length ? { linkedFiles } : {}),
    imageResources: {
      resolutionInfo: {
        horizontalResolution: 72,
        horizontalResolutionUnit: "PPI",
        widthUnit: "Points",
        heightUnit: "Points",
        verticalResolution: 72,
        verticalResolutionUnit: "PPI",
      },
    },
  };
}

export async function downloadScene(scene: Scene, filename: string) {
  const { writePsdUint8Array } = await import("ag-psd");
  const bytes = writePsdUint8Array(sceneToPsd(scene));
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "image/vnd.adobe.photoshop" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}