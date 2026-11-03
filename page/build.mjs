// Bundles the page's live figures into ../home/js/.
//
//   npm run build                 # every entry, split into shared chunks
//   node build.mjs perm           # just perm.js, self-contained (for working
//                                 # on one figure while others build theirs)
//   npm run watch                 # rebuild every entry on change
//   node build.mjs --out=<dir>    # somewhere else
//
// React stays external: the page's import map points it at esm.sh, so the
// page's hand-written scripts (header.js, cards.js) and these bundles share
// one React. They share one Dragology too, through js/dragology.js (lib.ts).

import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const outArg = process.argv.find((a) => a.startsWith("--out="));
const OUT = outArg
  ? path.resolve(outArg.slice("--out=".length))
  : path.resolve(HERE, "../home/js");

const ENTRIES = {
  dragology: "lib.ts",
  whiteboard: "whiteboard.tsx",
  perm: "perm.tsx",
  "cards-demos": "cards-demos.tsx",
  fig1: "fig1.tsx",
};

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const only = args.filter((a) => !a.startsWith("--"));
for (const name of only)
  if (!ENTRIES[name]) throw new Error(`no entry ${name}; have ${Object.keys(ENTRIES)}`);
const split = only.length === 0;

const options = {
  entryPoints: Object.fromEntries(
    Object.entries(ENTRIES)
      .filter(([name]) => split || only.includes(name))
      .map(([name, file]) => [name, path.join(HERE, file)]),
  ),
  outdir: OUT,
  bundle: true,
  format: "esm",
  splitting: split,
  chunkNames: "chunk-[hash]",
  minify: true,
  sourcemap: false,
  target: "es2022",
  jsx: "automatic",
  external: ["react", "react-dom", "react/*", "react-dom/*"],
  define: { "import.meta.hot": "undefined", "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
  metafile: true,
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  fs.mkdirSync(OUT, { recursive: true });
  // A full build replaces the chunks, so clear out the old ones first.
  if (split)
    for (const f of fs.readdirSync(OUT))
      if (f.startsWith("chunk-")) fs.rmSync(path.join(OUT, f));
  const result = await esbuild.build(options);
  for (const [file, { bytes }] of Object.entries(result.metafile.outputs))
    console.log(`${(bytes / 1024).toFixed(0).padStart(6)} KB  ${path.relative(OUT, file)}`);
}
