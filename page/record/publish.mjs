// Puts filmed clips on the page: copies out/<name>.mp4 into home/clips/, with
// its log (compacted) and a poster (its first frame, for when it can't
// autoplay, as on an iPhone in Low Power Mode).
//
//   node page/record/publish.mjs <name>...

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
const CLIPS = path.resolve(HERE, "../../home/clips");
const FFMPEG = process.env.FFMPEG || "ffmpeg";

/**
 * A clip's log, smaller: numbers to hundredths, and each entry's square only
 * where it changes (the page carries the last one forward)
 */
function compactLog(file) {
  let view = "";
  const entries = JSON.parse(fs.readFileSync(file, "utf8")).map((e) => {
    if (!("view" in e)) return e;
    const v = JSON.stringify(e.view);
    if (v !== view) return ((view = v), e);
    const { view: _, ...rest } = e;
    return rest;
  });
  return JSON.stringify(entries, (_, x) => (typeof x === "number" ? Math.round(x * 100) / 100 : x));
}

const names = process.argv.slice(2);
if (!names.length) throw new Error("usage: node page/record/publish.mjs <name>...");
for (const name of names) {
  const mp4 = path.join(OUT, `${name}.mp4`);
  if (!fs.existsSync(mp4)) throw new Error(`no ${path.relative(process.cwd(), mp4)}: film it first`);
  fs.copyFileSync(mp4, path.join(CLIPS, `${name}.mp4`));
  const log = path.join(OUT, `${name}.log.json`);
  if (fs.existsSync(log)) fs.writeFileSync(path.join(CLIPS, `${name}.log.json`), compactLog(log));
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", mp4, "-frames:v", "1", "-quality", "85",
    path.join(CLIPS, `${name}.webp`)]);
  console.log(`published ${name}`);
}
