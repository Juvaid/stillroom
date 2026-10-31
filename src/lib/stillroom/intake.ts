export type StillMeta = {
  width: number;
  height: number;
  frame: number;
};

function clamp(value: number) {
  if (!Number.isFinite(value)) return 960;
  return Math.min(1920, Math.max(64, Math.round(value)));
}

export function readStillMeta(html: string): StillMeta {
  let width = 960;
  let height = 540;
  let best = 0;
  for (const match of html.matchAll(/style\s*=\s*["']([^"']*)["']/gi)) {
    const w = /(?:^|[;\s])width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(match[1]);
    const h = /(?:^|[;\s])height\s*:\s*(\d+(?:\.\d+)?)px/i.exec(match[1]);
    if (!w || !h) continue;
    const ww = Math.round(parseFloat(w[1]));
    const hh = Math.round(parseFloat(h[1]));
    if (ww >= 64 && hh >= 64 && ww * hh > best) {
      best = ww * hh;
      width = ww;
      height = hh;
    }
  }
  const dataW = html.match(/data-width\s*=\s*["'](\d+)/i);
  const dataH = html.match(/data-height\s*=\s*["'](\d+)/i);
  if (dataW && dataH) {
    width = parseInt(dataW[1], 10);
    height = parseInt(dataH[1], 10);
  }
  const frameAttr = html.match(/data-frame\s*=\s*["'](\d+)/i);
  const frameFallback = html.match(/__STILL_FRAME\s*\?\?\s*(\d+)/);
  const frame = frameAttr ? parseInt(frameAttr[1], 10) : frameFallback ? parseInt(frameFallback[1], 10) : 0;
  return { width: clamp(width), height: clamp(height), frame: Number.isFinite(frame) ? frame : 0 };
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
