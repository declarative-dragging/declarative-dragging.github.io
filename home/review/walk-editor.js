// Edits the walk figure's layout (../walk/layout.json, drawn by ../walk.js)
// by direct manipulation. Served by d2-talk/d2-page/walk-server.mjs, it saves
// each change to the layout file as you go, and bakes it into the page's
// image on request; served otherwise, it keeps unsaved work in this browser,
// to Download or Copy.

import { drawPiece, mountWalk, PAPER_LOOK, paperLook, pieceSize, SOURCES } from "../walk.js";

const LAYOUT_URL = "../walk/layout.json";
/** The layout Claude started with, for Revert */
const START_URL = "walk-layout-start.json";
const DRAFT_KEY = "walk-layout-draft";

const canvas = document.getElementById("canvas");
const stage = document.getElementById("stage");
const overlay = document.getElementById("overlay");
const $ = (id) => document.getElementById(id);

let layout;
/** A piece's id, "frame", or null */
let selected = null;
const undos = [];
const redos = [];

// # Geometry

const rad = (deg) => (deg * Math.PI) / 180;
const rot = (v, deg) => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** A piece's corners on the canvas: top left, top right, bottom right, bottom left */
function corners(p) {
  const { w, h } = pieceSize(p);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => add(p, rot({ x: (sx * w) / 2, y: (sy * h) / 2 }, p.rotate)));
}

/** The canvas the editor shows: the frame and every piece, with room around them */
function bounds() {
  const pts = [
    { x: layout.frame.x, y: layout.frame.y },
    { x: layout.frame.x + layout.frame.w, y: layout.frame.y + layout.frame.h },
    ...layout.pieces.filter((p) => !p.hidden).flatMap(corners),
  ];
  const x0 = Math.min(...pts.map((p) => p.x));
  const y0 = Math.min(...pts.map((p) => p.y));
  const x1 = Math.max(...pts.map((p) => p.x));
  const y1 = Math.max(...pts.map((p) => p.y));
  const m = 0.08 * Math.max(x1 - x0, y1 - y0);
  return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
}

/** Canvas to screen (in #canvas): k, and where the view's corner is */
let view = { x: 0, y: 0, w: 1, h: 1 };
let k = 1;
let off = { x: 0, y: 0 };
function fitView() {
  view = bounds();
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  k = Math.min(W / view.w, H / view.h);
  off = { x: (W - view.w * k) / 2, y: (H - view.h * k) / 2 };
  stage.style.transform = `translate(${off.x}px, ${off.y}px) scale(${k}) translate(${-view.x}px, ${-view.y}px)`;
}
const toScreen = (p) => ({ x: off.x + (p.x - view.x) * k, y: off.y + (p.y - view.y) * k });
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left - off.x) / k + view.x, y: (e.clientY - r.top - off.y) / k + view.y };
}

// # Drawing

const pieceEls = new Map();
function drawPieces() {
  const seen = new Set();
  for (const p of layout.pieces) {
    let el = pieceEls.get(p.id);
    if (!el) {
      el = document.createElement("div");
      el.dataset.id = p.id;
      pieceEls.set(p.id, el);
    }
    drawPiece(el, p, "../", paperLook(layout));
    el.style.pointerEvents = p.locked ? "none" : "";
    el.style.cursor = "move";
    stage.append(el); // in order, bottom to top
    seen.add(p.id);
  }
  for (const [id, el] of pieceEls) if (!seen.has(id)) (el.remove(), pieceEls.delete(id));
}

const SVG = "http://www.w3.org/2000/svg";
function svg(tag, attrs, parent = overlay) {
  const el = document.createElementNS(SVG, tag);
  for (const [a, v] of Object.entries(attrs)) el.setAttribute(a, v);
  parent.append(el);
  return el;
}
const pts = (ps) => ps.map((p) => `${p.x},${p.y}`).join(" ");

