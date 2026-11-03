// Bundles the permutation lab's recording page (perm.tsx → out/perm.js),
// React included, so perm.html works from any static server or file://.
// As build.mjs, for the card clips' page.
//
//   node page/record/build-perm.mjs

import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
await esbuild.build({
  entryPoints: [path.join(HERE, "perm.tsx")],
  outfile: path.join(HERE, "out/perm.js"),
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2022",
  jsx: "automatic",
  define: { "import.meta.hot": "undefined", "process.env.NODE_ENV": '"production"' },
  loader: { ".ttf": "file", ".woff2": "file", ".png": "file", ".jpg": "file" },
  logLevel: "info",
});
