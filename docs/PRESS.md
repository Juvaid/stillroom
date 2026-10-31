# Stillroom press

Stillroom moves one designed frame between the browser and Photoshop. It is not a video editor and it does not invent motion that was never in the file.

There are two presses:

| Direction | You drop | You get |
|---|---|---|
| Still → Photoshop | One HTML file (a closed Remotion still, or plain HTML, CSS, and JS) | A layered `.psd` |
| Photoshop → Remotion | One `.psd` | A Remotion project zip, plus the same stack shown on the stage |

The HTML path freezes one frame. Remotion clips become groups. The Photoshop path has no timeline to read, so the Remotion composition is a 90-frame hold at 30 fps. Each layer is its own node so it can be animated after the fact.

## What “good” means

A press is good when a person can keep editing the thing that was designed, not when a screenshot matches.

Four fates, recorded on the way into Photoshop:

| Fate | Meaning |
|---|---|
| Faithful | The Photoshop feature is the same idea as the CSS feature. Live type, a shape, a group, a mask, a drop shadow without spread. |
| Approximated | The picture is close and the layer is still editable, but a number changed. Shadow spread is written as choke. A webfont is renamed to a face Photoshop ships. |
| Baked | The subtree becomes one raster. Rotate, scale, filter, and `background-clip: text` do this. You can see it. You cannot edit the words. |
| Dropped | Photoshop has no place to put it. `backdrop-filter` is the usual case. The finding says so. Nothing is silently deleted from the list. |

On the way back, the same standard is structural rather than a fate tag:

- Panel order is `z-index`. The bottom layer in the panel is 1. Later siblings paint above it.
- A shape is an inline `<svg>`, from the vector path, not a PNG of the shape.
- An SVG smart object is inlined. A photo is an `<Img>` in `public/`.
- A clipping mask is a wrapper. The base layer and the layers clipped to it sit inside a `clip-path`.
- If the base has a vector mask, the clip is that path. If it only has pixel alpha, the clip is the layer box, and the zip’s README says so.

## How a still becomes a PSD

`capture.ts` walks the live document after `renderFrame(n)` if that function exists. `scene.ts` is the intermediate graph. `psd.ts` writes it with `ag-psd`. `proof.ts` paints the graph back to a canvas so the stage can be compared with the browser frame.

What each CSS object becomes:

| In the frame | In the PSD |
|---|---|
| `data-clip` / `data-layer` | Group or layer name |
| A filled box, pill, or circle | Shape layer (`vectorFill` + `vectorMask`). Rasterize it in Photoshop if you want pixels. |
| SVG `rect`, `ellipse`, or a single path | Shape layer |
| Nested or filtered SVG | Vector smart object |
| Photo, same-origin or a data URL | Embedded smart object. A corner radius is a vector mask on that object. |
| One text node, a face Photoshop ships | Live type. Arial, Helvetica, Times, Georgia, Courier, Verdana. Liberation is renamed to the matching face. |
| `overflow: hidden` and a radius | Raster mask. The element’s own shadow stays outside it. |
| `box-shadow` | Live drop or inner shadow. Spread is choke. |
| `translate` | Position. `rotate`, `scale`, `skew`, and a CSS filter bake the subtree. |
| Missing image | A shape or plate of the CSS fill, plus the alt text as live type. It does not vanish. |

The agent brief in the source column is the contract for a static. It is the wrong brief for a motion picture.

## How a PSD becomes Remotion

`from-psd.ts` reads the file with `ag-psd` and emits a project. It does not go back through the scene graph. That is deliberate for this pass and it is also the main thing to change. See the review below.

The zip contains:

```
package.json
tsconfig.json
remotion.config.ts
src/index.ts
src/Root.tsx
src/Composition.tsx
public/*          # raster smart objects and painted pixels
README.md         # the notes for this file
```

`Composition.tsx` is one component. Groups are nested `div`s. Shapes are `<svg>`. Clipping stacks are `div`s with `data-clip` and `clip-path: path(...)`. The stage loads the same markup so you can look at the order before unzipping.