/** A handle: something to grab, `hit` big, drawn as `shape` */
function handle(name, at, cursor, shape) {
  const g = svg("g", { "data-handle": name, style: `cursor: ${cursor}` });
  svg("circle", { cx: at.x, cy: at.y, r: 11, fill: "transparent" }, g);
  shape(g);
  return g;
}

const RESIZE_CURSORS = ["ns-resize", "nesw-resize", "ew-resize", "nwse-resize"];
/** The resize cursor for a handle pointing `dir` (on screen) */
function resizeCursor(dir) {
  const a = ((Math.atan2(dir.y, dir.x) * 180) / Math.PI + 360 + 22.5) % 180;
  return RESIZE_CURSORS[(Math.floor(a / 45) + 2) % 4];
}

function drawOverlay() {
  overlay.replaceChildren();
  const f = layout.frame;
  const a = toScreen({ x: f.x, y: f.y });
  const b = toScreen({ x: f.x + f.w, y: f.y + f.h });
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  // outside the frame, washed out
  svg("path", {
    d: `M0,0H${W}V${H}H0Z M${a.x},${a.y}V${b.y}H${b.x}V${a.y}Z`,
    fill: "rgba(236, 235, 230, 0.72)",
    "fill-rule": "evenodd",
  });
  const frameSel = selected === "frame";
  svg("rect", {
    x: a.x,
    y: a.y,
    width: b.x - a.x,
    height: b.y - a.y,
    fill: "none",
    stroke: "#dc3400",
    "stroke-width": frameSel ? 2 : 1.5,
    "stroke-dasharray": frameSel ? "" : "6 4",
  });

  const p = layout.pieces.find((q) => q.id === selected);
  if (p) {
    const cs = corners(p).map(toScreen);
    svg("polygon", { points: pts(cs), fill: "none", stroke: "#2563eb", "stroke-width": 1.5 });
    // edges: crop
    const EDGES = ["t", "r", "b", "l"];
    EDGES.forEach((e, i) => {
      const u = cs[i];
      const v = cs[(i + 1) % 4];
      const m = mul(add(u, v), 0.5);
      const out = rot({ x: 0, y: -1 }, p.rotate + 90 * i);
      const g = svg("g", { "data-handle": `edge-${e}`, style: `cursor: ${resizeCursor(out)}` });
      svg("line", { x1: u.x, y1: u.y, x2: v.x, y2: v.y, stroke: "transparent", "stroke-width": 12 }, g);
      const along = mul(sub(v, u), 1 / Math.hypot(v.x - u.x, v.y - u.y));
      const s = add(m, mul(along, -9));
      const t = add(m, mul(along, 9));
      svg("line", { x1: s.x, y1: s.y, x2: t.x, y2: t.y, stroke: "white", "stroke-width": 7, "stroke-linecap": "round" }, g);
      svg("line", { x1: s.x, y1: s.y, x2: t.x, y2: t.y, stroke: "#2563eb", "stroke-width": 4, "stroke-linecap": "round" }, g);
    });
    // corners: scale
    ["tl", "tr", "br", "bl"].forEach((c, i) => {
      const at = cs[i];
      const out = sub(at, toScreen(p));
      handle(`corner-${c}`, at, resizeCursor(out), (g) => {
        const half = 5;
        const sq = [
          { x: -half, y: -half },
          { x: half, y: -half },
          { x: half, y: half },
          { x: -half, y: half },
        ].map((d) => add(at, rot(d, p.rotate)));
        svg("polygon", { points: pts(sq), fill: "white", stroke: "#2563eb", "stroke-width": 1.5 }, g);
      });
    });
    // the knob: turn
    const top = mul(add(cs[0], cs[1]), 0.5);
    const knob = add(top, rot({ x: 0, y: -26 }, p.rotate));
    svg("line", { x1: top.x, y1: top.y, x2: knob.x, y2: knob.y, stroke: "#2563eb", "stroke-width": 1.5 });
    handle("rotate", knob, "grab", (g) => {
      svg("circle", { cx: knob.x, cy: knob.y, r: 6, fill: "white", stroke: "#2563eb", "stroke-width": 1.5 }, g);
    });
  }

  // the frame's tab: select it, and drag it to move the frame
  const tab = svg("g", { "data-handle": "frame-move", style: "cursor: move" });
  const label = "page frame";
  svg("rect", { x: a.x, y: a.y - 20, width: 74, height: 18, rx: 3, fill: "#dc3400" }, tab);
  const text = svg("text", { x: a.x + 6, y: a.y - 7, fill: "white", "font-size": 11, "font-family": "system-ui, sans-serif" }, tab);
  text.textContent = label;
  if (frameSel) {
    const cs = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
    ["t", "r", "b", "l"].forEach((e, i) => {
      const u = cs[i];
      const v = cs[(i + 1) % 4];
      const g = svg("g", { "data-handle": `frame-${e}`, style: `cursor: ${i % 2 ? "ew-resize" : "ns-resize"}` });
      svg("line", { x1: u.x, y1: u.y, x2: v.x, y2: v.y, stroke: "transparent", "stroke-width": 12 }, g);
    });
    ["tl", "tr", "br", "bl"].forEach((c, i) => {
      handle(`frame-${c}`, cs[i], i % 2 ? "nesw-resize" : "nwse-resize", (g) => {
        svg("rect", { x: cs[i].x - 5, y: cs[i].y - 5, width: 10, height: 10, fill: "white", stroke: "#dc3400", "stroke-width": 1.5 }, g);
      });
    });
  }
}

