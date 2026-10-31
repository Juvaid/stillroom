export type Fate = "faithful" | "approximated" | "baked" | "dropped";

export type FindingArea = "groups" | "layout" | "type" | "effects";

export type Finding = {
  id: string;
  area: FindingArea;
  fate: Fate;
  title: string;
  detail: string;
  layerId?: string;
};

export type Rgba = { r: number; g: number; b: number; a: number };

export type Shadow = {
  inset: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: Rgba;
};

export type GradientStop = { color: Rgba; offset: number };

export type Gradient = {
  kind: "linear" | "radial";
  angle: number;
  stops: GradientStop[];
};

export type StackInput = {
  domIndex: number;
  position: string;
  zIndex: string;
  cssOrder: number;
};

const FACE: Record<
  string,
  { regular: string; bold?: string; italic?: string; boldItalic?: string; note?: string }
> = {
  arial: {
    regular: "ArialMT",
    bold: "Arial-BoldMT",
    italic: "Arial-ItalicMT",
    boldItalic: "Arial-BoldItalicMT",
  },
  "liberation sans": {
    regular: "ArialMT",
    bold: "Arial-BoldMT",
    italic: "Arial-ItalicMT",
    boldItalic: "Arial-BoldItalicMT",
    note: "Liberation Sans matches Arial’s metrics, so the type layer is named Arial — the face Photoshop actually has.",
  },
  helvetica: {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
    italic: "Helvetica-Oblique",
    boldItalic: "Helvetica-BoldOblique",
  },
  "times new roman": {
    regular: "TimesNewRomanPSMT",
    bold: "TimesNewRomanPS-BoldMT",
    italic: "TimesNewRomanPS-ItalicMT",
    boldItalic: "TimesNewRomanPS-BoldItalicMT",
  },
  times: {
    regular: "TimesNewRomanPSMT",
    bold: "TimesNewRomanPS-BoldMT",
    italic: "TimesNewRomanPS-ItalicMT",
    boldItalic: "TimesNewRomanPS-BoldItalicMT",
  },
  "liberation serif": {
    regular: "TimesNewRomanPSMT",
    bold: "TimesNewRomanPS-BoldMT",
    italic: "TimesNewRomanPS-ItalicMT",
    boldItalic: "TimesNewRomanPS-BoldItalicMT",
    note: "Liberation Serif matches Times metrics, so the type layer is named Times New Roman.",
  },
  georgia: {
    regular: "Georgia",
    bold: "Georgia-Bold",
    italic: "Georgia-Italic",
    boldItalic: "Georgia-BoldItalic",
  },
  "courier new": {
    regular: "CourierNewPSMT",
    bold: "CourierNewPS-BoldMT",
    italic: "CourierNewPS-ItalicMT",
    boldItalic: "CourierNewPS-BoldItalicMT",
  },
  "liberation mono": {
    regular: "CourierNewPSMT",
    bold: "CourierNewPS-BoldMT",
    italic: "CourierNewPS-ItalicMT",
    boldItalic: "CourierNewPS-BoldItalicMT",
    note: "Liberation Mono is written as Courier New so the file resolves in Photoshop.",
  },
  verdana: {
    regular: "Verdana",
    bold: "Verdana-Bold",
    italic: "Verdana-Italic",
    boldItalic: "Verdana-BoldItalic",
  },
};

