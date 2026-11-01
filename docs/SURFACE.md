# Stillroom surface

The press writes a Photoshop file. The place you work in is not Photoshop.

Photoshop is the handoff. Figma is the interaction. Framer is the object, because the canvas is already HTML. This document is the order in which the surface gets built. It is not a reskin, and it is not a claim that Stillroom outscores Photoshop.

## The benchmark

Stillroom does not have a better benchmark than Photoshop. Photoshop is not in that contest.

Photoshop composites the file it owns. Against itself, on the features it supports, the error is the error of its own renderer. Stillroom cannot beat that, and it should not try. A drop shadow Photoshop draws from its own layer style will look more like Photoshop than a shadow we approximated from CSS.

What we can measure is the bridge, which Photoshop does not do:

| Number | What it is | What we have |
|---|---|---|
| Structure | Share of layers that stayed editable (type, shape, smart object) instead of baking | Per file, in the fidelity list. Not a corpus score. |
| Pixels, frame against proof | Mean error between the browser frame and our reconstruction of the layer stack | One still, Launch at frame 42, after the press closes off-frame clips: mean error 0.98, and 0.9% of pixels past a difference of 12. The corners match. This is not a Photoshop composite. |
| Pixels, frame against Photoshop | The same frame opened in Photoshop and composited there | Not measured. `ag-psd` does not composite a PSD here. |
| Round trip | Still → PSD → Remotion → still | Not measured as a number. The tests check structure: order, a clip, a path, a size. |

A type specimen is the weak picture. Launch is the easy one. Publishing either number as “better than Photoshop” would be false.

Photoshop still wins, and will keep winning, at: the type engine, color management, CMYK, 16-bit, pen tool, real layer styles, adjustment layers, smart filters, actions, and blend modes we drop. Stillroom’s only advantage is the job: an HTML or Remotion still becomes layers, and a PSD becomes editable nodes, in the browser, with a list of what was lost.

The three numbers in [PRESS.md](PRESS.md) stay the benchmark. This document does not add a fourth called “feels like Photoshop.”

## Which product this is

| | Photoshop | Figma | Framer | Stillroom today | Stillroom target |
|---|---|---|---|---|---|
| Canvas | A document, tools down the left, panels docked on the right | Frames on an infinite canvas | Breakpoints on an infinite canvas. The frame is the page | One fitted frame, 272 / stage / 300 | One frame on a field. Not infinite, not a second tool |
| Selection | Move tool, marching ants | Click, box, shift. Blue bounds. Handles resize | Same idea, on the live frame | A box drawn from the scene, not from the element | Bounds on the element you will edit |
| Properties | Options bar plus Properties panel | Right sidebar. X Y W H, then layout, fill, stroke, effects. No Apply button | Right sidebar, and it changes with the selection. Fixed, fill, or fit | A form: X, Y, opacity, type size, then Apply | The same fields, in one row, committed when you leave them |
| Layers | The product. Thumbnails, masks, effects | A tree. Indent, eye, lock. Hover reveals the eye | Pages, Layers, Assets. The tree is the page | A list on the right, under the source column’s opposite | The tree on the left. The right side is only properties |
| Assets | Libraries, smart objects | Components and styles | Insert panel, components, code files | A missing image becomes a plate | A named asset you can replace. A shape stays a shape |
| Handoff | The file itself | Inspect, CSS, Dev Mode | Publish | PSD, or a Remotion zip | Unchanged. The surface does not replace the file |

Sources for the two products, so the spacing below is not invented:

- Figma’s own help: position, alignment, and W/H sit at the top of the Design panel. Resize is dragging the bounds. Arrow keys nudge. A blue label under the box shows the size. Auto layout’s gap now uses the CSS words Between, Around, and Evenly ([position and dimensions](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions), [auto layout](https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout)).
- Framer’s own help and interface: left rail is Pages, Layers, Assets. The right side is a style panel that changes with the selection. Pages are breakpoints on a freeform canvas. A layer is fixed, fill, or fit content, and it is either in a stack or absolutely placed ([layout grids](https://www.framer.com/help/articles/layout-grids/), [FrameNode](https://www.framer.com/developers/reference/plugins-frame-node)).

We do not copy their icons, their blue, or their logos. We copy the order of work: see the frame, point at a layer, change a number, see it move.

## What the chrome is today

Measured from [studio.tsx](../src/components/stillroom/studio.tsx) and [styles.css](../src/styles.css). This is the gap, not the target.

| Token | Today | Why it feels like a form |
|---|---|---|
| Rails | 272px source, 300px layers | The left rail is markup and presets. Figma’s left rail is the tree. |
| Hit target | 44px (`min-h-11`) | Correct for a finger. Tall for a property row. A layer row can be 32px and still clear 44px on touch by padding the row, not the type. |
| Page padding | 16px | Fine for a page. A property stack wants 8px between rows and 12px from the rail edge. |
| Labels | 12px mono, tracked out, uppercase | Reads as a spec sheet. Property labels are 11px, sentence case, muted. |
| Fields | Full width, stacked, `py-2` | X and Y should share a row. W and H share the next. Four numbers, two lines. |
| Commit | An Apply button | The drag already commits on pointer up. The form should commit on Enter and on blur. Apply is a second, worse path. |
| Type | Instrument Sans, IBM Plex Mono | Keep both. Sans for the chrome. Mono for numbers only. |
| Color | `#141311` page, `#1c1a17` surface, `#0e0d0c` stage, `#e23d1a` accent, `#f4f0e8` text, `#9c968c` muted, `#3a362f` line | Keep them. Do not switch the accent to Figma blue. The stage stays darker than the rails so the frame reads as the object. |
| Radius | 4px and 8px | Property fields go to 4px. The frame selection stays a 1px line, no radius. |

Spacing scale for the new chrome, and only the chrome: 4, 8, 12, 16, 24. Nothing else.

| Use | Space |
|---|---|
| Icon to label, inside a row | 4 |
| Between two fields in a pair | 8 |
| Row to row inside one section | 8 |
| Section to section | 16 |
| Rail edge to content | 12 |
| Layer indent per depth | 12 |
| Canvas padding around the frame | 48, so the frame is an object, not the window |

Type scale, chrome only:

| Use | Size | Face |
|---|---|---|
| Section title | 11px | Sans, muted |
| Layer name, field | 13px | Sans. Numbers in mono |
| Canvas status (size, frame, zoom) | 11px | Mono |

## Functions, in the order to build them

Each one is done only when the still, the proof, and undo agree. A control that moves the picture and not the markup is not done.

### 1. Frame on a field

Today the stage is the window. The frame should sit on `#0e0d0c` with 48px around it, centered, at a zoom that fits. The rails do not scroll the frame away.

Done when resizing the window changes the zoom, not the frame’s pixel size. 960 stays 960.

Not this: an infinite canvas, pages, or a second artboard.

### 2. Selection

Clicking the picture selects the front layer at that point, which `topLayerAt` already does. The bounds are drawn on top of the element, in the accent color, 1px, with no fill. A second click does not start a drag until the pointer moves 3px.

Done when the box matches the element’s border box, including after the press hides an off-frame clip. Hidden layers are not selectable.

Not this: multi-select, or selecting through a group by double-click. Those are later, and they need tests before the chrome.

### 3. Move

Drag writes `left` and `top` through the stable id, one history state per gesture. Arrow keys nudge 1px. Shift-arrow nudges 8. Both are one history state per key repeat burst, same rule as typing.

Done when a nudge of a stock Remotion `AbsoluteFill` moves the layer and does not stretch it. Already true for a pointer drag. Not yet true for the keyboard.

Not this: smart selection, distribute, or alignment of several layers.

### 4. Layers

Move the tree to the left rail. The right rail becomes properties only. Source markup moves behind a disclosure, not beside the picture.

A row is 32px. Indent is 12px per depth. The eye is `visibility`, and it is the same flag the press uses for an off-frame clip. Hiding a row hides it on the frame and in the proof.

Done when the Launch end card, which starts at frame 80, is a row with the eye off at frame 42, and turning the eye on shows it in both pictures.

Not this: masks as their own rows, or drag-to-reparent. Reparenting changes z-order and is a separate function.

### 5. Position and size

Replace the form.

```
X [ 120 ]   Y [  80 ]
W [ 670 ]   H [  74 ]
```

X and Y commit on blur. W and H are visible and not editable until resize exists, so we do not offer a number we cannot write. Opacity sits on the next line as a percent, not `0.85` in a third full-width field.

Done when there is no Apply button, and undo restores the previous X and Y as one state.

### 6. Type

When the layer is text, the section shows family, size, weight, line height, tracking, and align. Size is the one we can already write. The others are shown from the scene and disabled until the writer knows the property.

Done when changing size updates the frame, the proof, and the markup, and undo puts the old size back. The family is the face Photoshop will receive, with the rename noted under the field (Liberation Sans → Arial). Do not hide the rename.

Not this: a font menu of faces we cannot embed, or mixed styles inside one layer. Mixed styles are already a note on the way back from Photoshop.

### 7. Fill, stroke, radius

Shown for a shape: fill, stroke color, stroke width, corner radii. Editable only for a single solid fill and one radius, because that is what the shape writer can round-trip. A gradient is shown and locked, with the fate (“baked” or “approximated”) on the row.

Done when a solid fill change is a shape on the way to Photoshop, not a new raster.

### 8. Effects

One row per shadow the scene already parsed. Offset, blur, color. Spread is labeled choke, because that is the approximation. A filter or a backdrop blur is a row that says dropped, and it is not a slider.

Done when the row and the fidelity list say the same thing. They must not disagree.

### 9. Zoom

A mono percent at the bottom of the stage. Fit, 100%, and a slider is enough. 100% means one frame pixel per device pixel, so you can judge type. Fit is the default.

Done when 100% does not reflow the document. Zoom is a view. It is not in the undo stack.

### 10. Undo

Already a document stack: markup, position, opacity, type size, canvas size. Selection, zoom, Frame/Proof, and the playhead are not in it.

Done when the keyboard and the buttons use that stack, and a size change is not folded into a typing burst. That split is in place. What is missing is a visible count or a label of the last action. The label matters more than a longer stack. “Move Title” is the state. A bare Undo is how you lose trust.

Not this: Photoshop’s history panel of brush strokes. We do not have brushes.

### 11. Assets

A photo or an SVG smart object is a row in an Assets disclosure on the left: name, kind (shape, smart object, plate), and whether the pixels were actually embedded. A missing image stays a plate. Replacing it means dropping a file onto that row, not onto the window.

Done when a replaced PNG is the smart object in the PSD, and the layer name does not change.

Not this: a component system, variants, or a library shared across files. One still has one asset list.

### 12. Clips and the playhead

The playhead is a view. Scrubbing is not undo. The press already closes clips outside the frame. The surface should show that: the frame number, the clip’s in and out, and the eye following the playhead.

Done when scrubbing from frame 42 to frame 80 on Launch hides the title card, shows the end card, and the proof follows without a second button.

Not this: editing in and out points. That is a timeline, and this product is a still.

### 13. Proof

Proof is a mode of the same frame, not a different page. The toggle stays. A pixel gap is drawn only in proof, as a faint difference, and the fidelity row is the explanation.

Done when Launch’s remaining ~1% is visible as edge antialiasing and not as a shifted layer. If a layer is shifted, the proof is wrong and the surface should not decorate it.

### 14. Handoff

Two commands, in the header, nowhere else:

- Still to Photoshop. The PSD.
- Photoshop to Remotion. The zip.

“This frame” is the same PSD, for the frame the playhead is on. It does not need its own verb once the header says which frame.

Done when both commands are disabled with a reason, not only a faded button. “Drop a PSD” and “Press the frame first” are the reasons.

## Order

Do not build these in parallel.

1. Frame on a field, zoom, selection bounds. No new editing. The picture has to look like an object before the fields change.
2. Layers move left. Properties stay right. Apply goes away. X Y commit.
3. Type size, then solid fill, then the shadow rows that only display.
4. Assets and the playhead’s effect on the eye.
5. Nudge, then resize. Resize is last because W and H are the numbers we must not fake.

Anything in “not this” waits until the row above it is done and checked against the frame, the proof, and undo.

## What we will not make

- A Photoshop tools column. We do not have a pen, a brush, or a marquee that writes pixels.
- Figma auto layout as a second layout engine. The layout is CSS. Showing gap and padding is allowed. Inventing a new constraint solver is not.
- Framer breakpoints. One still has one size, the project’s size.
- A second theme. The tokens above are the theme.
