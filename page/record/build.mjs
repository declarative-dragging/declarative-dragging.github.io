// Bundles the recording page (record.tsx → out/record.js), React included,
// so index.html works from any static server or file://.
//
//   node page/record/build.mjs

import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
await esbuild.build({
  entryPoints: [path.join(HERE, "record.tsx")],
  outfile: path.join(HERE, "out/record.js"),
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2022",
  jsx: "automatic",
  define: { "import.meta.hot": "undefined", "process.env.NODE_ENV": '"production"' },
  loader: { ".ttf": "file", ".woff2": "file", ".png": "file", ".jpg": "file" },
  logLevel: "info",
});
