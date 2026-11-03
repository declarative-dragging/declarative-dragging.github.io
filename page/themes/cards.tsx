// The demo cards' live pictures, themed: cards-demos.tsx's LiveDemo, with
// each demo swapped for its themed copy (./demos/), drawn in the scheme and
// variant it's given. The review page shows every variant side by side;
// the themed page copies (cards-themed.js) get the page's scheme.

import { DraggableRenderer, Vec2 } from "dragology";
import {
  Component,
  type ComponentType,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { EmbedContext, type Mounted } from "../demo-ui-shim";
import { Algebra, VARIANTS as algebraVariants } from "./demos/algebra";
import { Bezier, VARIANTS as bezierVariants } from "./demos/bezier";
import { Braid, VARIANTS as braidVariants } from "./demos/braid";
import { CardPiles, VARIANTS as cardPilesVariants } from "./demos/card-piles";
import { Face, VARIANTS as faceVariants } from "./demos/face";
import {
  SproutingTree,
  VARIANTS as sproutingVariants,
} from "./demos/sprouting-tree";
import { Tromino, VARIANTS as trominoVariants } from "./demos/tromino";
import {
  TwistedTrees,
  VARIANTS as twistedVariants,
} from "./demos/twisted-trees";
import { DEFAULT_LOOK, type Scheme } from "./palette";
import { DemoThemeContext, type Variants } from "./theme";

type CardDemo = {
  name: string;
  Component: ComponentType;
  variants: Variants;
  /** The smallest square of the demo's canvas the card shows */
  minSide: number;
  /** The same on a touch screen, if a fingertip needs things bigger */
  touchSide?: number;
  /** Room around the content, in canvas px */
  pad?: number;
  /** The state to start from, given the demo's own initial state */
  start?: (initial: any) => any;
  /** Where the card holds the content it frames: in the middle, or, for a
   * demo that grows downward, `pad` from the top (and across the middle) */
  anchor?: "middle" | "top";
  /** Framing from the top, the room kept free below the content (canvas px),
   * for a pull downward to go into */
  room?: number;
  /** A state read back from JSON (a clip's log), made whole again: its Vec2s, say */
  revive?: (state: any) => any;
};

/** By demo id, as in the demo's address (#/demos/<id>); as cards-demos.tsx */
export const CARD_DEMOS: Record<string, CardDemo> = {
  // the tree filling the card, as in Josh's original clip
  "animate-algebra-tree": {
    name: "algebra",
    Component: Algebra,
    variants: algebraVariants,
    minSide: 166,
    pad: 8,
  },
  // big enough to keep its clip's square (the original's) when it goes live
  "twisted-trees": {
    name: "twisted trees",
    Component: TwistedTrees,
    variants: twistedVariants,
    minSide: 430,
    pad: 14,
  },
  bezier: {
    name: "bézier curve",
    Component: Bezier,
    variants: bezierVariants,
    minSide: 220,
    pad: 10,
    // the demo's curve, drawn a little tighter, so the card can zoom in on it
    start: () => ({
      p0: { x: 60, y: 60 },
      p1: { x: 175, y: 60 },
      p2: { x: 105, y: 180 },
      p3: { x: 255, y: 180 },
    }),
  },
  "braid-old": {
    name: "braid",
    Component: Braid,
    variants: braidVariants,
    // the strands' tops near the top, and room for a few rows below; a margin
    // that lets its clip's square (the original's) hold six crossings
    minSide: 400,
    pad: 12,
    anchor: "top",
    room: 100,
    start: (s) => ({
      ...s,
      seq: [
        [1, 2],
        [0, 1],
        [2, 3],
      ],
    }),
  },
  "card-piles": {
    name: "card piles",
    Component: CardPiles,
    variants: cardPilesVariants,
    minSide: 300,
  },
  "face-creator": {
    name: "face",
    Component: Face,
    variants: faceVariants,
    minSide: 260,
  },
  "sprouting-tree": {
    name: "sprouting tree",
    Component: SproutingTree,
    variants: sproutingVariants,
    // A seedling near the top of a square with room for a couple of dozen
    // nodes, so pulling leaves down fills it out (as in Josh's original clip,
    // a little closer)
    minSide: 630,
    // leaves are 50 apart, so this many across a phone-wide card makes their
    // grab circles about a fingertip
    touchSide: 420,
    anchor: "top",
    room: 150,
    start: () => ({
      root: {
        id: "p0",
        children: [
          { id: "p1", children: [] },
          { id: "p2", children: [] },
        ],
      },
    }),
  },
  tromino: {
    name: "trominoes",
    Component: Tromino,
    variants: trominoVariants,
    minSide: 320,
    pad: 4,
    revive: (s) => ({
      ...s,
      missingSquare: Vec2(s.missingSquare.x, s.missingSquare.y),
    }),
  },
};

// # The page's theme, for the themed page copies

// The main page's: four colors, each demo in its first variant
let page: { scheme: Scheme; variants: Record<string, string> } = {
  scheme: "four",
  variants: {},
};

/** Set by main.tsx, on a themed page copy, from the page (its data-theme) and its address (?<demo id>=<variant>) */
export function setPageTheme(scheme: Scheme, variants: Record<string, string>) {
  page = { scheme, variants };
}

type Square = { x: number; y: number; side: number };

function frame(
  b: DOMRect,
  card: CardDemo,
  current: Square | null,
  minSide: number,
): Square {
  const pad = card.pad ?? 16;
  const top = card.anchor === "top";
  const below = top ? Math.max(pad, card.room ?? 0) : pad;
  const side = Math.max(minSide, b.width + 2 * pad, b.height + pad + below);
  if (
    current &&
    b.x - pad >= current.x &&
    b.y - pad >= current.y &&
    b.x + b.width + pad <= current.x + current.side &&
    b.y + b.height + pad <= current.y + current.side &&
    current.side <= side * 1.25
  )
    return current;
  const cx = b.x + b.width / 2;
  if (top) return { x: cx - side / 2, y: b.y - pad, side };
  const cy = b.y + b.height / 2;
  return { x: cx - side / 2, y: cy - side / 2, side };
}

class Fallback extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("live demo card failed; showing its clip", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * A demo, live, in a `size`-px square, in `scheme` and `variant` (by
 * default, the page's). Presses inside it work the demo and go no further.
 */
export const LiveDemo = memo(function LiveDemo({
  id,
  size,
  fallback = null,
  scheme = page.scheme,
  variant,
  initial,
  onChange,
  onDrag,
  touch = false,
}: {
  id: string;
  size: number;
  fallback?: ReactNode;
  scheme?: Scheme;
  variant?: string;
  /** Where to start instead: a state and the square it was shown in (say,
   * where a clip of the demo had got to when the reader took over) */
  initial?: { state: any; view: Square | null };
  /** Told each state dropped into, and the square the card shows */
  onChange?: (state: any, view: Square | null) => void;
  /** Told, through a drag, each state it would drop into */
  onDrag?: (state: any) => void;
  /** For fingers: framed closer where the card asks for that */
  touch?: boolean;
}) {
  const card = CARD_DEMOS[id];
  const v =
    variant ??
    (scheme === page.scheme ? page.variants[id] : undefined) ??
    card.variants[scheme][0].key;
  const [state, setState] = useState<any>(() =>
    initial?.state
      ? card.revive
        ? card.revive(initial.state)
        : initial.state
      : null,
  );
  const [view, setView] = useState<Square | null>(initial?.view ?? null);
  const svgHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state || view) onChange?.(state, view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, view]);

  useEffect(() => {
    const measure = () => {
      const svg = svgHost.current?.querySelector("svg");
      if (!svg) return;
      const b = svg.getBBox();
      if (b.width === 0 && b.height === 0) return;
      setView((cur) =>
        frame(b, card, cur, (touch && card.touchSide) || card.minSide),
      );
    };
    const t = setTimeout(measure, view ? 450 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, card]);

  const embed = useCallback(
    (m: Mounted) => {
      const shown =
        state ?? (card.start ? card.start(m.initialState) : m.initialState);
      const sq = view ?? { x: 0, y: 0, side: Math.max(m.width, m.height) };
      const s = size / sq.side;
      return (
        <div
          ref={svgHost}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: m.width,
            height: m.height,
            transform: `scale(${s}) translate(${-sq.x}px, ${-sq.y}px)`,
            transformOrigin: "0 0",
            transition: view ? "transform 0.5s ease" : undefined,
            visibility: view ? "visible" : "hidden",
          }}
        >
          <DraggableRenderer
            draggable={m.draggable}
            state={shown}
            onDropState={setState}
            onDragState={onDrag}
            width={m.width}
            height={m.height}
          />
        </div>
      );
    },
    [card, size, state, view, onDrag],
  );

  return (
    <Fallback fallback={fallback}>
      <div
        className="live"
        style={{
          position: "relative",
          width: size,
          height: size,
          overflow: "hidden",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div style={{ visibility: "hidden", height: 0, overflow: "hidden" }}>
          <DemoThemeContext.Provider
            value={{ scheme, variant: v, look: DEFAULT_LOOK }}
          >
            <EmbedContext.Provider value={embed}>
              <card.Component />
            </EmbedContext.Provider>
          </DemoThemeContext.Provider>
        </div>
      </div>
    </Fallback>
  );
});
