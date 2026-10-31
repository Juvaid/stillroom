import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readStillMeta, stillFilename } from "./intake.ts";

describe("still intake", () => {
  it("reads the largest box and the closed frame", () => {
    const html = `<div style="width:36px;height:36px"></div>
<div style="position:relative;width:960px;height:540px"></div>
<script>renderFrame(window.__STILL_FRAME ?? 42);</script>`;
    const meta = readStillMeta(html);
    assert.equal(meta.width, 960);
    assert.equal(meta.height, 540);
    assert.equal(meta.frame, 42);
  });

  it("prefers data-width and names the file from the comp", () => {
    const meta = readStillMeta(`<div data-width="800" data-height="700" data-frame="3" style="width:100px;height:100px"></div>`);
    assert.deepEqual(meta, { width: 800, height: 700, frame: 3 });
    assert.equal(stillFilename("Launch Still.html", 3), "launch-still-f3.psd");
  });
});
