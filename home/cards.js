// The demo cards, made reorderable with Dragology. Each plays its clip
// (clips/<name>.mp4) until the pointer comes over it; then it goes live
// (js/cards-demos.js), starting where the clip had got to (each clip's log,
// clips/<name>.log.json, says which state it showed when). Once the pointer
// is on the cards, every clip holds still; a few seconds after it leaves
// them, every card goes back to its clip, from where that clip stopped, and
// they all play again. (?cards=live: every card live from the start.)
//
// The static grid stays in the HTML as the no-JS version (and on touch
// screens, where dragging the grid would get in the way of scrolling, and in
// Safari); this measures it, then redraws the same cards inside a draggable,
// keeping the grid's columns. On the phone review page (review/phone.html,
// data-phone-live), it's one card per row instead, each going live when
// tapped.
//
// A card is picked up by its name, which is also its link to the full demo; a
// press inside the live picture works the demo instead.

import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { DraggableRenderer, translate } from "./js/dragology.js";
import { h, isWebKit, move, targetLines } from "./drag-shared.js";

const PAD = 10; // room around the cards for the hover tilt
const QUIET_MS = 8000; // how long the clips wait, once the pointer leaves the cards, to play again
const MODE = new URLSearchParams(location.search).get("cards") === "live" ? "live" : "clips";
const PHONE_LIVE = document.documentElement.hasAttribute("data-phone-live");

const grid = document.querySelector(".demos");

// # Where a clip had got to

/** Each clip's log, by its clip's address */
const logs = new Map();
function loadLog(src) {
  if (!logs.has(src))
    logs.set(src, fetch(src.replace(/\.mp4$/, ".log.json")).then((r) => r.json()).catch(() => null));
  return logs.get(src);
}

/**
 * The state the clip shows at `t` (s) and its card's square then: the last
 * state dropped into by then, or, mid-drag, the state the drag would drop
 * into then.
 */
function stateAt(log, t) {
  // an entry's square is given only where it changes
  let at = null;
  let view = null;
  for (const e of log) {
    if (e.t > t) break;
    if ("view" in e) view = e.view;
    if (e.kind === "drop" || e.kind === "drag") at = e;
  }
  return at?.state ? { state: at.state, view } : undefined;
}

/** Cards gone live, by card id: where they started, and the clip's time then */
const wentLive = new Map();
/** Cards gone back to their clips, by card id: the time to pick up from */
const resumeAt = new Map();
/** The clips' playing (desktop): which are on screen, and whether they're
 * holding still while the reader is at the cards */
const playing = { io: null, shown: new Set(), quiet: false };

/** Live from where `video` is, unless the pointer has left it meanwhile */
async function goLive(id, video) {
  const log = await loadLog(video.getAttribute("src"));
  if (!PHONE_LIVE && !video.matches(":hover")) return false;
  const initial = log ? stateAt(log, video.currentTime) : undefined;
  video.pause();
  wentLive.set(id, { initial, at: video.currentTime });
  return true;
}

// # The draggable grid (desktop)

