// Serves the page (home/), for the walk figure's
// editor (review/walk-editor.html), which PUTs the layout to
// walk/layout.json as you edit, and POSTs to walk/bake to
// bake it into the image the page shows, walk/walk-figure.webp.
//
//   node page/walk-server.mjs        serve, at http://localhost:8767/review/walk-editor.html
//   node page/walk-server.mjs bake   just bake the image

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../home");
const LAYOUT = "/walk/layout.json";
const BAKE = "/walk/bake";
const IMAGE = path.join(ROOT, "walk/walk-figure.webp");
/** The baked image's width: the page's column, twice over */
const IMAGE_W = 1500;
const PORT = 8767;
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
};

/**
 * Draws the layout (with walk.js, as the editor does) in headless Chrome,
 * from the site served at `origin`, and saves it as the page's image; returns
 * its size
 */
async function bake(origin) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: IMAGE_W, height: 1200 } });
    await page.goto(origin + LAYOUT);
    await page.evaluate(async (w) => {
      const { mountWalk } = await import("/walk.js");
      const layout = await (await fetch("/walk/layout.json", { cache: "no-store" })).json();
      const host = document.createElement("div");
      host.id = "bake";
      host.style.width = `${w}px`;
      document.body.style.margin = "0";
      document.body.replaceChildren(host);
      mountWalk(host, layout, "/");
      await Promise.all([...host.querySelectorAll("img")].map((img) => img.decode()));
    }, IMAGE_W);
    const png = IMAGE.replace(/\.webp$/, ".png");
    await page.locator("#bake").screenshot({ path: png });
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", png, "-quality", "85", IMAGE]);
    fs.rmSync(png);
    const size = await page.locator("#bake").evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));
    // the page's <img> keeps its size, so its place is the right shape before it loads
    const html = path.join(ROOT, "index.html");
    fs.writeFileSync(
      html,
      fs
        .readFileSync(html, "utf8")
        .replace(/(src="walk\/walk-figure\.webp") width="\d+" height="\d+"/, `$1 width="${size.w}" height="${size.h}"`),
    );
    return size;
  } finally {
    await browser.close();
  }
}

function server() {
  return http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (req.method === "PUT" && url === LAYOUT) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const layout = JSON.parse(body);
          if (!layout.frame || !Array.isArray(layout.pieces)) throw new Error("not a layout");
          fs.writeFileSync(path.join(ROOT, LAYOUT), body);
          res.writeHead(204).end();
        } catch (e) {
          res.writeHead(400).end(String(e));
        }
      });
      return;
    }
    if (req.method === "POST" && url === BAKE) {
      bake(`http://127.0.0.1:${req.socket.localPort}`).then(
        (size) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(size)),
        (e) => res.writeHead(500).end(String(e)),
      );
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405).end();
    let file = path.join(ROOT, path.normalize(url));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!url.endsWith("/")) return res.writeHead(301, { Location: url + "/" }).end();
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file)) return res.writeHead(404).end("not found");
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

if (process.argv[2] === "bake") {
  const s = server().listen(0, "127.0.0.1", async () => {
    const size = await bake(`http://127.0.0.1:${s.address().port}`);
    console.log(`baked ${path.relative(process.cwd(), IMAGE)}: ${size.w}×${size.h}`);
    s.close();
  });
} else {
  server().listen(PORT, "127.0.0.1", () => console.log(`http://localhost:${PORT}/review/walk-editor.html`));
}