const BLEND: Record<string, { ps: string; fate: Fate; detail?: string }> = {
  normal: { ps: "normal", fate: "faithful" },
  multiply: { ps: "multiply", fate: "faithful" },
  screen: { ps: "screen", fate: "faithful" },
  overlay: { ps: "overlay", fate: "faithful" },
  darken: { ps: "darken", fate: "faithful" },
  lighten: { ps: "lighten", fate: "faithful" },
  "color-dodge": { ps: "color dodge", fate: "faithful" },
  "color-burn": { ps: "color burn", fate: "faithful" },
  "hard-light": { ps: "hard light", fate: "faithful" },
  "soft-light": { ps: "soft light", fate: "faithful" },
  difference: { ps: "difference", fate: "faithful" },
  exclusion: { ps: "exclusion", fate: "faithful" },
  hue: { ps: "hue", fate: "faithful" },
  saturation: { ps: "saturation", fate: "faithful" },
  color: { ps: "color", fate: "faithful" },
  luminosity: { ps: "luminosity", fate: "faithful" },
  "plus-lighter": {
    ps: "linear dodge",
    fate: "approximated",
    detail: "CSS plus-lighter has no Photoshop twin. Linear Dodge is the nearest blend.",
  },
  "plus-darker": {
    ps: "linear burn",
    fate: "approximated",
    detail: "CSS plus-darker has no Photoshop twin. Linear Burn is the nearest blend.",
  },
};

export function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export function parseColor(input: string | null | undefined): Rgba | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) return null;
  const bits = rgb[1].split(/[,\s/]+/).filter(Boolean);
  if (bits.length < 3) return null;
  const channel = (part: string) => {
    if (part.endsWith("%")) return Math.round((parseFloat(part) / 100) * 255);
    return Math.round(parseFloat(part));
  };
  const alpha = (part: string | undefined) => {
    if (part == null) return 1;
    if (part.endsWith("%")) return parseFloat(part) / 100;
    return parseFloat(part);
  };
  return {
    r: channel(bits[0]),
    g: channel(bits[1]),
    b: channel(bits[2]),
    a: alpha(bits[3]),
  };
}

function parsePxList(input: string): number[] {
  return [...input.matchAll(/-?\d*\.?\d+px/g)].map((m) => parseFloat(m[0]));
}

export function parseShadows(input: string | null | undefined): Shadow[] {
  if (!input || input.trim() === "none") return [];
  const shadows: Shadow[] = [];
  for (const part of splitTopLevel(input)) {
    const inset = /\binset\b/i.test(part);
    const colorMatch = part.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/i);
    const color = parseColor(colorMatch?.[0] ?? "rgb(0, 0, 0)") ?? { r: 0, g: 0, b: 0, a: 1 };
    const rest = part
      .replace(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi, " ")
      .replace(/\binset\b/gi, " ");
    const nums = parsePxList(rest);
    if (nums.length < 2) continue;
    shadows.push({
      inset,
      offsetX: nums[0] ?? 0,
      offsetY: nums[1] ?? 0,
      blur: nums[2] ?? 0,
      spread: nums[3] ?? 0,
      color,
    });
  }
  return shadows;
}

function sliceCall(input: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < input.length; i += 1) {
    if (input[i] === "(") depth += 1;
    else if (input[i] === ")") {
      depth -= 1;
      if (depth === 0) return input.slice(openIndex + 1, i);
    }
  }
  return "";
}

function directionToAngle(dir: string): number | null {
  const key = dir.trim().toLowerCase();
  const map: Record<string, number> = {
    "to top": 0,
    "to right": 90,
    "to bottom": 180,
    "to left": 270,
    "to top right": 45,
    "to right top": 45,
    "to bottom right": 135,
    "to right bottom": 135,
    "to bottom left": 225,
    "to left bottom": 225,
    "to top left": 315,
    "to left top": 315,
  };
  return map[key] ?? null;
}

function parseStops(parts: string[]): GradientStop[] {
  const stops: GradientStop[] = [];
  for (const part of parts) {
    const colorMatch = part.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/i);
    const color = parseColor(colorMatch?.[0] ?? "");
    if (!color) continue;
    const pct = part.match(/(-?\d*\.?\d+)%/);
    stops.push({ color, offset: pct ? parseFloat(pct[1]) / 100 : Number.NaN });
  }
  if (!stops.length) return [];
  const missing = stops.some((s) => Number.isNaN(s.offset));
  if (missing) {
    stops.forEach((s, i) => {
      if (Number.isNaN(s.offset)) s.offset = stops.length === 1 ? 0 : i / (stops.length - 1);
    });
  }
  return stops;
}