Photoshop stores no keyframes in a normal still. Stillroom does not pretend otherwise. Ninety frames is room to animate, not recovered motion.

## Benchmark

There is no published pixel-diff score against Photoshop or against other converters. Treating a unit test as that score would be dishonest. What exists today:

| Check | Result | What it does not prove |
|---|---|---|
| `node --experimental-strip-types --test src/lib/stillroom/*.test.ts` | 20 tests, about 0.6 s on this machine | That a frame matches Photoshop on screen |
| PSD write/read | A group, live type, a shape’s knots, and an embedded smart object survive `writePsd` → `readPsd` | A file saved by Photoshop 2026 |
| PSD → Remotion | Panel order, a clipping wrapper, an inlined SVG, and a shape read back from our own writer | Third-party PSDs with layer styles we do not map |
| Stage | Frame against proof, by eye | A numeric error |

A real benchmark, when we build it, is three numbers on a fixed corpus:

1. **Structure.** Fraction of layers that stayed editable (type, shape, smart object) instead of baking.
2. **Pixels.** Mean absolute error between the browser frame and a composite of the PSD, on the corpus, at 72 ppi.
3. **Round trip.** MAE after still → PSD → Remotion → still, so we can see what the reverse press destroys.

Until those exist, the fidelity list on a given file is the benchmark for that file.

## Other factors

These matter as much as pixel error. They are why a flattened render is the wrong default.

| Factor | Why it is in the design |
|---|---|
| Editability | A marketing still goes back to Photoshop for type and color. A baked word is a failure even if the PNG matches. |
| Layer order | Wrong z-order is a wrong picture, and it is also a wrong animation later. |
| Clipping | A photo inside a circle is not a photo with a circle nearby. The mask has to travel with the stack. |
| Vectors vs rasters | Shapes and SVG must stay vectors so they can be recolored. Photos must stay smart objects so they can be replaced. |
| Name and group | `data-layer` and the Photoshop panel are how a person finds the object. Anonymous layers do not survive a handoff. |
| Honesty | A dropped `backdrop-filter` that is listed is better than a blur that was never written. |
| One frame | Remotion time is closed on the way in. The press is not a timeline editor. |
| Script trust | Markup runs in the frame. Only press files you trust. |
| Size | 72 CSS pixels are 72 points. The intake clamps a side to 64–1920. |
| Same origin | Cross-origin pixels cannot be copied. You get the plate and the alt, not the picture. |

## Approaches we did not take

| Approach | Why not |
|---|---|
| Screenshot the iframe and put one pixel layer in the PSD | Fast and pixel-perfect. Nothing is editable. This is the fallback only when a subtree is baked. |
| Drive Photoshop with ExtendScript or UXP | Faithful, and it can make real shape layers. It needs Photoshop installed. Stillroom runs in the browser. |
| Render a Remotion project with `@remotion/renderer` and export a PNG | Right tool for a picture. Wrong tool for a layered file. The browser never sees the `.tsx` project, only an HTML still. |
| Parse `.tsx` and skip the browser | Layout, fonts, and CSS variables would be guessed. The press reads the computed frame instead. |
| Use CSS `z-index` alone as the Photoshop group model | Stacking contexts, opacity, and filters do not match the layers panel. The walk mirrors those rules and writes a finding when it bakes. |

`ag-psd` is the library on both sides. It can write and read vector masks, type, placed layers, and clipping flags. It cannot composite a PSD in this environment without a canvas implementation, which is why the pixel benchmark is not automated yet.

## Review

Reviewed against the two presses as they stand. This is a list of what to change, in order. It is not a claim that the current press is wrong for the cases the tests cover.

### 1. The reverse press should emit a scene, not a string

HTML → `Scene` → PSD. PSD currently → JSX strings. The layer tree, the proof canvas, and the fidelity list never see the imported file until the generated HTML is captured again. That second capture can bake a shape that was a vector on the way out.

Better: `readPsd` → `Scene` → the same Remotion emitter, and the same proof. One graph, two writers. `from-psd.ts` (531 lines) and `capture.ts` (1504 lines) would meet in `scene.ts` instead of each inventing a layout.

