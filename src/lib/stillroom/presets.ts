export type Preset = {
  id: string;
  name: string;
  note: string;
  width: number;
  height: number;
  frame: number;
  duration: number | null;
  html: string;
};

const launch = `
<div data-remotion-comp="Launch" data-fps="30" data-duration="96" data-clip="comp" style="position:relative;width:960px;height:540px;background:#141311;overflow:hidden;color:#f4f0e8;font-family:'Liberation Sans',Arial,sans-serif;">
  <div data-clip="field" data-from="0" data-duration="96" style="position:absolute;inset:0;background:linear-gradient(118deg,#3a241c 0%,#141311 58%);"></div>
  <div data-clip="clock" data-from="0" data-duration="96" id="frame-label" style="position:absolute;left:64px;top:56px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#9c968c;">Frame 042</div>
  <svg data-layer="mark" width="36" height="36" viewBox="0 0 36 36" style="position:absolute;right:64px;top:48px;">
    <circle cx="18" cy="18" r="12" fill="none" stroke="#e23d1a" stroke-width="2"></circle>
    <path d="M18 4v8M18 24v8M4 18h8M24 18h8" stroke="#f4f0e8" stroke-width="1.5"></path>
    <circle cx="18" cy="18" r="2.5" fill="#e23d1a"></circle>
  </svg>
  <div data-clip="title" data-from="12" data-duration="84" style="position:absolute;left:64px;top:168px;width:700px;">
    <div data-layer="kicker" style="font-size:14px;letter-spacing:4px;text-transform:uppercase;color:#e23d1a;">Stillroom</div>
    <div data-layer="headline" style="margin-top:14px;font-family:'Liberation Serif','Times New Roman',serif;font-weight:700;font-size:76px;line-height:0.92;letter-spacing:-1.5px;">Close the timeline.</div>
  </div>
  <div data-clip="lower" data-from="24" data-duration="72" style="position:absolute;left:64px;right:64px;bottom:48px;display:flex;justify-content:space-between;align-items:flex-end;gap:32px;">
    <div data-layer="deck" style="width:460px;font-size:20px;line-height:1.4;color:#d9d3c7;">Groups, type, and shadows land as Photoshop layers. Motion stays a hidden clip.</div>
    <div data-layer="badge" style="background:#f4f0e8;color:#141311;border-radius:999px;padding:14px 18px;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,0.35);">Frame 42</div>
  </div>
  <div data-clip="endcard" data-from="80" data-duration="16" style="position:absolute;inset:0;display:flex;align-items:flex-end;padding:64px;background:#e23d1a;color:#fff8f5;">
    <div data-layer="endline" style="font-family:'Liberation Serif','Times New Roman',serif;font-size:56px;line-height:1;">Hold the frame.</div>
  </div>
</div>
<script>
function renderFrame(frame) {
  var label = document.getElementById('frame-label');
  if (label) label.textContent = 'Frame ' + String(frame).padStart(3, '0');
  var badge = document.querySelector('[data-layer="badge"]');
  if (badge) badge.textContent = 'Frame ' + frame;
}
renderFrame(window.__STILL_FRAME ?? 42);
</script>`;

const clips = `
<div data-clip="sheet" style="position:relative;width:880px;height:640px;background:#efeae2;color:#141311;font-family:'Liberation Sans',Arial,sans-serif;overflow:hidden;">
  <div data-layer="watermark" style="position:absolute;left:40px;top:280px;z-index:-1;font-family:'Liberation Serif',serif;font-size:120px;line-height:0.8;color:rgba(20,19,17,0.06);letter-spacing:-4px;">CLIP</div>
  <div data-clip="card" style="position:absolute;left:64px;top:72px;width:460px;height:420px;background:#f7f3ec;border-radius:28px;overflow:hidden;box-shadow:0 24px 50px rgba(20,19,17,0.16);">
    <div data-layer="photo" style="height:230px;background:linear-gradient(160deg,#e23d1a,#2a211c 70%);"></div>
    <div data-layer="meta" style="padding:22px 26px;">
      <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#9c968c;">Overflow mask</div>
      <div style="margin-top:8px;font-family:'Liberation Serif',serif;font-size:36px;line-height:1;letter-spacing:-0.5px;">Rounded clip</div>
      <div style="margin-top:10px;font-size:16px;line-height:1.45;color:#4a453e;">Children are masked. The card’s own shadow sits outside the radius.</div>
    </div>
    <div data-layer="escape" style="position:absolute;right:-36px;bottom:28px;background:#f4f0e8;border:2px solid #141311;padding:10px 14px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Half outside the mask</div>
  </div>
  <div data-layer="sticker" style="position:absolute;left:430px;top:48px;z-index:3;width:120px;height:120px;border-radius:999px;background:#e23d1a;color:#fff8f5;display:flex;align-items:center;justify-content:center;text-align:center;font-size:13px;letter-spacing:1px;text-transform:uppercase;font-weight:600;box-shadow:0 12px 24px rgba(226,61,26,0.35);">On top z 3</div>
  <div data-clip="note" style="position:absolute;right:56px;top:250px;width:250px;background:#141311;color:#f4f0e8;border-radius:18px;padding:22px;box-shadow:0 16px 30px rgba(20,19,17,0.2);">
    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e23d1a;">Stacking</div>
    <div style="margin-top:8px;font-size:18px;line-height:1.35;">Negative z sits under the card. The sticker paints last.</div>
  </div>
</div>`;