export function parseGradients(input: string | null | undefined): Gradient[] {
  if (!input || input === "none") return [];
  const gradients: Gradient[] = [];
  const re = /(linear|radial)-gradient\(/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input))) {
    const kind = match[1].toLowerCase() as "linear" | "radial";
    const body = sliceCall(input, match.index + match[1].length + "-gradient".length);
    let chunks = splitTopLevel(body);
    let angle = kind === "linear" ? 180 : 0;
    if (chunks.length) {
      const head = chunks[0].trim();
      const inSpace = head.match(/^in\s+[a-z0-9-]+$/i);
      if (inSpace) chunks = chunks.slice(1);
    }
    if (chunks.length && kind === "linear") {
      const head = chunks[0].trim().toLowerCase();
      const deg = head.match(/^(-?\d*\.?\d+)deg$/);
      const dir = directionToAngle(head);
      if (deg) {
        angle = parseFloat(deg[1]);
        chunks = chunks.slice(1);
      } else if (dir != null) {
        angle = dir;
        chunks = chunks.slice(1);
      } else if (head.startsWith("to ") || head.includes("in ")) {
        chunks = chunks.slice(1);
      }
    } else if (chunks.length && kind === "radial" && /circle|ellipse|at |closest|farthest/.test(chunks[0])) {
      chunks = chunks.slice(1);
    }
    const stops = parseStops(chunks);
    if (stops.length) gradients.push({ kind, angle, stops });
    re.lastIndex = match.index + match[0].length + body.length + 1;
  }
  return gradients;
}

