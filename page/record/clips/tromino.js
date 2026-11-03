// The trominoes card's clip: Josh's original (clips/tromino.mp4 on the page),
// remade in the page's colors by replaying its cursor. It's one long drag of
// the hole, already under way on the first frame: down the middle, out along
// the bottom left, up the left edge, across and back down the middle, out to
// the right, up the right edge, along the top (the cursor off the top of the
// card) and round again, the trominoes turning to tile around the hole all
// the way.
//
//   node <talk repo>/d2-talk/recorder/vrec.js page/record/clips/tromino.js --no-webm

import path from "node:path";
import { fileURLToPath } from "node:url";
import { card, SIZE } from "./card.js";
import { at, loadTrack, saveLog, startLog, toScreen } from "../replay.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30; // the original's

// tracks/tromino.json: track.py with tracks/tromino-templates.json (a fist
// cut from the clip's own frame 6; its cursor is drawn ~1.3× the others').
// The button is held throughout. On frames 62-67 the cursor is above the top
// of the original (only a sliver shows on 62, 63 and 67); there it's put
// where the hole, held to the top row, says it was across, and just above
// the edge.
const track = loadTrack(path.join(HERE, "../tracks/tromino.json"), {
  fix: {
    62: { x: 344, y: 6 },
    63: { x: 327, y: -8 },
    64: { x: 310, y: -16 },
    65: { x: 278, y: -18 },
    66: { x: 238, y: -12 },
    67: { x: 192, y: -2 },
  },
});

// The original's board (canvas 0-320 square) spans 27-449 px both ways (its
// edge lines): 1.31875 px per unit, offset (27, 23).
const S = 1.31875;
const toCanvas = (p) => ({ x: (p.x - 27) / S, y: (p.y - 23) / S });

// In the original the hole trails the cursor by 0.77 of a frame (render
// latency: fitting hole(t) = cursor(t - L) - offset over the frames where the
// hole is free of the board's edges leaves a median miss of 1 px at L = 0.77
// frames, against 14 px at L = 0). Here the hole keeps up with the pointer,
// so play the cursor that much late: the hole then moves as the original's
// did, frame for frame. The offset is where the hole was held: (0.95, 16.1)
// px from its center, near its bottom edge.
const LAG = 0.77 / FPS;
const GRAB = { x: 0.95 / S, y: 16.1 / S };

/** The original's cursor at t (s), carried on straight back before its first frame. */
function pos(t) {
  if (t >= 0) return at(track, t);
  const a = track.frames[0], b = track.frames[1];
  const u = -t * FPS;
  return { x: a.x - (b.x - a.x) * u, y: a.y - (b.y - a.y) * u };
}

// The cursor goes off the top of the original for a moment, still pulling;
// the card sits this far down the page, with the film cropped to it, so the
// pointer has page above it to go to.
const ABOVE = 60;

/** A canvas point on the page (kept on it, just in case). */
async function onCard(rec, p) {
  const q = await toScreen(rec, p);
  return { x: Math.min(SIZE - 0.5, Math.max(0.5, q.x)), y: Math.min(ABOVE + SIZE - 0.5, Math.max(0.5, q.y)) };
}

export default card("tromino", {
  css: `#root { top: ${ABOVE}px !important; }`,
  height: ABOVE + SIZE,
  crop: { x: 0, y: ABOVE, w: SIZE, h: SIZE },
  // The card starts with the hole top left; press it where the original held
  // it, and carry it (unfilmed) to where the original's first frame has it.
  // The hole's place mid-drag depends only on the pointer, so the path there
  // doesn't matter.
  async setup(rec) {
    const press = { x: 20 + GRAB.x, y: 20 + GRAB.y };
    await rec.step(await onCard(rec, press));
    await rec.down();
    const to = toCanvas(pos(-LAG));
    const n = 30;
    for (let i = 1; i <= n; i++) {
      const s = i / n;
      await rec.step(await onCard(rec, { x: press.x + (to.x - press.x) * s, y: press.y + (to.y - press.y) * s }));
    }
  },
  async script(rec) {
    const t0 = await startLog(rec);
    // 96 frames at 30 fps: 3.2 s, 192 frames at 60. The original ends
    // mid-drag; let go after the last frame, unfilmed, so the log ends on the
    // state the clip ends on (the hole's nearest cell).
    const frames = Math.round((track.frames.length / FPS) * 60);
    for (let k = 0; k < frames; k++) await rec.step(await onCard(rec, toCanvas(pos(k / 60 - LAG))));
    rec.filming = false;
    await rec.up();
    await saveLog(rec, path.join(HERE, "../out/tromino.log.json"), t0, 0);
  },
});
