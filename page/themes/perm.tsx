// Themed copy of ../perm.tsx: the permutation lab, laid out as the talk
// laid it out (src/demos/permutation-lab-talk.tsx), drawn by the themed
// lab (./permutation-lab.tsx) in the look it's given, and played by the
// ghost hand until the reader takes over. What to do is a red tag on
// hover, like Figure 1's: "click to take over" while the ghost plays,
// "your turn / drag anything" once it's theirs, both over the figure's
// lower right corner, where they hide nothing. Mounted by main.tsx and
// ../perm.tsx.
//
// For a phone, there's also a tall layout (below the talk's), every
// handle in it big enough for a finger; it's the reader's from the start,
// with no ghost and no tags.

import { DraggableRenderer, type DragStatus, translate, Vec2 } from "dragology";
import {
  Component,
  Fragment,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { DemoDraggable, type Embed, EmbedContext } from "../demo-ui-shim";
import {
  autoplay,
  chance,
  Cursor,
  type Gesture,
  GhostHand,
  pick,
  pickWeighted,
  rand,
  type Run,
} from "../ghost-hand";
import { GRAY, type Look } from "./palette";
import {
  INITIAL_PERMS,
  INITIAL_VIEW,
  permutationLab,
  type State,
  wordFromPerm,
} from "./permutation-lab";

// # The talk's layout (permutation-lab-talk.tsx's)

const W = 960;
const H = 540;

function heading(
  text: string,
  pos: Vec2,
  anchor: "start" | "middle" = "start",
  fontSize = 13,
) {
  return (
    <text
      transform={translate(pos)}
      textAnchor={anchor}
      fontSize={fontSize}
      fontWeight={600}
      fill={GRAY.g5}
      fontFamily="system-ui, sans-serif"
      letterSpacing={1}
    >
      {text.toUpperCase()}
    </text>
  );
}

const talkDraggable = (look: Look) =>
  permutationLab(
    {
      width: W,
      height: H,
      twoLine: { origin: Vec2(42, 52), ts: 48 },
      cycle: { origin: Vec2(16, 266), scale: 1.35 },
      matrix: { origin: Vec2(310, 52), cs: 32 },
      ph: { center: Vec2(722, 282), r: 236, marks: 1.6 },
      word: { origin: Vec2(236, 276), fontSize: 26, maxWidth: 205 },
      stats: null,
      wiring: {
        origin: Vec2(52, 384),
        width: 412,
        rs: 42,
        scale: 1.4,
        minCols: 10,
      },
      annotations: ({ wiringFull }) => (
        <g>
          {heading("two-line notation", Vec2(16, 24))}
          {heading("permutation matrix", Vec2(300, 24))}
          {heading("cycle diagram", Vec2(16, 202))}
          {heading(
            wiringFull ? "wiring diagram (full)" : "wiring diagram",
            Vec2(16, 352),
          )}
          {heading("permutohedron", Vec2(722, 24), "middle")}
        </g>
      ),
    },
    look,
  );

// # The phone's layout
//
// A phone's column wide (348 at a 390px-wide phone, which draws it at its
// own size) and a little more than its screen tall. Down the left, the
// two-line notation, the matrix, the cycle diagram and the word; down the
// right, the wiring diagram, turned to run down the page, so its wires
// leave the top row's order for the bottom row's as the two-line
// notation's rows do; and the permutohedron across the whole width below.
// Everything you grab spans at least TOUCH (Apple's smallest target),
// with invisible hit areas where its drawing is smaller.

const PW = 348;
const PH = 786;
const TOUCH = 44;
/** The left column's left edge, and its width (the widest the cycle
 * diagram gets, 2 + 1 + 1, at its scale) */
const LX = 9;
const LW = 176;
/** The right column's left edge */
const RX = 197;

const phoneDraggable = (look: Look) =>
  permutationLab(
    {
      width: PW,
      height: PH,
      touch: TOUCH,
      twoLine: { origin: Vec2(LX + 13, 36), ts: 34 },
      matrix: { origin: Vec2(LX + 17, 172), cs: 39 },
      cycle: { origin: Vec2(LX, 404), scale: 1.15, centerIn: LW },
      word: { origin: Vec2(LX, 476), fontSize: 16, maxWidth: LW - 30 },
      stats: null,
      // 36 apart, the strands' ends fill the right column, which is as
      // tall as the left
      wiring: {
        origin: Vec2(RX + 18, 68),
        width: 365,
        rs: 36,
        scale: 1.2,
        minCols: 10,
        vertical: true,
      },
      ph: { center: Vec2(PW / 2, 640), r: 136, marks: 1.5 },
      annotations: ({ wiringFull }) => (
        <g>
          {heading("two-line notation", Vec2(LX, 21), "start", 12)}
          {heading("permutation matrix", Vec2(LX, 142), "start", 12)}
          {heading("cycle diagram", Vec2(LX, 354), "start", 12)}
          {heading(
            wiringFull ? "wiring (full)" : "wiring diagram",
            Vec2(RX, 21),
            "start",
            12,
          )}
          {/* (beside the top of the solid, which is round enough to leave
            the corner) */}
          {heading("permutohedron", Vec2(LX, 507), "start", 12)}
        </g>
      ),
    },
    look,
  );

const LAYOUTS = {
  talk: { width: W, height: H, draggable: talkDraggable },
  phone: { width: PW, height: PH, draggable: phoneDraggable },
};

export type PermLayout = keyof typeof LAYOUTS;

/** A layout's canvas, in its own units */
export function permCanvas(layout: PermLayout) {
  const { width, height } = LAYOUTS[layout];
  return { width, height };
}

const initialState: State = {
  n: 4,
  word: wordFromPerm(INITIAL_PERMS[4]),
  mode: "adjacent",
  phStyle: "solid",
  view: INITIAL_VIEW,
};

function PermutationLab({
  look,
  layout,
  initial = initialState,
}: {
  look: Look;
  layout: PermLayout;
  initial?: State;
}) {
  const { width, height, draggable: make } = LAYOUTS[layout];
  const draggable = useMemo(() => make(look), [make, look]);
  return (
    <DemoDraggable
      draggable={draggable}
      initialState={initial}
      width={width}
      height={height}
    />
  );
}

/** The talk layout's word holds at most this many letters (its wiring
 * diagram has 10 columns and keeps one spare). */
const CAP = 9;

// # The ghost

class Ghost extends GhostHand {
  private lastKind = "";

  constructor(
    private stage: HTMLElement,
    cursor: HTMLElement,
    private scale: () => number,
  ) {
    super(Vec2(W * 0.62, H * 0.86), cursor);
  }

  private get svg() {
    return this.stage.querySelector("svg")!;
  }

  protected client(p: Vec2) {
    const r = this.svg.getBoundingClientRect();
    return {
      clientX: r.left + (p.x * r.width) / W,
      clientY: r.top + (p.y * r.height) / H,
    };
  }

  protected place(p: Vec2) {
    return p.mul(this.scale());
  }

  protected owns(el: Element) {
    return this.svg.contains(el);
  }

  protected clamp(p: Vec2) {
    return Vec2(
      Math.min(W - 6, Math.max(6, p.x)),
      Math.min(H - 6, Math.max(6, p.y)),
    );
  }

  protected async loop(run: Run) {
    await this.sleep(run, rand(500, 900));
    for (;;) {
      const [kind, gesture] = this.nextGesture();
      this.lastKind = kind;
      await gesture(run);
      await this.sleep(run, chance(0.15) ? rand(1800, 2600) : rand(450, 1300));
    }
  }

  // ## Reading the drawing

  private el(id: string) {
    return this.svg.querySelector<SVGGraphicsElement>(`[id="${id}"]`);
  }

  private els(prefix: string) {
    return [
      ...this.svg.querySelectorAll<SVGGraphicsElement>(`[id^="${prefix}"]`),
    ];
  }

  /** Center of an element's box, in canvas coordinates */
  private center(el: SVGGraphicsElement) {
    const b = el.getBBox();
    const p = new DOMPoint(
      b.x + b.width / 2,
      b.y + b.height / 2,
    ).matrixTransform(el.getCTM()!);
    return Vec2(p.x, p.y);
  }

  private lineEnds(line: SVGLineElement): [Vec2, Vec2] {
    const m = line.getCTM()!;
    const a = new DOMPoint(
      line.x1.baseVal.value,
      line.y1.baseVal.value,
    ).matrixTransform(m);
    const b = new DOMPoint(
      line.x2.baseVal.value,
      line.y2.baseVal.value,
    ).matrixTransform(m);
    return [Vec2(a.x, a.y), Vec2(b.x, b.y)];
  }

  private wordLength() {
    return this.els("word-letter-").length;
  }

  private canAppend(k: number) {
    return this.wordLength() + k <= CAP;
  }

  /** Somewhere on `el` a hand might grab: near the middle, not dead on it */
  private grabPoint(el: SVGGraphicsElement, spread = 0.22) {
    const b = el.getBBox();
    return this.center(el).add(
      Vec2(rand(-spread, spread) * b.width, rand(-spread, spread) * b.height),
    );
  }

  // ## Gestures

  private nextGesture(): [string, Gesture] {
    const gestures: [string, Gesture | null, number][] = [
      ["tile", this.tileSwap(), 3],
      ["token", this.tokenWalk(), 2.2],
      ["walk", this.walkRewrite(), 3],
      ["matrix", this.matrixSwap(), 1.6],
      ["spin", this.faceSpin(), 1.2],
      ["cycle", this.cycleMove(), 0.9],
      ["wire", this.wireEnd(), 0.9],
      ["look", this.lookAround(), 0.5],
    ];
    // Near capacity, nothing can append; favor what shortens the word.
    const full = !this.canAppend(2);
    const options = gestures
      .filter(([, g]) => g)
      .map(([kind, g, w]): [[string, Gesture], number] => [
        [kind, g!],
        w *
          (kind === this.lastKind ? 0.15 : 1) *
          (full && ["walk", "matrix", "cycle"].includes(kind) ? 4 : 1),
      ]);
    return pickWeighted(options) ?? ["look", this.lookAround()!];
  }

  /** A tile in the two-line notation's bottom row, one or two places over */
  private tileSwap(): Gesture | null {
    if (!this.canAppend(1)) return null;
    const tiles = this.els("tl-tile-").sort(
      (a, b) => this.center(a).x - this.center(b).x,
    );
    if (tiles.length < 2) return null;
    const i = Math.floor(Math.random() * tiles.length);
    const k = chance(0.25) && this.canAppend(2) ? 2 : 1;
    const dirs = [-1, 1].filter((d) => tiles[i + d * k]);
    if (dirs.length === 0) return null;
    const d = pick(dirs);
    return (run) => {
      const grab = this.grabPoint(tiles[i]);
      const to = this.center(tiles[i + d * k]).add(
        grab.sub(this.center(tiles[i])),
      );
      return this.drag(run, tiles[i], grab, [to.add(Vec2(0, rand(-5, 3)))]);
    };
  }

  /** The token along one or two edges of the permutohedron */
  private tokenWalk(): Gesture | null {
    const token = this.el("ph-token");
    const edgeGroup = this.el("ph-edges-front");
    if (!token || !edgeGroup || !this.canAppend(1)) return null;
    const edges = [...edgeGroup.querySelectorAll("line")].map((l) =>
      this.lineEnds(l),
    );
    const neighbors = (p: Vec2) =>
      edges.flatMap(([a, b]) =>
        a.dist(p) < 3 ? [b] : b.dist(p) < 3 ? [a] : [],
      );
    const start = this.center(token);
    const first = neighbors(start);
    if (first.length === 0) return null;
    const v1 = pick(first);
    const path = [v1];
    if (chance(0.4) && this.canAppend(2)) {
      const onward = neighbors(v1).filter((v) => v.dist(start) > 3);
      if (onward.length) path.push(pick(onward));
    }
    return (run) =>
      this.drag(run, token, start.add(Vec2(rand(-3, 3), rand(-3, 3))), path, {
        slow: 1.4,
        bend: 0.06,
      });
  }

  /** Push the walk across a face of the permutohedron: turn a square's
   * corner, swing a hexagon's middle edge across, or fold a spur back. */
  private walkRewrite(): Gesture | null {
    const segments = this.els("ph-walk-")
      .map((l) => ({
        k: parseInt(l.id.slice("ph-walk-".length)),
        l: l as unknown as SVGLineElement,
      }))
      .sort((a, b) => a.k - b.k)
      .filter(({ l }) => l.getAttribute("opacity") !== "0")
      .map(({ l }) => this.lineEnds(l))
      .filter(([a, b]) => a.dist(b) > 1);
    if (segments.length < 2) return null;
    const V = [segments[0][0], ...segments.map(([, b]) => b)];
    for (let k = 1; k < segments.length; k++)
      if (segments[k][0].dist(segments[k - 1][1]) > 2) return null;

    const moves: { el: SVGGraphicsElement; to: Vec2 }[] = [];
    for (const el of this.els("ph-v-")) {
      const j = parseInt(el.id.slice("ph-v-".length));
      const at = this.center(el);
      if (!(j >= 1 && j + 1 < V.length) || V[j].dist(at) > 2) continue;
      const spur = V[j + 1].dist(V[j - 1]) < 2;
      moves.push({
        el,
        to: spur ? V[j - 1] : V[j - 1].add(V[j + 1]).sub(V[j]),
      });
    }
    for (const el of this.els("ph-edge-")) {
      const m = parseInt(el.id.slice("ph-edge-".length));
      if (!(m >= 1 && m + 2 < V.length)) continue;
      moves.push({ el, to: V[m - 1].add(V[m + 2]).sub(this.center(el)) });
    }
    if (moves.length === 0) return null;
    const { el, to } = pick(moves);
    return (run) => {
      const grab = this.center(el).add(Vec2(rand(-2, 2), rand(-2, 2)));
      return this.drag(
        run,
        el,
        grab,
        [to.add(Vec2(rand(-3, 3), rand(-3, 3)))],
        { slow: 1.5, bend: 0.1 },
      );
    };
  }

  /** A dot of the permutation matrix up or down to another row */
  private matrixSwap(): Gesture | null {
    const dots = this.els("mat-dot-");
    if (dots.length < 2) return null;
    const dot = pick(dots);
    const c = this.center(dot);
    const rows = dots
      .map((d) => this.center(d).y)
      .filter((y) => Math.abs(y - c.y) > 4);
    const y = pick(rows);
    return (run) => {
      const grab = this.grabPoint(dot, 0.12);
      return this.drag(
        run,
        dot,
        grab,
        [Vec2(grab.x + rand(-6, 6), y + rand(-4, 4))],
        { slow: 1.35, bend: 0.05 },
      );
    };
  }

  /** Turn the solid by dragging a face around */
  private faceSpin(): Gesture | null {
    const solid = this.el("ph-solid");
    if (!solid) return null;
    const mid = this.center(solid);
    const faces = this.els("ph-face-").filter((f) => {
      const shape = f.querySelector("path");
      return (
        shape?.getAttribute("fill-opacity") === "0.72" &&
        this.center(f).dist(mid) < 150
      );
    });
    if (faces.length === 0) return null;
    const face = pick(faces);
    return (run) => {
      const grab = this.grabPoint(face, 0.15);
      const heading = rand(0, 360);
      const out = grab.add(Vec2.polarDeg(rand(90, 160), heading));
      const path = [out];
      // sometimes it turns it back part of the way, having a second look
      if (chance(0.4))
        path.push(
          out
            .lerp(grab, rand(0.35, 0.8))
            .add(Vec2.polarDeg(rand(10, 30), heading + 90)),
        );
      return this.drag(run, face, grab, path, { slow: 1.9, bend: 0.32 });
    };
  }

  /** A node of the cycle diagram into another cycle, or out on its own */
  private cycleMove(): Gesture | null {
    const nodes = this.els("cyc-node-");
    if (nodes.length < 2) return null;
    const node = pick(nodes);
    const c = this.center(node);
    const others = nodes.filter((n) => n !== node).map((n) => this.center(n));
    const rightmost = Math.max(...nodes.map((n) => this.center(n).x));
    const spots = [
      ...others.map((p) => p.add(p.sub(c).norm().mul(-16))),
      Vec2(Math.min(rightmost + 60, 260), c.y),
    ];
    const to = pick(spots);
    return (run) =>
      this.drag(run, node, this.grabPoint(node, 0.15), [to], {
        slow: 1.3,
        bend: 0.2,
      });
  }

  /** A strand's end label in the wiring diagram past its neighbor */
  private wireEnd(): Gesture | null {
    if (!this.canAppend(1)) return null;
    const ends = this.els("wire-end-").sort(
      (a, b) => this.center(a).y - this.center(b).y,
    );
    if (ends.length < 2) return null;
    const i = Math.floor(Math.random() * ends.length);
    const d = pick([-1, 1].filter((d) => ends[i + d]));
    const c = this.center(ends[i]);
    const y = this.center(ends[i + d]).y;
    return (run) =>
      this.drag(
        run,
        ends[i],
        c.add(Vec2(rand(-3, 3), rand(-3, 3))),
        [Vec2(c.x + rand(-4, 4), y + rand(-3, 3))],
        { slow: 1.3, bend: 0.05 },
      );
  }

  /** Just look: drift over to some part of the figure and rest there */
  private lookAround(): Gesture | null {
    return async (run) => {
      const spots = [
        Vec2(140, 120),
        Vec2(380, 130),
        Vec2(250, 450),
        Vec2(722, 282),
        Vec2(120, 290),
      ];
      await this.reach(
        run,
        pick(spots).add(Vec2(rand(-40, 40), rand(-30, 30))),
        { overshoot: 0.1 },
      );
      await this.sleep(run, rand(400, 900));
    };
  }
}

/**
 * If drawing the lab ever throws (the renderer rethrows a failed drag's
 * error while drawing), starts it over from the beginning: without this,
 * React would unmount the whole root and leave a blank where the figure
 * was. A few times at most, in case it throws from the start.
 */
class StartOver extends Component<
  { children: ReactNode },
  { tries: number; failed: boolean }
> {
  state = { tries: 0, failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
    this.setState(({ tries }) => ({ tries: tries + 1, failed: false }));
  }

  render() {
    if (this.state.failed || this.state.tries > 3) return null;
    return <Fragment key={this.state.tries}>{this.props.children}</Fragment>;
  }
}

// # The page's figure

export function PermLive({
  look,
  ghost = true,
  layout = "talk",
  initial,
  onDragState,
  onDropState,
}: {
  look: Look;
  /** Played by the ghost hand until the reader takes over; without it,
   * left to whoever's pointer it is from the start */
  ghost?: boolean;
  /** The talk's 16:9 layout, or the phone's tall one. The ghost knows
   * only the talk's, so the phone's has none; and with no ghost to take
   * over from, there are no tags. */
  layout?: PermLayout;
  /** Where it starts (by default, where the talk's does) */
  initial?: State;
  /** Told, through a drag, the state it would drop into, and then the
   * state it's dropped into (the clips' recordings log them) */
  onDragState?: (state: State) => void;
  onDropState?: (state: State) => void;
}) {
  const { width, height } = LAYOUTS[layout];
  const talk = layout === "talk";
  const ghosted = ghost && talk;
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const onIdleRef = useRef<() => void>(() => {});

  // The talk version mounts DemoDraggable with its draggable; draw that
  // here, keeping track of whether a drag is going on.
  const embed: Embed = (m) => (
    <DraggableRenderer
      draggable={m.draggable}
      initialState={m.initialState}
      width={m.width}
      height={m.height}
      onDragState={onDragState as (s: object) => void}
      onDropState={onDropState as (s: object) => void}
      onDragStatus={(s: DragStatus<object>) => {
        const dragging =
          s.type === "dragging" || (s.type === "idle" && !!s.pendingDrag);
        if (draggingRef.current && !dragging) onIdleRef.current();
        draggingRef.current = dragging;
      }}
    />
  );

  useEffect(() => {
    const box = boxRef.current!;
    const stage = stageRef.current!;
    let scale = 1;
    const ro = new ResizeObserver(() => {
      scale = box.clientWidth / width;
      stage.style.transform = `scale(${scale})`;
    });
    ro.observe(box);
    if (!ghosted) return () => ro.disconnect();

    const hand = new Ghost(stage, cursorRef.current!, () => scale);
    const play = autoplay(box, hand, { dragging: () => draggingRef.current });
    onIdleRef.current = play.dragEnded;

    return () => {
      play.cleanup();
      ro.disconnect();
    };
  }, [ghosted, width]);

  return (
    // the tags sit outside .perm-live, which clips, so they can hang over its corner
    <div
      className="perm-wrap"
      // (the phone's layout drawn much bigger than a phone's column, as
      // on a phone turned sideways, would be too tall to use)
      style={talk ? undefined : { maxWidth: width * 1.3, marginInline: "auto" }}
    >
      <div
        ref={boxRef}
        className="perm-live"
        // (the canvas's own shape inside the frame, as a clip of it has)
        style={
          talk
            ? undefined
            : { aspectRatio: `${width} / ${height}`, boxSizing: "content-box" }
        }
      >
        <div ref={stageRef} className="perm-stage" style={{ width, height }}>
          <EmbedContext.Provider value={embed}>
            <StartOver>
              <PermutationLab look={look} layout={layout} initial={initial} />
            </StartOver>
          </EmbedContext.Provider>
        </div>
        {talk && (
          <div ref={cursorRef} className="perm-ghost" aria-hidden="true">
            <Cursor />
          </div>
        )}
      </div>
      {ghosted && (
        <span className="live-tag tag-ghost" aria-hidden="true">
          click to take over
        </span>
      )}
      {ghosted && (
        <span className="live-tag tag-yours" aria-hidden="true">
          your turn
          <br />
          drag anything
        </span>
      )}
    </div>
  );
}
