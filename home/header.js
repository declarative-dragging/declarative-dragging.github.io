// The top of the page made one draggable list of lines: the title's two
// words, the three authors, the award and the link pills. Drag any of them
// into any line, or between lines to start a new one. A line too long for
// the column wraps, like text, so the header grows and the page moves down;
// take the extra item out again and the line closes back up. (With
// ?flow=push, a line too long instead pushes its last items onto the start
// of the next line, for good.) Items in a line sit on a shared baseline.
// The static header stays in the HTML as the no-JS version; this measures
// its pieces, then redraws them inside a draggable.

import React from "react";
import { createRoot } from "react-dom/client";
import { DraggableRenderer, translate } from "./js/dragology.js";
import { h, isWebKit, targetLines } from "./drag-shared.js";

const PAD = 6; // room around the items for the hover tilt
const MIXED_GAP = 14; // between items of different kinds
const FLOW = new URLSearchParams(location.search).get("flow") === "push" ? "push" : "wrap";

/** Where an element's text baseline is, from a zero-size inline-block set on it */
function baselineY(el) {
  const mark = document.createElement("span");
  mark.style.cssText = "display:inline-block;width:0;height:0";
  el.append(mark);
  const y = mark.getBoundingClientRect().top;
  mark.remove();
  return y;
}

// # Measuring the static header

function measure(main) {
  const h1 = main.querySelector("h1");
  const byline = main.querySelector(".byline");
  const award = main.querySelector(".award");
  const nav = main.querySelector("nav.links");
  const specs = {};
  const rects = {};
  const baselines = {};
  // measured unwrapped, whatever the column's width
  for (const el of [award, ...byline.querySelectorAll("a"), ...nav.querySelectorAll(":scope > a")]) el.style.whiteSpace = "nowrap";

  // the title's words, each wrapped to be measured
  const words = h1.textContent.trim().split(/\s+/);
  const spans = words.map((w) => Object.assign(document.createElement("span"), { textContent: w, style: "display:inline-block" }));
  h1.replaceChildren(...spans.flatMap((s, i) => (i ? [" ", s] : [s])));
  const cs = getComputedStyle(h1);
  const font = {
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing,
  };
  const title = spans.map((s, i) => {
    const id = `title-${i}`;
    specs[id] = { kind: "title", text: s.textContent, font };
    rects[id] = s.getBoundingClientRect();
    baselines[id] = baselineY(s);
    return id;
  });

  // the authors; each comma is drawn only between two names on one line
  const anchors = [...byline.querySelectorAll("a")];
  anchors.forEach((a) => (a.style.display = "inline-block"));
  const comma = document.createRange();
  comma.setStart(anchors[0].nextSibling, 0);
  comma.setEnd(anchors[0].nextSibling, 1);
  const commaW = comma.getBoundingClientRect().width;
  const names = anchors.map((a, i) => {
    const id = `name-${i}`;
    specs[id] = { kind: "name", href: a.getAttribute("href"), text: a.textContent };
    rects[id] = a.getBoundingClientRect();
    baselines[id] = baselineY(a);
    return id;
  });

  // the award, measured unrotated (it turns about its center)
  award.style.transform = "none";
  // (its link not natively draggable, so a drag moves the award, not the URL)
  specs.award = { kind: "award", inner: { __html: award.innerHTML.replace(/<a /g, '<a draggable="false" ') } };
  rects.award = award.getBoundingClientRect();
  baselines.award = baselineY(award);
  award.style.transform = "";

  const pills = [...nav.querySelectorAll(":scope > a")].map((a, i) => {
    const id = `pill-${i}`;
    specs[id] = {
      kind: "pill",
      href: a.getAttribute("href"),
      className: a.getAttribute("class"),
      label: a.getAttribute("aria-label"),
      title: a.getAttribute("title"),
      inner: { __html: a.innerHTML },
      radius: getComputedStyle(a).borderRadius,
    };
    rects[id] = a.getBoundingClientRect();
    return id;
  });
  // A pill's baseline is its text's: measured on a text pill, laid out for a
  // moment as a block (so its text sits in a line box, where it sat anyway),
  // and the same distance from the middle of every pill.
  const textPill = nav.querySelector(":scope > a:not(.icon):not(.paper)");
  textPill.style.display = "block";
  const tr = textPill.getBoundingClientRect();
  const pillBase = baselineY(textPill) - tr.top - tr.height / 2;
  textPill.style.display = "";
  for (const id of pills) baselines[id] = rects[id].top + rects[id].height / 2 + pillBase;

  for (const id in specs) Object.assign(specs[id], { w: rects[id].width, h: rects[id].height, base: baselines[id] - rects[id].top });
  const right = (id) => rects[id].left + rects[id].width;
  const kindGap = {
    title: rects[title[1]].left - right(title[0]),
    name: rects[names[1]].left - right(names[0]) - commaW,
    pill: rects[pills[1]].left - right(pills[0]),
    award: MIXED_GAP,
  };

  // the gaps between the lines, so it starts out just as the static header was
  const lines = [title, names, ["award"], pills];
  const box = (line) => {
    const y = baselines[line[0]];
    return { top: y - Math.max(...line.map((id) => specs[id].base)), bottom: y + Math.max(...line.map((id) => specs[id].h - specs[id].base)) };
  };
  const boxes = lines.map(box);
  const rowGaps = boxes.slice(1).map((b, i) => b.top - boxes[i].bottom);

  return { h1, byline, award, nav, specs, lines, commaW, kindGap, rowGaps };
}