const name = (p) => `${SOURCES[p.src].label}`;

function drawPanel() {
  const list = $("list");
  list.replaceChildren();
  const rows = [{ id: "frame" }, ...[...layout.pieces].reverse()];
  for (const p of rows) {
    const li = document.createElement("li");
    li.classList.toggle("sel", p.id === selected);
    li.classList.toggle("hidden", !!p.hidden);
    if (p.id === "frame") {
      li.innerHTML = `<span class="name" style="color:#dc3400">page frame</span>`;
    } else {
      li.innerHTML = `<label title="shown"><input type="checkbox" data-k="shown"></label>
        <span class="name">${name(p)} <small>${p.id}</small></span>
        <label title="only selectable from this list"><input type="checkbox" data-k="locked">lock</label>`;
      li.querySelector('[data-k="shown"]').checked = !p.hidden;
      li.querySelector('[data-k="locked"]').checked = !!p.locked;
      li.querySelector('[data-k="shown"]').onchange = (e) => change(() => (p.hidden = !e.target.checked || undefined));
      li.querySelector('[data-k="locked"]').onchange = (e) => change(() => (p.locked = e.target.checked || undefined));
    }
    li.onclick = (e) => {
      if (e.target.closest("label")) return;
      select(p.id);
    };
    list.append(li);
  }

  const p = layout.pieces.find((q) => q.id === selected);
  $("sel-panel").style.display = selected ? "" : "none";
  $("look-row").style.display = $("piece-buttons").style.display = p ? "" : "none";
  $("frame-buttons").style.display = selected === "frame" ? "" : "none";
  $("sel-title").textContent = p ? `${name(p)} (${p.id})` : "Page frame";
  if (p) $("look").value = p.look;
  drawNums();
  drawSliders();
  $("undo").disabled = !undos.length;
  $("redo").disabled = !redos.length;
}

function drawNums() {
  const p = layout.pieces.find((q) => q.id === selected);
  const r = (x) => Math.round(x);
  const f = layout.frame;
  $("nums").textContent = p
    ? `center  ${r(p.x)}, ${r(p.y)}\nscale   ${p.scale.toFixed(3)}\nturned  ${p.rotate.toFixed(1)}°\ncrop    ${r(p.crop.x)}, ${r(p.crop.y)}  ${r(p.crop.w)}×${r(p.crop.h)}`
    : selected === "frame"
      ? `corner  ${r(f.x)}, ${r(f.y)}\nsize    ${r(f.w)}×${r(f.h)}`
      : "";
}

function draw() {
  drawPieces();
  drawOverlay();
}

// # The paper's look: a slider for each of PAPER_LOOK's settings

