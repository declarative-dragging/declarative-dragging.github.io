// What every card clip shares: the recording page (record/index.html, served
// by the d2-talk-files server) with one demo in a 240px square, filmed at 2×
// (480×480, as the originals) with a slightly larger cursor than theirs, into
// record/out/.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { toScreen } from "../replay.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.RECORD_BASE || "http://127.0.0.1:5192/record/index.html";
export const SIZE = 240;

/**
 * A clip of the card demo `id`. `state` starts it somewhere other than the
 * card's start, and `view` in a square of the canvas other than the one the
 * card would frame; `startAt` (a canvas point) is where the cursor rests
 * before the first frame. The rest are vrec's clip options.
 */
export function card(id, { state, view, startAt, setup, ...rest }) {
  const q = new URLSearchParams({ id, size: String(SIZE) });
  if (state) q.set("state", JSON.stringify(state));
  if (view) q.set("view", JSON.stringify(view));
  return {
    url: `${BASE}?${q}`,
    width: SIZE,
    height: SIZE,
    scale: 2,
    onlySvg: false,
    crop: { x: 0, y: 0, w: SIZE, h: SIZE },
    cursorSize: 16,
    ready: "#root svg",
    lead: 0,
    tail: 0,
    outDir: path.join(HERE, "../out"),
    async setup(rec) {
      if (startAt) await rec.step(await toScreen(rec, startAt));
      if (setup) await setup(rec);
    },
    ...rest,
  };
}
