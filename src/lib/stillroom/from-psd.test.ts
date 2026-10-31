import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readPsd, writePsdUint8Array, type Psd } from "ag-psd";
import { projectFromPsd, projectZip } from "./from-psd.ts";
import { sceneToPsd } from "./psd.ts";
import type { Scene } from "./scene.ts";

describe("photoshop to remotion", () => {
  it("keeps panel order, clips to the shape, and inlines svg", () => {
    const svg = new TextEncoder().encode("<svg viewBox=\"0 0 10 10\"><path d=\"M0 0 L10 10\"/></svg>");
    const psd = {
      width: 120,
      height: 80,
      linkedFiles: [{ id: "icon", name: "icon.svg", data: svg }],
      children: [
        {
          name: "Back",
          left: 4,
          top: 6,
          right: 44,
          bottom: 46,
          vectorFill: { type: "color", color: { r: 0.2, g: 0.2, b: 0.2 } },
          vectorMask: {
            paths: [
              {
                open: false,
                fillRule: "non-zero",
                knots: [
                  { linked: false, points: [4, 6, 4, 6, 4, 6] },
                  { linked: false, points: [44, 6, 44, 6, 44, 6] },
                  { linked: false, points: [44, 46, 44, 46, 44, 46] },
                  { linked: false, points: [4, 46, 4, 46, 4, 46] },
                ],
              },
            ],
          },
        },
        {
          name: "Inside",
          clipping: true,
          text: {
            text: "clipped",
            transform: [1, 0, 0, 1, 10, 30],
            style: { font: { name: "ArialMT" }, fontSize: 14, fillColor: { r: 1, g: 1, b: 1 } },
            paragraphStyle: { justification: "left" },
          },
        },
        {
          name: "Mark",
          placedLayer: {
            id: "icon",
            type: "vector",
            placed: "mark",
            transform: [50, 8, 80, 8, 80, 38, 50, 38],
            width: 30,
            height: 30,
          },
        },
        {
          name: "Front",
          text: {
            text: "above",
            transform: [1, 0, 0, 1, 8, 18],
            style: { font: { name: "ArialMT" }, fontSize: 12, fillColor: { r: 0, g: 0, b: 0 } },
            paragraphStyle: { justification: "left" },
          },
        },
      ],
    } as Psd;
    const project = projectFromPsd(psd, "Card.psd");
    const clipAt = project.html.indexOf("data-clip=\"Back\"");
    const frontAt = project.html.indexOf("data-layer=\"Front\"");
    assert.ok(clipAt >= 0 && frontAt > clipAt);
    assert.match(project.html.slice(clipAt, frontAt), /clip-path:path\(/);
    assert.match(project.html.slice(clipAt, frontAt), /data-layer="Inside"/);
    assert.match(project.html, /z-index:1/);
    assert.match(project.html, /z-index:3/);
    assert.match(project.html, /<svg[^>]*data-layer="Back"/);
    assert.match(project.html, /<path d="M0 0 L10 10"/);
    const source = new TextDecoder().decode(project.files.find((file) => file.path === "src/Composition.tsx")!.data);
    assert.match(source, /zIndex: 1/);
    assert.match(source, /clipPath: "path\(/);
    assert.match(source, /data-clip="Back"/);
    const zip = projectZip(project);
    assert.equal(zip[0], 0x50);
    assert.equal(zip[1], 0x4b);
  });

  it("reads a written shape back as svg, under the type layer", () => {
    const scene: Scene = {
      width: 100,
      height: 80,
      frame: null,
      duration: null,
      fps: null,
      comp: "Order",
      findings: [],
      layers: [
        {
          id: "shape",
          name: "Plate",
          kind: "shape",
          hidden: false,
          opacity: 1,
          blendMode: "normal",
          left: 8,
          top: 10,
          width: 40,
          height: 24,
          box: { x: 8, y: 10, w: 40, h: 24 },
          children: [],
          fillOpacity: 1,
          shape: { origin: "rect", radii: [0, 0, 0, 0], fill: { type: "color", color: { r: 0.8, g: 0.1, b: 0.1, a: 1 } }, stroke: null },
        },
        {
          id: "type",
          name: "Title",
          kind: "type",
          hidden: false,
          opacity: 1,
          blendMode: "normal",
          left: 12,
          top: 16,
          width: 40,
          height: 20,
          box: { x: 12, y: 16, w: 40, h: 20 },
          children: [],
          text: {
            value: "On top",
            psFont: "ArialMT",
            cssFont: "16px Arial",
            fontSize: 16,
            leading: 18,
            tracking: 0,
            align: "left",
            color: { r: 0, g: 0, b: 0, a: 1 },
            fauxBold: false,
            fauxItalic: false,
            underline: false,
            strike: false,
            anchorX: 12,
            baseline: 32,
          },
        },
      ],
    };
    const bytes = writePsdUint8Array(sceneToPsd(scene));
    const psd = readPsd(bytes, { skipLayerImageData: true, skipCompositeImageData: true });
    const project = projectFromPsd(psd, "Order.psd");
    const plate = project.html.indexOf("data-layer=\"Plate\"");
    const title = project.html.indexOf("data-layer=\"Title\"");
    assert.ok(plate >= 0 && title > plate);
    assert.match(project.html, /data-layer="Plate"[^>]*left:8px/);
    assert.match(project.html, /<svg[^>]*data-layer="Plate"/);
    assert.ok(title > plate);
    assert.match(project.html.slice(plate, title), /z-index:1/);
    assert.match(project.html.slice(title), /z-index:2/);
    assert.match(project.html, /On top/);
  });
});