const SLIDERS = [
  { key: "lift", label: "shadow lift", min: 0, max: 30, step: 0.5, show: (v) => v.toFixed(1) },
  { key: "shadow", label: "shadow dark", min: 0, max: 0.5, step: 0.01, show: (v) => v.toFixed(2) },
  { key: "corner", label: "corners", min: 0, max: 40, step: 0.5, show: (v) => v.toFixed(1) },
  { key: "opacity", label: "opacity", min: 0.5, max: 1, step: 0.01, show: (v) => v.toFixed(2) },
];

/** The layout before the slider being dragged moved, for undo */
let sliderBefore = null;
for (const sl of SLIDERS) {
  const row = document.createElement("label");
  row.className = "slider";
  row.innerHTML = `<span>${sl.label}</span><input type="range" min="${sl.min}" max="${sl.max}" step="${sl.step}" data-k="${sl.key}"><output></output>`;
  const input = row.querySelector("input");
  input.oninput = () => {
    sliderBefore ??= snapshot();
    layout.paper = { ...paperLook(layout), [sl.key]: Number(input.value) };
    drawPieces();
    drawSliders();
  };
  input.onchange = () => {
    if (sliderBefore === null || sliderBefore === snapshot()) return void (sliderBefore = null);
    undos.push(sliderBefore);
    redos.length = 0;
    sliderBefore = null;
    committed();
  };
  $("paper-sliders").append(row);
}

function drawSliders() {
  const look = paperLook(layout);
  for (const sl of SLIDERS) {
    const input = document.querySelector(`#paper-sliders [data-k="${sl.key}"]`);
    input.value = look[sl.key];
    input.nextElementSibling.textContent = sl.show(look[sl.key]);
  }
}

// # Changes, undo, saving

const snapshot = () => JSON.stringify(layout);

/** Makes a change with `fn` (to `layout`), undoably, and saves */
function change(fn) {
  undos.push(snapshot());
  redos.length = 0;
  fn();
  committed();
}

/** After a change: fit, draw, save */
function committed() {
  fitView();
  draw();
  drawPanel();
  save();
}

function restore(from, to) {
  if (!from.length) return;
  to.push(snapshot());
  layout = JSON.parse(from.pop());
  if (selected && selected !== "frame" && !layout.pieces.some((p) => p.id === selected)) selected = null;
  committed();
}

/** The layout as the file has it: rounded, a piece to a line */
function formatted(l) {
  const r = (x, n = 1) => Math.round(x * 10 ** n) / 10 ** n;
  const box = (b) => ({ x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h) });
  const flat = (v) =>
    typeof v === "object"
      ? `{ ${Object.entries(v)
          .filter(([, x]) => x !== undefined)
          .map(([key, x]) => `"${key}": ${flat(x)}`)
          .join(", ")} }`
      : JSON.stringify(v);
  const piece = (p) => flat({ ...p, crop: box(p.crop), x: r(p.x), y: r(p.y), scale: r(p.scale, 4), rotate: r(p.rotate) });
  const paper = l.paper && `  "paper": ${flat(Object.fromEntries(Object.entries(l.paper).map(([key, v]) => [key, r(v, 2)])))},\n`;
  return `{\n  "frame": ${flat(box(l.frame))},\n${paper ?? ""}  "pieces": [\n${l.pieces.map((p) => `    ${piece(p)}`).join(",\n")}\n  ]\n}\n`;
}

let saveTimer;
function save() {
  const body = formatted(layout);
  clearTimeout(saveTimer);
  status("…");
  saveTimer = setTimeout(async () => {
    try {
      const res = await fetch(LAYOUT_URL, { method: "PUT", body });
      if (!res.ok) throw new Error(res.statusText);
      localStorage.removeItem(DRAFT_KEY);
      status("Saved to walk/layout.json");
    } catch {
      try {
        localStorage.setItem(DRAFT_KEY, body);
      } catch {}
      status("Not saved: this server can't write the layout (run walk-server.mjs). Kept in this browser; Download or Copy it.", true);
    }
  }, 400);
}

