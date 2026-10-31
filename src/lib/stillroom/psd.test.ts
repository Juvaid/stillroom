import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readPsd, writePsdUint8Array } from "ag-psd";
import { sceneToPsd } from "./psd.ts";
import type { Scene } from "./scene.ts";

describe("psd export", () => {
  it("writes a group and a live type layer", () => {
    const scene: Scene = {
      width: 200,
      height: 80,
      frame: 12,
      duration: 48,
      fps: 30,
      comp: "Launch",
      findings: [],
      layers: [
        {
          id: "g",
          name: "title  f12–48",
          kind: "group",
          hidden: false,
          opacity: 0.5,
          blendMode: "pass through",
          left: 0,
          top: 0,
          width: 200,
          height: 80,
          box: { x: 0, y: 0, w: 200, h: 80 },
          children: [
            {
              id: "t",
              name: "headline",
              kind: "type",
              hidden: false,
              opacity: 1,
              blendMode: "normal",
              left: 16,
              top: 20,
              width: 160,
              height: 40,
              box: { x: 16, y: 20, w: 160, h: 40 },
              children: [],
              text: {
                value: "Close the timeline.",
                psFont: "TimesNewRomanPS-BoldMT",
                cssFont: "700 32px serif",
                fontSize: 32,
                leading: 36,
                tracking: -21,
                align: "left",
                color: { r: 244, g: 240, b: 232, a: 1 },
                fauxBold: false,
                fauxItalic: false,
                underline: false,
                strike: false,
                anchorX: 16,
                baseline: 48,
              },
            },
          ],
        },
      ],
    };
    const bytes = writePsdUint8Array(sceneToPsd(scene));
    const psd = readPsd(bytes, { skipLayerImageData: true, skipCompositeImageData: true });
    assert.equal(psd.width, 200);
    assert.equal(psd.children?.length, 1);
    const group = psd.children?.[0];
    assert.equal(group?.name, "title  f12–48");
    assert.equal(group?.blendMode, "pass through");
    assert.ok(Math.abs((group?.opacity ?? 0) - 0.5) < 0.01);
    const type = group?.children?.[0];
    assert.equal(type?.name, "headline");
    assert.equal(type?.text?.text, "Close the timeline.");
    assert.equal(type?.text?.style?.font?.name, "TimesNewRomanPS-BoldMT");
    assert.equal(type?.text?.style?.tracking, -21);
    assert.equal(psd.imageResources?.resolutionInfo?.horizontalResolution, 72);
  });

  it("writes a live shape and an embedded smart object", () => {
    const png = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 15, 4, 0, 0, 1, 1, 1, 0, 27, 182, 238, 86, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ]);
    const scene: Scene = {
      width: 120,
      height: 80,
      frame: null,
      duration: null,
      fps: null,
      comp: null,
      findings: [],
      layers: [
        {
          id: "s",
          name: "dot",
          kind: "shape",
          hidden: false,
          opacity: 1,
          blendMode: "normal",
          left: 10,
          top: 12,
          width: 40,
          height: 40,
          box: { x: 10, y: 12, w: 40, h: 40 },
          children: [],
          shape: {
            origin: "ellipse",
            radii: [20, 20, 20, 20],
            fill: { type: "color", color: { r: 226, g: 61, b: 26, a: 1 } },
            stroke: null,
          },
        },
        {
          id: "p",
          name: "photo",
          kind: "smart",
          hidden: false,
          opacity: 1,
          blendMode: "normal",
          left: 60,
          top: 8,
          width: 32,
          height: 24,
          box: { x: 60, y: 8, w: 32, h: 24 },
          children: [],
          clipRadii: [8, 8, 8, 8],
          smart: {
            id: "20953ddb-9391-11ec-b4f1-c15674f50bc4",
            placed: "20953dda-9391-11ec-b4f1-c15674f50bc4",
            name: "photo.png",
            png,
            vector: false,
          },
        },
      ],
    };
    const bytes = writePsdUint8Array(sceneToPsd(scene));
    const psd = readPsd(bytes, { skipLayerImageData: true, skipCompositeImageData: true });
    const shape = psd.children?.find((layer) => layer.name === "dot");
    const photo = psd.children?.find((layer) => layer.name === "photo");
    assert.equal(shape?.vectorFill && "type" in shape.vectorFill ? shape.vectorFill.type : "", "color");
    assert.equal(shape?.vectorMask?.paths.length, 1);
    assert.equal(shape?.vectorOrigination?.keyDescriptorList[0]?.keyOriginType, 5);
    assert.ok((shape?.vectorMask?.paths[0]?.knots.length ?? 0) >= 4);
    assert.equal(photo?.placedLayer?.type, "raster");
    assert.equal(photo?.placedLayer?.id, "20953ddb-9391-11ec-b4f1-c15674f50bc4");
    assert.equal(photo?.vectorMask?.paths.length, 1);
    assert.equal(psd.linkedFiles?.length, 1);
    assert.equal(psd.linkedFiles?.[0]?.name, "photo.png");
    assert.ok((psd.linkedFiles?.[0]?.data?.length ?? 0) > 8);
  });
});