// Rendered by React inside a foreignObject, so it keeps the page's CSS.
function Card({ spec, width, dragging, live }) {
  // While dragged, a card wears its hover look whether or not the pointer is over it.
  const className = dragging ? "card is-dragged" : "card";
  const [, rerender] = useState(0);
  if (!live?.CARD_DEMOS[spec.demoId]) {
    // No live version: the static card, its clip and caption. Its HTML is set
    // once and left alone, so its video keeps playing through drags.
    return h("a", {
      href: spec.href,
      className,
      draggable: false,
      style: { width: `${width}px` },
      dangerouslySetInnerHTML: spec.inner,
    });
  }
  const went = MODE === "live" ? { initial: undefined } : wentLive.get(spec.id);
  const picture = went
    ? h(live.LiveDemo, { id: spec.demoId, size: width - 2, fallback: spec.fallback, initial: went.initial })
    : h("video", {
        src: spec.clip,
        poster: spec.poster,
        autoPlay: !playing.quiet,
        muted: true,
        loop: true,
        playsInline: true,
        className: "clip-video",
        ref: (v) => v && playing.io?.observe(v),
        onLoadedMetadata: (e) => {
          // back from being live: on from where it was
          if (!resumeAt.has(spec.id)) return;
          e.currentTarget.currentTime = resumeAt.get(spec.id);
          resumeAt.delete(spec.id);
        },
        onPointerEnter: async (e) => {
          if (await goLive(spec.id, e.currentTarget)) rerender((n) => n + 1);
        },
      });
  return h(
    "div",
    { className: `${className} is-live`, style: { width: `${width}px` }, "data-card": spec.id },
    h(
      "div",
      { className: "picture" },
      picture,
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

function cardSpecs(cards) {
  const specs = {};
  const ids = cards.map((a, i) => {
    const id = `card-${i}`;
    const href = a.getAttribute("href");
    const video = a.querySelector("video");
    specs[id] = {
      id,
      href,
      inner: { __html: a.innerHTML },
      demoId: href.split("#/demos/")[1],
      name: a.querySelector("span").textContent,
      clip: video.getAttribute("src"),
      poster: video.getAttribute("poster"),
      // if a live demo fails, its card falls back to the clip
      fallback: h("div", { className: "clip", dangerouslySetInnerHTML: { __html: video.outerHTML } }),
    };
    return id;
  });
  return { specs, ids };
}

async function desktop() {
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
  const { specs, ids } = cardSpecs(cards);
  for (const id of ids) loadLog(specs[id].clip);

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

  // Only play the clips that are on screen, as the static grid did, and none
  // while the reader is at the cards: once the pointer comes onto one, every
  // clip holds still (the one under it goes live). QUIET_MS after the pointer
  // has left the cards (and any drag is done), every live card goes back to
  // its clip, from where that clip stopped, and they all play again.
  let wake;
  let pressed = false;
  const { shown } = playing;
  const io = (playing.io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) shown.add(e.target);
      else shown.delete(e.target);
      e.isIntersecting && !playing.quiet ? e.target.play().catch(() => {}) : e.target.pause();
    }
  }));
  host.addEventListener("pointerover", (e) => {
    if (!e.target.closest?.("[data-card]")) return;
    playing.quiet = true;
    clearTimeout(wake);
    host.querySelectorAll("video.clip-video").forEach((v) => v.pause());
  });
  host.addEventListener("pointerdown", () => { pressed = true; }, true);
  document.addEventListener("pointerup", () => { pressed = false; }, true);
  const playAgain = () => {
    if (pressed) return (wake = setTimeout(playAgain, 1000));
    for (const [id, went] of wentLive) resumeAt.set(id, went.at);
    wentLive.clear();
    playing.quiet = false;
    render();
    requestAnimationFrame(() => {
      for (const v of shown) if (v.isConnected) v.play().catch(() => {});
    });
  };
  host.addEventListener("pointerleave", () => {
    clearTimeout(wake);
    if (playing.quiet) wake = setTimeout(playAgain, QUIET_MS);
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

// # Phones, on the phone review page: one card per row, live when tapped

function TappedDemo({ live, spec, size, initial }) {
  return h(live.LiveDemo, { id: spec.demoId, size, fallback: spec.fallback, initial, touch: true });
}

/**
 * Keeps a touch that starts on something draggable in `host` (Dragology
 * gives those cursor: grab) from scrolling the page: the renderer's svg asks
 * for that with touch-action, which iOS Safari doesn't always honor, so the
 * touch's moves are cancelled. A touch anywhere else still scrolls. And a
 * touch the browser takes back partway (a second finger, a system gesture)
 * gets a pointercancel and never a pointerup, which would leave a drag stuck
 * partway, so it's let go of where it last was. (As tap-to-wake.ts's
 * holdDragTouches, for the other live figures.)
 */
function holdDragTouches(host) {
  let id = null;
  let last = null;
  host.addEventListener("pointerdown", (e) => { id = e.pointerId; last = e; }, true);
  document.addEventListener("pointermove", (e) => { if (e.pointerId === id) last = e; }, true);
  document.addEventListener("pointerup", (e) => { if (e.pointerId === id) id = null; }, true);
  document.addEventListener("pointercancel", (e) => {
    if (e.pointerId !== id || !last) return;
    id = null;
    const { clientX, clientY } = last;
    document.dispatchEvent(new PointerEvent("pointerup", { pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary, clientX, clientY, bubbles: true }));
  }, true);
  let held = false;
  host.addEventListener("touchstart", (e) => { held = !!e.target.closest?.('[style*="cursor: grab"]'); }, { passive: true });
  host.addEventListener("touchmove", (e) => { if (held) e.preventDefault(); }, { passive: false });
}

async function phone() {
  const live = await import("./js/cards-demos.js").catch((e) => { console.warn(e); return null; });
  if (!live) return;
  grid.classList.add("one-column");
  const cards = [...grid.querySelectorAll(":scope > a.card")];
  const { specs, ids } = cardSpecs(cards);
  cards.forEach((a, i) => {
    const spec = specs[ids[i]];
    if (!live.CARD_DEMOS[spec.demoId]) return;
    loadLog(spec.clip);
    // the card stops being a link: its picture is tapped to try it, its name opens the demo
    const card = document.createElement("div");
    card.className = "card tap-card";
    const picture = document.createElement("div");
    picture.className = "picture";
    const video = a.querySelector("video");
    picture.append(video);
    const hint = document.createElement("span");
    hint.className = "tap-hint";
    hint.textContent = "tap to try";
    picture.append(hint);
    const name = document.createElement("a");
    name.className = "name";
    name.href = spec.href;
    name.textContent = spec.name;
    card.append(picture, name);
    a.replaceWith(card);
    picture.addEventListener("click", async () => {
      if (card.classList.contains("is-tapped")) return;
      await goLive(spec.id, video);
      card.classList.add("is-tapped");
      const holder = document.createElement("div");
      picture.replaceChildren(holder);
      holdDragTouches(holder);
      createRoot(holder).render(
        createElement(TappedDemo, { live, spec, size: picture.clientWidth, initial: wentLive.get(spec.id).initial }),
      );
    });
  });
}

const hover = matchMedia("(hover: hover) and (pointer: fine)").matches;
if (hover && !isWebKit) desktop();
else if (PHONE_LIVE) phone();
