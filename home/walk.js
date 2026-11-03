// The figure with Josh's story of the walk (#walk-figure): the map of the
// walk, with Josh's drawings of twisted trees laid over it like scraps of
// paper. Drawn from a layout, walk/layout.json, which review/walk-editor.html
// edits by direct manipulation; the page shows it baked into an image,
// walk/walk-figure.webp (by d2-talk/d2-page/walk-server.mjs, with this).
//
// A layout is in the map's pixels ("canvas units"):
//
//   frame   the part of the canvas the figure shows: {x, y, w, h}
//   paper   how the paper pieces look, PAPER_LOOK's settings (any left out
//           are PAPER_LOOK's)
//   pieces  bottom to top, each a crop of one of SOURCES:
//     src     the image's name in SOURCES
//     crop    the part of the image it shows, in the image's pixels: {x, y, w, h}
//     x, y    where its center is on the canvas
//     scale   canvas units per image pixel
//     rotate  degrees, clockwise
//     look    "paper" (a white border and a shadow), "plain", or "ink"
//             (multiplied onto what's under it)
//     hidden  left out
//     locked  (the editor's) only selectable from its list

export const SOURCES = {
  "walk-map": { w: 1920, h: 1428, label: "map of the walk" },
  "elliot-2": { w: 1920, h: 1773, label: "Josh's sketch" },
  "elliot-3": { w: 1920, h: 1836, label: "Josh's drawing" },
  "elliot-1": { w: 1450, h: 698, label: "Elliot's drawing" },
  "walk-trail": { w: 1280, h: 720, label: "the trail (photo)" },
};

/** A paper piece's white border, in canvas units */
export const PAPER = 9;

/**
 * How the paper pieces look, unless the layout says otherwise:
 *
 *   lift     how far the shadow falls below the paper, in canvas units (it
 *            blurs over three times that)
 *   shadow   the shadow's darkness, 0 to 1
 *   corner   the paper's corners' radius, in canvas units
 *   opacity  the paper's, so the map shows through it a little below 1
 */
export const PAPER_LOOK = { lift: 10, shadow: 0.2, corner: 0, opacity: 1 };

/** The layout's paper look, filled in */
export const paperLook = (layout) => ({ ...PAPER_LOOK, ...layout.paper });

/** A piece's size on the canvas */
export function pieceSize(p) {
  return { w: p.crop.w * p.scale, h: p.crop.h * p.scale };
}

/**
 * Draws piece `p` into `el` (a div, made the first time; its img too), placed
 * on a stage of canvas units, a paper piece as `paper` (PAPER_LOOK's
 * settings) says. `dir` is where walk/ is, relative to the page.
 */
export function drawPiece(el, p, dir, paper = PAPER_LOOK) {
  const { w, h } = pieceSize(p);
  const s = SOURCES[p.src];
  const onPaper = p.look === "paper";
  // the paper is a border around the image, so its corners round outside
  // and the image's inside them
  const border = onPaper ? PAPER : 0;
  Object.assign(el.style, {
    position: "absolute",
    boxSizing: "content-box",
    left: `${p.x - w / 2 - border}px`,
    top: `${p.y - h / 2 - border}px`,
    width: `${w}px`,
    height: `${h}px`,
    transform: p.rotate ? `rotate(${p.rotate}deg)` : "",
    overflow: "hidden",
    display: p.hidden ? "none" : "",
    background: onPaper ? "white" : "",
    border: onPaper ? `${PAPER}px solid white` : "",
    borderRadius: onPaper && paper.corner ? `${paper.corner}px` : "",
    boxShadow: onPaper ? `0 ${paper.lift}px ${3 * paper.lift}px rgba(0, 0, 0, ${paper.shadow})` : "",
    opacity: onPaper && paper.opacity < 1 ? String(paper.opacity) : "",
    mixBlendMode: p.look === "ink" ? "multiply" : "",
  });
  let img = el.querySelector("img");
  if (!img) {
    img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    el.append(img);
  }
  const src = `${dir}walk/${p.src}.webp`;
  if (img.getAttribute("src") !== src) img.setAttribute("src", src);
  // inline, over the page's rules for figure images
  Object.assign(img.style, {
    position: "absolute",
    display: "block",
    left: `${-p.crop.x * p.scale}px`,
    top: `${-p.crop.y * p.scale}px`,
    width: `${s.w * p.scale}px`,
    height: `${s.h * p.scale}px`,
    maxWidth: "none",
    borderRadius: "0",
    background: "none",
    pointerEvents: "none",
  });
}

/**
 * Draws `layout` into `host`, its frame filling the host's width; returns a
 * function to draw a changed layout
 */
export function mountWalk(host, layout, dir) {
  const stage = document.createElement("div");
  Object.assign(stage.style, { position: "absolute", left: "0", top: "0", transformOrigin: "0 0" });
  Object.assign(host.style, { position: "relative", overflow: "hidden" });
  host.append(stage);
  const fit = () => {
    const { frame } = layout;
    host.style.aspectRatio = `${frame.w} / ${frame.h}`;
    const k = host.clientWidth / frame.w;
    stage.style.transform = `scale(${k}) translate(${-frame.x}px, ${-frame.y}px)`;
  };
  const draw = (next) => {
    layout = next;
    stage.replaceChildren();
    for (const p of layout.pieces) {
      const el = document.createElement("div");
      drawPiece(el, p, dir, paperLook(layout));
      stage.append(el);
    }
    fit();
  };
  new ResizeObserver(fit).observe(host);
  draw(layout);
  return draw;
}