const type = `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@500&display=swap">
<div data-clip="specimen" style="width:800px;height:700px;background:#f4f0e8;color:#141311;padding:56px 60px;box-sizing:border-box;font-family:'Liberation Sans',Arial,sans-serif;">
  <div data-layer="index" style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#9c968c;">Type proof</div>
  <div data-layer="headline" style="margin-top:18px;font-family:'Liberation Serif','Times New Roman',serif;font-weight:700;font-size:68px;line-height:0.92;letter-spacing:-1.6px;">Faithful is a baseline.</div>
  <div data-layer="deck" style="margin-top:22px;width:520px;font-size:18px;line-height:1.55;color:#3c3832;">Soft wraps become hard returns. Tracking becomes thousandths of an em. A face Photoshop does not ship with keeps its name and will substitute.</div>
  <div data-layer="web" style="margin-top:28px;font-family:'Instrument Sans',sans-serif;font-size:22px;letter-spacing:0.4px;">Instrument Sans is not a Photoshop default.</div>
  <div data-layer="rules" style="margin-top:36px;display:flex;gap:28px;">
    <div style="flex:1;">
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e23d1a;">Center</div>
      <div style="margin-top:8px;text-align:center;font-size:20px;line-height:1.3;background:#fff;border-radius:12px;padding:16px;">Anchored on the middle of the box.</div>
    </div>
    <div style="flex:1;">
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e23d1a;text-decoration:underline;">Underline</div>
      <div style="margin-top:8px;font-size:20px;line-height:1.3;text-shadow:0 8px 16px rgba(20,19,17,0.25);">Shadow follows the glyphs.</div>
    </div>
  </div>
  <div data-layer="gradient" style="margin-top:32px;font-family:'Liberation Serif',serif;font-size:42px;font-weight:700;background:linear-gradient(90deg,#e23d1a,#141311);-webkit-background-clip:text;background-clip:text;color:transparent;">Gradient text drops the gradient.</div>
</div>`;

const effects = `
<div data-clip="bench" style="position:relative;width:880px;height:640px;background:#d9d2c5;color:#141311;font-family:'Liberation Sans',Arial,sans-serif;overflow:hidden;">
  <div data-layer="plate" style="position:absolute;left:48px;top:48px;width:520px;height:360px;border-radius:24px;background:linear-gradient(165deg,#2a211c,#141311);box-shadow:0 30px 60px rgba(20,19,17,0.28), 0 2px 0 rgba(255,255,255,0.35) inset;"></div>
  <div data-layer="multiply" style="position:absolute;left:86px;top:92px;width:220px;height:64px;background:#e23d1a;mix-blend-mode:multiply;border-radius:8px;"></div>
  <div data-clip="veil" style="position:absolute;left:300px;top:150px;width:280px;opacity:0.55;">
    <div data-layer="screen" style="height:90px;border-radius:16px;background:#f4f0e8;mix-blend-mode:screen;"></div>
    <div data-layer="caption" style="margin-top:12px;color:#f4f0e8;font-size:16px;letter-spacing:1px;text-transform:uppercase;">Opacity isolates the group</div>
  </div>
  <div data-layer="stamp" style="position:absolute;right:70px;top:78px;width:150px;height:150px;border-radius:999px;border:2px solid #e23d1a;color:#e23d1a;display:flex;align-items:center;justify-content:center;text-align:center;font-size:13px;letter-spacing:2px;text-transform:uppercase;transform:rotate(-12deg);background:rgba(244,240,232,0.92);">Transform baked</div>
  <div data-layer="blur" style="position:absolute;left:48px;bottom:48px;font-family:'Liberation Serif',serif;font-size:42px;filter:blur(5px);color:#141311;">Blur is pixels</div>
  <div data-layer="frost" style="position:absolute;right:48px;bottom:56px;width:240px;padding:18px 20px;border-radius:16px;background:rgba(244,240,232,0.72);backdrop-filter:blur(10px);box-shadow:0 10px 24px rgba(20,19,17,0.12);">
    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9c968c;">Dropped</div>
    <div style="margin-top:6px;font-size:16px;line-height:1.35;">Backdrop blur cannot be sampled into a layer style.</div>
  </div>
</div>`;

