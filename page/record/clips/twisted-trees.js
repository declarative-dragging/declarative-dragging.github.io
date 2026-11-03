// The twisted trees card's clip: Josh's original (clips/twisted-trees.mp4 on
// the page), remade in the page's colors by replaying its cursor. It pulls
// the right subtree's leaves down into their own bubbles, lifts the right
// node into the root's, pulls a leaf out on the left and swaps it for its
// sibling, then undoes it all in reverse.
//
//   node <talk repo>/d2-talk/recorder/vrec.js page/record/clips/twisted-trees.js --no-webm
//
// The themed tree is laid out as the original's, and filmed in the square of
// the canvas the original showed, so the cursor maps straight across. Each
// press is still put exactly on the node the original grabbed, and each
// release where that node lands (shifts of a unit or two, from reading them
// off the original's frames), keeping the cursor where it was on the node;
// the shifts come in along the way, in step with the distance the cursor
// covers, so the original's path and pace stay as they were.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { card } from "./card.js";
import { at, saveLog, startLog, toScreen } from "../replay.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;

// # The states, and where their nodes are

// The demo's morphs: where each node of the dragged tree sits in the fixed
// one. The original starts at S0 (the card starts elsewhere) and goes
// S0 → S1 → … → S5 and back.
const morph = (m) => ({ morph: { root: "root", a: "a", a1: "a", a2: "a2", b: "b", b1: "b", b2: "b", ...m } });
const S0 = morph({});
const S1 = morph({ b1: "b1" });
const S2 = morph({ b1: "b1", b2: "b2" });
const S3 = morph({ b: "root", b1: "b1", b2: "b2" });
const S4 = morph({ b: "root", b1: "b1", b2: "b2", a1: "a1" });
const S5 = morph({ b: "root", b1: "b1", b2: "b2", a1: "a1", a2: "a" });

// Where the grabbed nodes are in each state: in the original's pixels (read
// off its frames at rest) and on the themed demo's canvas (from the page)
const ORIG = {
  S0: { b1: [269.6, 251.1] },
  S1: { b1: [257.9, 350.4], b2: [304.5, 239.8] },
  S2: { b: [314.6, 186.1], b2: [370.8, 298.4] },
  S3: { b: [230.3, 127.3], a1: [99.9, 293.1] },
  S4: { a1: [71.9, 351.8], a2: [184.3, 351.9] },
  S5: { a2: [118.0, 293.1] },
};
const THEMED = {
  S0: { b1: [262.1, 239.7] },
  S1: { b1: [249.7, 351.5], b2: [300.9, 227] },
  S2: { b: [312.1, 167.3], b2: [374.6, 292.1] },
  S3: { b: [218.5, 102.1], a1: [73.6, 286.3] },
  S4: { a1: [42.4, 351.5], a2: [167.3, 351.5] },
  S5: { a2: [93.6, 286.3] },
};

// # The original's cursor

// Its arrow never changes shape, so the presses come from the content: each
// drag starts moving the tree about three frames after the press (the
// original's page drew a little behind its cursor), and a drop that settles
// after the cursor has stopped shows its release the same way. By frame
// index (f0001 is 0): press, release, the node, from and to.
const drags = [
  [43, 61, "b1", "S0", "S1"], // b1 down into its own bubble
  [98, 119, "b2", "S1", "S2"], // b2 likewise
  [154, 175, "b", "S2", "S3"], // b up into the root's
  [210, 232, "a1", "S3", "S4"], // a1 down into its own
  [266, 287, "a2", "S4", "S5"], // a2 up into a's
  [321, 342, "a2", "S5", "S4"], // and back down
  [377, 399, "a1", "S4", "S3"], // a1 back up
  [432, 454, "b", "S3", "S2"], // b back down
  [490, 503, "b2", "S2", "S1"], // b2 back up
  [544, 565, "b1", "S1", "S0"], // b1 back up
];
const downs = drags.map(([a, b]) => [a / FPS, b / FPS]);

const track = cleanTrack(path.join(HERE, "../tracks/twisted-trees.json"), { minScore: 0.6 });

// The original's pixels on the demo's canvas: 0.9 px per unit (its nodes are
// 36 px across, the demo's 40 units), its root where the themed S0 has it
const toCanvas = (p) => ({ x: (p.x - 203.3) / 0.9 + 188.5, y: (p.y - 73.7) / 0.9 + 42.4 });
// The square of the canvas the original showed (its 480 px), which holds the
// tree in every state the clip goes through
const VIEW = { x: toCanvas({ x: 0, y: 0 }).x, y: toCanvas({ x: 0, y: 0 }).y, side: 480 / 0.9 };

// The shift that puts the original's node `n` in state `s` on the themed one
const onto = (n, s) => {
  const o = toCanvas({ x: ORIG[s][n][0], y: ORIG[s][n][1] });
  return { x: THEMED[s][n][0] - o.x, y: THEMED[s][n][1] - o.y };
};
// Where the cursor rests before and after: the original's spots, a little
// left at the start so the bigger arrow isn't cut off by the edge
const restShift = (frame, { x, y }) => {
  const o = toCanvas(track.frames[frame]);
  return { x: x - o.x, y: y - o.y };
};
const anchors = [
  [17 / FPS, restShift(17, toCanvas({ x: 452, y: 253 }))],
  ...drags.flatMap(([a, b, n, from, to]) => [
    [a / FPS, onto(n, from)],
    [b / FPS, onto(n, to)],
  ]),
  [593 / FPS, restShift(593, toCanvas({ x: 460, y: 217 }))],
];
const pos = warp(track, toCanvas, anchors);

const isDown = (t) => downs.some(([a, b]) => t >= a && t < b);

export default card("twisted-trees", {
  state: S0,
  view: VIEW,
  startAt: pos(0),
  async script(rec) {
    const t0 = await startLog(rec);
    // as many frames as the original's 20.2 s
    await play(rec, { pos, isDown, to: track.frames.length / FPS - 1 / 60 });
    await saveLog(rec, path.join(HERE, "../out/twisted-trees.log.json"), t0, 0);
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
 * The cursor on the demo's canvas at time t: the track through `toCanvas`,
 * plus a shift that goes from one anchor's to the next in step with the
 * distance the original cursor covers between them (so it never moves a
 * cursor that's at rest, and keeps the original's accelerations).
 */
function warp(track, toCanvas, anchors) {
  const dt = 1 / 240;
  const s = [0];
  let prev = at(track, 0);
  for (let t = dt; t <= track.duration + dt; t += dt) {
    const p = at(track, t);
    s.push(s[s.length - 1] + Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  const arc = (t) => {
    const u = Math.max(0, Math.min(s.length - 1, t / dt));
    const i = Math.min(s.length - 2, Math.floor(u));
    return s[i] + (s[i + 1] - s[i]) * (u - i);
  };
  const shift = (t) => {
    if (t <= anchors[0][0]) return anchors[0][1];
    for (let k = 0; k < anchors.length - 1; k++) {
      const [ta, ca] = anchors[k], [tb, cb] = anchors[k + 1];
      if (t > tb) continue;
      const span = arc(tb) - arc(ta);
      const w = span > 1e-6 ? (arc(t) - arc(ta)) / span : (t - ta) / (tb - ta);
      return { x: ca.x + (cb.x - ca.x) * w, y: ca.y + (cb.y - ca.y) * w };
    }
    return anchors[anchors.length - 1][1];
  };
  return (t) => {
    const p = toCanvas(at(track, t)), c = shift(t);
    return { x: p.x + c.x, y: p.y + c.y };
  };
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
