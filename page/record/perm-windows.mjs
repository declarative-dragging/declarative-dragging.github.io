// Picks stretches of the permutation lab's ghost play that loop well, for
// clips/permutation-lab-ghost.js. Reads surveys (that clip's PERM_SURVEY logs; see
// perm.tsx's `__perm`) and scores every stretch of about the clip's length
// that starts and ends at rest (cursor still, button up, nothing moving):
// how far the drawing and the cursor are, at its end, from where they were
// at its start (the jump the loop makes), and what the ghost does in it.
//
//   node page/record/perm-windows.mjs <survey.json>... [--min 19] [--max 21.5] [--reps 4] [--idle 2.4] [--top 15]

import fs from "node:fs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args.splice(i, 2)[1]) : fallback;
};
const MIN = opt("min", 19) * 60;
const MAX = opt("max", 21.5) * 60;
const TOP = opt("top", 15);
/** At least this many representations played with */
const REPS = opt("reps", 4);
/** No pause longer than this, in seconds */
const IDLE = opt("idle", 2.4);
/** Frames on each side of a cut that have to be still */
const STILL = 8;

/** What each press was, by what it pressed on, and which representation */
const KINDS = [
  ["tl-tile-", "tile", "two-line"],
  ["ph-token", "token", "permutohedron"],
  ["ph-v-", "walk", "permutohedron"],
  ["ph-edge-", "walk", "permutohedron"],
  ["ph-face-", "spin", "permutohedron"],
  ["mat-dot-", "matrix", "matrix"],
  ["cyc-node-", "cycle", "cycles"],
  ["wire-end-", "wire", "wiring"],
];
const kindOf = (id) => KINDS.find(([p]) => id.startsWith(p)) ?? [id, id, id];

/** What a changed part of the drawing says changed */
const GROUPS = [
  ["tl-tile-", "permutation"],
  ["ph-face-", "view"],
  ["word-letter-", "word"],
];
const groupOf = (id) => GROUPS.find(([p]) => id.startsWith(p))?.[1];

const results = [];
for (const file of args) {
  const log = JSON.parse(fs.readFileSync(file, "utf8"));
  const n = log.cursor.length / 4;
  const cur = (f) => log.cursor.slice(f * 4, f * 4 + 4);

  // A frame is still if the cursor didn't move, the button was up and the
  // drawing didn't change, over STILL frames each side.
  const quiet = [];
  for (let f = 0; f < n; f++) {
    const [x, y, shape, mut] = cur(f);
    const [px, py] = f > 0 ? cur(f - 1) : [x, y];
    quiet.push(shape !== 2 && mut === 0 && Math.hypot(x - px, y - py) < 0.01);
  }
  const still = (f) => {
    for (let g = f - STILL; g <= f + STILL; g++) if (g < 0 || g >= n || !quiet[g]) return false;
    return true;
  };

  let ids = [];
  const samples = log.samples.map((s) => {
    if (s.ids) ids = s.ids;
    const at = new Map();
    ids.forEach((id, i) => at.set(id, s.boxes.slice(i * 4, i * 4 + 4)));
    return { f: s.f, at };
  });

  /** How much of the drawing jumps between two samples, roughly in px */
  function jump(a, b) {
    let d = 0;
    let parts = 0;
    const groups = new Set();
    const changed = (id) => {
      parts++;
      const g = groupOf(id);
      if (g) groups.add(g);
    };
    for (const [id, p] of a.at) {
      const q = b.at.get(id);
      if (!q) {
        d += 30;
        changed(id);
        continue;
      }
      const e = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) + Math.abs(p[3] - q[3]);
      if (e > 1) changed(id);
      d += Math.min(e, 30);
    }
    for (const id of b.at.keys()) if (!a.at.has(id)) (d += 30), changed(id);
    return { d, parts, groups: [...groups].join(", ") || "nothing" };
  }

  // how long the cursor has sat still, at each frame
  const stillFor = [];
  for (let f = 0; f < n; f++) {
    const [x, y] = cur(f);
    const [px, py] = f > 0 ? cur(f - 1) : [NaN, NaN];
    stillFor.push(Math.hypot(x - px, y - py) < 0.01 ? (stillFor[f - 1] ?? 0) + 1 : 0);
  }
  /** The longest the cursor sits still between frames a and b */
  const idle = (a, b) => {
    let most = 0;
    for (let f = a; f < b; f++) most = Math.max(most, Math.min(stillFor[f], f - a + 1));
    return most / 60;
  };

  const rests = samples.filter((s) => s.f < n && still(s.f));
  for (const [i, a] of rests.entries()) {
    for (const b of rests.slice(i + 1)) {
      if (b.f - a.f > MAX) break;
      if (b.f - a.f < MIN) continue;
      const presses = log.presses.filter((p) => p.f >= a.f && p.f < b.f).map((p) => kindOf(p.id));
      const reps = new Set(presses.map(([, , r]) => r));
      if (reps.size < REPS) continue;
      const { d, parts, groups } = jump(a, b);
      const [ax, ay, as] = cur(a.f);
      const [bx, by, bs] = cur(b.f);
      const c = Math.hypot(ax - bx, ay - by) + (as !== bs ? 15 : 0);
      results.push({
        seed: log.seed,
        from: a.f,
        to: b.f,
        cost: d + 2 * c,
        jump: Math.round(d),
        parts,
        groups,
        cursor: Math.round(c),
        reps: reps.size,
        idle: () => idle(a.f, b.f),
        gestures: presses.map(([, k]) => k).join(" "),
      });
    }
  }
}

// Best first: the most representations, then the smallest jump; no long
// pauses, and one per neighborhood.
const best = results.sort((r, s) => s.reps - r.reps || r.cost - s.cost);
const seen = [];
for (const r of best) {
  if (seen.some((s) => s.seed === r.seed && Math.abs(s.from - r.from) < 90 && Math.abs(s.to - r.to) < 90)) continue;
  r.idle = r.idle();
  if (r.idle > IDLE) continue;
  seen.push(r);
  console.log(
    `seed ${r.seed} ${r.from}–${r.to} (${((r.to - r.from) / 60).toFixed(1)} s): cost ${Math.round(r.cost)}` +
      ` (drawing ${r.jump} over ${r.parts} parts; ${r.groups} changed; cursor ${r.cursor}px),` +
      ` ${r.reps} reps, idle ${r.idle.toFixed(1)} s: ${r.gestures}`,
  );
  if (seen.length >= TOP) break;
}