// # Layout

function makeLayout({ specs, commaW, kindGap, rowGaps }) {
  const hasComma = (line, k) => specs[line[k]].kind === "name" && specs[line[k + 1]]?.kind === "name";
  const width = (line, k) => specs[line[k]].w + (hasComma(line, k) ? commaW : 0);
  const gap = (a, b) => {
    const ka = specs[a].kind, kb = specs[b].kind;
    return ka === kb ? kindGap[ka] : Math.max(kindGap[ka], kindGap[kb], MIXED_GAP);
  };
  const lineWidth = (line) => line.reduce((x, id, k) => x + (k ? gap(line[k - 1], id) : 0) + width(line, k), 0);

  /** A line's rows: all of it, or with "wrap", as much as fits in `maxW` a row */
  function rowsOf(line, maxW) {
    if (FLOW === "push") return [line.map((_, k) => k)];
    const rows = [[]];
    let x = 0;
    line.forEach((id, k) => {
      const w = width(line, k);
      if (k && x + gap(line[k - 1], id) + w > maxW) rows.push([]), (x = 0);
      else if (k) x += gap(line[k - 1], id);
      rows[rows.length - 1].push(k);
      x += w;
    });
    return rows;
  }

  /** Each item's corner, whether it's followed by a comma, and the header's height */
  function layout(lines, maxW) {
    const pos = {}, comma = {};
    let y = 0;
    lines.forEach((line, i) => {
      // lines past those the page started with, and a line's wrapped rows, are
      // as far apart as wrapped pills were
      if (i) y += rowGaps[i - 1] ?? kindGap.pill;
      rowsOf(line, maxW).forEach((row, r) => {
        if (r) y += kindGap.pill;
        // each row as tall as its tallest item above and below the baseline
        const ascent = Math.max(...row.map((k) => specs[line[k]].base));
        const descent = Math.max(...row.map((k) => specs[line[k]].h - specs[line[k]].base));
        let x = 0;
        row.forEach((k, j) => {
          const id = line[k];
          if (j) x += gap(line[k - 1], id);
          pos[id] = { x, y: y + ascent - specs[id].base };
          comma[id] = hasComma(line, k);
          x += width(line, k);
        });
        y += ascent + descent;
      });
    });
    return { pos, comma, height: y };
  }

  /** With "push", lines too long for `maxW` push their last items onto the start of the next */
  function reflow(lines, maxW) {
    if (FLOW === "wrap") return lines;
    const out = lines.map((l) => l.slice());
    for (let i = 0; i < out.length; i++) {
      while (out[i].length > 1 && lineWidth(out[i]) > maxW) {
        if (i + 1 === out.length) out.push([]);
        out[i + 1].unshift(out[i].pop());
      }
    }
    return out.filter((l) => l.length);
  }

  return { layout, reflow };
}

/** Every state dragging `id` can lead to: into any slot of any line, or into a new line of its own */
function targetsFor(lines, id, reflow, maxW) {
  const without = lines.map((l) => l.filter((x) => x !== id)).filter((l) => l.length);
  const out = [];
  without.forEach((line, j) => {
    for (let k = 0; k <= line.length; k++) {
      const next = without.map((l) => l.slice());
      next[j].splice(k, 0, id);
      out.push(next);
    }
  });
  for (let g = 0; g <= without.length; g++) out.push([...without.slice(0, g), [id], ...without.slice(g)]);
  const seen = new Set();
  const targets = [];
  for (const t of out.map((t) => reflow(t, maxW))) {
    const key = JSON.stringify(t);
    if (!seen.has(key)) seen.add(key), targets.push({ lines: t });
  }
  return { targets, without: { lines: without } };
}

// # Drawing