/** Photoshop light angle from a CSS shadow offset. 90° casts the shadow straight down. */
export function lightAngle(offsetX: number, offsetY: number): number {
  if (offsetX === 0 && offsetY === 0) return 90;
  const deg = 180 - (Math.atan2(offsetY, offsetX) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

export function shadowDistance(offsetX: number, offsetY: number): number {
  return Math.hypot(offsetX, offsetY);
}

export function paintRank(el: StackInput): [number, number, number, number] {
  const positioned =
    el.position === "absolute" ||
    el.position === "relative" ||
    el.position === "fixed" ||
    el.position === "sticky";
  const zAuto = el.zIndex === "auto";
  const z = zAuto ? 0 : Number.parseInt(el.zIndex, 10) || 0;
  let band = 1;
  if (positioned && !zAuto && z < 0) band = 0;
  else if (!positioned) band = 1;
  else if (zAuto || z === 0) band = 2;
  else band = 3;
  const zKey = band === 0 || band === 3 ? z : 0;
  return [band, zKey, el.cssOrder, el.domIndex];
}

export function sortForPaint<T>(items: T[], get: (item: T) => StackInput): T[] {
  return items
    .map((item) => ({ item, rank: paintRank(get(item)) }))
    .sort((a, b) => {
      for (let i = 0; i < 4; i += 1) {
        if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
      }
      return 0;
    })
    .map((row) => row.item);
}

export function transformKind(transform: string | null | undefined): "none" | "translate" | "complex" {
  if (!transform || transform === "none") return "none";
  const match = transform.match(/^matrix\(([^)]+)\)$/i);
  if (!match) return "complex";
  const [a, b, c, d] = match[1].split(",").map((part) => parseFloat(part.trim()));
  const eps = 0.0008;
  if (Math.abs(a - 1) < eps && Math.abs(b) < eps && Math.abs(c) < eps && Math.abs(d - 1) < eps) {
    return "translate";
  }
  return "complex";
}

export function clipVisible(frame: number | null, from: number | null, duration: number | null): boolean {
  if (frame == null || from == null) return true;
  const end = from + (duration ?? 0);
  return frame >= from && frame < end;
}

export function trackingFromLetterSpacing(letterSpacingPx: number | null, fontSize: number): number {
  if (letterSpacingPx == null || !fontSize) return 0;
  return Math.round((letterSpacingPx / fontSize) * 1000);
}

export function mapBlend(mode: string): { ps: string; fate: Fate; detail?: string } {
  return (
    BLEND[mode] ?? {
      ps: "normal",
      fate: "dropped",
      detail: `mix-blend-mode: ${mode} has no Photoshop equivalent and was left as Normal.`,
    }
  );
}

export type Isolation = {
  isolated: boolean;
  blendMode: string;
  passThrough: boolean;
  reason: string | null;
};

export function isolationFor(input: {
  opacity: number;
  blendMode: string;
  isolation: string;
  filter: string;
  backdrop: string;
  clipPath: string;
  maskImage: string;
  transform: "none" | "translate" | "complex";
  willChange: string;
}): Isolation {
  const blend = mapBlend(input.blendMode === "normal" ? "normal" : input.blendMode);
  const reasons: string[] = [];
  if (input.opacity < 1) reasons.push("opacity under 1");
  if (input.blendMode !== "normal") reasons.push(`blend ${input.blendMode}`);
  if (input.isolation === "isolate") reasons.push("isolation");
  if (input.filter && input.filter !== "none") reasons.push("filter");
  if (input.backdrop && input.backdrop !== "none") reasons.push("backdrop-filter");
  if (input.clipPath && input.clipPath !== "none") reasons.push("clip-path");
  if (input.maskImage && input.maskImage !== "none") reasons.push("mask");
  if (input.transform === "complex") reasons.push("transform");
  if (/opacity|transform|filter/.test(input.willChange)) reasons.push("will-change");
  const isolated = reasons.length > 0;
  if (input.blendMode !== "normal") {
    return {
      isolated: true,
      blendMode: blend.ps,
      passThrough: false,
      reason: reasons.join(", "),
    };
  }
  if (isolated) {
    return { isolated: true, blendMode: "normal", passThrough: false, reason: reasons.join(", ") };
  }
  return { isolated: false, blendMode: "pass through", passThrough: true, reason: null };
}

export function chooseFont(family: string, weight: number, italic: boolean): {
  psName: string;
  fauxBold: boolean;
  fauxItalic: boolean;
  fate: Fate;
  detail: string;
} {
  const key = family.trim().replace(/^['"]+|['"]+$/g, "").toLowerCase();
  const face = FACE[key];
  if (!face) {
    return {
      psName: family.replace(/['"]/g, "").split(",")[0].trim() || "ArialMT",
      fauxBold: weight >= 600,
      fauxItalic: italic,
      fate: "approximated",
      detail: `${family} is not a face Photoshop ships with. The layer keeps that name and will substitute if it isn’t installed.`,
    };
  }
  let psName = face.regular;
  let fauxBold = false;
  let fauxItalic = false;
  if (weight >= 600 && italic && face.boldItalic) psName = face.boldItalic;
  else if (weight >= 600 && face.bold) psName = face.bold;
  else if (italic && face.italic) psName = face.italic;
  else {
    if (weight >= 600) fauxBold = true;
    if (italic) fauxItalic = true;
  }
  const mapped = Boolean(face.note);
  const detail = face.note
    ? face.note
    : fauxBold || fauxItalic
      ? `${psName} has no separate ${weight >= 600 ? "bold " : ""}${italic ? "italic" : ""} file, so faux styling is on.`
      : `${family} → ${psName}.`;
  return {
    psName,
    fauxBold,
    fauxItalic,
    fate: fauxBold || fauxItalic || mapped ? "approximated" : "faithful",
    detail,
  };
}

export function applyTextTransform(text: string, mode: string): string {
  if (mode === "uppercase") return text.toUpperCase();
  if (mode === "lowercase") return text.toLowerCase();
  if (mode === "capitalize") return text.replace(/\b([a-z])/g, (m) => m.toUpperCase());
  return text;
}

export function snap(n: number): { value: number; drift: number } {
  const value = Math.round(n);
  return { value, drift: Math.abs(n - value) };
}

export function filterNeedsBake(filter: string | null | undefined): boolean {
  return Boolean(filter && filter !== "none");
}

export function overflows(overflow: string): boolean {
  return overflow === "hidden" || overflow === "clip" || overflow === "scroll" || overflow === "auto";
}
