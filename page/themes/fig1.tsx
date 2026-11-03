// Figure 1 of the paper ("How it works"), live. The paper's figure walks
// through one drag of tile A in five frozen stages: (1) a render function
// maps the model state to a view, (2) when a drag starts the possible target
// states are computed, (3) each is rendered speculatively, (4) where the
// dragged tile lands in each rendering becomes a drop zone, and (5) those
// drive the animated interaction.
//
// Live, it's laid out for dragging instead: one big live view (1 and 5)
// with the model beside it, and the target states of the tile in hand, each
// as its state (code), rendered to a view, and joined to the drop zone that
// view makes on the big one while a drag is on. A small modifier (`publish`)
// reports each frame of a drag (pointer, drop zones, chosen target) to a
// store the rest of the figure reads. On a phone it's laid out top to bottom
// instead, the live view last, where the finger on it covers nothing that
// moves (`ConceptFigurePhone`, under "The phone's layout").
//
// Themed copy of ../fig1.tsx for the color-theme review: its tiles are
// THE tiles (the permutation lab's too), drawn from palette.ts in the
// look it's given; the paper's magenta (the dragged tile, its drop zones,
// its links) becomes the page's red, the interaction color; the render
// arrows, which were dark red, are black; and in the code, each tile's
// string is in that tile's color. Mounted by ../fig1.tsx and main.tsx.

import {
  type DragFrame,
  type Draggable,
  DraggableRenderer,
  type DragInitContext,
  type DragSpecBuilder,
  type DragSpecData,
  getElementPositionCheap,
  Modifier,
  modifier,
  type OpResult,
  type Svgx,
  translate,
  Vec2,
} from "dragology";
import {
  Fragment,
  type ReactNode,
  type SVGProps,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  GRAY,
  type Look,
  INK as PAGE_INK,
  RED as PAGE_RED,
  tile,
} from "./palette";

// # Model

type State = { rows: string[][] };

const START: State = {
  rows: [
    ["A", "B"],
    ["C", "D"],
  ],
};

/** The most tiles a row holds, so the figure's boxes have room for any state */
const ROW_MAX = 3;

/**
 * Which side of the live view the targets are on, and so where their links
 * come from: below it (the desktop layout), or above it (the phone's).
 */
type Side = "below" | "above";

/** The view's row nearer the targets; the other is the far row */
const nearRow = (side: Side) => (side === "below" ? 1 : 0);

/**
 * Every state dragging `id` can lead to: out of its row, into any slot of
 * either row with room (its own slot included). From the paper's start
 * there are five, as in the paper.
 *
 * Ordered by `lane`, so the figure's links from each to its drop zone
 * don't cross.
 */
function targetsFor(state: State, id: string, side: Side): State[] {
  const without = state.rows.map((r) => r.filter((t) => t !== id));
  const out: State[] = [];
  without.forEach((row, r) => {
    if (row.length >= ROW_MAX) return;
    for (let i = 0; i <= row.length; i++) {
      const rows = without.map((x) => x.slice());
      rows[r].splice(i, 0, id);
      out.push({ rows });
    }
  });
  return out.sort((a, b) => lane(id, a, side) - lane(id, b, side));
}

/**
 * Where a target's link comes into its zone: straight in, for the near
 * row; around the left, for the far row's first slot; around the right,
 * for its last; and otherwise through the gap right of the zone in front
 * of it (on the near row).
 */
type LinkEnd = "near" | "first" | "last" | "gap";

function linkEnd(id: string, target: State, side: Side): LinkEnd {
  const far = target.rows[1 - nearRow(side)];
  const i = far.indexOf(id);
  if (i < 0) return "near";
  if (i === 0) return "first";
  return i === far.length - 1 ? "last" : "gap";
}

/**
 * Where a target's link comes past the near row, in slots from the left:
 * so ordering the targets by it, their links don't cross.
 */
function lane(id: string, target: State, side: Side): number {
  const end = linkEnd(id, target, side);
  if (end === "near") return target.rows[nearRow(side)].indexOf(id);
  return end === "first"
    ? -1
    : end === "last"
      ? Infinity
      : target.rows[1 - nearRow(side)].indexOf(id) + 0.5;
}

/** Whether a target's zone, on the far row, has another target's zone in front of it */
function behind(
  id: string,
  target: State,
  targets: State[],
  side: Side,
): boolean {
  const far = target.rows[1 - nearRow(side)].indexOf(id);
  return (
    far >= 0 && targets.some((u) => u.rows[nearRow(side)].indexOf(id) === far)
  );
}

// # Look: the paper figure's

