// The link pills at the top of the page, made reorderable with Dragology.
// The static <nav> stays in the HTML as the no-JS version; this measures its
// pills, then redraws the same links inside a draggable.

import { createRoot } from "react-dom/client";
import { DraggableRenderer, translate } from "./js/dragology.js";
import { h, isWebKit, move, targetLines } from "./drag-shared.js";

const GAP = 8; // matches nav.links { gap: 0.5rem }
const PAD = 6; // room around the pills for the hover tilt

const nav = document.querySelector("nav.links");

// Rendered by React inside a foreignObject, so it keeps the page's CSS.
// Native link dragging is off, so a drag moves the pill rather than the URL.
function Pill({ spec, size, dragging }) {
  return h("a", {
    href: spec.href,
    // While dragged, a pill wears its hover look whether or not the pointer is over it.
    className: [spec.className, dragging && "is-dragged"].filter(Boolean).join(" ") || undefined,
    "aria-label": spec.label || undefined,
    title: spec.title || undefined,
    draggable: false,
    // the box the static pill had, so text and icons sit exactly where they did
    // Each pill keeps the corners it had in the static row (they come from nth-child
    // rules, which no longer apply once every pill is alone in its own container).
    style: {
      display: "flex",
      boxSizing: "border-box",
      width: `${size.w}px`,
      height: `${size.h}px`,
      borderRadius: spec.radius,
    },
    // the same object every render: React re-sets innerHTML whenever it gets a new one
    dangerouslySetInnerHTML: spec.inner,
  });
}

// Lay pills out left to right, wrapping at the nav's width, like the flex row did.
function layout(order, sizes, width) {
  const positions = {};
  let x = 0, y = 0, rowHeight = 0;
  for (const id of order) {
    const { w, h: ht } = sizes[id];
    if (x > 0 && x + w > width) { x = 0; y += rowHeight + GAP; rowHeight = 0; }
    positions[id] = { x, y };
    x += w + GAP;
    rowHeight = Math.max(rowHeight, ht);
  }
  return { positions, height: y + rowHeight };
}

function makeDraggable(specs, sizes, width) {
  return ({ state, d, draggedId }) => {
    const { positions } = layout(state.order, sizes, width);
    return h(
      "g",
      {},
      ...state.order.map((id, i) =>
        h(
          "g",
          {
            id,
            transform: translate(positions[id].x + PAD, positions[id].y + PAD),
            dragologyZIndex: draggedId === id ? "/1" : false,
            // An onClick here makes Dragology wait for real movement before
            // starting a drag, so a plain click still follows the link.
            onClick: () => {},
            dragologyOnDrag: () => {
              const orders = state.order.map((_, j) => ({ order: move(state.order, i, j) }));
              // Far from the row, the others close up the gap it left; dropped
              // there, the pill swings back to where it was.
              const without = { order: state.order.filter((o) => o !== id) };
              return d
                .closest(orders)
                .whenFar(d.fixed(without).onDrop(state), { gap: 100 })
                .withFloating()
                .with(targetLines(orders, { canvas: () => nav.querySelector("svg") }));
            },
          },
          h(
            "foreignObject",
            { width: sizes[id].w, height: sizes[id].h, style: { overflow: "visible" } },
            h(Pill, { spec: specs[id], size: sizes[id], dragging: draggedId === id }),
          ),
        ),
      ),
    );
  };
}

async function main() {
  // In Safari the row stays static.
  if (isWebKit) return;
  await document.fonts.ready;
  const links = [...nav.querySelectorAll(":scope > a")];
  const specs = {}, sizes = {};
  const ids = links.map((a, i) => {
    const id = `pill-${i}`;
    const r = a.getBoundingClientRect();
    specs[id] = {
      href: a.getAttribute("href"),
      className: a.getAttribute("class"),
      label: a.getAttribute("aria-label"),
      title: a.getAttribute("title"),
      inner: { __html: a.innerHTML },
      radius: getComputedStyle(a).borderRadius,
    };
    sizes[id] = { w: r.width, h: r.height };
    return id;
  });

  let state = { order: ids };
  const host = document.createElement("div");
  host.className = "pills-draggable";
  nav.replaceChildren(host);
  const root = createRoot(host);

  const render = () => {
    const width = nav.clientWidth;
    const { height } = layout(state.order, sizes, width);
    root.render(
      h(DraggableRenderer, {
        draggable: makeDraggable(specs, sizes, width),
        state,
        onDropState: (s) => { state = s; render(); },
        width: width + 2 * PAD,
        height: height + 2 * PAD,
      }),
    );
  };
  render();
  new ResizeObserver(render).observe(nav);
}

main();
