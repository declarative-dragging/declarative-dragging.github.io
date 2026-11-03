// The permutation lab's clip for the D2 page (clips/permutation-lab.mp4,
// which phones and no-JS readers see in place of the live figure): the talk's
// take on it, replayed on the page's figure. The talk's Permutation Playground
// slide plays a recording of a real mouse (src/slideshow/rails/
// permutation-lab.json, made with the slideshow's Rails): a walk round the
// permutohedron and home, the wiring diagram untangled, then rebuilt. Here the
// same pointer, at the same times, works the page's figure (record/perm.html?
// ghost=0, the talk's layout in the page's look, without its ghost hand), with
// vrec's cursor, up to where the rebuilt permutation is back as it began.
//
//   node <talk repo>/d2-talk/recorder/vrec.js page/record/clips/permutation-lab.js --no-webm
//
// (clips/permutation-lab-ghost.js films a take by the figure's own ghost hand
// instead.)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.RECORD_BASE || "http://127.0.0.1:5192/record/perm.html";
const RAILS = path.join(HERE, "../permutation-lab-take.json");

/** The talk layout's canvas, which the figure draws at its own size */
const W = 960;
const H = 540;
const FRAME = 1000 / 60;

// # The talk's take

/** Each moment of the take: t (ms), x and y as fractions of the slide's frame, and the button */
const take = JSON.parse(fs.readFileSync(RAILS, "utf8"))["0"];

// The slide's frame on the demo's canvas (measured on the slide: the same at
// any window size)
const fromSlide = ({ x, y }) => ({ x: -60 + 1080 * x, y: -53.75 + 607.5 * y });

// The page's figure is the talk's, but for its two-line notation: the page
// leaves room between the tiles, as Figure 1 does, so they're 54.5 apart, not
// 48, from the same first tile (at x 66). Around that row, x is stretched to
// match, so a tile dragged there lands on the same tile here; the stretch fades
// out over FADE beyond the row, well short of the matrix to its right.
const TS = 48;
const K = (TS + (6 * TS) / 44) / TS;
const ROW = { x0: 20, x1: 250, y0: 90, y1: 180 };
const FADE = 40;
function onPage({ x, y }) {
  const out = Math.max(ROW.x0 - x, x - ROW.x1, ROW.y0 - y, y - ROW.y1, 0);
  const w = Math.max(0, 1 - out / FADE);
  return { x: x + (x - 66) * (K - 1) * w, y };
}

/** Where the take's pointer is at t (ms), on the page's canvas, and whether it's pressed */
function at(t) {
  let i = 0;
  while (i < take.length - 2 && take[i + 1].t <= t) i++;
  const a = take[i];
  const b = take[i + 1];
  const u = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t || 1)));
  const p = onPage(fromSlide({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }));
  return { ...p, down: (t >= b.t ? b : a).down };
}

// The take goes on to walk the token two more edges (from 15.69 s); the clip
// stops just before, with the permutation as it began (only the solid is
// turned) and the pointer coming to rest 130 units from where it started, so
// it loops with little more than that hop.
const DURATION = 15620;
const start = at(0);

export default {
  name: "permutation-lab",
  url: `${BASE}?ghost=0`,
  width: W,
  height: H,
  startPos: [start.x, start.y],
  scale: 1.25,
  capture: { x: 0, y: 0, w: W, h: H },
  // 1200×674: video wants even sizes, so a device px off the (empty) bottom
  crop: { x: 0, y: 0, w: W, h: 674 / 1.25 },
  onlySvg: false,
  // The card clips' cursor is 16px on a 240px card, which a phone shows about
  // 165px wide; a phone shows this clip about 350px wide, so 30px here comes
  // out the same size there.
  cursorSize: 30,
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
    await rec.step(start);
  },

  // A frame per 60th of a second, as long as the take; a press or release
  // takes the place of that frame's move, so the clip keeps the take's timing
  async script(rec) {
    const n = Math.round(DURATION / FRAME);
    for (let k = 0; k <= n; k++) {
      const p = at(k * FRAME);
      if (p.down !== rec.buttonDown) await (p.down ? rec.down() : rec.up());
      else await rec.step({ x: p.x, y: p.y });
    }
    if (rec.buttonDown) await rec.up();
  },
};