const FONT = `"Open Sans", system-ui, sans-serif`;
const UI = `system-ui, -apple-system, "Segoe UI", sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
const INK = PAGE_INK;
const RED = PAGE_INK; // the render arrows, and "render"
const MAGENTA = PAGE_RED; // the dragged element, and its drop zones
const PANEL_STROKE = GRAY.g3;

/** Tile ids are always A–D; what they're called and colored is the look's */
const tileOf = (look: Look, id: string) => tile(look, "ABCD".indexOf(id));

// # The view's layout, in "view units"

const T = 44; // tile
const GAP = 6; // between tiles
const PAD = 6; // around a row's tiles
const ROW_GAP = 10;
const EDGE = 8; // around the rows
const ROW_H = T + 2 * PAD;
/** The live views' canvas: room for a full row, and two rows */
const VIEW_W = 2 * EDGE + rowWidth(ROW_MAX);
const VIEW_H = 2 * EDGE + 2 * ROW_H + ROW_GAP;

function rowWidth(n: number) {
  return 2 * PAD + Math.max(n, 1) * T + Math.max(n - 1, 0) * GAP;
}

function rowY(r: number) {
  return EDGE + r * (ROW_H + ROW_GAP);
}

/** Top-left corner of each tile */
function tilePositions(state: State): Map<string, Vec2> {
  const pos = new Map<string, Vec2>();
  state.rows.forEach((row, r) =>
    row.forEach((id, i) =>
      pos.set(id, Vec2(EDGE + PAD + i * (T + GAP), rowY(r) + PAD)),
    ),
  );
  return pos;
}

// # The render function

type DrawOptions = {
  /**
   * Makes tiles draggable: for the live views. `enter` and `leave` are told
   * of the pointer entering and leaving a tile, `pick` of a click on one.
   */
  live?: {
    d: DragSpecBuilder<State>;
    draggedId: string | null;
    drag: DragOf;
    enter?: (id: string) => void;
    leave?: () => void;
    pick?: (id: string) => void;
  };
  /** Draws the paper's dashed magenta ring around this tile */
  outline?: string | null;
  /** The ring's line, thicker for a view drawn small */
  ring?: number;
  look: Look;
};

type DragOf = (
  d: DragSpecBuilder<State>,
  state: State,
  id: string,
) => ReturnType<DragSpecBuilder<State>["closest"]>;

/**
 * The view of a state. Rows and tiles are drawn side by side (not nested),
 * each at its spot on the canvas, so a tile changing rows is just a tile
 * moving.
 */
function drawView(state: State, o: DrawOptions): Svgx {
  const live = o.live;
  // Inside a draggable, elements are told apart by id (React keys are an
  // error there); everywhere else, by key.
  const ident = (id: string) => (live ? { id } : { key: id });

  const rows = state.rows.map((row, r) => (
    <rect
      {...ident(`row-${r}`)}
      {...(live ? { dragologyZIndex: -1 } : {})}
      x={EDGE}
      y={rowY(r)}
      width={rowWidth(row.length)}
      height={ROW_H}
      rx={7}
      fill={GRAY.g0}
      stroke={GRAY.g2}
      strokeWidth={1.2}
      strokeDasharray={row.length === 0 ? "4 4" : undefined}
    />
  ));

  const tiles = [...tilePositions(state)].map(([id, p]) => {
    if (!live)
      return (
        <g {...ident(id)} transform={translate(p)}>
          {tileArt(o.look, id, o.outline === id, false, o.ring)}
        </g>
      );
    // the tile being dragged is raised, and shadowed
    const raised = live.draggedId === id;
    return (
      <g
        id={id}
        transform={translate(p)}
        dragologyZIndex={raised ? "/1" : false}
        dragologyOnDrag={() => live.drag(live.d, state, id)}
        onPointerEnter={live.enter && (() => live.enter!(id))}
        onPointerLeave={live.leave}
        onClick={live.pick && (() => live.pick!(id))}
        style={{ cursor: live.draggedId === id ? "grabbing" : "grab" }}
      >
        {tileArt(o.look, id, false, raised)}
      </g>
    );
  });

  return (
    <g>
      {rows}
      {tiles}
    </g>
  );
}

function tileArt(
  look: Look,
  id: string,
  outline = false,
  lifted = false,
  ring = 1,
): Svgx {
  const t = tileOf(look, id);
  const c = t.style;
  return (
    <g>
      {/* always drawn, so a tile has the same parts lifted or not */}
      <rect
        x={1}
        y={4}
        width={T}
        height={T}
        rx={7}
        fill="rgba(0,0,0,0.24)"
        filter="url(#fig1-tile-shadow)"
        opacity={lifted ? 1 : 0}
      />
      <rect
        width={T}
        height={T}
        rx={7}
        fill={c.fill}
        stroke={c.stroke}
        strokeWidth={1.5}
      />
      <text
        x={T / 2}
        y={T / 2 + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={UI}
        fontWeight={600}
        fontSize={19}
        fill={c.text}
        style={{ pointerEvents: "none" }}
      >
        {t.name}
      </text>
      {outline && (
        <rect
          x={-4}
          y={-4}
          width={T + 8}
          height={T + 8}
          rx={10}
          fill="none"
          stroke={MAGENTA}
          strokeWidth={1.8 * ring}
          strokeDasharray={`${3 * ring} ${3 * ring}`}
        />
      )}
    </g>
  );
}

// # The drag, and what it reports

/**
 * Passes the drag through untouched, and tells the figure's store what it's
 * doing each frame: where the pointer is, where the grabbed point of the
 * tile lands in each target state (the drop zones), and which target the
 * drag would drop into.
 */
class Publish extends Modifier<State> {
  readonly name = "publish";
  readonly zones: Vec2[];

  constructor(
    ctx: DragInitContext<State>,
    inner: DragSpecData<State>,
    readonly store: FigStore,
    readonly targets: State[],
  ) {
    super(ctx, inner);
    this.zones = targets.map(
      (s) => getElementPositionCheap(ctx, s) ?? Vec2(0, 0),
    );
  }

  frame(frame: DragFrame): OpResult<State> {
    const result = this.inner.run(frame);
    const i = this.targets.indexOf(result.dropState);
    this.store.set({
      phase: "drag",
      start: this.ctx.startState,
      id: this.ctx.draggedId!,
      targets: this.targets,
      zones: this.zones,
      pointer: frame.pointer,
      anchor: this.ctx.anchorPos,
      nearest: i >= 0 ? i : nearestZone(this.zones, frame.pointer),
    });
    return result;
  }
}
const publish = modifier(Publish);

function nearestZone(zones: Vec2[], p: Vec2) {
  let best = 0;
  zones.forEach((z, i) => {
    if (z.dist(p) < zones[best].dist(p)) best = i;
  });
  return best;
}

// # The store: what the figure is showing

type Snap = {
  /** idle: a drag of `id` as it would start; drag: a drag going on */
  phase: "idle" | "drag";
  /** The state the targets come from */
  start: State;
  /** The tile grabbed (or about to be, or last dropped) */
  id: string;
  targets: State[];
  /** Where the grabbed point of the tile lands in each target */
  zones: Vec2[];
  /** In view units */
  pointer: Vec2;
  /** The grabbed point, from the tile's corner */
  anchor: Vec2;
  nearest: number;
};

/** A drag of `id` from `state` as it would start: grabbed near its lower right corner, as in the paper */
function snapFor(state: State, id: string, side: Side): Snap {
  const targets = targetsFor(state, id, side);
  const anchor = Vec2(T * 0.78, T * 0.76);
  const zones = targets.map((t) => tilePositions(t).get(id)!.add(anchor));
  const pointer = tilePositions(state).get(id)!.add(anchor);
  return {
    phase: "idle",
    start: state,
    id,
    targets,
    zones,
    pointer,
    anchor,
    nearest: nearestZone(zones, pointer),
  };
}

class FigStore {
  private snap: Snap;
  private listeners = new Set<() => void>();
  private queued = false;

  constructor(readonly side: Side) {
    this.snap = snapFor(START, "A", side);
  }

  get = () => this.snap;

  /** At rest, on a drag of `id` from `state` as it would start */
  rest(state: State, id: string) {
    this.set(snapFor(state, id, this.side));
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  set(s: Snap) {
    this.snap = s;
    // Drags report from inside Dragology's frame loop (sometimes from inside
    // its render), so tell the panels a moment later.
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.listeners.forEach((l) => l());
    });
  }
}

// # Code

/** A monospace font's advance, against its size */
const MONO_W = 0.6;

/** The state's code, a line at a time; a row's line knows its tiles */
function codeLines(state: State, look: Look) {
  const str = (t: string) => `“${tileOf(look, t).name}”`;
  return [
    { text: "{ rows: [", row: -1, ids: [] as string[] },
    ...state.rows.map((row, r) => ({
      text: `  [${row.map(str).join(", ")}]${r < state.rows.length - 1 ? "," : ""}`,
      row: r,
      ids: row,
    })),
    { text: "]}", row: -1, ids: [] as string[] },
  ];
}

function codeWidth(state: State, size: number, look: Look) {
  return (
    Math.max(...codeLines(state, look).map((l) => l.text.length)) *
    MONO_W *
    size
  );
}

// # Pieces of the figure

const EASE = "250ms cubic-bezier(.3,.7,.4,1)";

/** How the panels are drawn: their line, highlighted or not, their corners, and their shadow's filter */
type PanelLook = { line: number; hi: number; rx: number; shadow: string };

/** The page's: drawn large and scaled down to the column, so these come out about as fine as the paper's */
const PANEL: PanelLook = { line: 1.5, hi: 2.5, rx: 14, shadow: "fig1-shadow" };

/** A panel: the paper's white box with its soft shadow; its width eases */
function Box({
  x,
  y,
  w,
  h,
  highlight = false,
  look = PANEL,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  highlight?: boolean;
  look?: PanelLook;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={look.rx}
      fill="white"
      stroke={highlight ? MAGENTA : PANEL_STROKE}
      strokeWidth={highlight ? look.hi : look.line}
      filter={`url(#${look.shadow})`}
      style={{ width: w, transition: `width ${EASE}, stroke 150ms` }}
    />
  );
}

/** From inside one box down into the next, as in the paper; `k` scales its line and head */
function RedArrow({
  x,
  y1,
  y2,
  k = 1,
}: {
  x: number;
  y1: number;
  y2: number;
  k?: number;
}) {
  return (
    <g>
      <line
        x1={x}
        y1={y1}
        x2={x}
        y2={y2 - 14 * k}
        stroke={RED}
        strokeWidth={3.2 * k}
      />
      <path
        d={`M ${x - 9 * k} ${y2 - 16 * k} L ${x + 9 * k} ${y2 - 16 * k} L ${x} ${y2} Z`}
        fill={RED}
      />
    </g>
  );
}

/** The state as code, each tile's string in its color. Rows that differ
 * from `compare` are bold, their brackets in magenta. */
function stateCode(
  look: Look,
  state: State,
  x: number,
  y: number,
  size: number,
  lh: number,
  compare?: State,
): Svgx {
  const lines = codeLines(state, look);
  const old = compare && codeLines(compare, look);
  return (
    <text
      fontFamily={MONO}
      fontSize={size}
      fill={INK}
      style={{ whiteSpace: "pre" }}
    >
      {lines.map((l, i) => {
        const changed = !!old && l.row >= 0 && l.text !== old[i]?.text;
        return (
          <tspan
            key={i}
            x={x}
            y={y + i * lh}
            fill={changed ? MAGENTA : INK}
            fontWeight={changed ? 700 : 400}
          >
            {l.row < 0
              ? l.text
              : [
                  "  [",
                  ...l.ids.map((t, k) => (
                    <Fragment key={t}>
                      {k > 0 && ", "}
                      <tspan fill={tileOf(look, t).style.text}>
                        “{tileOf(look, t).name}”
                      </tspan>
                    </Fragment>
                  )),
                  l.text.endsWith(",") ? "]," : "]",
                ]}
          </tspan>
        );
      })}
    </text>
  );
}