const assets = `
<div data-clip="sheet" style="position:relative;width:880px;height:640px;background:#efeae2;color:#141311;font-family:'Liberation Sans',Arial,sans-serif;overflow:hidden;">
  <div data-layer="index" style="position:absolute;left:48px;top:36px;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#9c968c;">Assets</div>
  <img data-layer="photo" alt="" width="280" height="160" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='160'%3E%3Crect width='280' height='160' fill='%232a211c'/%3E%3Ccircle cx='86' cy='80' r='36' fill='%23e23d1a'/%3E%3Crect x='150' y='48' width='90' height='10' fill='%23f4f0e8'/%3E%3Crect x='150' y='70' width='70' height='8' fill='%239c968c'/%3E%3C/svg%3E" style="position:absolute;left:48px;top:72px;width:280px;height:160px;border-radius:18px;object-fit:cover;" />
  <img data-layer="missing" alt="File missing — plate only" src="https://invalid.invalid/stillroom-missing.png" width="280" height="120" style="position:absolute;left:48px;top:256px;width:280px;height:120px;background:#141311;color:#f4f0e8;border-radius:16px;font-size:16px;padding:22px;box-sizing:border-box;" />
  <svg data-layer="mark" width="64" height="64" viewBox="0 0 64 64" style="position:absolute;left:360px;top:72px;">
    <rect x="4" y="4" width="56" height="56" rx="14" fill="none" stroke="#141311" stroke-width="2"></rect>
    <path d="M20 34l8 8 16-18" fill="none" stroke="#e23d1a" stroke-width="3"></path>
  </svg>
  <div data-layer="notice" style="position:absolute;left:360px;top:160px;width:280px;background:#fff;border-radius:16px;padding:18px 18px 18px 20px;box-shadow:0 16px 30px rgba(20,19,17,0.12);border-left:4px solid #e23d1a;">
    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e23d1a;">Notice</div>
    <div style="margin-top:8px;font-size:16px;line-height:1.4;">A callout is a CSS box plus type. The box is pixels. The words stay editable.</div>
  </div>
  <div data-layer="dot" style="position:absolute;right:64px;top:72px;width:88px;height:88px;border-radius:999px;background:#e23d1a;box-shadow:0 12px 24px rgba(226,61,26,0.35);"></div>
  <div data-layer="diamond" style="position:absolute;right:72px;top:190px;width:72px;height:72px;background:#141311;clip-path:polygon(50% 0, 100% 50%, 50% 100%, 0 50%);"></div>
  <div data-layer="legend" style="position:absolute;left:48px;right:48px;bottom:36px;font-size:14px;line-height:1.45;color:#4a453e;">The photo is a smart object. The icon is shapes. The broken file keeps its plate and alt type. The circle is a live ellipse. The diamond’s polygon is the shape outline.</div>
</div>`;

export const PRESETS: Preset[] = [
  {
    id: "launch",
    name: "Launch still",
    note: "A closed Remotion comp. Clips carry frame ranges.",
    width: 960,
    height: 540,
    frame: 42,
    duration: 96,
    html: launch.trim(),
  },
  {
    id: "clips",
    name: "Clips and stacks",
    note: "Overflow masks, z-index, a sticker that escapes.",
    width: 880,
    height: 640,
    frame: 0,
    duration: null,
    html: clips.trim(),
  },
  {
    id: "type",
    name: "Type proof",
    note: "Tracking, wrap, a face Photoshop may not have.",
    width: 800,
    height: 700,
    frame: 0,
    duration: null,
    html: type.trim(),
  },
  {
    id: "effects",
    name: "Effects bench",
    note: "Live shadows, isolation, a baked transform, a dropped frost.",
    width: 880,
    height: 640,
    frame: 0,
    duration: null,
    html: effects.trim(),
  },
  {
    id: "assets",
    name: "Assets and notices",
    note: "A photo, a blocked file, an SVG, a callout, a circle, a clip-path.",
    width: 880,
    height: 640,
    frame: 0,
    duration: null,
    html: assets.trim(),
  },
];

export function presetById(id: string): Preset {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
}
