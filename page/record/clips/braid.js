// The braid card's clip: Josh's original (clips/braid.mp4 on the page),
// remade in the page's colors by replaying its cursor. It is one long drag of
// one strand's end: the clip opens mid-drag, the strand weaves down through a
// few crossings, is pulled back up (unweaving them), and weaves again.
//
//   node <talk repo>/d2-talk/recorder/vrec.js page/record/clips/braid.js --no-webm

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { card } from "./card.js";
import { at, loadTrack, saveLog, startLog, toScreen } from "../replay.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// The original's canvas: strands 0 and 3 at x 150.5 and 337 px, their tops
// at y 30, so 1.2433 px per unit.
const S = 186.5 / 150;
const toCanvas = (p) => ({ x: (p.x - 150.5) / S, y: (p.y - 30) / S });

// Frames the tracker couldn't place: the fist cut off by the top or bottom
// edge (placed by matching what shows), or out of the picture altogether
// (above the top while the pull unweaves everything, f49–54; below the bottom
// at the end). By frame index (f0001 is 0).
const fix = {
  0: { x: 221.5, y: 8.5 },
  1: { x: 166.5, y: 9.5 },
  2: { x: 150.5, y: 10.5 },
  3: { x: 145.5, y: 11.5 },
  29: { x: 168.5, y: 482.5 },
  30: { x: 187, y: 488 },
  31: { x: 204.5, y: 478.5 },
  47: { x: 133.5, y: 7.5 },
  48: { x: 205, y: -30 },
  49: { x: 228, y: -45 },
  50: { x: 238, y: -48 },
  51: { x: 238, y: -42 },
  52: { x: 232, y: -32 },
  53: { x: 222, y: -19 },
  54: { x: 212.5, y: -5.5 },
  77: { x: 215.5, y: 487.5 },
};
// after f78 the fist has gone out the bottom; it sinks a little further, then rests
for (let i = 78; i < 107; i++) {
  const u = Math.min(1, (i - 77) / 6);
  const e = 1 - (1 - u) ** 2;
  fix[i] = { x: 215.5 - 25 * e, y: 487.5 + 40 * e };
}
const track = loadTrack(path.join(HERE, "../tracks/braid.json"), { fix });

// The original opens mid-drag: strand 3's end (at the right) is held, with the
// braid still unwoven. So the clip starts from a longer braid (six crossings),
// in the square the original shows (about 400 units, strands at the top), and
// the unfilmed setup grabs strand 3's end there and pulls it up through its
// crossings, unweaving them, to the unwoven braid of the original's first
// frame, still held. (The card keeps a square until a drop, and keeps this
// one through the clip.)
const VIEW = { x: -126, y: -16, side: 402 };
const long = { n: 4, seq: [[1, 2], [0, 1], [2, 3], [1, 2], [0, 1], [2, 3]] };
// strand 3's end after each crossing of `long`, from the last back to none
const ends = [
  { x: 0, y: 350 },
  { x: 0, y: 300 },
  { x: 50, y: 250 },
  { x: 100, y: 200 },
  { x: 150, y: 150 },
  { x: 150, y: 100 },
  { x: 150, y: 50 },
];

/**
 * `replay` (../replay.js), but a press or release takes the place of that
 * frame's move instead of adding a frame of its own, so the clip keeps the
 * original's timing (and length) through each press and release.
 */
async function replaySteady(rec, track, { toCanvas, fps = 60 }) {
  const n = Math.round(track.duration * fps);
  for (let k = 0; k <= n; k++) {
    const t = k / fps;
    const want = track.isDown(t);
    if (want !== rec.buttonDown) await (want ? rec.down() : rec.up());
    else await rec.step(await toScreen(rec, toCanvas(at(track, t))));
  }
  if (rec.buttonDown) await rec.up();
}

/**
 * The original opens mid-drag, so the press comes before the clip and the log
 * has it at 0 with the states shown before it: put there instead the state the
 * drag began from (`from`, or the last one shown), in the square the card
 * showed, and the press just after, so a card going live early in the drag
 * starts from where the drag began.
 */
function logOpening(file, from) {
  const log = JSON.parse(fs.readFileSync(file, "utf8"));
  const i = log.findIndex((e) => e.kind === "down");
  const before = log.slice(0, i).filter((e) => e.kind === "drop" && e.view);
  const last = before[before.length - 1];
  const opening = { t: 0, kind: "drop", state: from ?? last.state, view: last.view };
  fs.writeFileSync(file, JSON.stringify([opening, { ...log[i], t: 0.001 }, ...log.slice(i + 1)]));
}

/**
 * The clip, grabbing strand 3's end `grab` (canvas units) off its center:
 * by default where the original's hand evidently held it, a little left of
 * and below its center (the offset whose take best matched the original's
 * strands, frame by frame, among trial takes). `outDir` and `name` are for
 * trial takes.
 */
export function braidClip({ grab = { x: -3, y: 6 }, outDir, name } = {}) {
  const off = (p) => ({ x: p.x + grab.x, y: p.y + grab.y });
  return card("braid-old", {
    state: long,
    view: VIEW,
    startAt: off(ends[0]),
    ...(outDir ? { outDir, name } : {}),
    async setup(rec) {
      await rec.wait(100);
      await rec.down();
      // pull up just past each end in turn, so each crossing unweaves
      for (let k = 1; k < ends.length; k++) {
        const a = ends[k - 1], b = ends[k];
        for (let s = 1; s <= 6; s++) {
          const u = s / 6;
          const p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - 12 * u };
          await rec.step(await toScreen(rec, off(p)));
        }
      }
      // over to where the original's first frame has the fist
      const from = off({ x: 150, y: 38 });
      const to = toCanvas(track.frames[0]);
      for (let s = 1; s <= 30; s++) {
        const u = s / 30;
        await rec.step(await toScreen(rec, { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u }));
      }
      await rec.wait(300);
    },
    async script(rec) {
      const t0 = await startLog(rec);
      await replaySteady(rec, track, { toCanvas });
      const log = path.join(outDir ?? path.join(HERE, "../out"), `${name ?? "braid"}.log.json`);
      await saveLog(rec, log, t0, 0);
      // (the drag began from the unwoven braid, not the longer one the setup unwove)
      logOpening(log, { n: 4, seq: [] });
    },
  });
}

export default braidClip();
