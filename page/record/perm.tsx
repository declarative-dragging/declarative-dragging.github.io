// The page the D2 page's permutation-lab clip is filmed from
// (clips/permutation-lab.js, with d2-talk/recorder/vrec.js): the live figure
// as the page mounts it (themes/perm.tsx's PermLive, in the page's look), at
// its canvas's own size, played by its own ghost hand.
//
//   record/perm.html?seed=<n>&cursor=<scale>
//   record/perm.html?ghost=0
//   record/perm.html?layout=phone
//
// With ghost=0 the figure has no ghost hand, and is left to vrec's pointer
// (clips/permutation-lab.js replays the talk's take on it that way). With
// layout=phone it's the phone's layout instead of the talk's, which has no
// ghost either (clips/permutation-lab-phone.js replays the take on that);
// then `__permStates` logs, by the page's clock, each state a drag would
// drop into and each it's dropped into, so the page's clip can say where
// it's got to.
//
// Nothing plays until the clip calls `__play()`, once vrec has frozen the
// clock. That seeds Math.random, which is where all of the ghost's
// randomness comes from, and mounts the figure; autoplay then starts the
// ghost (it plays while the figure is on screen). On vrec's clock the rest
// is exact, so a seed is a take: it plays the same way every time.
//
// `cursor` scales the ghost's cursor about its hotspot (the clip is shown
// smaller than the live figure, so its cursor wants to be a little bigger).
//
// `__perm` is a log for picking a stretch of a take that loops (see
// perm-windows.mjs), in frames since the ghost started: the ghost's cursor
// each frame, how much of the drawing changed, its presses, and every few
// frames where everything in the drawing is.

import { createRoot } from "react-dom/client";
import { DEFAULT_LOOK } from "../themes/palette";
import { PermLive, permCanvas } from "../themes/perm";
import type { State } from "../themes/permutation-lab";

const q = new URLSearchParams(location.search);
const seed = Number(q.get("seed") ?? 1);
const cursorScale = Number(q.get("cursor") ?? 1);
const ghost = q.get("ghost") !== "0";
const layout = q.get("layout") === "phone" ? "phone" : "talk";
/** Where everything is, every this many frames */
const SAMPLE_EVERY = 3;

/** mulberry32: a small seeded generator, standing in for Math.random */
function seeded(s: number) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Sample = {
  /** the frame whose drawing this is */
  f: number;
  /** the drawing's ids, when they differ from the previous sample's */
  ids?: string[];
  /** each id's box: center x, y, width, height (canvas px) */
  boxes: number[];
};

const SHAPES = ["arrow", "hand", "fist"];

const log = {
  seed,
  shapes: SHAPES,
  /** frames since load */
  frame: 0,
  /** the frame the ghost started on, or -1 */
  start: -1,
  /** four numbers per frame since the start: the cursor's x, y, shape (an
   * index into SHAPES), and how many attributes or nodes of the drawing
   * changed in that frame */
  cursor: [] as number[],
  presses: [] as { f: number; id: string }[],
  releases: [] as number[],
  samples: [] as Sample[],
};

const rel = () => (log.start < 0 ? -1 : log.frame - log.start);

let mutations = 0;
let lastIds = "";

function sample(svg: SVGSVGElement, f: number) {
  const els = [...svg.querySelectorAll("[id]")];
  const ids = els.map((el) => el.id);
  const key = ids.join(" ");
  const origin = svg.getBoundingClientRect();
  const boxes: number[] = [];
  for (const el of els) {
    const b = el.getBoundingClientRect();
    boxes.push(
      Math.round((b.x - origin.x + b.width / 2) * 10) / 10,
      Math.round((b.y - origin.y + b.height / 2) * 10) / 10,
      Math.round(b.width * 10) / 10,
      Math.round(b.height * 10) / 10,
    );
  }
  log.samples.push(key === lastIds ? { f, boxes } : { f, ids, boxes });
  lastIds = key;
}

/** Scales each cursor shape about its hotspot, which sits at its parent's
 * origin (ghost-hand.tsx's Cursor offsets each shape by its hotspot). */
function scaleCursor(ghost: HTMLElement) {
  for (const el of ghost.children as HTMLCollectionOf<SVGSVGElement>) {
    el.style.transformOrigin = `${-parseFloat(el.style.left)}px ${-parseFloat(el.style.top)}px`;
    el.style.scale = String(cursorScale);
  }
}

// Once a frame, before the ghost's own frame callbacks: what the last frame
// drew (as the screenshot after it shows it), and what the cursor is doing.
function watch() {
  requestAnimationFrame(watch);
  log.frame++;
  const box = document.querySelector<HTMLElement>(".perm-live");
  const svg = document.querySelector<SVGSVGElement>(".perm-stage svg");
  const ghost = document.querySelector<HTMLElement>(".perm-ghost");
  if (!box || !svg || !ghost) return;
  if (log.start < 0) {
    if (!box.classList.contains("ghosting")) return;
    log.start = log.frame;
    scaleCursor(ghost);
    new MutationObserver((records) => (mutations += records.length)).observe(
      svg,
      {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      },
    );
  }
  // This runs before the ghost moves this frame, so it sees the frame before
  const f = rel() - 1;
  if (f < 0) return;
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(
    ghost.style.transform,
  );
  const shape = [
    ...(ghost.children as HTMLCollectionOf<HTMLElement>),
  ].findIndex((el) => el.style.display === "block");
  log.cursor.push(
    m ? Number(m[1]) : NaN,
    m ? Number(m[2]) : NaN,
    shape,
    mutations,
  );
  mutations = 0;
  if (f % SAMPLE_EVERY === 0) sample(svg, f);
}

addEventListener(
  "pointerdown",
  (e) => {
    if (log.start < 0 || e.isTrusted) return;
    const id = (e.target as Element).closest?.("[id]")?.id ?? "";
    log.presses.push({ f: rel(), id });
  },
  true,
);
addEventListener(
  "pointerup",
  (e) => {
    if (log.start >= 0 && !e.isTrusted) log.releases.push(rel());
  },
  true,
);

const states: { t: number; kind: "drag" | "drop"; state: State }[] = [];
const logState = (kind: "drag" | "drop") => (state: State) =>
  states.push({ t: performance.now(), kind, state });

let played = false;
function play() {
  if (played) return;
  played = true;
  Math.random = seeded(seed);
  const root = document.getElementById("root")!;
  if (layout === "phone") {
    const { width, height } = permCanvas(layout);
    Object.assign(root.style, { width: `${width}px`, height: `${height}px` });
    createRoot(root).render(
      <PermLive
        look={DEFAULT_LOOK}
        layout={layout}
        onDragState={logState("drag")}
        onDropState={logState("drop")}
      />,
    );
  } else {
    createRoot(root).render(<PermLive look={DEFAULT_LOOK} ghost={ghost} />);
  }
  requestAnimationFrame(watch);
}

Object.assign(window, {
  __perm: log,
  __play: play,
  __permFrame: rel,
  __permStates: states,
});
