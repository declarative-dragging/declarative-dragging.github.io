// The permutation lab's clip for phones (clips/permutation-lab-phone.mp4,
// which phones show in place of the live figure): the talk's take, as in
// clips/permutation-lab.js, replayed on the lab's phone layout
// (record/perm.html?layout=phone, the layout a phone's reader gets when
// they tap it), so the clip and the live figure match.
//
// The phone layout puts everything somewhere else, at its own size, and
// turns the wiring diagram to run down the page, so the take can't just be
// scaled. Each drag of the take is replayed on the same element here, its
// motion carried over through that representation's own transform: from
// where the element is on the phone, the take's offsets from where it was
// on the talk's canvas, scaled as that representation is (and, for the
// wiring diagram, turned with it). Between drags, the pointer goes from
// where one drag ended to where the next begins along a gentle curve, at
// the take's pace: at each moment it's as far along its way as the take's
// pointer was along its own. It starts and ends at rest beside the
// permutohedron, where the take's pointer starts, so the clip loops.
//
//   node <talk repo>/d2-talk/recorder/vrec.js page/record/clips/permutation-lab-phone.js --no-webm
//
// Out come out/permutation-lab-phone.mp4 and out/permutation-lab-phone.log.json:
// the states the lab was in, by the video's clock (each it was dropped
// into and, through each drag, each it would drop into), so a phone that
// goes live from the clip starts where it had got to.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.RECORD_BASE || "http://127.0.0.1:5192/record/perm.html";
const RAILS = path.join(HERE, "../permutation-lab-take.json");

/** The phone layout's canvas, which the figure draws at its own size */
const W = 348;
const H = 786;
const FRAME = 1000 / 60;

// # The take, on the talk's canvas (as clips/permutation-lab.js reads it)

/** Each moment of the take: t (ms), x and y as fractions of the slide's frame, and the button */
const take = JSON.parse(fs.readFileSync(RAILS, "utf8"))["0"];

const fromSlide = ({ x, y }) => ({ x: -60 + 1080 * x, y: -53.75 + 607.5 * y });

// The page's two-line notation leaves room between its tiles; around that
// row, x is stretched to match (see clips/permutation-lab.js)
const TS = 48;
const K = (TS + (6 * TS) / 44) / TS;
const ROW = { x0: 20, x1: 250, y0: 90, y1: 180 };
const FADE = 40;
function onPage({ x, y }) {
  const out = Math.max(ROW.x0 - x, x - ROW.x1, ROW.y0 - y, y - ROW.y1, 0);
  const w = Math.max(0, 1 - out / FADE);
  return { x: x + (x - 66) * (K - 1) * w, y };
}

/** Where the take's pointer is at t (ms), on the talk's canvas, and whether it's pressed */
export function at(t) {
  let i = 0;
  while (i < take.length - 2 && take[i + 1].t <= t) i++;
  const a = take[i];
  const b = take[i + 1];
  const u = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t || 1)));
  const p = onPage(fromSlide({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }));
  return { ...p, down: (t >= b.t ? b : a).down };
}

/** Where the clip stops: as clips/permutation-lab.js, with the permutation as it began */
export const DURATION = 15620;

/** The take's presses and releases (ms): [down, up], the last one after the cut */
export const PRESS_TIMES = (() => {
  const spans = [];
  for (let i = 1; i < take.length; i++)
    if (take[i].down && !take[i - 1].down) spans.push([take[i].t, null]);
    else if (!take[i].down && take[i - 1].down) spans[spans.length - 1][1] = take[i].t;
  return spans.filter(([down]) => down <= DURATION + 200);
})();

