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
});
