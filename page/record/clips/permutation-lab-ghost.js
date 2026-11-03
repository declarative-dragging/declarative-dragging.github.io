// Another take of the permutation lab's clip for the D2 page (the page's is
// clips/permutation-lab.js, the talk's take): the live figure itself, in the
// page's look, played by its own ghost hand, filmed from record/perm.html,
// into out/permutation-lab-ghost.mp4.
//
//   node <talk repo>/d2-talk/recorder/vrec.js page/record/clips/permutation-lab-ghost.js --no-webm
//
// perm.html seeds the ghost, and vrec's clock makes everything else exact,
// so a seed is a take: it plays the same way every time. The clip is a
// stretch of one take, picked (by perm-windows.mjs) to loop: it ends with
// the drawing as it began and the cursor near where it began, both at rest,
// and the ghost does a bit of everything in between.
//
// To look for another: survey some seeds, each played for a while unfilmed
// (this one came from 30 seeds, 3 to 5 minutes each),
//
//   PERM_SURVEY=300 PERM_SEED=7 SURVEY_OUT=<dir> node vrec.js <this file> --no-webm
//
// then `node page/record/perm-windows.mjs <dir>/*.json`, and put
// the best one in TAKE (or try it with PERM_SEED, PERM_FROM and PERM_TO).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.RECORD_BASE || "http://127.0.0.1:5192/record/perm.html";

/**
 * The take: a seed, and the stretch of its play to film, in frames since the
 * ghost started (from `from` up to, not including, `to`). In this one (20.5
 * s) the ghost slides a tile two places over in the two-line notation, pulls
 * a strand's end across in the wiring diagram, walks the permutohedron's token
 * along two edges, folds the walk's spur back (cancelling a pair of letters),
 * and moves a dot of the matrix, which brings the drawing back to exactly how
 * it began. At the loop only the cursor moves, hopping about 80px.
 */
const TAKE = { seed: 32, from: 1209, to: 2439 };

const env = (name, fallback) => (process.env[name] ? Number(process.env[name]) : fallback);
const SURVEY = env("PERM_SURVEY", 0);
const seed = env("PERM_SEED", TAKE.seed);
const from = env("PERM_FROM", TAKE.from);
const to = env("PERM_TO", TAKE.to);

/** The talk layout's canvas, which the figure draws at its own size */
const W = 960;
const H = 540;
/**
 * The ghost's cursor, scaled up a little. Live, it's 24px on a canvas scaled
 * to the column (about 700px), so 1/29 of the figure's width; the clip's
 * canvas is 960px, so 24px there would be smaller than that, and at a phone's
 * 350px it would be 9px. 1.3× makes it 31px: about what the live figure
 * shows on desktop, and on a phone the size of the card clips' cursors.
 */
const CURSOR = 1.3;
const FRAME = 1000 / 60;
/** vrec steps 400 ms, unfilmed, between `setup` and the first filmed frame */
const PREROLL = Math.round(400 / FRAME);

const frames = (rec, n) => rec.wait(n * FRAME);
/** The last frame the page has stepped, counted from the ghost's start (-1 before) */
const frameNow = (rec) => rec.evaluate(() => window.__permFrame());

export default {
  name: SURVEY ? `permutation-lab-survey-${seed}` : "permutation-lab-ghost",
  url: `${BASE}?seed=${seed}&cursor=${CURSOR}`,
  // roomy enough that vrec's own (real, hidden) pointer can rest off the figure
  width: W + 40,
  height: H + 40,
  startPos: [W + 30, H + 30],
  scale: 1.25,
  capture: { x: 0, y: 0, w: W, h: H },
  // 1200×674: video wants even sizes, so a device px off the (empty) bottom
  crop: { x: 0, y: 0, w: W, h: 674 / 1.25 },
  onlySvg: false,
  // the ghost draws its own cursor; vrec's follows only real pointer events
  css: "#__cursor-overlay { display: none !important; }",
  cursor: { ripple: false },
  ready: "#root",
  lead: 0,
  tail: 0,
  outDir: SURVEY ? os.tmpdir() : path.join(HERE, "../out"),

  async setup(rec) {
    await rec.evaluate(() => window.__play());
    // autoplay starts the ghost about a second after it sees the figure
    for (let k = 0; (await frameNow(rec)) < 0; k++) {
      if (k > 600) throw new Error("the ghost hasn't started");
      await frames(rec, 1);
    }
    if (SURVEY) {
      await frames(rec, SURVEY * 60);
      const log = await rec.evaluate(() => window.__perm);
      const dir = process.env.SURVEY_OUT || os.tmpdir();
      const file = path.join(dir, `permutation-lab-survey-${seed}.json`);
      fs.writeFileSync(file, JSON.stringify(log));
      console.log(`survey: ${file}`);
      return;
    }
    const now = await frameNow(rec);
    if (now > from - 1 - PREROLL) throw new Error(`the take starts too early (frame ${from})`);
    await frames(rec, from - 1 - PREROLL - now);
  },

  async script(rec) {
    if (SURVEY) return rec.wait(100);
    const now = await frameNow(rec);
    if (now !== from - 1) throw new Error(`out of step: at frame ${now}, not ${from - 1}`);
    await frames(rec, to - from);
  },
};
