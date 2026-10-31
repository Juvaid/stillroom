import { useCallback, useEffect, useRef, useState } from "react";
import { Download, EyeOff, Folder, Square, Type } from "lucide-react";
import { captureFrame, prepareFrame, wrapSource } from "@/lib/stillroom/capture";
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

function clampSize(value: number) {
  if (!Number.isFinite(value)) return 320;
  return Math.min(1920, Math.max(64, Math.round(value)));
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

export function Studio() {
  const opening = PRESETS[0];
  const [html, setHtml] = useState(opening.html);
  const [presetId, setPresetId] = useState(opening.id);
  const [width, setWidth] = useState(opening.width);
  const [height, setHeight] = useState(opening.height);
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const proofRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const frameRef = useRef(frame);
  const loaded = useRef(false);
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
      } catch (err) {
        if (id !== token.current) return;
        setError(err instanceof Error ? err.message : "Could not read that frame.");
      } finally {
        if (id === token.current) setBusy(false);
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
    if (!loaded.current) return;
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
    const preset = presetById(id);
    setPresetId(preset.id);
    setHtml(preset.html);
    setWidth(preset.width);
    setHeight(preset.height);
    setFrame(preset.frame);
    setDuration(preset.duration);
    setSelected(null);
    setView("frame");
    setTab("stage");
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
    <main className="flex h-screen flex-col bg-bg text-fg">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-widest text-accent">STILLROOM</p>
          <h1 className="truncate text-lg leading-tight">Press a still into layers</h1>
        </div>
        <p className="hidden min-w-0 flex-1 text-sm text-muted lg:block">
          HTML, CSS, and JS — or a Remotion frame with the timeline closed. Groups, type, and effects, and every place they stop being faithful.
        </p>
        <button
          type="button"
          onClick={exportPsd}
          disabled={!scene || busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-40"
        >
          <Download className="size-4" aria-hidden />
          Export PSD
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
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted">
                Width
                <input
                  type="number"
                  min={64}
                  max={1920}
                  value={width}
                  onChange={(event) => setWidth(clampSize(Number(event.target.value)))}
                  className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-2 font-mono text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted">
                Height
                <input
                  type="number"
                  min={64}
                  max={1920}
                  value={height}
                  onChange={(event) => setHeight(clampSize(Number(event.target.value)))}
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
                onChange={(event) => setHtml(event.target.value)}
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
            <p className="truncate font-mono text-xs text-muted">
              {width}×{height}
              {duration != null ? ` · f${frame}` : ""} · 72 ppi
              {busy ? " · pressing" : ""}
            </p>
          </div>
          {view === "proof" ? (
            <p className="px-4 pb-2 text-xs text-muted">Rebuilt from the layer stack, not the live page. A gap here is listed under Fidelity.</p>
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
