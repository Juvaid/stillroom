import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseFont,
  clipVisible,
  isolationFor,
  lightAngle,
  paintRank,
  parseGradients,
  parseShadows,
  sortForPaint,
  trackingFromLetterSpacing,
  transformKind,
} from "./model.ts";

describe("photoshop shadow angle", () => {
  it("maps a down-right offset to 135°", () => {
    assert.equal(Math.round(lightAngle(3, 3)), 135);
  });

  it("maps a straight-down shadow to 90°", () => {
    assert.equal(Math.round(lightAngle(0, 4)), 90);
  });
});

describe("paint order", () => {
  it("puts negative z under flow, then positioned, then positive z", () => {
    const items = [
      { id: "flow", position: "static", zIndex: "auto", cssOrder: 0, domIndex: 0 },
      { id: "badge", position: "absolute", zIndex: "2", cssOrder: 0, domIndex: 1 },
      { id: "watermark", position: "absolute", zIndex: "-1", cssOrder: 0, domIndex: 2 },
      { id: "card", position: "relative", zIndex: "auto", cssOrder: 0, domIndex: 3 },
    ];
    const order = sortForPaint(items, (item) => item).map((item) => item.id);
    assert.deepEqual(order, ["watermark", "flow", "card", "badge"]);
  });

  it("ranks a positive z-index in the top band", () => {
    const rank = paintRank({ domIndex: 1, position: "absolute", zIndex: "4", cssOrder: 0 });
    assert.equal(rank[0], 3);
    assert.equal(rank[1], 4);
  });
});

describe("groups", () => {
  it("isolates opacity so the folder is Normal, not Pass Through", () => {
    const group = isolationFor({
      opacity: 0.4,
      blendMode: "normal",
      isolation: "auto",
      filter: "none",
      backdrop: "none",
      clipPath: "none",
      maskImage: "none",
      transform: "none",
      willChange: "auto",
    });
    assert.equal(group.isolated, true);
    assert.equal(group.passThrough, false);
    assert.equal(group.blendMode, "normal");
  });

  it("lets a plain wrapper pass blends through", () => {
    const group = isolationFor({
      opacity: 1,
      blendMode: "normal",
      isolation: "auto",
      filter: "none",
      backdrop: "none",
      clipPath: "none",
      maskImage: "none",
      transform: "translate",
      willChange: "auto",
    });
    assert.equal(group.passThrough, true);
  });

  it("hides a Remotion clip that has not started", () => {
    assert.equal(clipVisible(42, 12, 84), true);
    assert.equal(clipVisible(42, 48, 20), false);
    assert.equal(clipVisible(null, 12, 10), true);
  });
});

describe("type", () => {
  it("converts letter-spacing to thousandths of an em", () => {
    assert.equal(trackingFromLetterSpacing(1.6, 16), 100);
    assert.equal(trackingFromLetterSpacing(-1.5, 72), -21);
  });

  it("renames Liberation Sans to Arial", () => {
    const font = chooseFont("Liberation Sans", 700, false);
    assert.equal(font.psName, "Arial-BoldMT");
    assert.equal(font.fauxBold, false);
  });

  it("keeps an unknown webfont name and warns", () => {
    const font = chooseFont("Instrument Sans", 500, false);
    assert.equal(font.psName, "Instrument Sans");
    assert.equal(font.fate, "approximated");
  });
});

describe("effects parsing", () => {
  it("reads a two-layer box-shadow", () => {
    const shadows = parseShadows(
      "rgba(0, 0, 0, 0.25) 0px 18px 40px 0px, inset 0px 1px 0px rgba(255, 255, 255, 0.4)",
    );
    assert.equal(shadows.length, 2);
    assert.equal(shadows[0].inset, false);
    assert.equal(shadows[0].blur, 40);
    assert.equal(shadows[1].inset, true);
    assert.equal(shadows[1].color.a, 0.4);
  });

  it("keeps a 90deg angle after the color-space prefix", () => {
    const grads = parseGradients("linear-gradient(in srgb, 90deg, rgb(226, 61, 26) 0%, rgb(20, 19, 17) 100%)");
    assert.equal(grads.length, 1);
    assert.equal(grads[0].angle, 90);
    assert.equal(grads[0].stops[0].color.r, 226);
  });

  it("reads a linear gradient the way Chrome computes it", () => {
    const grads = parseGradients(
      "linear-gradient(in srgb, rgb(226, 61, 26) 0%, rgb(20, 19, 17) 100%)",
    );
    assert.equal(grads.length, 1);
    assert.equal(grads[0].kind, "linear");
    assert.equal(grads[0].stops[0].color.r, 226);
    assert.equal(grads[0].stops[1].offset, 1);
  });
});

describe("transforms", () => {
  it("treats a pure translate matrix as placement, not a bake", () => {
    assert.equal(transformKind("matrix(1, 0, 0, 1, 12, -4)"), "translate");
    assert.equal(transformKind("matrix(0.99, 0.14, -0.14, 0.99, 0, 0)"), "complex");
    assert.equal(transformKind("none"), "none");
  });
});
