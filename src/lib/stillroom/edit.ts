import type { SceneLayer } from "./scene.ts";

export type StylePatch = {
  left?: number;
  top?: number;
  opacity?: number;
  fontSize?: number;
};

const FRAME = /\s+f\d+–\d+$/;

export function layerHook(name: string) {
  return name.replace(FRAME, "");
}

export function topLayerAt(layers: SceneLayer[], x: number, y: number): SceneLayer | null {
  for (let index = layers.length - 1; index >= 0; index--) {
    const layer = layers[index];
    if (layer.hidden || layer.folded) continue;
    const child = topLayerAt(layer.children, x, y);
    if (child) return child;
    const box = layer.box;
    if (x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h) return layer;
  }
  return null;
}

function findOpenTag(html: string, name: string) {
  const needles = [`data-layer="${name}"`, `data-layer='${name}'`, `data-clip="${name}"`, `data-clip='${name}'`];
  for (const needle of needles) {
    const at = html.indexOf(needle);
    if (at < 0) continue;
    const start = html.lastIndexOf("<", at);
    const end = html.indexOf(">", at);
    if (start < 0 || end < 0 || html[start + 1] === "/") continue;
    return { start, end: end + 1, tag: html.slice(start, end + 1) };
  }
  return null;
}

function declarations(style: string) {
  const map = new Map<string, string>();
  for (const part of style.split(";")) {
    const split = part.indexOf(":");
    if (split < 0) continue;
    const key = part.slice(0, split).trim().toLowerCase();
    const value = part.slice(split + 1).trim();
    if (key && value) map.set(key, value);
  }
  return map;
}

function mergeTag(tag: string, patch: StylePatch) {
  const match = tag.match(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/i);
  const decls = declarations(match?.[2] ?? "");
  if (patch.left != null || patch.top != null) {
    decls.set("position", "absolute");
    decls.delete("inset");
    decls.delete("inset-block");
    decls.delete("inset-inline");
    decls.delete("transform");
    decls.delete("translate");
    decls.set("right", "auto");
    decls.set("bottom", "auto");
    decls.set("margin", "0");
  }
  if (patch.left != null) decls.set("left", `${Math.round(patch.left)}px`);
  if (patch.top != null) decls.set("top", `${Math.round(patch.top)}px`);
  if (patch.opacity != null) decls.set("opacity", String(Math.round(patch.opacity * 1000) / 1000));
  if (patch.fontSize != null) decls.set("font-size", `${Math.round(patch.fontSize)}px`);
  const style = [...decls.entries()].map(([key, value]) => `${key}:${value}`).join(";");
  if (match && match.index != null) {
    return tag.slice(0, match.index) + ` style="${style}"` + tag.slice(match.index + match[0].length);
  }
  const cut = tag.endsWith("/>") ? tag.length - 2 : tag.length - 1;
  return `${tag.slice(0, cut)} style="${style}"${tag.slice(cut)}`;
}

