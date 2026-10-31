export const STATIC_BRIEF = `Apply this only when the deliverable is a static frame that will be pressed to Photoshop. If the job is a motion picture, ignore it.

Stillroom closes the timeline. It writes one PSD of the frame you pick. Sequences are folders, not tweens. Off-frame clips stay in the file as hidden layers.

Author
- Plain HTML, CSS, and one script. No React, no @remotion/player.
- Root: data-remotion-comp, data-fps, data-duration.
- Each shot: data-clip, data-from, data-duration.
- Name every box with data-layer. One element, one job.
- window.renderFrame(frame) may set text. Stillroom calls it before the press.

Type — keep it editable
- One text node per element. Do not mix spans and loose text in the same box.
- Faces Photoshop ships: Arial, Helvetica, Times New Roman, Georgia, Courier New, Verdana.
- Liberation Sans, Serif, and Mono are fine. They are renamed to Arial, Times, and Courier.
- Do not load a webfont if the words must stay editable. Photoshop will substitute it.
- font-size, line-height, and letter-spacing in px. text-align left, center, or right.
- Type the final case. text-transform is burned into the letters.
- Solid color only. Do not use background-clip: text. That still matches the frame, but the words become pixels.
- Underline and line-through are fine. text-shadow is fine. Do not put spread on a text-shadow.

Layout — it will not reflow
- Flex and grid may place the still. They freeze. Give wrapping text an explicit width.
- Prefer position: absolute and px for anything that must land on a pixel.
- translate is fine. rotate, scale, skew, and 3D bake the whole subtree into one raster.
- Do not use filter (blur, grayscale) on a group you need to edit. It bakes that group.
- Fixed and sticky are just where they sat in this frame.

What survives
- overflow: hidden plus border-radius becomes a mask. The element's own box-shadow stays outside it.
- box-shadow without spread becomes a live drop or inner shadow. Spread is written as choke.
- These blends map straight across: multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion, hue, saturation, color, luminosity.
- Opacity under 1 isolates the group, so child blends stay inside it.
- Images must be same-origin or data URLs. SVG is rasterized.
- A ::before or ::after only if it is position: absolute with width and height in px.

Do not use
- backdrop-filter. It is dropped.
- clip-path and mask-image. They are dropped.
- display: none for something you want in the file. Use opacity: 0, or a clip whose frame range is off.
- Cross-origin images. Their pixels cannot be copied.

Size
- Design at the export size. 72 CSS pixels equal 72 points. Stay within 1920 on a side.`;
