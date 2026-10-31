import type { Finding, Rgba, Shadow } from "./model.ts";

export type TextRun = {
  value: string;
  psFont: string;
  cssFont: string;
  fontSize: number;
  leading: number;
  tracking: number;
  align: "left" | "center" | "right";
  color: Rgba;
  fauxBold: boolean;
  fauxItalic: boolean;
  underline: boolean;
  strike: boolean;
  anchorX: number;
  baseline: number;
};

export type SceneLayer = {
  id: string;
  name: string;
  kind: "group" | "pixel" | "type";
  hidden: boolean;
  opacity: number;
  blendMode: string;
  left: number;
  top: number;
  width: number;
  height: number;
  box: { x: number; y: number; w: number; h: number };
  children: SceneLayer[];
  canvas?: HTMLCanvasElement;
  text?: TextRun;
  shadows?: Shadow[];
  fillOpacity?: number;
  mask?: {
    canvas: HTMLCanvasElement;
    left: number;
    top: number;
    width: number;
    height: number;
  };
  baked?: boolean;
  folded?: boolean;
};

export type Scene = {
  width: number;
  height: number;
  frame: number | null;
  duration: number | null;
  fps: number | null;
  comp: string | null;
  layers: SceneLayer[];
  findings: Finding[];
};

export function layerById(layers: SceneLayer[], id: string): SceneLayer | null {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    const nested = layerById(layer.children, id);
    if (nested) return nested;
  }
  return null;
}

export function countLayers(layers: SceneLayer[]): number {
  return layers.reduce((sum, layer) => sum + 1 + countLayers(layer.children), 0);
}