### 2. Measure type from the font, not from `0.8 × fontSize`

`from-psd.ts` places a point-text layer at `baseline - fontSize * 0.8`. Photoshop’s anchor is the baseline. CSS’s `top` is the em box. The 0.8 is a guess. It will sit high or low depending on the face.

Better: when the layer has bounds, use those. When it does not, measure `actualBoundingBoxAscent` in the same document and store that on the scene. Do not add a second guess on the way back.

### 3. A pixel clipping mask should become a mask, not a box

If the base layer has no vector mask, the clip is `inset(...)` of the layer bounds. The pixels outside the alpha still show. The note in the zip says this. It is still the largest visual lie on the way back.

Better: read `layer.canvas` or `layer.mask.canvas` (the browser read already has them) and write `mask-image` from the alpha. Keep the box only when there are no pixels.

### 4. Honor the placed-layer transform

A smart object’s eight-point `transform` is read as the top-left plus width and height. Rotation, skew, and a flip are discarded. The picture is in the right place only when the transform is an axis-aligned box.

Better: map the quad to a CSS matrix, and say so when the quad is not a rectangle. Same for the SVG wrapper.

### 5. Check the gradient angle against a Photoshop file we did not write

Our writer stores `(cssAngle - 90)`. The reader adds 90 and builds an SVG gradient. That round-trips our own files. Photoshop’s gradient angle is not documented by a fixture from the app. A gradient made by hand in Photoshop may run the wrong way.

Better: one PSD saved from Photoshop, checked in, with a known left-to-right and a known top-to-bottom gradient. Assert the SVG endpoints. Delete the arithmetic if it does not match.

### 6. The generated project is not compiled

`Composition.tsx` is concatenated. An SVG with `class`, a namespace, or a `{` in a text layer can fail `tsc` inside Remotion. `jsxText` escapes braces. It does not parse SVG.

Better: run the generated file through the TypeScript parser in a test, on a fixture that includes a quote, a brace, and a `class` attribute. Or emit React nodes and print them with a serializer.

### 7. Put the press tests on `npm test`

`package.json` does not run `src/lib/stillroom`. The 20 tests pass only when invoked directly. A green `npm test` currently says nothing about the press.

### 8. Do not grow `capture.ts` further

At 1504 lines it owns walking, stacking, SVG explosion, shape promotion, missing assets, and proof pixels. The next feature (a real mask image, a scene-based reverse press) should be a new file that consumes a `Scene`. Splitting after the fact, without a behavior change, is not worth a commit by itself.

### What is already the right call

- Shapes for boxes and simple SVG, smart objects for photos. The user can rasterize in Photoshop. The press should not do it first.
- A missing asset stays as a plate and alt text.
- Baked transforms are named in the fidelity list instead of being faked as live layers.
- The reverse project tells you the PSD had no timeline.
- Store-only zip is fine. The projects are source files. Compression can wait until a corpus of PNGs makes the zip large.

## Run

```bash
npm install
npm run dev
```

Press tests, which `npm test` does not include yet:

```bash
npx tsc --noEmit
node --experimental-strip-types --test src/lib/stillroom/*.test.ts
```

Open the source column and copy **Agent brief — Statics only** when an agent is building a still for this press, not a motion comp.

## Where the code lives

| File | Job |
|---|---|
| `src/lib/stillroom/capture.ts` | DOM frame to a scene |
| `src/lib/stillroom/scene.ts` | Layer graph |
| `src/lib/stillroom/vector.ts` | Shape paths, SVG path parser |
| `src/lib/stillroom/psd.ts` | Scene to a PSD |
| `src/lib/stillroom/from-psd.ts` | PSD to a Remotion project |
| `src/lib/stillroom/proof.ts` | Scene painted back to a canvas |
| `src/lib/stillroom/static-brief.ts` | Instructions for an agent making a static |
| `src/components/stillroom/studio.tsx` | Stage, both drop targets, fidelity list |
