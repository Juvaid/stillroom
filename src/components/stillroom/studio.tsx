import { useCallback, useEffect, useRef, useState } from "react";
import { Download, EyeOff, Folder, Square, Type } from "lucide-react";
import { captureFrame, prepareFrame, wrapSource } from "@/lib/stillroom/capture";
import { patchStill, stampStillIds, topLayerAt } from "@/lib/stillroom/edit";
import { canRedo, canUndo, historyOf, record, redo, undo, type DocSnap } from "@/lib/stillroom/history";
import { projectFromPhotoshop, projectZip } from "@/lib/stillroom/from-psd";
import { readStillMeta, stillFilename } from "@/lib/stillroom/intake";
import type { Finding, FindingArea } from "@/lib/stillroom/model";
import { downloadScene } from "@/lib/stillroom/psd";
import { PRESETS, presetById } from "@/lib/stillroom/presets";
import { renderProof } from "@/lib/stillroom/proof";
import { countLayers, layerById, type Scene, type SceneLayer } from "@/lib/stillroom/scene";
import { STATIC_BRIEF } from "@/lib/stillroom/static-brief";

type Tab = "source" | "stage" | "layers" | "report";
type Area = "all" | FindingArea;

const FATE: Record<Finding["fate"], string> = {
  faithful: "Faithful",
  approximated: "Approx",
  baked: "Baked",
  dropped: "Dropped",
};

const AREAS: { id: Area; label: string }[] = [
  { id: "all", label: "All" },
  { id: "groups", label: "Groups" },
  { id: "layout", label: "Layout" },
  { id: "type", label: "Type" },
  { id: "effects", label: "Effects" },
];

function canvasSize(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
}

function highlightFor(layers: SceneLayer[], id: string, baked: SceneLayer | null = null): SceneLayer | null {
  for (const layer of layers) {
    const nextBaked = layer.baked ? layer : baked;
    if (layer.id === id) return layer.folded && nextBaked ? nextBaked : layer;
    const found = highlightFor(layer.children, id, nextBaked);
    if (found) return found;
  }
  return null;
}

function LayerTree({
  layers,
  depth,
  selected,
  onSelect,
}: {
  layers: SceneLayer[];
  depth: number;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const pad = ["pl-2", "pl-5", "pl-8", "pl-11", "pl-14"][Math.min(depth, 4)];
  return (
    <>
      {[...layers].reverse().map((layer) => (
        <div key={layer.id}>
          <button
            id={`layer-${layer.id}`}
            type="button"
            onClick={() => onSelect(layer.id)}
            className={`flex w-full items-center gap-2 py-2 pr-3 text-left text-sm ${pad} ${
              selected === layer.id ? "bg-surface-2" : "hover:bg-surface-2"
            } ${layer.hidden || layer.folded ? "text-muted" : "text-fg"}`}
          >
            {layer.kind === "group" && !layer.baked ? (
              <Folder className="size-3.5 shrink-0" aria-hidden />
            ) : layer.kind === "type" && !layer.baked ? (
              <Type className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <Square className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate font-mono">{layer.name}</span>
            {layer.hidden ? <EyeOff className="size-3.5 shrink-0" aria-hidden /> : null}
            {layer.baked ? <span className="font-mono text-xs text-accent">Baked</span> : null}
            {layer.kind === "shape" ? <span className="font-mono text-xs">Shape</span> : null}
            {layer.kind === "smart" ? <span className="font-mono text-xs">Smart</span> : null}
            {layer.folded ? <span className="font-mono text-xs">Folded</span> : null}
          </button>
          {layer.children.length > 0 ? (
            <LayerTree layers={layer.children} depth={depth + 1} selected={selected} onSelect={onSelect} />
          ) : null}
        </div>
      ))}
    </>
  );
}

function EditFields({
  layer,
  onApply,
}: {
  layer: SceneLayer;
  onApply: (x: number, y: number, extra: { opacity?: number; fontSize?: number }) => void;
}) {
  return (
    <form
      className="space-y-2 border-t border-line px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onApply(Number(data.get("x")), Number(data.get("y")), {
          opacity: Number(data.get("opacity")),
          ...(layer.text ? { fontSize: Number(data.get("size")) } : {}),
        });
      }}
    >
      <p className="font-mono text-xs tracking-widest text-muted">ON THE CANVAS</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          X
          <input name="x" type="number" defaultValue={Math.round(layer.box.x)} className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-2 font-mono text-sm text-fg" />
        </label>
        <label className="text-xs text-muted">
          Y
          <input name="y" type="number" defaultValue={Math.round(layer.box.y)} className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-2 font-mono text-sm text-fg" />
        </label>
        <label className="text-xs text-muted">
          Opacity
          <input name="opacity" type="number" min={0} max={1} step={0.05} defaultValue={layer.opacity} className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-2 font-mono text-sm text-fg" />
        </label>
        {layer.text ? (
          <label className="text-xs text-muted">
            Size
            <input name="size" type="number" min={1} defaultValue={Math.round(layer.text.fontSize)} className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-2 font-mono text-sm text-fg" />
          </label>
        ) : null}
      </div>
      <button type="submit" className="min-h-11 w-full rounded-md border border-line text-sm">
        Apply
      </button>
    </form>
  );
}

