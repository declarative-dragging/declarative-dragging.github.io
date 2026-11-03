// The page the D2 page's demo clips are filmed from (record/clips/*.js, with
// d2-talk/recorder/vrec.js): one card's live demo, alone in a square at the
// top left, drawn as its card draws it.
//
//   record/index.html?id=<demo id>&size=<css px>[&state=<json>][&view=<json>]
//
// `state` starts the demo somewhere other than its card's start (say, where
// the original clip being remade starts), and `view` in a square of the canvas
// other than the one the card would frame it in ({x, y, side}; the card keeps
// it while what it shows fits, as it keeps any square it has framed). The page logs each state the demo
// is dropped into, and through each drag each state it would drop into, with
// the square the card shows and the (virtual) time, and each press and
// release, so a card can pick up live from wherever its clip had got to. `__toScreen(x, y)` turns a point on the demo's canvas into
// page coordinates, wherever the card's framing has moved it.

import { createRoot } from "react-dom/client";
import { LiveDemo } from "../themes/cards";

const q = new URLSearchParams(location.search);
const id = q.get("id") ?? "";
const size = Number(q.get("size") ?? 240);
const state = q.get("state");
const startView = q.get("view");

type Entry =
  | { t: number; kind: "drop" | "drag"; state: unknown; view: unknown }
  | { t: number; kind: "down" | "up" };

const log: Entry[] = [];
let view: unknown = null;
let last = "";
addEventListener(
  "pointerdown",
  () => log.push({ t: performance.now(), kind: "down" }),
  true,
);
addEventListener(
  "pointerup",
  () => log.push({ t: performance.now(), kind: "up" }),
  true,
);

function toScreen(x: number, y: number) {
  const svg = document.querySelector<SVGSVGElement>("#root svg");
  const m = svg?.getScreenCTM();
  if (!svg || !m) return null;
  const p = new DOMPoint(x, y).matrixTransform(m);
  return { x: p.x, y: p.y };
}

Object.assign(window, { __clipLog: log, __toScreen: toScreen });

createRoot(document.getElementById("root")!).render(
  <LiveDemo
    id={id}
    size={size}
    initial={
      state || startView
        ? {
            state: state ? JSON.parse(state) : null,
            view: startView ? JSON.parse(startView) : null,
          }
        : undefined
    }
    onChange={(state, v) => {
      view = v;
      last = JSON.stringify(state);
      log.push({ t: performance.now(), kind: "drop", state, view });
    }}
    onDrag={(state) => {
      // a vary drag reports a new state every frame; only changes are kept
      const json = JSON.stringify(state);
      if (json === last) return;
      last = json;
      log.push({ t: performance.now(), kind: "drag", state, view });
    }}
  />,
);
