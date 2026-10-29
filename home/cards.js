// The demo cards, made reorderable with Dragology, each showing its demo live
// (js/cards-demos.js) in place of its clip. The static grid stays in the
// HTML as the no-JS version (and on touch screens, where dragging the grid would
// get in the way of scrolling, and in Safari); this measures it, then redraws the same cards
// inside a draggable, keeping the grid's columns.
//
// A card is picked up by its name, which is also its link to the full demo; a
// press inside the live picture works the demo instead.

import { createRoot } from "react-dom/client";
import { DraggableRenderer, translate } from "./js/dragology.js";
import { h, isWebKit, move, targetLines } from "./drag-shared.js";

const PAD = 10; // room around the cards for the hover tilt

const grid = document.querySelector(".demos");

// Rendered by React inside a foreignObject, so it keeps the page's CSS.
function Card({ spec, width, dragging, live }) {
  // While dragged, a card wears its hover look whether or not the pointer is over it.
  const className = dragging ? "card is-dragged" : "card";
  if (!live?.CARD_DEMOS[spec.demoId]) {
    // No live version: the static card, its clip and caption. Its HTML is set
    // once and left alone, so its video keeps playing through drags (React
    // re-sets innerHTML whenever it gets a new object, so this is the same one
    // every render).
    return h("a", {
      href: spec.href,
      className,
      draggable: false,
      style: { width: `${width}px` },
      dangerouslySetInnerHTML: spec.inner,
    });
  }
  return h(
    "div",
    { className: `${className} is-live`, style: { width: `${width}px` } },
    h(
      "div",
      { className: "picture" },
      // inside the picture's 1px border
      h(live.LiveDemo, { id: spec.demoId, size: width - 2, fallback: spec.fallback }),
      h("a", {
        className: "open",
        href: spec.href,
        draggable: false,
        title: "Open the full demo",
        "aria-label": `Open the full ${spec.name} demo`,
      }, "↗"),
    ),
    // Native link dragging is off, so dragging the name moves the card, not the URL.
    h("a", { className: "name", href: spec.href, draggable: false }, spec.name),
  );
}

// The grid's own columns: four, or two on narrow screens.
function layout(count, width, gaps, captionHeight) {
  const cols = matchMedia("(max-width: 560px)").matches ? 2 : 4;
  const w = (width - (cols - 1) * gaps.col) / cols;
  const hgt = w + captionHeight;
  const at = (i) => ({ x: (i % cols) * (w + gaps.col), y: Math.floor(i / cols) * (hgt + gaps.row) });
  const rows = Math.ceil(count / cols);
  return { cols, rows, w, h: hgt, at, height: rows * hgt + (rows - 1) * gaps.row };
}

function makeDraggable(specs, geo, live) {
  return ({ state, d, draggedId }) =>
    h(
      "g",
      {},
      ...state.order.map((id, i) => {
        const { x, y } = geo.at(i);
        return h(
          "g",
          {
            id,
            transform: translate(x + PAD, y + PAD),
            dragologyZIndex: draggedId === id ? "/1" : false,
            // An onClick here makes Dragology wait for real movement before
            // starting a drag, so a plain click on the name still opens the demo.
            onClick: () => {},
            dragologyOnDrag: () => {
              const orders = state.order.map((_, j) => ({ order: move(state.order, i, j) }));
              // Far from the grid, the others close up the gap it left; dropped
              // there, the card swings back to where it was.
              const without = { order: state.order.filter((o) => o !== id) };
              return d
                .closest(orders)
                .whenFar(d.fixed(without).onDrop(state), { gap: 140 })
                .withFloating()
                .with(targetLines(orders, {
                  canvas: () => grid.querySelector("svg"),
                  // labels keep off the whole grid, not just the targets' heights
                  band: [0, geo.height + 2 * PAD],
                  // over the cards, so the lines and rings stay visible across them
                  over: true,
                }));
            },
          },
          h(
            "foreignObject",
            { width: geo.w, height: geo.h, style: { overflow: "visible" } },
            h(Card, { spec: specs[id], width: geo.w, dragging: draggedId === id, live }),
          ),
        );
      }),
    );
}

async function main() {
  // Only with a mouse or trackpad, and not in Safari: elsewhere the grid stays static.
  if (isWebKit || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  // Without the live demos, the cards are still reorderable, showing their clips.
  const [live] = await Promise.all([
    import("./js/cards-demos.js").catch((e) => { console.warn(e); return null; }),
    document.fonts.ready,
  ]);

  const cards = [...grid.querySelectorAll(":scope > a.card")];
  const first = cards[0].getBoundingClientRect();
  const captionHeight = first.height - first.width;
  const style = getComputedStyle(grid);
  const gaps = { col: parseFloat(style.columnGap), row: parseFloat(style.rowGap) };
  const specs = {};
  const ids = cards.map((a, i) => {
    const id = `card-${i}`;
    const href = a.getAttribute("href");
    const media = { __html: a.querySelector("video").outerHTML };
    specs[id] = {
      href,
      inner: { __html: a.innerHTML },
      demoId: href.split("#/demos/")[1],
      name: a.querySelector("span").textContent,
      // if a live demo fails, its card falls back to the clip
      fallback: h("div", { className: "clip", dangerouslySetInnerHTML: media }),
    };
    return id;
  });

  let state = { order: ids };
  const host = document.createElement("div");
  host.className = "cards-draggable";
  grid.replaceChildren(host);
  const root = createRoot(host);
  // One red tag for the whole grid, on hover: every card can be dragged, by
  // its name or inside its picture
  const tag = document.createElement("span");
  tag.className = "live-tag cards-tag";
  tag.setAttribute("aria-hidden", "true");
  tag.textContent = "drag us around";
  grid.append(tag);

  // A card dropped by its name is still under the pointer, so the press ends
  // with a click on the name; Dragology stops that click's propagation, but
  // only cancelling it keeps the link from opening.
  let dragged = false;
  host.addEventListener("pointerdown", () => { dragged = false; }, true);
  host.addEventListener("click", (e) => { if (dragged) e.preventDefault(); }, true);
  const onDragStatus = (s) => { if (s.type === "dragging") dragged = true; };

  // Only play the clips that are on screen, as the static grid did.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause();
  });
  const watchVideos = () => host.querySelectorAll("video").forEach((v) => io.observe(v));

  const render = () => {
    const width = grid.clientWidth;
    const geo = layout(ids.length, width, gaps, captionHeight);
    root.render(
      h(DraggableRenderer, {
        draggable: makeDraggable(specs, geo, live),
        state,
        onDropState: (s) => { state = s; render(); },
        onDragStatus,
        width: width + 2 * PAD,
        height: geo.height + 2 * PAD,
      }),
    );
    requestAnimationFrame(watchVideos);
  };
  render();
  new ResizeObserver(render).observe(grid);
}

main();