/**
 * The whole state as the phone's narrow columns have room for: the same
 * lines as `stateCode`, packed (`{rows:[`, ` [A,B],`, …), the tiles' letters
 * unquoted, each in its color. Rows that differ from `compare` are bold,
 * their brackets in magenta.
 */
function packedCode(
  look: Look,
  state: State,
  x: number,
  y: number,
  size: number,
  lh: number,
  compare?: State,
): Svgx {
  const last = state.rows.length - 1;
  return (
    <text
      fontFamily={MONO}
      fontSize={size}
      fill={INK}
      style={{ whiteSpace: "pre" }}
    >
      <tspan x={x} y={y}>
        {"{rows:["}
      </tspan>
      {state.rows.map((row, r) => {
        const changed = !!compare && row.join() !== compare.rows[r]?.join();
        return (
          <tspan
            key={r}
            x={x}
            y={y + (r + 1) * lh}
            fill={changed ? MAGENTA : INK}
            fontWeight={changed ? 700 : 400}
          >
            {" ["}
            {row.map((t, k) => (
              <Fragment key={t}>
                {k > 0 && ","}
                <tspan fill={tileOf(look, t).style.text}>
                  {tileOf(look, t).name}
                </tspan>
              </Fragment>
            ))}
            {r < last ? "]," : "]"}
          </tspan>
        );
      })}
      <tspan x={x} y={y + (last + 2) * lh}>
        {"]}"}
      </tspan>
    </text>
  );
}

/** `packedCode`'s widest line, in characters */
function packedChars(state: State) {
  const rows = state.rows.map(
    (row, r) => ` [${row.join(",")}]${r < state.rows.length - 1 ? "," : ""}`,
  );
  return Math.max(
    ..."{rows:[ ]}"
      .split(" ")
      .concat(rows)
      .map((l) => l.length),
  );
}

/** A numbered caption: the paper's black disc at (x, y), then its lines */
function Caption({
  n,
  x,
  y,
  lines,
  size = 25,
}: {
  n: number;
  x: number;
  y: number;
  lines: ReactNode[];
  size?: number;
}) {
  return (
    <g fontFamily={FONT} fontSize={size} fill={INK}>
      <circle cx={x} cy={y} r={size * 0.52} fill={INK} />
      <text
        x={x}
        y={y + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontWeight="bold"
        fontStyle="italic"
        fontSize={size * 0.76}
      >
        {n}
      </text>
      {lines.map((l, i) => (
        <text key={i} x={x + size * 1.04} y={y + size * 0.36 + i * size * 1.28}>
          {l}
        </text>
      ))}
    </g>
  );
}

const em = (text: string, color = INK) => (
  <tspan fontWeight="bold" fill={color}>
    {text}
  </tspan>
);

/**
 * The drawn hand (the slideshow's cursor art), open or grabbing, in view
 * units, `size` view units per unit of its 24-unit grid. The grabbing one
 * has the macOS closed hand's three knuckle lines.
 */
function handSvg(at: Vec2, grab = true, size = 1.5): Svgx {
  const shapes = grab ? FIST : OPEN_HAND;
  const hot = grab ? [12.5, 13.5] : [12.3, 12.5];
  return (
    <g
      transform={`${translate(at)} scale(${size}) translate(${-hot[0]}, ${-hot[1]})`}
      style={{ pointerEvents: "none" }}
    >
      <g
        fill={INK}
        stroke={INK}
        strokeWidth={2.3}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {shapes}
      </g>
      <g fill="white">{shapes}</g>
      {grab && (
        <g stroke={INK} strokeWidth={1.35} strokeLinecap="round">
          {[10.9, 13.5, 16.1].map((x) => (
            <line key={x} x1={x} y1={14.6} x2={x} y2={18.6} />
          ))}
        </g>
      )}
    </g>
  );
}

function finger(
  cx: number,
  top: number,
  bottom: number,
  w: number,
  deg: number,
) {
  return (
    <rect
      x={cx - w / 2}
      y={top}
      width={w}
      height={bottom - top}
      rx={w / 2}
      transform={`rotate(${deg} ${cx} ${bottom})`}
    />
  );
}

const OPEN_HAND = (
  <g>
    <path d="M6.6 11.2 C6.6 9.9 7.6 9.4 8.6 9.4 L17.4 9.4 C18.8 9.4 19.6 10.4 19.4 11.8 L18.6 16.8 C18.2 19.4 16.6 21.6 14.2 21.9 L11 21.9 C8.8 21.6 7.4 20 6.8 18 Z" />
    {finger(8.25, 4.1, 13, 2.9, -11)}
    {finger(11.45, 2.3, 12.4, 2.9, -3)}
    {finger(14.65, 3.1, 12.4, 2.9, 5)}
    {finger(17.6, 5.6, 13.2, 2.6, 14)}
    <rect
      x={5.45}
      y={9.3}
      width={3.1}
      height={8.6}
      rx={1.55}
      transform="rotate(-38 7 17.4)"
    />
  </g>
);

const FIST = (
  <g>
    <path d="M6.4 12.6 C6.4 11.1 7.4 10.2 8.8 10.2 L17.6 10.2 C19 10.2 19.8 11.3 19.6 12.8 L18.9 17.3 C18.5 19.8 16.8 21.8 14.4 22 L11.2 22 C8.9 21.7 7.4 20.1 6.9 18.1 Z" />
    {finger(8.6, 7.4, 12.8, 3, -4)}
    {finger(11.8, 6.6, 12.4, 3, 0)}
    {finger(15, 6.9, 12.4, 3, 3)}
    {finger(18, 8.4, 13, 2.7, 9)}
    <rect
      x={4.9}
      y={11.4}
      width={3.1}
      height={6.6}
      rx={1.55}
      transform="rotate(-24 6.45 17.6)"
    />
  </g>
);

/** Places a drawing in view units at a view's spot on the figure */
function At({
  view,
  children,
}: {
  view: { at: Vec2; scale: number };
  children: ReactNode;
}) {
  return (
    <g transform={`${translate(view.at)} scale(${view.scale})`}>{children}</g>
  );
}

// # Fitting to the column

function useFitWidth(stageW: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.45);
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / stageW));
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageW]);
  return { ref, scale };
}

function useSnap(store: FigStore) {
  return useSyncExternalStore(store.subscribe, store.get);
}

// # The figure

// At rest it shows the target states of the tile the hand rests on: A, or
// the tile last clicked or dragged. The paper's captions 4 and 5 are one
// here, since the drop zones and the interaction are drawn on the same view.

type Box4 = { x: number; y: number; w: number; h: number };

type Cap = { x: number; y: number; lines: ReactNode[]; size: number };

const targetX = (i: number) => 240 + i * 179;

const L = {
  w: 1135,
  h: 704,
  model: { x: 24, y: 64, w: 250, h: 166 },
  view: { x: 420, y: 20, w: 410, h: 350 },
  /** The big live view in the view panel */
  cv: { at: Vec2(464, 84), scale: 1.9 },
  /** Target i's state (code), and under it its rendering */
  target: (i: number) => ({
    code: { x: targetX(i), y: 414, w: 168, h: 92 },
    thumb: { x: targetX(i), y: 530, w: 168, h: 150 },
  }),
  /** The targets' code size, and the scale of their renderings */
  code: 13,
  // a full row fills its card but for even padding each side
  scale: (168 - 2 * 12) / rowWidth(ROW_MAX),
  // 1, 2 and 3 down the left, each beside (or under) what it's about
  caps: {
    1: {
      x: 30,
      y: 272,
      size: 19,
      lines: [
        <>A {em("render function", RED)}</>,
        "maps model state",
        "to view tree.",
      ],
    },
    2: {
      x: 30,
      y: 430,
      size: 19,
      lines: [
        "When a drag starts,",
        <>possible {em("target")}</>,
        <>{em("states")} are</>,
        "computed.",
      ],
    },
    3: {
      x: 30,
      y: 556,
      size: 19,
      lines: [
        "We speculatively",
        <>{em("render", RED)} these to</>,
        "view trees.",
      ],
    },
    // a phrase a line, centered on the view
    4: {
      x: 858,
      y: 128,
      size: 18,
      lines: [
        "The fates of the",
        <>{em("dragged element", MAGENTA)}</>,
        "in the renderings below",
        "determine “drop zones”,",
        "which we use to produce",
        "responsive, animated",
        "drag-drop interactions.",
      ],
    },
  } satisfies Record<1 | 2 | 3 | 4, Cap>,
};

