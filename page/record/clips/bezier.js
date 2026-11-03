// The bézier card's clip: Josh's original (clips/bezier.mp4 on the page),
// remade in the page's colors by replaying its cursor. It pulls P2 down and
// back, then grabs the curve itself and swings it.
//
//   node <talk repo>/d2-talk/recorder/vrec.js page/record/clips/bezier.js --no-webm

import path from "node:path";
import { fileURLToPath } from "node:url";
import { card } from "./card.js";
import { loadTrack, replay, saveLog, startLog } from "../replay.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const track = loadTrack(path.join(HERE, "../tracks/bezier.json"));

// The original's first frame, on the demo's canvas: its P0 and P3 put the
// canvas at 1.246 px per unit, offset (25.3, 81.3); P1 and P2 read off it.
const toCanvas = (p) => ({ x: (p.x - 25.3) / 1.246, y: (p.y - 81.3) / 1.246 });
const start = { p0: { x: 50, y: 50 }, p1: { x: 238, y: 4 }, p2: { x: 112, y: 211 }, p3: { x: 300, y: 200 } };
// A square with room below the curve, where the card's own framing would have
// none: pulled down, P2 (here X) reaches y 268 and the swung curve dips to
// 283, both inside it. (Swinging the curve still throws P2 out past the
// bottom, to y 407, as it threw the original's.)
const view = { x: 9, y: -35, side: 332 };

export default card("bezier", {
  state: start,
  view,
  startAt: toCanvas(track.frames[0]),
  async script(rec) {
    const t0 = await startLog(rec);
    await replay(rec, track, { toCanvas });
    await saveLog(rec, path.join(HERE, "../out/bezier.log.json"), t0, 0);
  },
});