// Each item is drawn by React inside a foreignObject, in a wrapper that gives
// it the page's CSS for what it was (a pill in a .links, a name in a .byline).
// Native link dragging is off, so a drag moves the item rather than the URL.
function Item({ spec, comma, dragging }) {
  const dragged = dragging ? "is-dragged" : undefined;
  switch (spec.kind) {
    case "title":
      return h("div", { "aria-hidden": true, className: dragged, style: { ...spec.font, whiteSpace: "nowrap" } }, spec.text);
    case "name":
      return h(
        "p",
        { className: ["byline", dragged].filter(Boolean).join(" "), style: { margin: 0, whiteSpace: "nowrap" } },
        h("a", { href: spec.href, draggable: false, style: { display: "inline-block" } }, spec.text),
        comma ? "," : null,
      );
    case "award":
      return h("span", {
        className: ["award", dragged].filter(Boolean).join(" "),
        // a block, so no line box shifts it within its foreignObject
        style: { display: "block", margin: 0, whiteSpace: "nowrap" },
        dangerouslySetInnerHTML: spec.inner,
      });
    case "pill":
      return h(
        "div",
        { className: "links", style: { margin: 0, display: "block" } },
        h("a", {
          href: spec.href,
          className: [spec.className, dragged].filter(Boolean).join(" ") || undefined,
          "aria-label": spec.label || undefined,
          title: spec.title || undefined,
          draggable: false,
          // the box and corners the static pill had (its corners came from
          // nth-child rules, which no longer apply)
          style: { display: "flex", whiteSpace: "nowrap", boxSizing: "border-box", width: `${spec.w}px`, height: `${spec.h}px`, borderRadius: spec.radius },
          // the same object every render: React re-sets innerHTML whenever it gets a new one
          dangerouslySetInnerHTML: spec.inner,
        }),
      );
  }
}

function makeDraggable(m, { layout, reflow }, maxW, canvas) {
  const ids = Object.keys(m.specs);
  return ({ state, d, draggedId }) => {
    const { pos, comma } = layout(state.lines, maxW);
    return h(
      "g",
      {},
      // (in a fixed order, so stacking doesn't change as they move; the one
      // dragged is missing from the states with it lifted out)
      ...ids.filter((id) => pos[id]).map((id) => {
        const spec = m.specs[id];
        return h(
          "g",
          {
            id,
            transform: translate(pos[id].x + PAD, pos[id].y + PAD),
            dragologyZIndex: draggedId === id ? "/1" : false,
            // An onClick makes Dragology wait for real movement before starting
            // a drag, so a plain click on a link still follows it.
            onClick: spec.kind === "title" ? undefined : () => {},
            dragologyOnDrag: () => {
              const { targets, without } = targetsFor(state.lines, id, reflow, maxW);
              // Far from every spot, the others close up the gap it left;
              // dropped there, it swings back to where it was.
              return d
                .closest(targets)
                .whenFar(d.fixed(without).onDrop(state), { gap: 100 })
                .withFloating()
                .with(targetLines(targets, { canvas }));
            },
          },
          h(
            "foreignObject",
            { width: spec.w + (comma[id] ? m.commaW : 0), height: spec.h, style: { overflow: "visible" } },
            h(Item, { spec, comma: comma[id], dragging: draggedId === id }),
          ),
        );
      }),
    );
  };
}

function Header({ m, host }) {
  const flow = React.useMemo(() => makeLayout(m), [m]);
  const [maxW, setMaxW] = React.useState(host.clientWidth);
  const [state, setState] = React.useState(() => ({ lines: flow.reflow(m.lines, host.clientWidth) }));
  // the state mid-drag, so the header's height (and the page under it) follows the preview
  const [preview, setPreview] = React.useState(null);

  React.useEffect(() => {
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      setMaxW(w);
      setState((s) => ({ lines: flow.reflow(s.lines, w) }));
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [flow, host]);

  const draggable = React.useMemo(
    () => makeDraggable(m, flow, maxW, () => host.querySelector("svg")),
    [m, flow, maxW, host],
  );
  const shown = flow.layout((preview ?? state).lines, maxW).height;
  const height = flow.layout(state.lines, maxW).height;
  React.useLayoutEffect(() => {
    host.style.height = `${shown}px`;
    // the lines as data, for checking from outside
    host.dataset.lines = JSON.stringify(state.lines);
  }, [host, shown, state]);
  return h(
    "div",
    { style: { margin: -PAD } },
    h(DraggableRenderer, {
      draggable,
      state,
      onDragState: (s) => setPreview((p) => (p && JSON.stringify(p.lines) === JSON.stringify(s.lines) ? p : s)),
      onDropState: (s) => {
        setState(s);
        setPreview(null);
      },
      width: maxW + 2 * PAD,
      height: height + 2 * PAD,
    }),
  );
}

async function main() {
  // In Safari the header stays static.
  if (isWebKit) return;
  await document.fonts.ready;
  const main = document.querySelector("main");
  const m = measure(main);

  const host = document.createElement("div");
  host.className = "header-draggable";
  host.style.marginTop = getComputedStyle(m.h1).marginTop;
  host.style.marginBottom = getComputedStyle(m.nav).marginBottom;
  m.h1.before(host);
  // the heading stays for screen readers; the rest is redrawn in the draggable
  m.h1.className = "sr-only";
  for (const el of [m.byline, m.award, m.nav]) el.style.display = "none";
  createRoot(host).render(h(Header, { m, host }));
}

main();
