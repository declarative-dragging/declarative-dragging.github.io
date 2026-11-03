// Helpers for the clip scripts in record/clips/: replaying the cursor of one
// of the page's original clips (tracked by track.py into a JSON track) on the
// recording page, and saving the demo's log alongside the clip.
//
// A track is the original's cursor, frame by frame (30 fps): where its hotspot
// was in the original's pixels, which cursor it was (an arrow, a hand, a fist),
// and how sure the tracker was. Replaying it moves the pointer through the same
// path at the same speeds, carried onto the demo's canvas by `toCanvas` (the
// original's pixels → canvas coordinates) and from there onto the page through
// the card's framing as it is at that frame, with the button held wherever the
// original showed a fist (or over `downs`, given in seconds).

import fs from "node:fs";

/**
 * Load a track and clean it up: low-confidence frames (the cursor hidden or
 * off the edge) are filled in from their neighbors.
 */
export function loadTrack(file, { minScore = 0.55, fps = 30, downs, fix = {} } = {}) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const frames = raw.map((f, i) => {
    const o = fix[i] ?? null; // {x, y} by frame index, for frames the tracker got wrong
    return {
      t: i / fps,
      x: o?.x ?? f.x,
      y: o?.y ?? f.y,
      ok: !!o || f.score >= minScore,
      fist: f.kind === "fist",
    };
  });
  // fill the gaps by straight lines between the good frames on either side
  const good = frames.map((f, i) => (f.ok ? i : -1)).filter((i) => i >= 0);
  if (!good.length) throw new Error(`${file}: no confident frames`);
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].ok) continue;
    const a = [...good].reverse().find((g) => g < i);
    const b = good.find((g) => g > i);
    const A = frames[a ?? b], B = frames[b ?? a];
    const w = a == null || b == null ? 0 : (i - a) / (b - a);
    frames[i].x = A.x + (B.x - A.x) * w;
    frames[i].y = A.y + (B.y - A.y) * w;
    frames[i].fist = (w < 0.5 ? A : B).fist;
  }
  const isDown = downs
    ? (t) => downs.some(([a, b]) => t >= a && t < b)
    : (t) => frames[Math.min(frames.length - 1, Math.round(t * fps))].fist;
  return { frames, fps, duration: (frames.length - 1) / fps, isDown };
}

/** The track's hotspot at time t (s): a Catmull-Rom curve through the frames. */
export function at(track, t) {
  const { frames, fps } = track;
  const u = Math.max(0, Math.min(frames.length - 1, t * fps));
  const i = Math.floor(u), s = u - i;
  const p = (k) => frames[Math.max(0, Math.min(frames.length - 1, k))];
  const P0 = p(i - 1), P1 = p(i), P2 = p(i + 1), P3 = p(i + 2);
  const cr = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s * s + (-a + 3 * b - 3 * c + d) * s * s * s);
  return { x: cr(P0.x, P1.x, P2.x, P3.x), y: cr(P0.y, P1.y, P2.y, P3.y) };
}

/** A similarity (uniform scale, then shift) from two pairs of points, `from` → `to`. */
export function fit([a1, b1], [a2, b2]) {
  const s = Math.hypot(b2.x - a2.x, b2.y - a2.y) / Math.hypot(b1.x - a1.x, b1.y - a1.y);
  return (p) => ({ x: a2.x + (p.x - a1.x) * s, y: a2.y + (p.y - a1.y) * s });
}

/** Where a canvas point is on the page now. */
export async function toScreen(rec, p) {
  const q = await rec.evaluate(([x, y]) => window.__toScreen(x, y), [p.x, p.y]);
  if (!q) throw new Error("no demo svg on the page");
  return q;
}

/**
 * Replay the track from `from` to `to` (s, of the original), at its own
 * speed, with the button following the original's.
 */
export async function replay(rec, track, { toCanvas, from = 0, to = track.duration, fps = 60 } = {}) {
  const n = Math.round((to - from) * fps);
  for (let k = 0; k <= n; k++) {
    const t = from + k / fps;
    const p = await toScreen(rec, toCanvas(at(track, t)));
    const want = track.isDown(t);
    if (want !== rec.buttonDown) {
      // press or release where the pointer is now
      await rec.step(p);
      await (want ? rec.down() : rec.up());
    } else {
      await rec.step(p);
    }
  }
  if (rec.buttonDown) await rec.up();
}

/** Mark the script's start (for the log's times), and save the log at the end. */
export async function startLog(rec) {
  return rec.evaluate(() => performance.now());
}

/**
 * Write the demo's log beside the clip: drops (state and framing), presses
 * and releases, with times in seconds of the video. `lead` is the clip's
 * `lead` option (the stillness filmed before the script).
 */
export async function saveLog(rec, file, t0, lead = 300) {
  const log = await rec.evaluate(() => window.__clipLog);
  const out = log.map((e) => ({ ...e, t: Math.max(0, Math.round(e.t - t0 + lead) / 1000) }));
  fs.writeFileSync(file, JSON.stringify(out));
}