// # What each press of the take grabs
//
// Found by replaying the take on the talk's layout (record/perm.html?ghost=0)
// as clips/permutation-lab.js does: the element each press landed on, and
// where that element's origin was on the talk's canvas just then, and the
// word it left (the phone's replay has to leave the same). A walk round the
// permutohedron (and a turn of it), the wiring diagram untangled to e, and
// the permutation rebuilt by the cycle diagram, the two-line notation and
// the matrix.
export const PRESSES = [
  { id: "ph-token", origin: { x: 620.96, y: 479.25 }, leaves: "s₂ s₃ s₁ s₃ s₂" },
  { id: "ph-face-1", origin: { x: 787.81, y: 291.25 }, leaves: "s₂ s₃ s₁ s₃ s₂" },
  { id: "ph-token", origin: { x: 809.01, y: 477.63 }, leaves: "s₂ s₃ s₁ s₃ s₂ s₁ s₂ s₁" },
  { id: "cross-2-4x", origin: { x: 196.2, y: 489 }, leaves: "s₂ s₃ s₃ s₁ s₂ s₁ s₂ s₁" },
  { id: "strand-4-1", origin: { x: 134.4, y: 468 }, leaves: "s₂ s₁ s₂ s₁ s₂ s₁" },
  { id: "cross-1-3", origin: { x: 113.8, y: 405 }, leaves: "s₁ s₂ s₁ s₁ s₂ s₁" },
  { id: "strand-3-2", origin: { x: 175.6, y: 384 }, leaves: "s₁ s₂ s₂ s₁" },
  { id: "strand-3-1", origin: { x: 134.4, y: 426 }, leaves: "s₁ s₁" },
  { id: "strand-2-0", origin: { x: 93.2, y: 384 }, leaves: "e" },
  { id: "cyc-node-2", origin: { x: 83.5, y: 266 }, leaves: "s₁" },
  { id: "cyc-node-3", origin: { x: 142.9, y: 266 }, leaves: "s₂ s₁" },
  { id: "cyc-node-4", origin: { x: 142.9, y: 266 }, leaves: "s₃ s₂ s₁" },
  { id: "tl-tile-3", origin: { x: 205.64, y: 111.29 }, leaves: "s₃ s₂ s₁ s₃ s₂ s₁" },
  { id: "tl-tile-4", origin: { x: 96.55, y: 111.29 }, leaves: "s₃ s₂ s₁ s₃ s₂ s₁ s₂" },
  { id: "mat-dot-3", origin: { x: 390, y: 68 }, leaves: "s₃ s₁" },
  { id: "mat-dot-3", origin: { x: 390, y: 164 }, leaves: "s₂ s₃ s₁" },
];

// # From the talk's layout to the phone's
//
// Each representation's own transform, as it takes a move: its scale on the
// phone over its scale in the talk (themes/perm.tsx), and the wiring
// diagram's turn (across its wires is across the page in the talk, along
// the page on the phone, and the other way round).

const scaled = (k) => (d) => ({ x: d.x * k, y: d.y * k });
const CARRY = [
  ["tl-tile-", scaled(34 / 48)],
  ["mat-dot-", scaled(39 / 32)],
  ["cyc-node-", scaled(1.15 / 1.35)],
  ["ph-", scaled(136 / 236)],
  // along the wires: a column's width; across them: a row's spacing
  ["", (d) => ({ x: d.y * (36 / 42), y: d.x * (36.5 / 41.2) })],
];
export const carry = (id) => CARRY.find(([prefix]) => id.startsWith(prefix))[1];

/** Where the take starts and the clip starts and ends: on the phone, beside
 * the permutohedron as on the slide (carried over by its transform) */
export const START = (() => {
  const p = at(0);
  const d = carry("ph-")({ x: p.x - 722, y: p.y - 282 });
  return { x: 174 + d.x, y: 640 + d.y };
})();

/** Where an element's origin is on the phone's canvas, now */
const originOf = (rec, id) =>
  rec.evaluate((id) => {
    const el = document.querySelector(`.perm-stage svg [id="${id}"]`);
    if (!el) return null;
    const p = new DOMPoint(0, 0).matrixTransform(el.getCTM());
    return { x: p.x, y: p.y };
  }, id);

/** How far along its path the take's pointer is, from `t0` to `t1`, at t (0..1) */
const progresses = new Map();
function progress(t0, t1) {
  const key = `${t0}-${t1}`;
  if (!progresses.has(key)) progresses.set(key, measure(t0, t1));
  return progresses.get(key);
}