/** How far an arrow's ends reach into the cards it joins */
const ARROW_IN = 8;

function HArrow({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2 - 14} y2={y} stroke={RED} strokeWidth={3.2} />
      <path
        d={`M ${x2 - 16} ${y - 9} L ${x2 - 16} ${y + 9} L ${x2} ${y} Z`}
        fill={RED}
      />
    </g>
  );
}

/** A red arrow from card `a` to card `b`, its ends just inside each; `x` places a downward one */
function CardArrow({ a, b, x }: { a: Box4; b: Box4; x?: number }) {
  if (b.x >= a.x + a.w) {
    const y = a.y + a.h / 2;
    return <HArrow x1={a.x + a.w - ARROW_IN} x2={b.x + ARROW_IN} y={y} />;
  }
  return (
    <RedArrow
      x={x ?? a.x + a.w / 2}
      y1={a.y + a.h - ARROW_IN}
      y2={b.y + ARROW_IN}
    />
  );
}

// # The render arrows, marked as functions
//
// The paper's render arrows are plain. These say what they are, a function,
// for the review to choose from (`?fig1arrow=` on the page; `plain`, the
// paper's, when it's absent):
//
//   fn-over   a math italic "fn" set over each arrow (beside the falling
//             ones), as a map labels its arrows
//   fn-badge  a black disc on each arrow with a white "fn" in it
//   block     fat block arrows, nearly square where they're short, "fn" in
//             white on each
//   mapsto    the math maps-to arrow, ↦: a bar at its tail, an open head;
//             "render" over the long one
//   render    the function's name, in the code's font, over the long one,
//             and beside the short ones where there's room
//   lambda    a black disc with a white λ, programming's sign for a function
//   taper     a dart: a shaft thickening into a swept-back head, "fn" over it
//
// "fn" is set in Georgia italic: the page has no serif of its own, and
// Georgia's italic f has math's long descending hook, on desktops and
// phones alike.

export type ArrowStyle =
  | "plain"
  | "fn-over"
  | "fn-badge"
  | "block"
  | "mapsto"
  | "render"
  | "lambda"
  | "taper";

export const ARROW_STYLES: readonly ArrowStyle[] = [
  "plain",
  "fn-over",
  "fn-badge",
  "block",
  "mapsto",
  "render",
  "lambda",
  "taper",
];

const MATH = `Georgia, "Times New Roman", serif`;

// # What the arrows carry
//
// The function's mark on the arrows that carry one (fn-over, fn-badge,
// block, taper), for the review to choose from (`?fig1fn=` on the page;
// "fn" in Georgia italic when it's absent):
//
//   fn          "fn", Georgia italic
//   florin      ƒ, the florin sign, function's old shorthand: Libre Caslon's,
//               dark and slanted
//   fx          the spreadsheet's function mark: f, and a smaller, lower x,
//               in Computer Modern's math italic (KaTeX's font)
//   f-cm        f alone, Computer Modern's math italic: TeX's f
//   f-caslon    f alone, Libre Caslon's italic, its hook long and dark
//   f-garamond  f alone, EB Garamond's italic, the finest of them
//   fn-cm       "fn" in Computer Modern's math italic, set as math sets it
//   fn-caslon   "fn" in Libre Caslon's italic, the f's hook over the n
//   fparen      f(·), Computer Modern: a function, its argument left open
//   fn-mono     fn, bold, in the code's monospace: Rust's keyword
//   arrow       =>, bold, in the code's monospace: JavaScript's arrow function
//
// A mark in a web font waits for it: ../fig1.tsx loads `fonts` before the
// figure draws.

type Face = { fontFamily: string; fontStyle?: string; fontWeight?: number };

/** A web font a mark needs, from a Google Fonts stylesheet or a font file; `text` is what it draws in it */
export type WebFont = {
  family: string;
  style: "normal" | "italic";
  text: string;
  css?: string;
  url?: string;
};

const google = (family: string) =>
  `https://fonts.googleapis.com/css2?family=${family}&display=block`;
const KATEX = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/";

const CASLON = `"Libre Caslon Text", Georgia, serif`;
const GARAMOND = `"EB Garamond", Georgia, serif`;
const CM = `KaTeX_Math, Georgia, serif`;
const CM_MAIN = `KaTeX_Main, Georgia, serif`;

const CASLON_ROMAN: WebFont = {
  family: "Libre Caslon Text",
  style: "normal",
  text: "ƒ",
  css: google("Libre+Caslon+Text"),
};
const CASLON_ITALIC: WebFont = {
  family: "Libre Caslon Text",
  style: "italic",
  text: "fn",
  css: google("Libre+Caslon+Text:ital@1"),
};
const GARAMOND_ITALIC: WebFont = {
  family: "EB Garamond",
  style: "italic",
  text: "f",
  css: google("EB+Garamond:ital@1"),
};
const CM_ITALIC: WebFont = {
  family: "KaTeX_Math",
  style: "italic",
  text: "fnx",
  url: `${KATEX}KaTeX_Math-Italic.woff2`,
};
const CM_ROMAN: WebFont = {
  family: "KaTeX_Main",
  style: "normal",
  text: "(·)",
  url: `${KATEX}KaTeX_Main-Regular.woff2`,
};

/** A run of a mark's text in its face, `scale` against the mark's size, lowered `dy` (in em) */
type MarkPart = { text: string; face: Face; scale?: number; dy?: number };

/**
 * Where a mark's ink is, in em of its size: how far it reaches left and
 * right of where it starts, and above and below its baseline (as measured
 * in its faces), so it can be centered and fitted on an arrow by its ink,
 * not its letters' boxes
 */
type Ink = { left: number; right: number; asc: number; desc: number };

/** Each mark: its runs; its size against the arrow's lettering; its ink; and the web fonts it needs */
export const FN_MARKS = {
  fn: {
    parts: [{ text: "fn", face: { fontFamily: MATH, fontStyle: "italic" } }],
    scale: 1,
    ink: { left: 0.176, right: 0.89, asc: 0.756, desc: 0.217 },
    fonts: [],
  },
  florin: {
    parts: [{ text: "ƒ", face: { fontFamily: CASLON } }],
    scale: 1.15,
    ink: { left: 0.058, right: 0.651, asc: 0.78, desc: 0.191 },
    fonts: [CASLON_ROMAN],
  },
  fx: {
    parts: [
      { text: "f", face: { fontFamily: CM, fontStyle: "italic" } },
      {
        text: "x",
        face: { fontFamily: CM, fontStyle: "italic" },
        scale: 0.72,
        dy: 0.16,
      },
    ],
    scale: 1.05,
    ink: { left: -0.055, right: 0.866, asc: 0.705, desc: 0.205 },
    fonts: [CM_ITALIC],
  },
  "f-cm": {
    parts: [{ text: "f", face: { fontFamily: CM, fontStyle: "italic" } }],
    scale: 1.2,
    ink: { left: -0.055, right: 0.55, asc: 0.705, desc: 0.205 },
    fonts: [CM_ITALIC],
  },
  "f-caslon": {
    parts: [{ text: "f", face: { fontFamily: CASLON, fontStyle: "italic" } }],
    scale: 1.15,
    ink: { left: 0.342, right: 0.651, asc: 0.83, desc: 0.256 },
    fonts: [CASLON_ITALIC],
  },
  "f-garamond": {
    parts: [{ text: "f", face: { fontFamily: GARAMOND, fontStyle: "italic" } }],
    scale: 1.3,
    ink: { left: 0.194, right: 0.503, asc: 0.706, desc: 0.29 },
    fonts: [GARAMOND_ITALIC],
  },
  "fn-cm": {
    parts: [{ text: "fn", face: { fontFamily: CM, fontStyle: "italic" } }],
    scale: 1,
    ink: { left: -0.055, right: 1.07, asc: 0.705, desc: 0.205 },
    fonts: [CM_ITALIC],
  },
  "fn-caslon": {
    parts: [{ text: "fn", face: { fontFamily: CASLON, fontStyle: "italic" } }],
    scale: 1,
    ink: { left: 0.342, right: 0.894, asc: 0.83, desc: 0.256 },
    fonts: [CASLON_ITALIC],
  },
  fparen: {
    parts: [
      { text: "f", face: { fontFamily: CM, fontStyle: "italic" } },
      { text: "(·)", face: { fontFamily: CM_MAIN } },
    ],
    scale: 0.95,
    ink: { left: -0.055, right: 1.423, asc: 0.75, desc: 0.25 },
    fonts: [CM_ITALIC, CM_ROMAN],
  },
  "fn-mono": {
    parts: [{ text: "fn", face: { fontFamily: MONO, fontWeight: 700 } }],
    scale: 0.82,
    ink: { left: -0.085, right: 1.125, asc: 0.76, desc: 0 },
    fonts: [],
  },
  arrow: {
    parts: [{ text: "=>", face: { fontFamily: MONO, fontWeight: 700 } }],
    scale: 0.85,
    ink: { left: -0.043, right: 1.161, asc: 0.574, desc: -0.053 },
    fonts: [],
  },
} satisfies Record<
  string,
  { parts: MarkPart[]; scale: number; ink: Ink; fonts: WebFont[] }
