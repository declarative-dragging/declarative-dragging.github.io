// The permutation lab on the D2 page: the slideshow's compact layout,
// live, played by a ghost hand (ghost-hand.tsx) until the reader clicks on
// it to take over. The lab is themes/permutation-lab.tsx, drawn in the
// page's look (themes/palette.ts) by themes/perm.tsx, which also has the
// ghost's gestures.
//
// The static <video> stays in the HTML for no-JS. A phone gets its own clip
// of the lab (<clip>-phone.mp4, record/clips/permutation-lab-phone.js), in
// the layout the lab has on a phone: tall, with every handle big enough for
// a finger. On a touch screen it plays, as the demo cards' clips do, until
// it's tapped; then the lab is live in that layout, from the state the clip
// was showing, and it's the reader's from the start: no ghost, no tags.

import { createRoot } from "react-dom/client";
import { holdDragTouches } from "./tap-to-wake";
import { DEFAULT_LOOK } from "./themes/palette";
import { type PermLayout, PermLive } from "./themes/perm";
import type { State } from "./themes/permutation-lab";

/** Narrower than this, the figure is a phone's column, and gets the phone's layout */
const PHONE_WIDTH = 520;

// The tap-to-try clip, and the phone's layout once it's live
const PHONE_CSS = `
  #perm-figure .perm-tap { position: relative; cursor: pointer; }
  /* The phone's layout is taller than the screen: a swipe on it scrolls
     the page, unless it starts on a handle (holdDragTouches) */
  #perm-figure .perm-phone svg { touch-action: pan-y !important; }
`;

/**
 * Swaps the figure's clip for the phone's, the same address with `-phone`,
 * and its poster too; back to the first if the phone's won't load (a copy
 * of the page that hasn't got one).
 */
function phoneClip(video: HTMLVideoElement) {
  const src = video.getAttribute("src")!;
  const poster = video.getAttribute("poster");
  video.addEventListener(
    "error",
    () => {
      video.src = src;
      if (poster) video.poster = poster;
    },
    { once: true },
  );
  if (poster) video.poster = poster.replace(/\.webp$/, "-phone.webp");
  video.src = src.replace(/\.mp4$/, "-phone.mp4");
}

type LogEntry = { t: number; kind: string; state: State };

/** A clip's log of states, by its clock (missing, nothing) */
async function clipLog(video: HTMLVideoElement): Promise<LogEntry[]> {
  try {
    const r = await fetch(video.src.replace(/\.mp4$/, ".log.json"));
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

/**
 * The state the clip shows at `t` (s): the last it was dropped into by
 * then or, mid-drag, the one the drag would drop into. The log keeps two
 * decimals, so the solid's turn is made a rotation again.
 */
function stateAt(log: LogEntry[], t: number): State | undefined {
  let at: LogEntry | undefined;
  for (const e of log) {
    if (e.t > t) break;
    at = e;
  }
  if (!at) return undefined;
  const { view } = at.state;
  const len = Math.hypot(...view.orientation);
  const orientation = view.orientation.map(
    (c) => c / len,
  ) as typeof view.orientation;
  return { ...at.state, view: { ...view, orientation } };
}

function tapToTry(
  fallback: Element,
  video: HTMLVideoElement,
  layout: PermLayout,
) {
  const style = document.createElement("style");
  style.textContent = PHONE_CSS;
  document.head.append(style);

  // The clip stops being a link (the caption still links to the demo); a
  // tap swaps it for the live lab, the same size in the same place.
  const clip = document.createElement("div");
  clip.className = "perm-tap";
  const hint = document.createElement("span");
  hint.className = "tap-hint";
  hint.textContent = "tap to try";
  clip.append(video, hint);
  fallback.replaceWith(clip);
  const log = clipLog(video);
  clip.addEventListener(
    "click",
    async () => {
      video.pause();
      const initial = stateAt(await log, video.currentTime);
      const host = document.createElement("div");
      if (layout === "phone") host.className = "perm-phone";
      clip.replaceWith(host);
      createRoot(host).render(
        <PermLive
          look={DEFAULT_LOOK}
          ghost={false}
          layout={layout}
          initial={initial}
        />,
      );
      holdDragTouches(host);
    },
    { once: true },
  );
}

function main() {
  const figure = document.getElementById("perm-figure");
  if (!figure) return;
  const fallback = figure.querySelector(":scope > a");
  const video = fallback?.querySelector("video");
  if (!fallback || !video) return;
  // live with a mouse
  const hover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (hover) {
    const host = document.createElement("div");
    fallback.replaceWith(host);
    createRoot(host).render(<PermLive look={DEFAULT_LOOK} />);
    return;
  }
  // a phone's clip on a phone (wider, as on a tablet, the talk's fits)
  const layout = figure.clientWidth < PHONE_WIDTH ? "phone" : "talk";
  if (layout === "phone") phoneClip(video);
  // live when tapped
  tapToTry(fallback, video, layout);
}

main();
