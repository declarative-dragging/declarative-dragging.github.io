// The sprouting tree card's clip: Josh's original (clips/sprouting-tree.mp4
// on the page), remade in the page's colors by replaying its cursor. It
// starts as a lone node, already being pulled down and to the left, which
// sprouts three times over as it goes; then a leaf is pulled down to the
// right (more sprouting), one down to the left, and a last one hauled
// straight down and off the bottom, the tree sprouting after it.
//
//   node <talk repo>/d2-talk/recorder/vrec.js page/record/clips/sprouting-tree.js --no-webm

import path from "node:path";
import { fileURLToPath } from "node:url";
import { card, SIZE } from "./card.js";
import { at, loadTrack, saveLog, startLog, toScreen } from "../replay.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30; // the original's

// tracks/sprouting-tree.json: track.py with the default templates at 0.62
// (the original's cursor is drawn small). Frames 28, 70 and 107 are blurred
// in passing, left to the gap filling. On the last two frames the cursor has
// gone off the bottom, still pulling; carry it on as it was going.
const track = loadTrack(path.join(HERE, "../tracks/sprouting-tree.json"), {
  downs: [
    [0, 8.5 / FPS],
    [32.5 / FPS, 43.5 / FPS],
    [70.5 / FPS, 78.5 / FPS],
    [107.5 / FPS, 99],
  ],
  fix: {
    114: { x: 232, y: 512 },
    115: { x: 214, y: 612 },
  },
});
// The fist template's hotspot sits ~(4, 2) px (at full size) up and left of
// the arrow's; move the fists onto the arrow's, so the pointer doesn't jump
// as the cursor changes shape.
for (const f of track.frames) {
  if (f.fist) {
    f.x += 4 * 0.62;
    f.y += 2 * 0.62;
  }
}

// The original's canvas: 0.67352 px per unit, offset (62.16, 48.85), from
// its frame 100's 23 nodes fitted to their places in the layout (0.3 px rms).
const toCanvas = (p) => ({ x: (p.x - 62.16) / 0.67352, y: (p.y - 48.85) / 0.67352 });

// The first pull is under way on the first frame: the lone node (canvas
// (250, 40) at rest) is at (248.9, 48.4), its pointer 16 units off its center,
// beyond these smaller nodes' edge. Hold it 9.5 units off, in the same
// direction, by drawing that pull's pointer nearer (the node moves just as
// the original's), easing back onto the original's path as the cursor
// crosses to the next leaf.
const NODE0 = { x: 248.9, y: 48.4 };
const p0 = toCanvas(track.frames[0]);
const off0 = { x: p0.x - NODE0.x, y: p0.y - NODE0.y };
const r0 = Math.hypot(off0.x, off0.y);
const SHIFT = { x: off0.x * (9.5 / r0 - 1), y: off0.y * (9.5 / r0 - 1) };
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
function shiftAt(t) {
  const w = 1 - smooth((t * FPS - 15) / 12); // full until frame 15, gone by 27
  return { x: SHIFT.x * w, y: SHIFT.y * w };
}
// After the first pull the original's tree trails its cursor by about a
// frame (render latency: matching each frame of the original against this
// clip's frames finds the tree a frame behind through the later pulls, the
// first one level), where here the tree keeps up with the pointer. So from
// the first pull's end the cursor plays a frame late, and the tree moves as
// the original's did. The delay comes in over frames 9-13, while the cursor
// rests after the first pull, where it doesn't show.
const LAG = 1 / FPS;
const late = (t) => t - LAG * Math.min(1, Math.max(0, (t * FPS - 9) / 4));

function pos(t) {
  const p = toCanvas(at(track, t));
  const s = shiftAt(t);
  return { x: p.x + s.x, y: p.y + s.y };
}

// The square the clip shows: the original's (712.7 units across, from its
// scale) brought an eighth closer, centered on the root, which sits as near
// the top (proportionally) as the original's. Until the last pull the tree
// (with its leaves' grab circles) stays inside it, so the card never
// reframes; that one, as in the original, hauls it off the bottom and out
// past the sides.
const VIEW = { x: -65, y: -59, side: 630 };

export default card("sprouting-tree", {
  state: { root: { id: "n0", children: [] } },
  view: VIEW,
  // room below the card for the last pull to run on (the crop is still the card)
  height: SIZE + 140,
  // Press the lone node where the first frame holds it, and pull it (unfilmed)
  // to where that frame has it: not far enough to sprout.
  async setup(rec) {
    const press = { x: 250 + off0.x + SHIFT.x, y: 40 + off0.y + SHIFT.y };
    await rec.step(await toScreen(rec, press));
    await rec.down();
    const to = pos(0);
    const n = 10;
    for (let i = 1; i <= n; i++) {
      const s = i / n;
      await rec.step(await toScreen(rec, { x: press.x + (to.x - press.x) * s, y: press.y + (to.y - press.y) * s }));
    }
  },
  async script(rec) {
    const t0 = await startLog(rec);
    // 116 frames at 30 fps: 3.87 s, 232 frames at 60. Presses and releases
    // take a step's place, so the clip runs exactly as long as the original.
    const frames = Math.round((track.frames.length / FPS) * 60);
    for (let k = 0; k < frames; k++) {
      const t = late(k / 60);
      const want = track.isDown(t);
      if (want !== rec.buttonDown) await (want ? rec.down() : rec.up());
      else await rec.step(await toScreen(rec, pos(t)));
    }
    // The original ends mid-pull; let go after the last frame, unfilmed, so
    // the log ends on the state the clip ends on.
    rec.filming = false;
    await rec.up();
    await saveLog(rec, path.join(HERE, "../out/sprouting-tree.log.json"), t0, 0);
  },
});
