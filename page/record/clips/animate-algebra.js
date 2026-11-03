// The algebra card's clip: Josh's original (clips/animate-algebra.mp4 on the
// page), remade in the page's colors by replaying its cursor. It swaps the
// cloud (here a star) above the -🍄, pulls it up out of its sum, pushes it
// back in, and swaps it back down.
//
//   node <talk repo>/d2-talk/recorder/vrec.js page/record/clips/animate-algebra.js --no-webm
//
// The themed tree is laid out exactly as the original's, and the card frames
// it as the original did, so the cursor maps straight across: it comes in
// from beyond the right edge and leaves half off it, as the original's does.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { card } from "./card.js";
import { at, saveLog, startLog, toScreen } from "../replay.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;

// # The original's cursor

// Its arrow never changes shape, so the presses come from the content: each
// drag starts moving the tree two or three frames after the press (the
// original's page drew a little behind its cursor), and each drop's settling
// shows up the same way after the release. In seconds of the original.
const downs = [
  [37 / FPS, 63 / FPS], // the cloud up above the -🍄 (commutativity)
  [93 / FPS, 118 / FPS], // up out of its sum (associativity)
  [148 / FPS, 173 / FPS], // back down into it
  [202 / FPS, 229 / FPS], // and back below the -🍄
];

// Frames the tracker couldn't see, by index: before the cursor comes in from
// the right (it's off the frame until f0020, then at its edge), and after it
// leaves (half off the edge from f0255 on).
const fix = {
  ...Object.fromEntries([...Array(16).keys()].map((i) => [i, { x: 497, y: 269 }])),
  16: { x: 496, y: 269 },
  17: { x: 492, y: 268 },
  18: { x: 484, y: 266 },
  19: { x: 470.5, y: 263 },
  253: { x: 471.5, y: 228 },
  ...Object.fromEntries([...Array(15).keys()].map((i) => [255 + i, { x: 475.5, y: 227.5 }])),
  254: { x: 475.5, y: 227.5 },
};

const track = cleanTrack(path.join(HERE, "../tracks/animate-algebra.json"), { minScore: 0.7, fix });

// The original's first frame, on the demo's canvas: its outer box (150×140)
// spans (23.8, 23.6) to (455.8, 426.6), 2.88 px per unit.
const toCanvas = (p) => ({ x: (p.x - 23.8) / 2.88, y: (p.y - 23.6) / 2.88 });

const pos = (t) => toCanvas(at(track, t));

const isDown = (t) => downs.some(([a, b]) => t >= a && t < b);

export default card("animate-algebra-tree", {
  // room beyond the card (outside the crop) for the cursor to come in from
  width: 300,
  height: 300,
  startAt: pos(0),
  async script(rec) {
    const t0 = await startLog(rec);
    // as many frames as the original's 9 s
    await play(rec, { pos, isDown, to: track.frames.length / FPS - 1 / 60 });
    await saveLog(rec, path.join(HERE, "../out/animate-algebra.log.json"), t0, 0);
  },
});

// for checking the replayed path against the original's frames
export { pos, isDown, track };

// # Helpers (local variants of replay.js's)

/**
 * As replay.js's loadTrack, plus: frames listed in `drop` count as misses;
 * a frame that only repeats the one before (the original was captured at
 * about 25 fps into 30, so while the cursor moves every fifth or sixth frame
 * repeats) is filled in like a miss; and the whole is smoothed a little
 * (a Gaussian, `smooth` frames wide), since the captures' uneven timing
 * makes the cursor's speed stutter from frame to frame.
 */
function cleanTrack(file, { minScore, fix = {}, drop = [], smooth = 1 }) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const dropped = new Set(drop);
  const frames = raw.map((f, i) => {
    const o = fix[i];
    return { t: i / FPS, x: o?.x ?? f.x, y: o?.y ?? f.y, ok: !!o || (!dropped.has(i) && f.score >= minScore), fixed: !!o };
  });
  const same = (i, j) => frames[i].x === frames[j].x && frames[i].y === frames[j].y;
  const repeats = [];
  for (let i = 2; i < frames.length - 1; i++) {
    if (frames[i].fixed || !frames[i].ok || !frames[i - 1].ok) continue;
    if (same(i, i - 1) && !same(i - 1, i - 2) && !same(i + 1, i)) repeats.push(i);
  }
  for (const i of repeats) frames[i].ok = false;
  const good = frames.map((f, i) => (f.ok ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].ok) continue;
    const a = [...good].reverse().find((g) => g < i);
    const b = good.find((g) => g > i);
    const A = frames[a ?? b], B = frames[b ?? a];
    const w = a == null || b == null ? 0 : (i - a) / (b - a);
    frames[i].x = A.x + (B.x - A.x) * w;
    frames[i].y = A.y + (B.y - A.y) * w;
  }
  if (smooth > 0) {
    const r = Math.ceil(3 * smooth);
    const k = [...Array(2 * r + 1).keys()].map((j) => Math.exp(-((j - r) ** 2) / (2 * smooth * smooth)));
    const sum = k.reduce((a, b) => a + b);
    const xs = frames.map((f) => f.x), ys = frames.map((f) => f.y);
    const clamp = (i) => Math.max(0, Math.min(frames.length - 1, i));
    frames.forEach((f, i) => {
      f.x = k.reduce((a, w, j) => a + w * xs[clamp(i + j - r)], 0) / sum;
      f.y = k.reduce((a, w, j) => a + w * ys[clamp(i + j - r)], 0) / sum;
    });
  }
  return { frames, fps: FPS, duration: (frames.length - 1) / FPS };
}

/**
 * As replay.js's replay, but a press or release takes the place of the next
 * frame's move rather than adding a frame, so the clip runs exactly as long
 * as the original.
 */
async function play(rec, { pos, isDown, from = 0, to, fps = 60 }) {
  const n = Math.round((to - from) * fps);
  for (let k = 0; k <= n; k++) {
    const t = from + k / fps;
    const want = isDown(t);
    if (want !== rec.buttonDown) await (want ? rec.down() : rec.up());
    else await rec.step(await toScreen(rec, pos(t)));
  }
  if (rec.buttonDown) await rec.up();
}
