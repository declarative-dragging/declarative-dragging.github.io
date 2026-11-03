// The card piles card's clip: Josh's original (clips/card-piles.mp4 on the
// page), remade in the page's colors by replaying its cursor. It opens with a
// card held: the card is carried through every pile in turn (each takes it in
// and lets it go) and dropped back where it started; then the top pile is
// picked up by its edge and swung around in a small loop.
//
//   node <talk repo>/d2-talk/recorder/vrec.js page/record/clips/card-piles.js --no-webm

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { card } from "./card.js";
import { at, loadTrack, saveLog, startLog, toScreen } from "../replay.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const track = loadTrack(path.join(HERE, "../tracks/card-piles.json"));

// The original's canvas: cards are 80.5 × 115.3 px for 70 × 100 units, so
// 1.15 px per unit; the lone card at the bottom left (its corner at 63.5,
// 309.5 px) is put back where the demo first has it, (220, 300).
const S = 1.15;
const O = { x: 63.5 - 220 * S, y: 309.5 - 300 * S };
const toCanvas = (p) => ({ x: (p.x - O.x) / S, y: (p.y - O.y) / S });

// The original's first frame: a pile of three at the top, a lone card at the
// bottom left, and a pair at the bottom right whose front card is held. Cards
// by their corners (canvas units), listed back to front; the names choose the
// colors (a red, b yellow, c green, d blue, e red, f yellow), so the top pile
// has three and the held card shares its color only with the lone one.
const shown = {
  c: toCanvas({ x: 175.5, y: 103.7 }),
  d: toCanvas({ x: 149.5, y: 39.5 }),
  b: toCanvas({ x: 195, y: 73.5 }),
  a: toCanvas({ x: 63.5, y: 309.5 }),
  f: toCanvas({ x: 266, y: 283.5 }),
  e: toCanvas({ x: 190.5, y: 289.5 }),
};
const PILES = [["b", "c", "d"], ["a"], ["e", "f"]];

/** The demo's state with the cards at `pos`, piled as PILES (each pile at its cards' mean). */
function piled(pos) {
  const pile = (ids) => {
    const mean = (k) => ids.reduce((s, id) => s + pos[id][k], 0) / ids.length;
    const x = mean("x"), y = mean("y");
    const order = Object.keys(shown).filter((id) => ids.includes(id)); // back to front
    return { x, y, cards: Object.fromEntries(order.map((id) => [id, { dx: pos[id].x - x, dy: pos[id].y - y }])) };
  };
  return { piles: Object.fromEntries(PILES.map((ids) => [ids.join("-"), pile(ids)])) };
}

// The card frames itself around the cards (16 units of room, a square at
// least 300 units) and keeps its square while what's dropped still fits. To
// frame the cards as the original does (its 480 px are 417 units, the cards
// left of center), it first shows them spread to fill that square, centered
// in it: the lone card raised to its top, the held card's pile reaching its
// bottom and out to the right. The unfilmed setup puts both back (the second
// inside the 450 ms the card waits before reframing), and then takes hold of
// the card as the original's hand holds it.
const VIEW = { ...toCanvas({ x: 0, y: 0 }), side: 480 / S };
const mid = { x: VIEW.x + VIEW.side / 2, y: VIEW.y + VIEW.side / 2 };
const reach = (VIEW.side - 32) / 2;
const spread = {
  ...shown,
  a: { x: shown.a.x, y: mid.y - reach },
  e: { x: 2 * mid.x - shown.a.x - 82, y: mid.y + reach - 112 },
};
// where the original's hand holds the card, from its first frame
const hold = toCanvas(track.frames[0]);
const grip = { x: hold.x - shown.e.x, y: hold.y - shown.e.y };

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
 * The original opens mid-drag, so the press comes before the clip, and the
 * log has it at 0 among whatever the setup did: put there instead the last
 * state shown before the press held into the clip, in the square the card
 * showed, and that press just after, so a card going live early in the drag
 * starts from where the drag began.
 */
function logOpening(file) {
  const log = JSON.parse(fs.readFileSync(file, "utf8"));
  let i = -1;
  for (let k = 0; k < log.length && log[k].t === 0; k++) if (log[k].kind === "down") i = k;
  const last = log.slice(0, i).filter((e) => e.kind === "drop" && e.view).pop();
  const first = { t: 0, kind: "drop", state: last.state, view: last.view };
  fs.writeFileSync(file, JSON.stringify([first, { ...log[i], t: 0.001 }, ...log.slice(i + 1)]));
}

/** Press at `from`, carry it to `to` (canvas points) over `n` frames, release. */
async function carry(rec, from, to, n) {
  await rec.step(await toScreen(rec, from));
  await rec.down();
  for (let s = 1; s <= n; s++) {
    const u = s / n;
    await rec.step(await toScreen(rec, { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u }));
  }
  await rec.up();
}

export default card("card-piles", {
  state: piled(spread),
  startAt: { x: spread.e.x + grip.x, y: spread.e.y + grip.y },
  async setup(rec) {
    await rec.wait(100);
    const aGrip = { x: 35, y: 50 };
    await carry(rec, { x: spread.e.x + grip.x, y: spread.e.y + grip.y }, hold, 12);
    await carry(rec, { x: spread.a.x + aGrip.x, y: spread.a.y + aGrip.y }, { x: shown.a.x + aGrip.x, y: shown.a.y + aGrip.y }, 12);
    await rec.wait(700);
    // the original opens with the card already held
    await rec.step(await toScreen(rec, hold));
    await rec.down();
    await rec.wait(500);
  },
  async script(rec) {
    const t0 = await startLog(rec);
    await replaySteady(rec, track, { toCanvas });
    const LOG = path.join(HERE, "../out/card-piles.log.json");
    await saveLog(rec, LOG, t0, 0);
    logOpening(LOG);
  },
});