function status(text, bad = false) {
  $("status").textContent = text;
  $("status").classList.toggle("bad", bad);
}

function select(id) {
  selected = id;
  drawOverlay();
  drawPanel();
}

// # Dragging

const MIN = 20; // smallest crop, image pixels

/** What a drag does, from where it started (`q`, the piece then; `a`, the pointer then) to pointer `b` */
function dragPiece(how, q, a, b, e) {
  const p = layout.pieces.find((x) => x.id === q.id);
  const S = SOURCES[q.src];
  const d = sub(b, a);
  const dl = rot(d, -q.rotate);
  if (how === "move") {
    p.x = q.x + d.x;
    p.y = q.y + d.y;
  } else if (how === "pan") {
    p.crop.x = clamp(q.crop.x - dl.x / q.scale, 0, S.w - q.crop.w);
    p.crop.y = clamp(q.crop.y - dl.y / q.scale, 0, S.h - q.crop.h);
  } else if (how === "rotate") {
    const ang = ((Math.atan2(b.y - q.y, b.x - q.x) - Math.atan2(a.y - q.y, a.x - q.x)) * 180) / Math.PI;
    let r = (((q.rotate + ang + 540) % 360) + 360) % 360 - 180;
    if (e.shiftKey) r = Math.round(r / 15) * 15;
    else if (Math.abs(r) < 1) r = 0;
    p.rotate = r;
  } else if (how.startsWith("corner-") && !e.altKey) {
    const c = how.slice(7);
    const sx = c.includes("l") ? -1 : 1;
    const sy = c.includes("t") ? -1 : 1;
    const { w, h } = pieceSize(q);
    const O = add(q, rot({ x: (-sx * w) / 2, y: (-sy * h) / 2 }, q.rotate));
    const D = rot({ x: sx * w, y: sy * h }, q.rotate);
    const t = Math.max(0.05, dot(sub(b, O), D) / dot(sub(a, O), D));
    p.crop = { ...q.crop };
    p.scale = q.scale * t;
    Object.assign(p, add(O, mul(D, t / 2)));
  } else {
    // an edge, or (with ⌥) a corner's two edges: crop
    const edges = how.startsWith("corner-") ? how.slice(7) : how.slice(5);
    const crop = { ...q.crop };
    let shift = { x: 0, y: 0 };
    if (edges.includes("r")) {
      crop.w = clamp(q.crop.w + dl.x / q.scale, MIN, S.w - q.crop.x);
      shift.x = ((crop.w - q.crop.w) * q.scale) / 2;
    }
    if (edges.includes("l")) {
      crop.x = clamp(q.crop.x + dl.x / q.scale, 0, q.crop.x + q.crop.w - MIN);
      crop.w = q.crop.w + (q.crop.x - crop.x);
      shift.x = (-(q.crop.x - crop.x) * q.scale) / 2;
    }
    if (edges.includes("b")) {
      crop.h = clamp(q.crop.h + dl.y / q.scale, MIN, S.h - q.crop.y);
      shift.y = ((crop.h - q.crop.h) * q.scale) / 2;
    }
    if (edges.includes("t")) {
      crop.y = clamp(q.crop.y + dl.y / q.scale, 0, q.crop.y + q.crop.h - MIN);
      crop.h = q.crop.h + (q.crop.y - crop.y);
      shift.y = (-(q.crop.y - crop.y) * q.scale) / 2;
    }
    p.crop = crop;
    Object.assign(p, add(q, rot(shift, q.rotate)));
  }
}

function dragFrame(how, q, a, b) {
  const f = layout.frame;
  const d = sub(b, a);
  const MINF = 100;
  if (how === "frame-move") {
    f.x = q.x + d.x;
    f.y = q.y + d.y;
    return;
  }
  const edges = how.slice(6);
  if (edges.includes("l")) {
    f.x = Math.min(q.x + d.x, q.x + q.w - MINF);
    f.w = q.w + (q.x - f.x);
  }
  if (edges.includes("r")) f.w = Math.max(MINF, q.w + d.x);
  if (edges.includes("t")) {
    f.y = Math.min(q.y + d.y, q.y + q.h - MINF);
    f.h = q.h + (q.y - f.y);
  }
  if (edges.includes("b")) f.h = Math.max(MINF, q.h + d.y);
}

