export type StillMeta = {
  width: number;
  height: number;
  frame: number;
  /** True when the file named its own canvas. False means the 960×540 fallback. */
  sized: boolean;
};

function whole(value: number) {
  if (!Number.isFinite(value) || value < 1) return 0;
  return Math.round(value);
}

export function readStillMeta(html: string): StillMeta {
  let width = 0;
  let height = 0;
  let best = 0;
  for (const match of html.matchAll(/style\s*=\s*["']([^"']*)["']/gi)) {
    const w = /(?:^|[;\s])width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(match[1]);
    const h = /(?:^|[;\s])height\s*:\s*(\d+(?:\.\d+)?)px/i.exec(match[1]);
    if (!w || !h) continue;
    const ww = whole(parseFloat(w[1]));
    const hh = whole(parseFloat(h[1]));
    if (ww >= 1 && hh >= 1 && ww * hh > best) {
      best = ww * hh;
      width = ww;
      height = hh;
    }
  }
  const dataW = html.match(/data-width\s*=\s*["'](\d+)/i);
  const dataH = html.match(/data-height\s*=\s*["'](\d+)/i);
  if (dataW && dataH) {
    const ww = whole(parseInt(dataW[1], 10));
    const hh = whole(parseInt(dataH[1], 10));
    if (ww >= 1 && hh >= 1) {
      width = ww;
      height = hh;
    }
  }
  const frameAttr = html.match(/data-frame\s*=\s*["'](\d+)/i);
  const frameFallback = html.match(/__STILL_FRAME\s*\?\?\s*(\d+)/);
  const frame = frameAttr ? parseInt(frameAttr[1], 10) : frameFallback ? parseInt(frameFallback[1], 10) : 0;
  const sized = width >= 1 && height >= 1;
  return {
    width: sized ? width : 960,
    height: sized ? height : 540,
    frame: Number.isFinite(frame) ? frame : 0,
    sized,
  };
}

export function stillFilename(name: string, frame: number | null) {
  const base = name
    .replace(/\.html?$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const stem = base || "still";
  return frame == null ? `${stem}.psd` : `${stem}-f${frame}.psd`;
}