export function patchLayerStyle(html: string, name: string, patch: StylePatch) {
  const found = findOpenTag(html, layerHook(name));
  if (!found) return html;
  return html.slice(0, found.start) + mergeTag(found.tag, patch) + html.slice(found.end);
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

type El = { start: number; openEnd: number; end: number; children: El[] };

function tagNameAt(html: string, index: number) {
  return /^<\/?([A-Za-z][\w:-]*)/.exec(html.slice(index))?.[1] ?? "";
}

function scan(html: string, from: number, to: number): El[] {
  const nodes: El[] = [];
  let index = from;
  while (index < to) {
    const start = html.indexOf("<", index);
    if (start < 0 || start >= to) break;
    if (html.startsWith("</", start) || html.startsWith("<!", start) || html.startsWith("<?", start)) {
      const end = html.indexOf(">", start);
      index = end < 0 ? to : end + 1;
      continue;
    }
    const openEnd = html.indexOf(">", start);
    if (openEnd < 0 || openEnd >= to) break;
    const name = tagNameAt(html, start);
    if (!name) {
      index = start + 1;
      continue;
    }
    const opening = html.slice(start, openEnd + 1);
    const lower = name.toLowerCase();
    if (opening.endsWith("/>") || VOID.has(lower)) {
      nodes.push({ start, openEnd: openEnd + 1, end: openEnd + 1, children: [] });
      index = openEnd + 1;
      continue;
    }
    const close = matchingClose(html, lower, openEnd + 1);
    if (!close) break;
    nodes.push({
      start,
      openEnd: openEnd + 1,
      end: close.end,
      children: scan(html, openEnd + 1, close.start),
    });
    index = close.end;
  }
  return nodes;
}

function matchingClose(html: string, name: string, from: number) {
  let depth = 1;
  let index = from;
  while (index < html.length) {
    const start = html.indexOf("<", index);
    if (start < 0) return null;
    if (html.startsWith("</", start)) {
      const tag = tagNameAt(html, start).toLowerCase();
      const end = html.indexOf(">", start);
      if (end < 0) return null;
      if (tag === name) {
        depth -= 1;
        if (depth === 0) return { start, end: end + 1 };
      }
      index = end + 1;
      continue;
    }
    if (html.startsWith("<!", start) || html.startsWith("<?", start)) {
      const end = html.indexOf(">", start);
      index = end < 0 ? html.length : end + 1;
      continue;
    }
    const tag = tagNameAt(html, start).toLowerCase();
    const end = html.indexOf(">", start);
    if (end < 0) return null;
    const opening = html.slice(start, end + 1);
    if (tag === name && !opening.endsWith("/>") && !VOID.has(name)) depth += 1;
    index = end + 1;
  }
  return null;
}

function bodyInner(html: string) {
  const open = /<body[^>]*>/i.exec(html);
  const close = html.search(/<\/body>/i);
  if (open && close > open.index) return { start: open.index + open[0].length, end: close };
  return { start: 0, end: html.length };
}

export function nextLayerName(taken: string[], hint: string) {
  const base = hint.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "layer";
  if (!taken.includes(base)) return base;
  let count = 2;
  while (taken.includes(`${base}-${count}`)) count += 1;
  return `${base}-${count}`;
}

export function stampStillIds(html: string) {
  const range = bodyInner(html);
  const nodes: El[] = [];
  const walk = (list: El[]) => {
    for (const node of list) {
      nodes.push(node);
      walk(node.children);
    }
  };
  walk(scan(html, range.start, range.end));
  const used = new Set([...html.matchAll(/\bdata-still=(["'])(s\d+)\1/gi)].map((match) => match[2]));
  let count = 1;
  const inserts: { at: number; id: string }[] = [];
  for (const node of nodes) {
    const name = tagNameAt(html, node.start);
    if (/^(script|style)$/i.test(name)) continue;
    const tag = html.slice(node.start, node.openEnd);
    if (/\bdata-still=/.test(tag)) continue;
    while (used.has(`s${count}`)) count += 1;
    const id = `s${count}`;
    used.add(id);
    count += 1;
    inserts.push({ at: node.start + 1 + name.length, id });
  }
  let next = html;
  for (const insert of inserts.reverse()) {
    next = `${next.slice(0, insert.at)} data-still="${insert.id}"${next.slice(insert.at)}`;
  }
  return next;
}

export function patchStill(html: string, stillId: string, patch: StylePatch, hint: string) {
  const at = html.indexOf(`data-still="${stillId}"`);
  if (at < 0) return html;
  const start = html.lastIndexOf("<", at);
  const end = html.indexOf(">", at);
  if (start < 0 || end < 0 || html[start + 1] === "/") return html;
  let tag = html.slice(start, end + 1);
  if (!/\bdata-(?:layer|clip)=/.test(tag)) {
    const taken = [...html.matchAll(/data-(?:layer|clip)=["']([^"']+)["']/gi)].map((match) => match[1]);
    tag = tag.replace(/^(<[A-Za-z][\w:-]*)/, `$1 data-layer="${nextLayerName(taken, hint)}"`);
  }
  return html.slice(0, start) + mergeTag(tag, patch) + html.slice(end + 1);
}

export function applyAtPath(html: string, path: number[], patch: StylePatch, hint: string) {
  const range = bodyInner(html);
  let nodes = scan(html, range.start, range.end);
  let node: El | undefined;
  for (const index of path) {
    node = nodes[index];
    if (!node) return html;
    nodes = node.children;
  }
  if (!node) return html;
  let tag = html.slice(node.start, node.openEnd);
  if (!/data-layer=|data-clip=/.test(tag)) {
    const taken = [...html.matchAll(/data-(?:layer|clip)=["']([^"']+)["']/gi)].map((match) => match[1]);
    const name = nextLayerName(taken, hint);
    tag = tag.replace(/^(<[A-Za-z][\w:-]*)/, `$1 data-layer="${name}"`);
  }
  return html.slice(0, node.start) + mergeTag(tag, patch) + html.slice(node.openEnd);
}