let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || document.body.classList.contains("previewing")) return;
  const handleEl = e.target.closest("[data-handle]");
  const pieceEl = e.target.closest("[data-id]");
  let how;
  let id;
  if (handleEl) {
    how = handleEl.dataset.handle;
    id = how.startsWith("frame") ? "frame" : selected;
  } else if (pieceEl) {
    id = pieceEl.dataset.id;
    how = e.altKey ? "pan" : "move";
  } else {
    select(null);
    return;
  }
  if (id !== selected) select(id);
  const q = id === "frame" ? { ...layout.frame } : structuredClone(layout.pieces.find((p) => p.id === id));
  drag = { how, id, q, a: toCanvas(e), before: snapshot() };
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const b = toCanvas(e);
  if (drag.id === "frame") dragFrame(drag.how, drag.q, drag.a, b);
  else dragPiece(drag.how, drag.q, drag.a, b, e);
  draw();
  drawNums();
});
function endDrag() {
  if (!drag) return;
  const { before } = drag;
  drag = null;
  if (before === snapshot()) return;
  undos.push(before);
  redos.length = 0;
  committed();
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// # Keys and buttons

function selectedPiece() {
  return layout.pieces.find((p) => p.id === selected);
}

function freshId(src) {
  return `${src}-${Math.random().toString(36).slice(2, 6)}`;
}

function duplicate() {
  const p = selectedPiece();
  if (!p) return;
  const copy = { ...structuredClone(p), id: freshId(p.src), x: p.x + 40, y: p.y + 40, locked: undefined };
  change(() => layout.pieces.splice(layout.pieces.indexOf(p) + 1, 0, copy));
  select(copy.id);
}

function remove() {
  const p = selectedPiece();
  if (!p) return;
  change(() => layout.pieces.splice(layout.pieces.indexOf(p), 1));
  select(null);
}

function restack(by) {
  const p = selectedPiece();
  if (!p) return;
  const i = layout.pieces.indexOf(p);
  const j = clamp(i + by, 0, layout.pieces.length - 1);
  if (i === j) return;
  change(() => {
    layout.pieces.splice(i, 1);
    layout.pieces.splice(j, 0, p);
  });
}

function nudge(dx, dy) {
  if (selected === "frame") change(() => ((layout.frame.x += dx), (layout.frame.y += dy)));
  else if (selectedPiece()) change(() => ((selectedPiece().x += dx), (selectedPiece().y += dy)));
}

function togglePreview() {
  const on = document.body.classList.toggle("previewing");
  $("preview-btn").textContent = on ? "Edit" : "Preview";
  const host = document.querySelector("#preview .walk-canvas");
  host.replaceChildren();
  if (on) mountWalk(host, structuredClone(layout), "../");
}

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, select, textarea")) return;
  const cmd = e.metaKey || e.ctrlKey;
  const step = e.shiftKey ? 10 : 1;
  if (cmd && e.key.toLowerCase() === "z") restore(e.shiftKey ? redos : undos, e.shiftKey ? undos : redos);
  else if (cmd && e.key.toLowerCase() === "d") duplicate();
  else if (cmd) return;
  else if (e.key === "Delete" || e.key === "Backspace") remove();
  else if (e.key === "ArrowLeft") nudge(-step, 0);
  else if (e.key === "ArrowRight") nudge(step, 0);
  else if (e.key === "ArrowUp") nudge(0, -step);
  else if (e.key === "ArrowDown") nudge(0, step);
  else if (e.key === "]") restack(1);
  else if (e.key === "[") restack(-1);
  else if (e.key === "Escape") select(null);
  else if (e.key.toLowerCase() === "p") togglePreview();
  else return;
  e.preventDefault();
});

