// The face card's clip: Josh's original (clips/face.mp4 on the page), remade
// in the page's colors by replaying its cursor. It starts already holding the
// face's outline at the top right and pulls it out (the top squares off),
// lets go, takes the right eye up to the top of the face, then grabs the
// mouth's right corner and hauls it up over the eyes, holding it there.
//
//   node <talk repo>/d2-talk/recorder/vrec.js page/record/clips/face.js --no-webm

import path from "node:path";
import { fileURLToPath } from "node:url";
import { card } from "./card.js";
import { at, loadTrack, saveLog, startLog, toScreen } from "../replay.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30; // the original's

// tracks/face.json: track.py with the default templates, at scale 1. The
// open hand (just after each release) matches the fist template, so the
// button follows `downs`, read off the frames: held from the first frame to
// 10|11, from 23|24 to 35|36, and from 50|51 (the cursor isn't drawn on 50)
// to the end.
const track = loadTrack(path.join(HERE, "../tracks/face.json"), {
  minScore: 0.5, // the fist over the eye scores 0.51-0.53, rightly placed; frame 50 (no cursor) is 0.46
  downs: [
    [0, 10.5 / FPS],
    [23.5 / FPS, 35.5 / FPS],
    [50.5 / FPS, 99],
  ],
});
// The fist template's hotspot sits ~(4, 2) px up and left of the arrow's (at
// every press and release the arrow is that far from the fist), so move the
// hands onto the arrow's hotspot: the pointer then doesn't jump as the
// cursor changes shape.
for (const f of track.frames) {
  if (f.fist) {
    f.x += 4;
    f.y += 2;
  }
}

// The original's first frame, on the demo's canvas: its eyes (canvas
// (160, 155) and (240, 155)) at (181.35, 194.94) and (290.01, 195.02) put the
// canvas at 1.35825 px per unit, offset (-35.97, -15.55).
const toCanvas = (p) => ({ x: (p.x + 35.97) / 1.35825, y: (p.y + 15.55) / 1.35825 });

/**
 * Replay frame for frame: one video frame per step (at 60 fps, the
 * original's 30 fps track on a Catmull-Rom curve), with each press or release
 * taking a step's place rather than adding a frame, so the clip runs exactly
 * as long as the original.
 */
async function replayExact(rec, { from = 0, frames, fps = 60 }) {
  for (let k = 0; k < frames; k++) {
    const t = from + k / fps;
    const want = track.isDown(t);
    if (want !== rec.buttonDown) await (want ? rec.down() : rec.up());
    else await rec.step(await toScreen(rec, toCanvas(at(track, t))));
  }
}

/**
 * The original ends still holding on; let go after the last frame, unfilmed,
 * so the log ends on the state the clip ends on.
 */
async function letGoUnseen(rec) {
  if (!rec.buttonDown) return;
  rec.filming = false;
  await rec.up();
}

export default card("face-creator", {
  startAt: toCanvas(track.frames[0]),
  async script(rec) {
    const t0 = await startLog(rec);
    // 84 frames at 30 fps: 2.8 s, 168 frames at 60
    await replayExact(rec, { frames: Math.round((track.frames.length / FPS) * 60) });
    await letGoUnseen(rec);
    await saveLog(rec, path.join(HERE, "../out/face.log.json"), t0, 0);
  },
});