>;

export type FnMark = keyof typeof FN_MARKS;

/** A mark's lettering at font size `fs`, its runs as tspans */
function markText(mark: FnMark, fs: number, props: SVGProps<SVGTextElement>) {
  return (
    <text fontSize={fs} {...props}>
      {FN_MARKS[mark].parts.map((p: MarkPart, i) => (
        <tspan
          key={i}
          {...p.face}
          fontSize={p.scale ? `${p.scale}em` : undefined}
          dy={p.dy ? `${p.dy}em` : undefined}
        >
          {p.text}
        </tspan>
      ))}
    </text>
  );
}

/**
 * A render arrow in one of the styles, straight from `from` to `to`, each
 * `inset` inside the card it touches (the paper's arrows reach into both).
 * `k` scales its lines and head against the page's arrows, `size` its
 * lettering. `main`: the long one, from the model, which gets a name where
 * the short ones don't. `roomy`: there's room beside it for a word.
 */
function FnArrow({
  from,
  to,
  inset,
  style,
  k,
  size,
  main = false,
  roomy = true,
  mark = "fn",
}: {
  from: Vec2;
  to: Vec2;
  inset: number;
  style: ArrowStyle;
  k: number;
  size: number;
  main?: boolean;
  roomy?: boolean;
  mark?: FnMark;
}) {
  const len = to.dist(from);
  const d = to.sub(from).norm();
  // "over": above a level arrow, right of a falling one
  const n = Vec2(d.y, -d.x);
  const level = Math.abs(d.y) < 0.5;
  const P = (a: number, c = 0) => from.add(d.mul(a)).add(n.mul(c));
  const shape = (...ps: Vec2[]) =>
    `M ${ps.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;
  const line = (a: number, b: number, w: number) => (
    <line
      {...P(a).xy1()}
      {...P(b).xy2()}
      stroke={RED}
      strokeWidth={w}
      strokeLinecap="butt"
    />
  );
  // the paper's: a line, and a filled head
  const plain = (
    <g>
      {line(0, len - 14 * k, 3.2 * k)}
      <path
        d={shape(P(len - 16 * k, -9 * k), P(len), P(len - 16 * k, 9 * k))}
        fill={RED}
      />
    </g>
  );
  /**
   * Lettering over the arrow at `a` along it: above if it's level; right of
   * it if it falls, midway between the cards, where a short one has room
   */
  const over = (
    text: string,
    font: { fontFamily: string; fontStyle?: string },
    s = size,
    a = (len - 16 * k) / 2,
  ) => {
    const at = P(level ? a : len / 2);
    return level ? (
      <text
        x={at.x}
        y={at.y - 0.45 * s}
        textAnchor="middle"
        fontSize={s}
        fill={INK}
        {...font}
      >
        {text}
      </text>
    ) : (
      <text
        x={at.x + 0.4 * s}
        y={at.y + 0.27 * s}
        fontSize={s}
        fill={INK}
        {...font}
      >
        {text}
      </text>
    );
  };
  /** Lettering centered on the arrow at `a`, white, for a dark ground */
  const on = (
    text: string,
    font: { fontFamily: string; fontStyle?: string },
    a: number,
    s = size,
  ) => {
    const at = P(a);
    return (
      <text
        x={at.x}
        y={at.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={s}
        fill="white"
        {...font}
      >
        {text}
      </text>
    );
  };
  /** The function's mark over the arrow, as `over` sets lettering */
  const markOver = (s = size, a = (len - 16 * k) / 2) => {
    const at = P(level ? a : len / 2);
    const fs = s * FN_MARKS[mark].scale;
    return level
      ? markText(mark, fs, {
          x: at.x,
          y: at.y - 0.45 * s,
          textAnchor: "middle",
          fill: INK,
        })
      : markText(mark, fs, {
          x: at.x + 0.4 * s,
          y: at.y + 0.27 * s,
          fill: INK,
        });
  };
  /**
   * The function's mark on the arrow, white, its ink centered at `a` along
   * it, and made smaller if its ink is wider than `w` or taller than `h`
   */
  const markOn = (a: number, s: number, w: number, h: number) => {
    const m = FN_MARKS[mark];
    const { left, right, asc, desc } = m.ink;
    const fs = Math.min(s * m.scale, w / (left + right), h / (asc + desc));
    const at = P(a);
    return markText(mark, fs, {
      x: at.x - ((right - left) / 2) * fs,
      y: at.y + ((asc - desc) / 2) * fs,
      fill: "white",
    });
  };
  const fn = { fontFamily: MATH, fontStyle: "italic" };
  const code = { fontFamily: MONO };

  switch (style) {
    case "plain":
      return plain;
    case "fn-over":
      return (
        <g>
          {plain}
          {markOver()}
        </g>
      );
    case "fn-badge":
    case "lambda": {
      // the disc sits on the middle of the shaft, short of the head
      const r = 0.72 * size;
      const a = (len - 16 * k) / 2;
      return (
        <g>
          {plain}
          <circle {...P(a).cxy()} r={r} fill={RED} />
          {style === "fn-badge"
            ? markOn(a, 0.88 * size, 1.5 * r, 1.5 * r)
            : on("λ", { fontFamily: MATH }, a, 1.05 * size)}
        </g>
      );
    }
    case "block": {
      // from the one card's edge just onto the other: a fat shaft, a head barely wider
      const a0 = inset;
      const tip = len - inset + 2 * k;
      const hs = 0.62 * size;
      const hh = 1.0 * size;
      const hl = 0.55 * size;
      return (
        <g>
          <path
            d={shape(
              P(a0, -hs),
              P(tip - hl, -hs),
              P(tip - hl, -hh),
              P(tip),
              P(tip - hl, hh),
              P(tip - hl, hs),
              P(a0, hs),
            )}
            fill={RED}
            stroke={RED}
            strokeWidth={1.5 * k}
            strokeLinejoin="round"
          />
          {level
            ? markOn(
                (a0 + tip - hl) / 2,
                0.95 * size,
                0.9 * (tip - hl - a0),
                1.72 * hs,
              )
            : // a short one: across the shaft, and down into the head, with
              // room to spare on either side
              markOn(
                a0 + 0.42 * (tip - a0),
                0.95 * size,
                1.45 * hs,
                0.66 * (tip - a0),
              )}
        </g>
      );
    }
    case "mapsto": {
      // between the cards, not into them: the bar just off the one, the head at the other
      const a0 = inset + 4 * k;
      const tip = len - inset;
      const w = 2.4 * k;
      return (
        <g
          stroke={RED}
          strokeWidth={w}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <line {...P(a0, -7 * k).xy1()} {...P(a0, 7 * k).xy2()} />
          <line {...P(a0).xy1()} {...P(tip - w / 2).xy2()} />
          <path
            d={`M ${P(tip - 9 * k, -7 * k).str(" ")} L ${P(tip).str(" ")} L ${P(tip - 9 * k, 7 * k).str(" ")}`}
          />
          {main && (
            <g stroke="none">{over("render", fn, size, (a0 + tip) / 2)}</g>
          )}
        </g>
      );
    }
    case "render":
      return (
        <g>
          {plain}
          {(main || roomy) && over("render", code, main ? size : 0.75 * size)}
        </g>
      );
    case "taper": {
      // a dart: a hairline tail thickening to the head, whose barbs sweep back
      const hl = 16 * k;
      const hh = 10 * k;
      const sweep = 5 * k;
      return (
        <g>
          <path
            d={shape(
              P(0, -0.6 * k),
              P(len - hl, -3.4 * k),
              P(len - hl - sweep, -hh),
              P(len),
              P(len - hl - sweep, hh),
              P(len - hl, 3.4 * k),
              P(0, 0.6 * k),
            )}
            fill={RED}
            strokeLinejoin="round"
          />
          {markOver(size, (len - hl - sweep) / 2)}
        </g>
      );
    }
  }
}

/** A target's number, on its card and on its drop zone */
function badge(at: Vec2, n: number, on: boolean, r = 9) {
  return (
    <g>
      <circle
        {...at.cxy()}
        r={r}
        fill={on ? MAGENTA : "white"}
        stroke={MAGENTA}
        strokeWidth={1.5}
      />
      <text
        x={at.x}
        y={at.y + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={UI}
        fontSize={(11 * r) / 9}
        fontWeight={700}
        fill={on ? "white" : MAGENTA}
      >
        {n}
      </text>
    </g>
  );
}

// Each link is one cubic: straight out of its target's column, and into its
// drop zone (see `LinkEnd`), each control point reaching straight along
// those.

/**
 * Which way a link comes into its zone (a unit vector pointing back along
 * it), and how far its control points reach out of the column and into the
 * zone: for targets below the view, coming up into it. `behind`: there's a
 * zone in front of this one, under it.
 */
function entry(
  end: LinkEnd,
  behind: boolean,
): { back: Vec2; out: number; into: number } {
  switch (end) {
    case "first":
      // steeply, past the bottom row's left end
      return { back: Vec2(-1, 1.7).norm(), out: 110, into: 150 };
    case "last":
      // as steeply as clears the zone right of the one under it, if any
      return behind
        ? { back: Vec2(1, 1.4).norm(), out: 60, into: 140 }
        : { back: Vec2(0.25, 1).norm(), out: 70, into: 150 };
    case "gap":
      return {
        back: Vec2((T + GAP) / 2, ROW_H + ROW_GAP).norm(),
        out: 70,
        into: 110,
      };
    case "near":
      return { back: Vec2(0, 1), out: 60, into: 110 };
  }
}

/**
 * The same for targets above the view (the phone's), coming down into it,
 * drawn upside down: the zones sit low on their tiles, where the tile is
 * grabbed, so a link to the far row comes down nearly straight through the
 * near row's gaps.
 */
function entryAbove(
  end: LinkEnd,
  behind: boolean,
): { back: Vec2; out: number; into: number } {
  switch (end) {
    case "first":
      // wide, past the top row's left end
      return { back: Vec2(-1, 0.9).norm(), out: 46, into: 150 };
    case "last":
      // with a zone in front of it, flat enough to pass right of the zone right of that one
      return behind
        ? { back: Vec2(1, 0.75).norm(), out: 40, into: 160 }
        : { back: Vec2(0.2, 1).norm(), out: 40, into: 80 };
    case "gap":
      return { back: Vec2(0.22, 1).norm(), out: 40, into: 96 };
    case "near":
      return { back: Vec2(0, 1), out: 36, into: 60 };
  }
}

function linkPath(
  from: Vec2,
  z: Vec2,
  end: LinkEnd,
  behind: boolean,
  side: Side,
) {
  const { back, out, into } =
    side === "below" ? entry(end, behind) : entryAbove(end, behind);
  // drawn for targets below; for targets above, upside down
  const s = side === "below" ? 1 : -1;
  const c2 = z.add(Vec2(back.x, s * back.y).mul(into));
  return `M ${from.x} ${from.y} C ${from.x} ${from.y - s * out}, ${c2.x} ${c2.y}, ${z.x} ${z.y}`;
}

/** Each target's link, from where it leaves its column (`from`) into its zone */
function linksFor(
  snap: Snap,
  zones: Vec2[],
  from: (i: number) => Vec2,
  side: Side,
) {
  return snap.targets.map((t, i) =>
    linkPath(
      from(i),
      zones[i],
      linkEnd(snap.id, t, side),
      behind(snap.id, t, snap.targets, side),
      side,
    ),
  );
}

// # The live view, and what both layouts share

/**
 * The live view, and the store the rest of the figure reads. `onTile`: the
 * pointer is on a tile, so the hand makes way for it. It comes back a
 * moment after the pointer leaves the tiles (so crossing the gaps between
 * them doesn't flash it), on A, or on the tile last clicked or dragged.
 */
function useLiveView(look: Look, side: Side) {
  const [state, setState] = useState(START);
  const store = useMemo(() => new FigStore(side), [side]);
  const snap = useSnap(store);
  const [onTile, setOnTile] = useState(false);
  const backTimer = useRef(0);

  const draggable: Draggable<State> = useMemo(() => {
    const drag: DragOf = (d, state, id) => {
      const targets = targetsFor(state, id, store.side);
      return d.closest(targets).withFloating().with(publish(store, targets));
    };
    const enter = () => {
      clearTimeout(backTimer.current);
      setOnTile(true);
    };
    const leave = () => {
      clearTimeout(backTimer.current);
      backTimer.current = window.setTimeout(() => setOnTile(false), 250);
    };
    return ({ state, d, draggedId }) => {
      const pick = (id: string) => {
        const s = store.get();
        if (s.phase === "idle" && s.id !== id) store.rest(state, id);
      };
      return drawView(state, {
        live: { d, draggedId, drag, enter, leave, pick },
        look,
      });
    };
  }, [store, look]);

  const renderer = (
    <DraggableRenderer
      draggable={draggable}
      state={state}
      width={VIEW_W}
      height={VIEW_H}
      onDropState={(s) => {
        const id = store.get().id;
        setState(s);
        store.rest(s, id);
      }}
      // A press reports a drag's first frame at once; one let go of
      // without moving (a click) ends with no drop, so settle here,
      // on the tile clicked
      onDragStatus={(st) => {
        const s = store.get();
        if (st.type === "idle" && !st.pendingDrag && s.phase === "drag")
          store.rest(state, s.id);
      }}
    />
  );

  return { state, snap, onTile, renderer };
}

/** The live view at `cv` on the figure */
function LiveAt({
  cv,
  children,
}: {
  cv: { at: Vec2; scale: number };
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: cv.at.x,
        top: cv.at.y,
        transform: `scale(${cv.scale})`,
        transformOrigin: "0 0",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Over the live view: each target joined to its drop zone, the pointer's
 * lines to the zones while dragging, and the faint hand at rest. `r`: the
 * zones' badges.
 */
function Marks({
  w,
  h,
  snap,
  cv,
  links,
  onTile,
  r,
}: {
  w: number;
  h: number;
  snap: Snap;
  cv: { at: Vec2; scale: number };
  links: string[];
  onTile: boolean;
  r?: number;
}) {
  const dragging = snap.phase === "drag";
  const near = (i: number) => dragging && i === snap.nearest;
  const onView = (p: Vec2) => cv.at.add(p.mul(cv.scale));
  const zones = snap.zones.map(onView);
  const pointer = onView(snap.pointer);
  // the drop zones and their links only show while dragging
  const ink = dragging ? 1 : 0;
  return (
    <svg
      width={w}
      height={h}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <g style={{ opacity: ink, transition: "opacity 200ms" }}>
        {links.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={MAGENTA}
            strokeWidth={near(i) ? 2.5 : 1.3}
            strokeDasharray={near(i) ? undefined : "5 4"}
            opacity={near(i) || !dragging ? 0.9 : 0.45}
          />
        ))}
        {dragging &&
          zones.map((z, i) => (
            <line
              key={i}
              {...pointer.xy1()}
              {...z.xy2()}
              stroke={MAGENTA}
              strokeWidth={near(i) ? 2.2 : 1}
              strokeDasharray={near(i) ? undefined : "3 3"}
              opacity={0.8}
            />
          ))}
        {zones.map((z, i) => (
          <g key={i}>{badge(z, i + 1, near(i), r)}</g>
        ))}
      </g>
      <At view={cv}>
        <g
          style={{
            opacity: dragging || onTile ? 0 : 1,
            transform: `translate(${snap.pointer.x}px, ${snap.pointer.y}px)`,
          }}
        >
          {/* about a real cursor's size on the page */}
          {handSvg(Vec2(0, 0), true, 1.05)}
        </g>
      </At>
    </svg>
  );
}

const SHADOWS = (
  <defs>
    <filter id="fig1-shadow" x="-15%" y="-15%" width="130%" height="140%">
      <feDropShadow
        dx={0}
        dy={4}
        stdDeviation={5}
        floodColor="#000"
        floodOpacity={0.2}
      />
    </filter>
    <filter id="fig1-tile-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation={2.6} />
    </filter>
  </defs>
);

// # The page's layout

export function ConceptFigure({
  look,
  arrows = "plain",
  mark = "fn",
}: {
  look: Look;
  arrows?: ArrowStyle;
  mark?: FnMark;
}) {
  const { state, snap, onTile, renderer } = useLiveView(look, "below");
  const { ref: boxRef, scale } = useFitWidth(L.w);
  const dragging = snap.phase === "drag";

  const { cv, model, view } = L;
  // a target's rendering: its rows, left-aligned and centered top to bottom
  const thumbView = (i: number) => {
    const b = L.target(i).thumb;
    const rowsH = (VIEW_H - 2 * EDGE) * L.scale;
    return {
      at: Vec2(
        b.x + 12 - EDGE * L.scale,
        b.y + (b.h - rowsH) / 2 - EDGE * L.scale,
      ),
      scale: L.scale,
    };
  };
  // Each target's link to its zone: from the top of its column, above where
  // the tile sits in its rendering
  const links = linksFor(
    snap,
    snap.zones.map((p) => cv.at.add(p.mul(cv.scale))),
    (i) => {
      const v = thumbView(i);
      const tile = tilePositions(snap.targets[i])
        .get(snap.id)!
        .add(Vec2(T / 2, T / 2));
      return Vec2(v.at.add(tile.mul(v.scale)).x, L.target(i).code.y);
    },
    "below",
  );
  const near = (i: number) => dragging && i === snap.nearest;
  const cap = (n: 1 | 2 | 3 | 4) => <Caption n={n} {...L.caps[n]} />;

  const below = (
    <svg
      width={L.w}
      height={L.h}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
    >
      {SHADOWS}
      {/* 1: the model, rendered to the view; it stays the drag's start state until the drop */}
      <Box
        x={model.x}
        y={model.y}
        w={Math.max(model.w, 46 + codeWidth(state, 17, look) + 22)}
        h={model.h}
      />
      <text
        x={model.x + 16}
        y={model.y + 32}
        fontFamily={UI}
        fontWeight={700}
        fontSize={22}
        fill={INK}
      >
        Model state
      </text>
      {stateCode(look, state, model.x + 26, model.y + 66, 17, 24)}
      {cap(1)}

      {/* 4: the view, live, with its drop zones */}
      <Box x={view.x} y={view.y} w={view.w} h={view.h} />
      <text
        x={view.x + 16}
        y={view.y + 32}
        fontFamily={UI}
        fontWeight={700}
        fontSize={22}
        fill={INK}
      >
        View
      </text>
      {arrows === "plain" ? (
        <CardArrow a={model} b={view} />
      ) : (
        <FnArrow
          from={Vec2(model.x + model.w - ARROW_IN, model.y + model.h / 2)}
          to={Vec2(view.x + ARROW_IN, model.y + model.h / 2)}
          inset={ARROW_IN}
          style={arrows}
          mark={mark}
          k={1}
          size={30}
          main
        />
      )}
      {cap(4)}

      {/* 2 and 3: the target states, rendered */}
      {snap.targets.map((t, i) => {
        const { code, thumb } = L.target(i);
        const corner = Vec2(code.x + code.w - 16, code.y + 16);
        return (
          <g key={i}>
            <Box {...code} highlight={near(i)} />
            {stateCode(
              look,
              t,
              code.x + 12,
              code.y + 23,
              L.code,
              L.code * 1.36,
              near(i) ? snap.start : undefined,
            )}
            <Box {...thumb} highlight={near(i)} />
            <At view={thumbView(i)}>
              {drawView(t, { outline: snap.id, look })}
            </At>
            {arrows === "plain" ? (
              <CardArrow a={code} b={thumb} />
            ) : (
              <FnArrow
                from={Vec2(code.x + code.w / 2, code.y + code.h - ARROW_IN)}
                to={Vec2(code.x + code.w / 2, thumb.y + ARROW_IN)}
                inset={ARROW_IN}
                style={arrows}
                mark={mark}
                k={1}
                size={19}
              />
            )}
            {badge(corner, i + 1, near(i))}
          </g>
        );
      })}
      {cap(2)}
      {cap(3)}
    </svg>
  );

  return (
    <div ref={boxRef} className="fig1-live" style={{ height: L.h * scale }}>
      <div
        className="fig1-stage"
        style={{ width: L.w, height: L.h, transform: `scale(${scale})` }}
      >
        {below}
        <LiveAt cv={cv}>{renderer}</LiveAt>
        <Marks
          w={L.w}
          h={L.h}
          snap={snap}
          cv={cv}
          links={links}
          onTile={onTile}
        />
      </div>
      {/* beside the view's title, where there's room */}
      <span
        className="live-tag"
        aria-hidden="true"
        style={{ left: (view.x + 88) * scale, top: (view.y + 21) * scale }}
      >
        try dragging a tile
      </span>
    </div>
  );
}

// # The phone's layout
//
// On a phone the figure is about a screen tall, read top to bottom and
// dragged at the bottom: the model, beside caption 1; captions 2 and 3;
// the targets in a row across the screen, each its state over its
// rendering; and last the live view, so the finger on it hides nothing that
// answers the drag, only caption 4 under it. Each target's link comes down
// out of its rendering into its zone.
//
// It's drawn about at the screen's size, not scaled down from a bigger
// drawing as the page's is, so its panels get their own finer lines and
// shadows. Every card fits what's in it: the model's its title, each
// target's its state's widest line and rendering's widest row, so a target
// with a row of three gets the room the two-by-twos don't need; and the
// view's panel just holds the rows' room. The code is the whole state,
// packed (`{rows:[`, ` [A,B],`, …) to fit the columns at a size that reads.

const PANEL_FINE: PanelLook = {
  line: 0.9,
  hi: 1.6,
  rx: 8,
  shadow: "fig1-shadow-fine",
};

const P = {
  w: 368,
  h: 750,
  /** The model's code size; its card fits its title, "Model state", or its code if that's wider */
  model: { x: 0, y: 0, h: 108, code: 14, titleW: 88, pad: 12 },
  /**
   * The targets' row: its code cards' top and height, and its renderings'
   * top. Code at `code`, with `pad` each side; renderings at `scale`, with
   * `thumbPad` around their rows.
   */
  row: { y: 210, codeH: 74, thumbY: 302 },
  code: 12,
  pad: 5.5,
  scale: 0.4,
  thumbPad: 6,
  /** The live view: tiles about 70px across, good to grab with a finger */
  cv: { at: Vec2((368 - VIEW_W * 1.6) / 2, 432), scale: 1.6 },
  // 1 beside the model; 2 and 3 over the row of targets; 4 under the view,
  // where the hand dragging covers only it
  caps: {
    1: {
      x: 132,
      y: 44,
      size: 15,
      lines: [
        <>A {em("render function", RED)} maps</>,
        "model state to view tree.",
      ],
    },
    2: {
      x: 8,
      y: 130,
      size: 15,
      lines: [
        <>When a drag starts, possible {em("target states")}</>,
        "are computed.",
      ],
    },
    3: {
      x: 8,
      y: 178,
      size: 15,
      lines: [<>We speculatively {em("render", RED)} these to view trees.</>],
    },
    4: {
      x: 8,
      y: 678,
      size: 15,
      lines: [
        <>The fates of the {em("dragged element", MAGENTA)} in the</>,
        "renderings above determine “drop zones”,",
        "which we use to produce responsive,",
        "animated drag-drop interactions.",
      ],
    },
  } satisfies Record<1 | 2 | 3 | 4, Cap>,
  /** Caption 1 beside a marked render arrow from the model, in a narrower column */
  capOneMarked: [
    <>A {em("render function", RED)}</>,
    "maps model state",
    "to view tree.",
  ],
};

/** The view's panel: the live view, with room over it for its title */
const P_VIEW = {
  x: P.cv.at.x,
  y: P.cv.at.y - 22,
  w: VIEW_W * P.cv.scale,
  h: VIEW_H * P.cv.scale + 22,
};

/** A rendering's height: two rows, and its padding */
const P_THUMB_H = (VIEW_H - 2 * EDGE) * P.scale + 2 * P.thumbPad;

/**
 * Each target's code card and rendering, each as wide as what's in it, the
 * two centered on each other, the columns spread across the figure.
 */
function phoneCards(targets: State[]): { code: Box4; thumb: Box4 }[] {
  const sized = targets.map((t) => {
    const codeW = packedChars(t) * MONO_W * P.code + 2 * P.pad;
    const thumbW =
      rowWidth(Math.max(...t.rows.map((r) => r.length))) * P.scale +
      2 * P.thumbPad;
    return { codeW, thumbW, w: Math.max(codeW, thumbW) };
  });
  const total = sized.reduce((s, c) => s + c.w, 0);
  const gap = Math.min(12, (P.w - total) / Math.max(targets.length - 1, 1));
  let x = (P.w - total - gap * (targets.length - 1)) / 2;
  return sized.map(({ codeW, thumbW, w }) => {
    const mid = x + w / 2;
    x += w + gap;
    return {
      code: { x: mid - codeW / 2, y: P.row.y, w: codeW, h: P.row.codeH },
      thumb: { x: mid - thumbW / 2, y: P.row.thumbY, w: thumbW, h: P_THUMB_H },
    };
  });
}

export function ConceptFigurePhone({
  look,
  arrows = "plain",
  mark = "fn",
}: {
  look: Look;
  arrows?: ArrowStyle;
  mark?: FnMark;
}) {
  const { state, snap, onTile, renderer } = useLiveView(look, "above");
  const { ref: boxRef, scale } = useFitWidth(P.w);
  const dragging = snap.phase === "drag";

  const { cv } = P;
  const view = P_VIEW;
  const cards = phoneCards(snap.targets);
  // a target's rendering: its rows, from its card's corner
  const thumbView = (i: number) => {
    const b = cards[i].thumb;
    return {
      at: Vec2(b.x, b.y).add(
        Vec2(P.thumbPad - EDGE * P.scale, P.thumbPad - EDGE * P.scale),
      ),
      scale: P.scale,
    };
  };
  // Each target's link to its zone: from the bottom of its rendering, under
  // where the tile sits in it
  const links = linksFor(
    snap,
    snap.zones.map((p) => cv.at.add(p.mul(cv.scale))),
    (i) => {
      const v = thumbView(i);
      const tile = tilePositions(snap.targets[i])
        .get(snap.id)!
        .add(Vec2(T / 2, T / 2));
      const { thumb } = cards[i];
      return Vec2(v.at.add(tile.mul(v.scale)).x, thumb.y + thumb.h);
    },
    "above",
  );
  const near = (i: number) => dragging && i === snap.nearest;
  const model = {
    ...P.model,
    w:
      Math.max(P.model.titleW, packedChars(state) * MONO_W * P.model.code) +
      2 * P.model.pad,
  };
  const cap = (n: 1 | 2 | 3 | 4) => <Caption n={n} {...P.caps[n]} />;

  const below = (
    <svg
      width={P.w}
      height={P.h}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
    >
      {SHADOWS}
      <defs>
        <filter
          id="fig1-shadow-fine"
          x="-15%"
          y="-15%"
          width="130%"
          height="140%"
        >
          <feDropShadow
            dx={0}
            dy={1.5}
            stdDeviation={2}
            floodColor="#000"
            floodOpacity={0.14}
          />
        </filter>
      </defs>
      {/* 1: the model, rendered to the view at the bottom; it stays the drag's start state until the drop */}
      <Box {...model} look={PANEL_FINE} />
      <text
        x={model.x + model.pad}
        y={model.y + 24}
        fontFamily={UI}
        fontWeight={700}
        fontSize={15}
        fill={INK}
      >
        Model state
      </text>
      {packedCode(
        look,
        state,
        model.x + model.pad,
        model.y + 48,
        model.code,
        16.5,
      )}
      {arrows === "plain" ? (
        cap(1)
      ) : (
        // the render function marked as the arrows below are, its
        // caption beside it
        <g>
          <FnArrow
            from={Vec2(model.x + model.w + 6, model.y + model.h / 2)}
            to={Vec2(model.x + model.w + 62, model.y + model.h / 2)}
            inset={0}
            style={arrows}
            mark={mark}
            k={0.6}
            size={14}
            main
          />
          <Caption
            n={1}
            {...P.caps[1]}
            x={model.x + model.w + 78}
            y={model.y + model.h / 2 - 24}
            lines={P.capOneMarked}
          />
        </g>
      )}

      {/* 2 and 3: the target states, rendered */}
      {cap(2)}
      {cap(3)}
      {snap.targets.map((t, i) => {
        const { code, thumb } = cards[i];
        return (
          <g key={i}>
            <Box {...code} highlight={near(i)} look={PANEL_FINE} />
            {packedCode(
              look,
              t,
              code.x + P.pad,
              code.y + 21,
              P.code,
              15,
              near(i) ? snap.start : undefined,
            )}
            <Box {...thumb} highlight={near(i)} look={PANEL_FINE} />
            <At view={thumbView(i)}>
              {drawView(t, { outline: snap.id, look, ring: 1.6 })}
            </At>
            {arrows === "plain" ? (
              <RedArrow
                x={code.x + code.w / 2}
                y1={code.y + code.h - 5}
                y2={thumb.y + 5}
                k={0.55}
              />
            ) : (
              <FnArrow
                from={Vec2(code.x + code.w / 2, code.y + code.h - 5)}
                to={Vec2(code.x + code.w / 2, thumb.y + 5)}
                inset={5}
                style={arrows}
                mark={mark}
                k={0.55}
                size={11.5}
                roomy={false}
              />
            )}
            {badge(Vec2(code.x + code.w - 8, code.y), i + 1, near(i), 8)}
          </g>
        );
      })}

      {/* 4: the view, live, with its drop zones */}
      <Box {...view} look={PANEL_FINE} />
      {cap(4)}
    </svg>
  );

  return (
    <div ref={boxRef} className="fig1-live" style={{ height: P.h * scale }}>
      <div
        className="fig1-stage"
        style={{ width: P.w, height: P.h, transform: `scale(${scale})` }}
      >
        {below}
        <LiveAt cv={cv}>{renderer}</LiveAt>
        <Marks
          w={P.w}
          h={P.h}
          snap={snap}
          cv={cv}
          links={links}
          onTile={onTile}
          r={10}
        />
        {/* the view's title, over the links that come in past it, in line with the rows */}
        <svg
          width={P.w}
          height={P.h}
          style={{
            position: "absolute",
            inset: 0,
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <text
            x={cv.at.x + EDGE * cv.scale}
            y={view.y + 19}
            fontFamily={UI}
            fontWeight={700}
            fontSize={15}
            fill={INK}
            stroke="white"
            strokeWidth={6}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            View
          </text>
        </svg>
      </div>
      {/* on the view's lower right edge, out of the links' way */}
      <span
        className="live-tag"
        aria-hidden="true"
        style={{
          left: "auto",
          right: (P.w - view.x - view.w + 10) * scale,
          top: (view.y + view.h) * scale,
        }}
      >
        try dragging a tile
      </span>
    </div>
  );
}