$("undo").onclick = () => restore(undos, redos);
$("redo").onclick = () => restore(redos, undos);
$("preview-btn").onclick = togglePreview;
$("dup").onclick = duplicate;
$("del").onclick = remove;
$("up").onclick = () => restack(1);
$("down").onclick = () => restack(-1);
$("look").onchange = (e) => change(() => (selectedPiece().look = e.target.value));
$("level").onclick = () => change(() => (selectedPiece().rotate = 0));
$("uncrop").onclick = () =>
  change(() => {
    const p = selectedPiece();
    const S = SOURCES[p.src];
    // the image stays where it is on the canvas
    const at = rot({ x: (S.w / 2 - (p.crop.x + p.crop.w / 2)) * p.scale, y: (S.h / 2 - (p.crop.y + p.crop.h / 2)) * p.scale }, p.rotate);
    Object.assign(p, add(p, at));
    p.crop = { x: 0, y: 0, w: S.w, h: S.h };
  });
$("paper-reset").onclick = () => change(() => (layout.paper = { ...PAPER_LOOK }));
$("frame-map").onclick = () => change(() => (layout.frame = { x: 0, y: 0, w: SOURCES["walk-map"].w, h: SOURCES["walk-map"].h }));
$("frame-pieces").onclick = () =>
  change(() => {
    const ps = layout.pieces.filter((p) => !p.hidden && p.src !== "walk-map").flatMap(corners);
    const x = Math.min(...ps.map((p) => p.x)) - 20;
    const y = Math.min(...ps.map((p) => p.y)) - 20;
    layout.frame = { x, y, w: Math.max(...ps.map((p) => p.x)) + 20 - x, h: Math.max(...ps.map((p) => p.y)) + 20 - y };
  });

for (const [src, s] of Object.entries(SOURCES)) {
  const o = document.createElement("option");
  o.value = src;
  o.textContent = s.label;
  $("add-src").append(o);
}
$("add").onclick = () => {
  const src = $("add-src").value;
  const S = SOURCES[src];
  const f = layout.frame;
  const scale = (0.3 * f.w) / S.w;
  const p = { id: freshId(src), src, crop: { x: 0, y: 0, w: S.w, h: S.h }, x: f.x + f.w / 2, y: f.y + f.h / 2, scale, rotate: 0, look: "paper" };
  change(() => layout.pieces.push(p));
  select(p.id);
};

$("bake").onclick = async () => {
  clearTimeout(saveTimer);
  status("Saving and baking…");
  try {
    await fetch(LAYOUT_URL, { method: "PUT", body: formatted(layout) });
    const res = await fetch("../walk/bake", { method: "POST" });
    if (!res.ok) throw new Error(await res.text());
    const { w, h } = await res.json();
    status(`Baked walk/walk-figure.webp (${w}×${h}): reload the page to see it`);
  } catch (e) {
    status(`Couldn't bake here (run walk-server.mjs): ${e.message}`, true);
  }
};
$("download").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([formatted(layout)], { type: "application/json" }));
  a.download = "layout.json";
  a.click();
};
$("copy").onclick = async () => {
  await navigator.clipboard.writeText(formatted(layout));
  status("Copied the layout");
};
$("revert").onclick = async () => {
  const start = await (await fetch(START_URL, { cache: "no-store" })).json();
  change(() => (layout = start));
  select(null);
};

new ResizeObserver(() => {
  if (!layout || drag) return;
  fitView();
  drawOverlay();
}).observe(canvas);

// # Starting

layout = await (await fetch(LAYOUT_URL, { cache: "no-store" })).json();
let draft = null;
try {
  draft = localStorage.getItem(DRAFT_KEY);
} catch {}
fitView();
draw();
drawPanel();
if (draft && draft !== formatted(layout)) {
  status("This browser has unsaved changes from before.");
  const b = document.createElement("button");
  b.textContent = "Restore them";
  b.onclick = () => {
    change(() => (layout = JSON.parse(draft)));
    b.remove();
  };
  $("status").append(" ", b);
}
