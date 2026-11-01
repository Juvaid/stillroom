import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAtPath, layerHook, nextLayerName, patchLayerStyle, patchStill, stampStillIds, topLayerAt } from "./edit.ts";
import type { SceneLayer } from "./scene.ts";

function layer(id: string, box: SceneLayer["box"], children: SceneLayer[] = []): SceneLayer {
  return {
    id,
    name: id,
    kind: "shape",
    hidden: false,
    opacity: 1,
    blendMode: "normal",
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    box,
    children,
  };
}

describe("live edit", () => {
  it("picks the front layer and ignores a hidden one", () => {
    const back = layer("back", { x: 0, y: 0, w: 100, h: 100 });
    const front = layer("front", { x: 10, y: 10, w: 40, h: 40 });
    const hidden = layer("gone", { x: 10, y: 10, w: 40, h: 40 });
    hidden.hidden = true;
    const hit = topLayerAt([back, hidden, front], 20, 20);
    assert.equal(hit?.id, "front");
  });

  it("writes position back onto the named layer", () => {
    const html = `<div data-clip="card" style="position:relative;background:#fff"><b data-layer="title" style="font-size:32px;color:#111">Hi</b></div>`;
    const next = patchLayerStyle(html, layerHook("title  f0–12"), { left: 24, top: 40, fontSize: 18 });
    assert.match(next, /data-layer="title"/);
    assert.match(next, /left:24px/);
    assert.match(next, /top:40px/);
    assert.match(next, /font-size:18px/);
    assert.match(next, /data-clip="card" style="position:relative;background:#fff"/);
  });

  it("names an unnamed object and writes the edit there", () => {
    const html = `<div style="position:relative"><p style="font-size:16px">Hello there</p></div>`;
    const named = applyAtPath(html, [0, 0], { left: 12, top: 8 }, "Hello there");
    assert.match(named, /data-layer="hello-there"/);
    assert.match(named, /left:12px/);
    assert.match(named, /top:8px/);
    assert.match(named, /right:auto/);
    const moved = applyAtPath(named, [0, 0], { left: 40 }, "Hello there");
    assert.equal(moved.match(/data-layer=/g)?.length, 1);
    assert.match(moved, /left:40px/);
    assert.equal(nextLayerName(["hello-there"], "Hello there"), "hello-there-2");
  });

  it("moves a stock Remotion AbsoluteFill instead of stretching it", () => {
    const html = `<div data-remotion-comp="HelloWorld" style="position:relative;width:960px;height:540px;background:#fff">
  <div style="position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;display:flex;justify-content:center;align-items:center">
    <h1 style="font-size:64px;margin:0;color:#111">Welcome to Remotion</h1>
  </div>
  <div style="position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center">
    <div style="background:#0b84f3;color:#fff;padding:16px 28px">Get started</div>
  </div>
</div>`;
    const title = applyAtPath(html, [0, 0, 0], { left: 120, top: 80 }, "Welcome to Remotion");
    assert.match(title, /<h1 data-layer="welcome-to-remotion"[^>]*left:120px/);
    assert.match(title, /top:80px/);
    const button = applyAtPath(html, [0, 1], { left: 40, top: 360 }, "Get started");
    assert.match(button, /data-layer="get-started"/);
    assert.match(button, /left:40px/);
    assert.match(button, /top:360px/);
    assert.match(button, /right:auto/);
    assert.match(button, /bottom:auto/);
    assert.doesNotMatch(button, /inset:/);
  });

  it("stamps stable ids and edits the second copy, not the first", () => {
    const html = `<table><tr><td>One</td></tr></table><div data-layer="card">A</div><div data-layer="card">B</div>`;
    const stamped = stampStillIds(html);
    assert.equal(stampStillIds(stamped), stamped);
    assert.match(stamped, /<td data-still="s3">/);
    const second = stamped.match(/<div data-still="(s\d+)" data-layer="card">B/)?.[1];
    assert.ok(second);
    const moved = patchStill(stamped, second, { left: 12, top: 4 }, "B");
    const cards = [...moved.matchAll(/<div\b[^>]*>/g)].map((match) => match[0]);
    assert.match(cards[1], /left:12px/);
    assert.doesNotMatch(cards[0], /left:12px/);
  });
});
