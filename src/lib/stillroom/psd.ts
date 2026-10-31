import type { BlendMode, Layer, Psd } from "ag-psd";
import { lightAngle, shadowDistance, type Shadow } from "./model.ts";
import type { Scene, SceneLayer } from "./scene.ts";

function pixels(value: number) {
  return { units: "Pixels" as const, value: Math.round(value * 100) / 100 };
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

function toLayer(layer: SceneLayer): Layer {
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
      children: layer.children.filter((child) => !child.folded).map(toLayer),
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
          autoLeading: false,
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
  return {
    width: Math.max(1, Math.round(scene.width)),
    height: Math.max(1, Math.round(scene.height)),
    children: scene.layers.map(toLayer),
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
