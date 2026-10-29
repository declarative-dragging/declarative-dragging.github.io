// Pieces shared by the page's draggables (the link pills and the demo cards).

import React from "react";
import { createRoot } from "react-dom/client";
import {
  getElementPositionCheap,
  layerSvg,
  layeredMerge,
  layeredPrefixIds,
  layeredShiftZIndices,
  Modifier,
  modifier,
  translate,
} from "./js/dragology.js";

export const h = React.createElement;
const ACCENT = "#dc3400";
const PAPER = "#fdfcf8";

// Safari, and every browser on iOS (all WebKit underneath), draws HTML inside
// SVG unreliably enough that these draggables misbehave there, so pages keep
// their static versions in WebKit. Chromium browsers say "Chrome/" in their
// user agent; WebKit ones say "AppleWebKit" without it.
export const isWebKit = /AppleWebKit/.test(navigator.userAgent) && !/Chrome\/|Chromium\//.test(navigator.userAgent);

export function move(list, from, to) {
  const out = list.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

// Always-on target lines: a dotted red line from the pointer to each place the
// grabbed point of the dragged element could land, a ring at each place, and
// the distance that `closest` compares, written along the line. `canvas` returns
// the draggable's <svg>, for drawing behind the page with ?lines=behind; `band`,
// if given, is the [top, bottom] span (canvas coordinates) labels keep out of,
// otherwise the span of the targets themselves. With `over`, the lines and rings
// draw on top of the elements being dragged among instead of behind them.
class TargetLines extends Modifier {
  name = "targetLines";

  constructor(ctx, inner, states, { canvas, band, over = false }) {
    super(ctx, inner);
    this.canvas = canvas;
    this.band = band;
    this.over = over;
    this.targets = states.map((s) => getElementPositionCheap(ctx, s)).filter(Boolean);
  }

  frame(frame) {
    const result = this.inner.run(frame);
    const p = frame.pointer;
    const lines = [], rings = [], labels = [], placed = [];
    const byDistance = this.targets
      .map((t) => ({ t, dist: Math.hypot(t.x - p.x, t.y - p.y) }))
      .sort((a, b) => a.dist - b.dist);
    // the band labels stay out of
    const [bandTop, bandBottom] = this.band ?? [
      Math.min(...this.targets.map((t) => t.y)) - 24,
      Math.max(...this.targets.map((t) => t.y)) + 24,
    ];
    for (const { t, dist } of byDistance) {
      lines.push(h("line", {
        x1: p.x, y1: p.y, x2: t.x, y2: t.y,
        stroke: ACCENT, strokeWidth: 2, strokeDasharray: "0.1 6", strokeLinecap: "round", strokeOpacity: 0.8,
      }));
      rings.push(h("circle", { cx: t.x, cy: t.y, r: 4, fill: "none", stroke: ACCENT, strokeWidth: 1.5 }));
      // Close to the targets the lines lie almost flat and there's no clean place
      // for labels; the reorder is about to take over anyway.
      if (dist < 48 || (p.y > bandTop - 60 && p.y < bandBottom + 60)) continue;
      // Along the line, reading left to right, a few px to one side. Nearest
      // lines get first pick; a label that would hit one already placed, or
      // land among the targets, slides back toward the pointer, or is left off.
      let deg = (Math.atan2(t.y - p.y, t.x - p.x) * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg < -90) deg += 180;
      const text = `${Math.round(dist)}px`;
      const halfLen = text.length * 3.4;
      for (const along of [0.72, 0.56, 0.4, 0.26]) {
        const c = { x: p.x + (t.x - p.x) * along, y: p.y + (t.y - p.y) * along };
        if (c.y > bandTop && c.y < bandBottom) continue;
        if (Math.hypot(c.x - p.x, c.y - p.y) < 40) continue;
        if (placed.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < halfLen + q.halfLen - 6)) continue;
        placed.push({ ...c, halfLen });
        labels.push(h("text", {
          transform: translate(c.x, c.y) + ` rotate(${deg})`,
          y: -5, textAnchor: "middle",
          fontFamily: '"Cutive Mono", "Courier New", monospace', fontSize: 11,
          fill: ACCENT, stroke: PAPER, strokeWidth: 3, paintOrder: "stroke",
        }, text));
        break;
      }
    }
    // With ?lines=behind, all the marks go on a separate layer behind the page's
    // text instead of into the drag preview.
    if (LINES_BEHIND) {
      drawBehind(this.canvas(), h("g", {}, ...lines, ...rings, ...labels));
      return result;
    }
    // Lines and rings go behind the dragged-among elements (so where a ring lands
    // on one its content stays on top), or with `over`, on top of them; labels go
    // above them, and everything stays below the floating element (floating
    // elements sit 1000000 up).
    const under = layeredShiftZIndices(
      layeredPrefixIds(layerSvg(h("g", {}, ...lines, ...rings)), "target-lines-"),
      this.over ? 400000 : -1,
    );
    const over = layeredShiftZIndices(
      layeredPrefixIds(layerSvg(h("g", {}, ...labels)), "target-labels-"),
      500000,
    );
    return { ...result, preview: () => layeredMerge(layeredMerge(result.preview(), under), over) };
  }
}
export const targetLines = modifier(TargetLines);

// The layer behind the page's text for ?lines=behind: an SVG at z-index -1, so it
// paints above the page background but under everything in the page's flow.
// Marks arrive in the draggable's canvas coordinates and are shifted to the page.
const LINES_BEHIND = new URLSearchParams(location.search).get("lines") === "behind";
let behindRoot = null;
function drawBehind(canvasSvg, marks) {
  if (!behindRoot) {
    const host = document.createElement("div");
    Object.assign(host.style, { position: "absolute", left: "0", top: "0", zIndex: "-1", pointerEvents: "none" });
    document.body.append(host);
    behindRoot = createRoot(host);
    const clear = () => behindRoot.render(null);
    addEventListener("pointerup", clear);
    addEventListener("pointercancel", clear);
  }
  const canvas = canvasSvg.getBoundingClientRect();
  behindRoot.render(
    h("svg", { width: 1, height: 1, style: { overflow: "visible", display: "block" } },
      h("g", { transform: translate(canvas.left + scrollX, canvas.top + scrollY) }, marks)),
  );
}
