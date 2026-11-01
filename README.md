# Stillroom

Two directions.

Drop a Photoshop file. You get a Remotion project, not a flat still. Panel order becomes z-index. Shapes and SVG stay vectors. A clipping mask becomes a clip-path on that stack. The composition holds for 90 frames so those layers can be animated. The PSD itself has no timeline.

Drop an HTML still. You get a layered PSD. Type stays editable when the face is one Photoshop ships. Boxes and simple SVG are shapes. Photos are smart objects.

```bash
npm install
npm run dev
```

The fidelity list, the benchmark we do not pretend to have, and the review of the next changes are in [docs/PRESS.md](docs/PRESS.md). The surface, and why it follows Figma’s interaction on a Framer-like frame rather than Photoshop’s panels, is in [docs/SURFACE.md](docs/SURFACE.md).

Open the source column and copy **Agent brief — Statics only** when an agent is building a still for this press, not a motion comp.
