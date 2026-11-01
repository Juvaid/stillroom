import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { readPsd, writePsdUint8Array } from "ag-psd";
import { sceneToPsd } from "../src/lib/stillroom/psd.ts";
import type { Scene } from "../src/lib/stillroom/scene.ts";

const presets = ["Launch still", "Clips and stacks", "Type proof", "Effects bench", "Assets and notices"];

function sampleScene(): Scene {
  return {
    width: 960,
    height: 540,
    frame: 42,
    duration: 96,
    fps: 30,
    comp: "Bench",
    findings: [],
    layers: [
      {
        id: "card",
        name: "card",
        kind: "group",
        hidden: false,
        opacity: 1,
        blendMode: "pass through",
        left: 0,
        top: 0,
        width: 960,
        height: 540,
        box: { x: 0, y: 0, w: 960, h: 540 },
        children: [
          {
            id: "plate",
            name: "plate",
            kind: "shape",
            hidden: false,
            opacity: 1,
            blendMode: "normal",
            left: 48,
            top: 64,
            width: 280,
            height: 160,
            box: { x: 48, y: 64, w: 280, h: 160 },
            children: [],
            fillOpacity: 1,
            shape: {
              origin: "round",
              radii: [18, 18, 18, 18],
              fill: { type: "color", color: { r: 0.886, g: 0.239, b: 0.102, a: 1 } },
              stroke: null,
            },
          },
          {
            id: "title",
            name: "title",
            kind: "type",
            hidden: false,
            opacity: 1,
            blendMode: "normal",
            left: 64,
            top: 80,
            width: 400,
            height: 48,
            box: { x: 64, y: 80, w: 400, h: 48 },
            children: [],
            text: {
              value: "Close the timeline.",
              psFont: "ArialMT",
              cssFont: "32px Arial",
              fontSize: 32,
              leading: 38,
              tracking: 0,
              align: "left",
              color: { r: 0.957, g: 0.941, b: 0.91, a: 1 },
              fauxBold: false,
              fauxItalic: false,
              underline: false,
              strike: false,
              anchorX: 64,
              baseline: 112,
            },
          },
        ],
      },
    ],
  };
}

function structural() {
  const scene = sampleScene();
  const started = performance.now();
  let bytes = writePsdUint8Array(sceneToPsd(scene));
  for (let i = 0; i < 29; i++) bytes = writePsdUint8Array(sceneToPsd(scene));
  const writeMs = (performance.now() - started) / 30;
  const readStarted = performance.now();
  let psd = readPsd(bytes, { skipLayerImageData: true, skipCompositeImageData: true });
  for (let i = 0; i < 29; i++) psd = readPsd(bytes, { skipLayerImageData: true, skipCompositeImageData: true });
  const readMs = (performance.now() - readStarted) / 30;
  const group = psd.children?.[0];
  const shape = group?.children?.[0];
  const type = group?.children?.[1];
  const checks = {
    size: psd.width === 960 && psd.height === 540,
    group: group?.name === "card" && (group.children?.length ?? 0) === 2,
    shape: Boolean(shape?.vectorFill && shape.vectorMask?.paths?.length),
    radii: shape?.vectorOrigination?.keyDescriptorList?.[0]?.keyOriginType === 2,
    type: type?.text?.text === "Close the timeline." && type.text.style?.fontSize === 32,
    resolution: psd.imageResources?.resolutionInfo?.horizontalResolution === 72,
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    writeMs: Math.round(writeMs * 100) / 100,
    readMs: Math.round(readMs * 100) / 100,
    bytes: bytes.byteLength,
    passed,
    total: Object.keys(checks).length,
  };
}

async function settle(page: Page) {
  await page.waitForFunction(() => !document.body.innerText.includes("pressing"), undefined, { timeout: 20000 });
  await page.waitForTimeout(350);
}

async function grab(page: Page, preset: string) {
  await page.getByRole("button", { name: new RegExp(`^${preset}`) }).first().click();
  await settle(page);
  await page.getByRole("button", { name: "Frame", exact: true }).click();
  await page.evaluate(() => {
    const iframe = document.querySelector("iframe");
    const host = iframe?.parentElement as HTMLElement | null;
    if (!iframe || !host) return;
    host.style.transform = "none";
    const match = document.body.innerText.match(/· f(\d+)/);
    const frame = match ? Number(match[1]) : 0;
    const doc = iframe.contentDocument;
    if (!doc) return;
    for (const el of doc.querySelectorAll("[data-from]")) {
      const from = Number(el.getAttribute("data-from"));
      const duration = Number(el.getAttribute("data-duration") || 0);
      const on = frame >= from && frame < from + duration;
      (el as HTMLElement).style.visibility = on ? "" : "hidden";
    }
  });
  const frame = await page.locator("iframe[title='Composition frame']").screenshot();
  await page.getByRole("button", { name: "Proof", exact: true }).click();
  await page.waitForTimeout(200);
  const proofUrl = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return canvas ? canvas.toDataURL("image/png") : "";
  });
  const counts = await page.evaluate(() => {
    const text = document.body.innerText;
    const tally = (label: string) => (text.match(new RegExp(label + " ·", "g")) || []).length;
    const all = text.match(/All (\d+)/);
    return {
      all: all ? Number(all[1]) : 0,
      faithful: tally("Faithful"),
      approx: tally("Approx"),
      baked: tally("Baked"),
      dropped: tally("Dropped"),
    };
  });
  return { frame, proofUrl, counts };
}

function compare(framePath: string, proofPath: string) {
  const raw = execFileSync("python3", ["-", framePath, proofPath], {
    encoding: "utf8",
    input: `import sys
from PIL import Image
a = Image.open(sys.argv[1]).convert("RGBA")
b = Image.open(sys.argv[2]).convert("RGBA")
inset = 8
a = a.crop((inset, inset, a.size[0] - inset, a.size[1] - inset))
b = b.crop((inset, inset, b.size[0] - inset, b.size[1] - inset))
if a.size != b.size:
    b = b.resize(a.size, Image.Resampling.BOX)
w, h = a.size
pa, pb = a.load(), b.load()
mae = 0
off = 0
seen = 0
for y in range(h):
    for x in range(w):
        A, B = pa[x, y], pb[x, y]
        if A[3] == 0 and B[3] == 0:
            continue
        seen += 1
        d = (abs(A[0]-B[0]) + abs(A[1]-B[1]) + abs(A[2]-B[2])) / 3
        mae += d
        if d > 12:
            off += 1
print(f"{w} {h} {seen} {mae / max(seen, 1):.3f} {100 * off / max(seen, 1):.2f}")
`,
  }).trim();
  const [w, h, seen, mae, off] = raw.split(" ");
  return { width: Number(w), height: Number(h), seen: Number(seen), mae: Number(mae), offPct: Number(off) };
}

const structure = structural();
mkdirSync("/tmp/stillroom-bench", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1100 } });
await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await settle(page);
const rows = [];
for (const preset of presets) {
  const shot = await grab(page, preset);
  const slug = preset.replace(/\s+/g, "-").toLowerCase();
  const framePath = `/tmp/stillroom-bench/${slug}-frame.png`;
  const proofPath = `/tmp/stillroom-bench/${slug}-proof.png`;
  writeFileSync(framePath, shot.frame);
  writeFileSync(proofPath, Buffer.from(shot.proofUrl.split(",")[1] ?? "", "base64"));
  rows.push({ preset, counts: shot.counts, pixels: compare(framePath, proofPath) });
}
await browser.close();
console.log(JSON.stringify({ structure, rows }, null, 2));