function measure(t0, t1) {
  const ts = [];
  for (let t = t0; t < t1; t += FRAME) ts.push(t);
  ts.push(t1);
  const lens = [0];
  for (let k = 1; k < ts.length; k++) {
    const a = at(ts[k - 1]);
    const b = at(ts[k]);
    lens.push(lens[k - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = lens[lens.length - 1] || 1;
  return (t) => {
    const k = Math.max(0, Math.min(ts.length - 1, Math.round((t - t0) / FRAME)));
    return lens[k] / total;
  };
}

/** A gentle curve from `a` to `b`, bowed to one side by a tenth of the way */
function curve(a, b, side) {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const c = { x: m.x - (b.y - a.y) * 0.1 * side, y: m.y + (b.x - a.x) * 0.1 * side };
  return (u) => ({
    x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x,
    y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y,
  });
}

/**
 * Plays the take on the phone layout, a frame at a time, through `rec`
 * (vrec's, or anything with its `step`, `down`, `up` and `evaluate`).
 */
export async function replay(rec) {
  let pos = START;
  let travelFrom = START;
  let side = 1;
  let press = -1; // the last press made
  let grab = null; // the press being held: where its element was, here and in the talk
  const n = Math.round(DURATION / FRAME);
  for (let k = 0; k <= n; k++) {
    const t = k * FRAME;
    const p = at(t);
    const held = grab !== null;
    if (p.down && !held) {
      // press where the travel brought the pointer
      press++;
      const { id, origin } = PRESSES[press];
      if (press > 0) await checkWord(rec, press - 1);
      const here = await originOf(rec, id);
      if (!here) throw new Error(`press ${press}: no ${id} on the phone`);
      grab = { id, here, there: origin, carry: carry(id) };
      await rec.down();
      continue;
    }
    if (!p.down && held) {
      grab = null;
      travelFrom = pos;
      side = -side;
      await rec.up();
      continue;
    }
    if (held) {
      const d = grab.carry({ x: p.x - grab.there.x, y: p.y - grab.there.y });
      pos = { x: grab.here.x + d.x, y: grab.here.y + d.y };
    } else {
      // on the way to the next press (or, after the last, back to the start)
      const next = press + 1;
      const [t0, t1] = [press < 0 ? 0 : PRESS_TIMES[press][1], PRESS_TIMES[next]?.[0] ?? DURATION];
      const last = !PRESSES[next] || PRESS_TIMES[next][0] > DURATION;
      let to = START;
      if (!last) {
        const { id, origin } = PRESSES[next];
        const here = await originOf(rec, id);
        const pressAt = at(PRESS_TIMES[next][0]);
        const d = carry(id)({ x: pressAt.x - origin.x, y: pressAt.y - origin.y });
        to = { x: here.x + d.x, y: here.y + d.y };
      }
      const u = progress(t0, last ? DURATION : t1)(t);
      pos = curve(travelFrom, to, side)(u);
    }
    await rec.step(pos);
  }
  if (grab) await rec.up();
  await checkWord(rec, press);
}

/** Says so if the replay hasn't left the word the take left after press `i` */
async function checkWord(rec, i) {
  // (the state it was dropped into: the drawing's letters may still be
  // fading in and out)
  const word = await rec.evaluate(() => {
    const drop = window.__permStates.findLast((e) => e.kind === "drop");
    const letters = drop.state.word.filter((c) => typeof c === "number");
    return letters.map((k) => `s${"₀₁₂₃₄₅₆₇₈₉"[k + 1]}`).join(" ") || "e";
  });
  if (word !== PRESSES[i].leaves)
    console.error(`press ${i} (${PRESSES[i].id}) left ${word}, not ${PRESSES[i].leaves}`);
}

export default {
  name: "permutation-lab-phone",
  url: `${BASE}?layout=phone`,
  width: W,
  height: H,
  startPos: [START.x, START.y],
  scale: 2,
  capture: { x: 0, y: 0, w: W, h: H },
  crop: { x: 0, y: 0, w: W, h: H },
  onlySvg: false,
  // The card clips' cursor is 16px on a 240px card, which a phone shows
  // about 165px wide; a phone shows this clip at its own size, so 11px.
  cursorSize: 11,
  ready: "#root",
  lead: 0,
  tail: 0,
  outDir: path.join(HERE, "../out"),

  async setup(rec) {
    await rec.evaluate(() => window.__play());
    for (let k = 0; !(await rec.evaluate(() => !!document.querySelector(".perm-stage svg"))); k++) {
      if (k > 300) throw new Error("the figure hasn't mounted");
      await rec.wait(FRAME);
    }
    await rec.step(START);
  },

  async script(rec) {
    const t0 = await rec.evaluate(() => performance.now());
    await replay(rec);
    // the states, by the video's clock: every drop, and through a drag each
    // change of what it would drop into (a turn of the solid changes it
    // every frame, so those at most every 100ms)
    const states = await rec.evaluate(() => window.__permStates);
    const log = [];
    for (const e of states) {
      const t = Math.max(0, e.t - t0) / 1000;
      const prev = log[log.length - 1];
      if (e.kind === "drag" && prev?.kind === "drag" && t - prev.t < 0.1) continue;
      log.push({ t, kind: e.kind, state: e.state });
    }
    fs.writeFileSync(path.join(HERE, "../out/permutation-lab-phone.log.json"), JSON.stringify(log));
  },
};