export function Studio() {
  const opening = PRESETS[0];
  const [history, setHistory] = useState(() =>
    historyOf({ html: stampStillIds(opening.html), width: opening.width, height: opening.height }),
  );
  const { html, width, height } = history.present;
  const [presetId, setPresetId] = useState(opening.id);
  const [frame, setFrame] = useState(opening.frame);
  const [duration, setDuration] = useState<number | null>(opening.duration);
  const [scene, setScene] = useState<Scene | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("stage");
  const [view, setView] = useState<"frame" | "proof">("frame");
  const [area, setArea] = useState<Area>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(1);
  const [writing, setWriting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const proofRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const frameRef = useRef(frame);
  const loaded = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const psdRef = useRef<HTMLInputElement>(null);
  const move = useRef<{
    name: string;
    el: HTMLElement;
    px: number;
    py: number;
    boxX: number;
    boxY: number;
    lastX: number;
    lastY: number;
    stillId: string;
    hint: string;
  } | null>(null);
  const autoName = useRef<string | null>(null);
  const commit = (snap: DocSnap, burst = false) => {
    setHistory((current) => record(current, { ...snap, html: stampStillIds(snap.html) }, burst));
  };
  const historyRef = useRef(history);
  historyRef.current = history;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const current = historyRef.current;
      const redoKey = key === "y" || (key === "z" && event.shiftKey);
      if (redoKey ? !canRedo(current) : !canUndo(current)) return;
      event.preventDefault();
      setHistory((stack) => (redoKey ? redo(stack) : undo(stack)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  frameRef.current = frame;

  const press = useCallback(
    async (time: number) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentDocument) return;
      const id = ++token.current;
      setBusy(true);
      setError(null);
      try {
        const doc = await prepareFrame(iframe, time);
        if (id !== token.current) return;
        const next = await captureFrame(doc, { width, height, frame: time });
        if (id !== token.current) return;
        setScene(next);
        setDuration(next.duration);
        const name = autoName.current;
        if (name) {
          autoName.current = null;
          setWriting(true);
          await downloadScene(next, stillFilename(next.comp || name, next.frame));
        }
      } catch (err) {
        if (id !== token.current) return;
        setError(err instanceof Error ? err.message : "Could not read that frame.");
      } finally {
        if (id === token.current) {
          setBusy(false);
          setWriting(false);
        }
      }
    },
    [width, height],
  );

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      loaded.current = true;
      void press(frameRef.current);
    };
    iframe.addEventListener("load", onLoad);
    iframe.srcdoc = wrapSource(html, width, height);
    return () => iframe.removeEventListener("load", onLoad);
  }, [html, width, height, press]);

  useEffect(() => {
    if (!loaded.current || autoName.current) return;
    void press(frame);
  }, [frame, press]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const measure = () => {
      const next = Math.min((node.clientWidth - 48) / width, (node.clientHeight - 72) / height, 1);
      setScale(Number.isFinite(next) && next > 0.05 ? next : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [width, height, tab]);

  useEffect(() => {
    if (view !== "proof" || !scene || !proofRef.current) return;
    const host = iframeRef.current?.contentDocument ?? document;
    const plate = renderProof(scene, host);
    const target = proofRef.current;
    target.width = scene.width;
    target.height = scene.height;
    target.getContext("2d")?.drawImage(plate, 0, 0);
  }, [view, scene]);

  useEffect(() => {
    if (!selected) return;
    document.getElementById(`layer-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [selected, tab]);

  const loadPreset = (id: string) => {
    autoName.current = null;
    const preset = presetById(id);
    setPresetId(preset.id);
    commit({ html: preset.html, width: preset.width, height: preset.height });
    setFrame(preset.frame);
    setDuration(preset.duration);
    setSelected(null);
    setView("frame");
    setTab("stage");
  };

  const takeFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && !file.type.includes("html")) {
      setError("Drop an HTML still. A Remotion project folder is not a frame.");
      return;
    }
    const text = await file.text();
    if (!text.trim()) {
      setError("That file is empty.");
      return;
    }
    const meta = readStillMeta(text);
    const same = text === html && meta.width === width && meta.height === height;
    autoName.current = file.name.replace(/\.html?$/i, "");
    setPresetId("file");
    setSelected(null);
    setView("frame");
    setTab("stage");
    setError(null);
    commit({ html: text, width: meta.width, height: meta.height });
    setFrame(meta.frame);
    setNotes([]);
    if (same) void press(meta.frame);
  };

  const takePhotoshop = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.psd$/i.test(file.name)) {
      setError("That is not a Photoshop file.");
      return;
    }
    setError(null);
    setWriting(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const project = await projectFromPhotoshop(bytes, file.name);
      const zip = projectZip(project);
      const copy = new Uint8Array(zip.byteLength);
      copy.set(zip);
      const url = URL.createObjectURL(new Blob([copy], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.name.toLowerCase()}-remotion.zip`;
      link.click();
      URL.revokeObjectURL(url);
      autoName.current = null;
      setPresetId("file");
      setSelected(null);
      setView("frame");
      setTab("stage");
      setNotes(project.notes);
      commit({ html: project.html, width: project.width, height: project.height });
      setFrame(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that Photoshop file.");
    } finally {
      setWriting(false);
    }
  };

  const elementFor = (box: { x: number; y: number; w: number; h: number }) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return null;
    const view = doc.defaultView;
    if (!view) return null;
    const canEdit = (node: Element): node is HTMLElement =>
      node instanceof view.HTMLElement || node instanceof view.SVGElement;
    const origin = doc.documentElement.getBoundingClientRect();
    let best: HTMLElement | null = null;
    let score = Infinity;
    for (const node of doc.body.querySelectorAll("*")) {
      if (!canEdit(node) || !node.getAttribute("data-still")) continue;
      const rect = node.getBoundingClientRect();
      const dx = rect.left - origin.left - box.x;
      const dy = rect.top - origin.top - box.y;
      const dw = rect.width - box.w;
      const dh = rect.height - box.h;
      const dist = dx * dx + dy * dy + dw * dw + dh * dh;
      const deeper = Boolean(best && dist < score + 16 && best.contains(node));
      if (dist < score || deeper) {
        score = dist;
        best = node;
      }
    }
    return score < 400 ? best : null;
  };

  const hintFor = (el: Element) => {
    const named = el.getAttribute("data-layer") || el.getAttribute("data-clip") || el.id;
    if (named) return named;
    const text = (el.textContent || "").trim().split(/\s+/).slice(0, 3).join(" ");
    return text || el.tagName.toLowerCase();
  };

  const place = (el: HTMLElement, artX: number, artY: number) => {
    const root = el.ownerDocument.documentElement.getBoundingClientRect();
    const parent = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? root;
    el.style.position = "absolute";
    el.style.margin = "0";
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.inset = "auto";
    el.style.transform = "none";
    el.style.left = `${Math.round(artX - (parent.left - root.left))}px`;
    el.style.top = `${Math.round(artY - (parent.top - root.top))}px`;
  };

  const writeBack = (
    from: { x: number; y: number; w: number; h: number },
    artX: number,
    artY: number,
    extra: { opacity?: number; fontSize?: number } = {},
  ) => {
    const el = elementFor(from);
    const stillId = el?.getAttribute("data-still");
    if (!el || !stillId) return;
    place(el, artX, artY);
    if (extra.opacity != null) el.style.opacity = String(extra.opacity);
    if (extra.fontSize != null) el.style.fontSize = `${Math.round(extra.fontSize)}px`;
    const left = Number.parseFloat(el.style.left);
    const top = Number.parseFloat(el.style.top);
    setError(null);
    commit({
      html: patchStill(
        html,
        stillId,
        {
          left,
          top,
          ...(extra.opacity != null ? { opacity: extra.opacity } : {}),
          ...(extra.fontSize != null ? { fontSize: extra.fontSize } : {}),
        },
        hintFor(el),
      ),
      width,
      height,
    });
  };

  const findings = scene?.findings.filter((finding) => area === "all" || finding.area === area) ?? [];
  const hit = selected && scene ? highlightFor(scene.layers, selected) : null;
  const layerCount = scene ? countLayers(scene.layers) : 0;

  const exportPsd = () => {
    if (!scene) return;
    const label = scene.comp ? scene.comp.toLowerCase().replace(/\s+/g, "-") : presetId;
    const suffix = scene.frame != null ? `-f${scene.frame}` : "";
    void downloadScene(scene, `stillroom-${label}${suffix}.psd`).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not write the PSD.");
    });
  };

  const copyBrief = () => {
    const field = document.getElementById("static-brief");
    const finish = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(STATIC_BRIEF).then(finish).catch(() => {
        if (field instanceof HTMLTextAreaElement) {
          field.focus();
          field.select();
        }
      });
      return;
    }
    if (field instanceof HTMLTextAreaElement) {
      field.focus();
      field.select();
    }
  };

  const showStage = tab === "stage";

  return (
    <main
      className="flex h-screen flex-col bg-bg text-fg"
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        void (/\.psd$/i.test(event.dataTransfer.files[0]?.name ?? "")
          ? takePhotoshop(event.dataTransfer.files[0])
          : takeFile(event.dataTransfer.files[0]));
      }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-widest text-accent">STILLROOM</p>
          <h1 className="truncate text-lg leading-tight">Stillroom</h1>
        </div>
        <p className="hidden min-w-0 flex-1 text-sm text-muted lg:block">
          Drop a PSD for a Remotion project: layer order, shapes, SVG, and clips. Drop an HTML still for a PSD.
        </p>
        <input
          ref={psdRef}
          type="file"
          accept=".psd,image/vnd.adobe.photoshop"
          className="sr-only"
          onChange={(event) => {
            void takePhotoshop(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => psdRef.current?.click()}
          disabled={writing}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-40"
        >
          <Download className="size-4" aria-hidden />
          {writing ? "Writing…" : "Photoshop to Remotion"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".html,.htm,text/html"
          className="sr-only"
          onChange={(event) => {
            void takeFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={writing}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-4 text-sm disabled:opacity-40"
        >
          <Download className="size-4" aria-hidden />
          {writing ? "Writing…" : "Still to Photoshop"}
        </button>
        <button
          type="button"
          onClick={exportPsd}
          disabled={!scene || busy}
          className="hidden min-h-11 items-center rounded-md border border-line px-3 text-sm sm:inline-flex disabled:opacity-40"
        >
          This frame
        </button>
      </header>

      <nav className="grid grid-cols-4 border-b border-line lg:hidden">
        {(
          [
            ["source", "Source"],
            ["stage", "Stage"],
            ["layers", "Layers"],
            ["report", "Fidelity"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-h-11 text-sm ${tab === id ? "text-fg" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[272px_minmax(0,1fr)_300px] lg:grid-rows-[minmax(0,1fr)_minmax(190px,32%)]">
        <section className={`min-h-0 flex-col border-line lg:row-span-2 lg:flex lg:border-r ${tab === "source" ? "flex" : "hidden"}`}>
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
            <div>
              <p className="font-mono text-xs tracking-widest text-muted">PLATE</p>
              <div className="mt-2 space-y-1">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => loadPreset(preset.id)}
                    className={`block w-full rounded-md border px-3 py-2 text-left ${
                      presetId === preset.id ? "border-accent bg-surface-2" : "border-line bg-surface"
                    }`}
                  >
                    <span className="block text-sm">{preset.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">{preset.note}</span>
                  </button>
                ))}
              </div>
            </div>
            <details className="rounded-md border border-line bg-surface">
              <summary className="cursor-pointer list-none px-3 py-3 text-sm">
                <span className="font-mono text-xs tracking-widest text-muted">AGENT BRIEF</span>
                <span className="mt-1 block text-fg">Statics only</span>
              </summary>
              <p className="px-3 pb-2 text-xs leading-relaxed text-muted">
                Hand this to an agent when the job is one frame for Photoshop. Skip it for a motion comp.
              </p>
              <textarea
                id="static-brief"
                readOnly
                value={STATIC_BRIEF}
                className="h-48 w-full resize-y border-t border-line bg-bg p-3 font-mono text-xs leading-relaxed text-fg"
              />
              <button type="button" onClick={copyBrief} className="min-h-11 w-full border-t border-line text-sm">
                {copied ? "Copied" : "Copy brief"}
              </button>
            </details>
            <p className="text-xs text-muted">Canvas matches the project, or the PSD. Change it only when the export should differ.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted">
                Width
                <input
                  type="number"
                  min={1}
                  value={width}
                  onChange={(event) => commit({ html, width: canvasSize(Number(event.target.value)), height })}
                  className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-2 font-mono text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted">
                Height
                <input
                  type="number"
                  min={1}
                  value={height}
                  onChange={(event) => commit({ html, width, height: canvasSize(Number(event.target.value)) })}
                  className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-2 font-mono text-sm text-fg"
                />
              </label>
            </div>
            {duration != null ? (
              <label className="block text-xs text-muted">
                Frame {frame} / {duration - 1}
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, duration - 1)}
                  value={Math.min(frame, duration - 1)}
                  onChange={(event) => setFrame(Number(event.target.value))}
                  className="mt-2 w-full"
                />
              </label>
            ) : null}
            <label className="block text-xs text-muted">
              Markup
              <textarea
                value={html}
                onChange={(event) => {
                  const next = event.target.value;
                  const meta = readStillMeta(next);
                  commit(
                    {
                      html: next,
                      width: meta.sized ? meta.width : width,
                      height: meta.sized ? meta.height : height,
                    },
                    true,
                  );
                }}
                spellCheck={false}
                className="mt-1 h-48 w-full resize-y rounded-md border border-line bg-bg p-3 font-mono text-xs leading-relaxed text-fg"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setTab("stage");
                void press(frame);
              }}
              className="min-h-11 w-full rounded-md border border-line bg-surface text-sm"
            >
              {busy ? "Pressing…" : "Press frame"}
            </button>
            <p className="text-xs leading-relaxed text-muted">
              Scripts in the frame run when you press. Only press markup you trust.
            </p>
          </div>
        </section>

        <section
          ref={stageRef}
          className={`relative min-h-0 min-w-0 flex-col bg-stage lg:flex ${
            showStage ? "flex" : "max-lg:fixed max-lg:top-0 max-lg:-left-[14000px] max-lg:flex max-lg:h-screen max-lg:w-screen"
          }`}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex rounded-md border border-line">
              <button
                type="button"
                onClick={() => setView("frame")}
                className={`min-h-11 px-3 text-sm ${view === "frame" ? "bg-surface-2 text-fg" : "text-muted"}`}
              >
                Frame
              </button>
              <button
                type="button"
                onClick={() => setView("proof")}
                className={`min-h-11 px-3 text-sm ${view === "proof" ? "bg-surface-2 text-fg" : "text-muted"}`}
              >
                Proof
              </button>
            </div>
            <div className="flex rounded-md border border-line">
              <button
                type="button"
                disabled={!canUndo(history)}
                onClick={() => setHistory((current) => undo(current))}
                className="min-h-11 px-3 text-sm text-fg disabled:text-muted"
              >
                Undo
              </button>
              <button
                type="button"
                disabled={!canRedo(history)}
                onClick={() => setHistory((current) => redo(current))}
                className="min-h-11 border-l border-line px-3 text-sm text-fg disabled:text-muted"
              >
                Redo
              </button>
            </div>
            <p className="truncate font-mono text-xs text-muted">
              {width}×{height}
              {duration != null ? ` · f${frame}` : ""} · 72 ppi
              {busy ? " · pressing" : ""}
            </p>
          </div>
          {view === "proof" ? (
            <p className="px-4 pb-2 text-xs text-muted">Rebuilt from the layer stack, not the live page. A gap here is listed under Fidelity.</p>
          ) : (
            <p className="px-4 pb-2 text-xs text-muted">Drag a layer. Undo restores the document, not the selection.</p>
          )}
          {notes.length ? (
            <div className="space-y-1 px-4 pb-2">
              {notes.slice(0, 3).map((item) => (
                <p key={item} className="text-xs text-muted">{item}</p>
              ))}
            </div>
          ) : null}
          {dragOver ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent bg-bg/80">
              <p className="text-sm">Drop a PSD or an HTML still.</p>
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
            <div className="relative" style={{ width: width * scale, height: height * scale }}>
              <div className="pointer-events-none absolute -top-3 -left-3 size-3 border-t border-l border-accent" />
              <div className="pointer-events-none absolute -top-3 -right-3 size-3 border-t border-r border-accent" />
              <div className="pointer-events-none absolute -bottom-3 -left-3 size-3 border-b border-l border-accent" />
              <div className="pointer-events-none absolute -right-3 -bottom-3 size-3 border-r border-b border-accent" />
              <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }} className="relative bg-bg">
                <iframe
                  ref={iframeRef}
                  title="Composition frame"
                  className="block border-0 bg-bg"
                  style={{ width, height }}
                />
                {view === "proof" ? (
                  <canvas ref={proofRef} className="absolute top-0 left-0" style={{ width, height }} />
                ) : null}
              </div>
              {hit && view === "frame" ? (
                <div
                  className="pointer-events-none absolute border-2 border-accent"
                  style={{
                    left: hit.box.x * scale,
                    top: hit.box.y * scale,
                    width: Math.max(1, hit.box.w * scale),
                    height: Math.max(1, hit.box.h * scale),
                  }}
                />
              ) : null}
              {view === "frame" && scene ? (
                <div
                  className="absolute inset-0 cursor-default"
                  data-edit-layer=""
                  onPointerDown={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const x = (event.clientX - rect.left) / scale;
                    const y = (event.clientY - rect.top) / scale;
                    const next = topLayerAt(scene.layers, x, y);
                    if (!next) {
                      setSelected(null);
                      return;
                    }
                    setSelected(next.id);
                    const el = elementFor(next.box);
                    const stillId = el?.getAttribute("data-still");
                    if (!el || !stillId) return;
                    setError(null);
                    event.currentTarget.setPointerCapture(event.pointerId);
                    move.current = {
                      name: next.name,
                      el,
                      px: x,
                      py: y,
                      boxX: next.box.x,
                      boxY: next.box.y,
                      lastX: next.box.x,
                      lastY: next.box.y,
                      stillId,
                      hint: hintFor(el),
                    };
                  }}
                  onPointerMove={(event) => {
                    const drag = move.current;
                    if (!drag) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const x = drag.boxX + ((event.clientX - rect.left) / scale - drag.px);
                    const y = drag.boxY + ((event.clientY - rect.top) / scale - drag.py);
                    drag.lastX = x;
                    drag.lastY = y;
                    place(drag.el, x, y);
                  }}
                  onPointerUp={() => {
                    const drag = move.current;
                    move.current = null;
                    if (!drag) return;
                    const left = Number.parseFloat(drag.el.style.left);
                    const top = Number.parseFloat(drag.el.style.top);
                    if (!Number.isFinite(left) || !Number.isFinite(top)) return;
                    commit({ html: patchStill(html, drag.stillId, { left, top }, drag.hint), width, height });
                  }}
                />
              ) : null}
            </div>
          </div>
          {error ? <p className="px-4 pb-3 text-sm text-accent">{error}</p> : null}
        </section>

        <section className={`min-h-0 flex-col border-line lg:flex lg:border-l ${tab === "layers" ? "flex" : "hidden"}`}>
          <div className="flex items-baseline justify-between border-b border-line px-3 py-3">
            <p className="font-mono text-xs tracking-widest text-muted">LAYERS</p>
            <p className="font-mono text-xs text-muted">{layerCount}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {scene ? (
              <LayerTree
                layers={scene.layers}
                depth={0}
                selected={selected}
                onSelect={(id) => {
                  setSelected(id);
                  setView("frame");
                  setTab("stage");
                }}
              />
            ) : (
              <p className="px-3 py-4 text-sm text-muted">Press a frame to build the stack.</p>
            )}
          </div>
          {selected && scene && layerById(scene.layers, selected)?.folded ? (
            <p className="border-t border-line px-3 py-2 text-xs text-muted">
              Folded into the baked raster above it. It is in this list so you can see the structure. It is not its own Photoshop layer.
            </p>
          ) : null}
          {selected && scene && layerById(scene.layers, selected) && !layerById(scene.layers, selected)?.folded ? (
            <EditFields
              key={`${selected}-${layerById(scene.layers, selected)!.box.x}-${layerById(scene.layers, selected)!.box.y}`}
              layer={layerById(scene.layers, selected)!}
              onApply={(artX, artY, extra) => {
                const layer = layerById(scene.layers, selected);
                if (!layer) return;
                writeBack(layer.box, artX, artY, extra);
              }}
            />
          ) : null}
        </section>

        <section className={`min-h-0 flex-col border-line lg:col-span-2 lg:flex lg:border-t ${tab === "report" ? "flex" : "hidden"}`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <p className="mr-2 font-mono text-xs tracking-widest text-muted">FIDELITY</p>
            {AREAS.map((item) => {
              const count =
                item.id === "all"
                  ? (scene?.findings.length ?? 0)
                  : (scene?.findings.filter((finding) => finding.area === item.id).length ?? 0);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setArea(item.id)}
                  className={`min-h-11 rounded-md px-3 text-sm ${area === item.id ? "bg-surface-2 text-fg" : "text-muted"}`}
                >
                  {item.label} {count}
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {findings.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">No notes yet.</p>
            ) : (
              findings.map((finding) => (
                <button
                  key={finding.id}
                  type="button"
                  onClick={() => {
                    if (finding.layerId) {
                      setSelected(finding.layerId);
                      setTab("stage");
                      setView("frame");
                    }
                  }}
                  className="block w-full border-b border-line px-4 py-3 text-left"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{finding.title}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">
                      {FATE[finding.fate]} · {finding.area}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">{finding.detail}</span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
