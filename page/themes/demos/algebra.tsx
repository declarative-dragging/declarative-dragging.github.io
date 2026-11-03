// src/demos/animate-algebra/tree.tsx, themed, as the D2 page's card shows
// it: (-🍄 + ⛅) + 🍄, with just commutativity and associativity. Minimal:
// the cloud becomes something red to grab that isn't another mushroom.
// Four colors: the mushroom and the rest in the other colors. Boxes take the page's
// warm grays; the one you hold, if it can go anywhere, is outlined in red,
// its operator too. An only child that can't go anywhere (the 🍄 in -🍄)
// hands its drags to its parent, so pressing it drags the whole -🍄.

import {
  type Draggable,
  type DragSpecBuilder,
  type Svgx,
  translate,
} from "dragology";
import _ from "lodash";
import { ReactNode, useMemo } from "react";
import {
  allPossibleRewrites,
  rewr,
  Rewrite,
  Tree,
} from "../../demo-logic/animate-algebra/asts";
import { DemoDraggable } from "../../demo-ui-shim";
import { INK, RED } from "../palette";
import { useDemoTheme } from "../theme";

// # State & initial states

type State = Tree;

export const initialState: State = {
  id: "root",
  label: "+",
  children: [
    {
      id: "root-1",
      label: "+",
      children: [
        {
          id: "root-1-1",
          label: "+",
          children: [
            { id: "root-1-1-1", label: "⛅", children: [] },
            {
              id: "root-1-1-2",
              label: "-",
              children: [{ id: "root-1-1-2-1", label: "🍄", children: [] }],
            },
          ],
        },
        { id: "root-1-2", label: "🍄", children: [] },
      ],
    },
    {
      id: "root-2",
      label: "+",
      children: [
        {
          id: "root-2-1",
          label: "×",
          children: [
            { id: "root-2-1-1", label: "🎲", children: [] },
            { id: "root-2-1-2", label: "🦠", children: [] },
          ],
        },
        {
          id: "root-2-2",
          label: "×",
          children: [
            { id: "root-2-2-1", label: "🎲", children: [] },
            { id: "root-2-2-2", label: "🐝", children: [] },
          ],
        },
      ],
    },
  ],
};

// # Rewrite rules

type RewriteSet = {
  rewrites: Rewrite[];
  title: ReactNode;
  subtitle?: ReactNode;
  defaultEnabled?: boolean;
};

export const rewriteSets: RewriteSet[] = [
  {
    title: <>Identity</>,
    rewrites: [rewr("(+ (0) #A)", "A"), rewr("(+ #A (0))", "A")],
    defaultEnabled: true,
  },
  {
    title: <>Identity (reverse)</>,
    rewrites: [rewr("#A", "(+ (0) A)")],
    defaultEnabled: true,
  },
  {
    title: <>Commutativity</>,
    rewrites: [rewr("(+ #A #B)", "(+ B A)"), rewr("(× #A #B)", "(× B A)")],
    defaultEnabled: true,
  },
  {
    title: <>Associativity</>,
    subtitle: <>Pull up op</>,
    rewrites: [
      rewr("(+2 #(+1 A B) C)", "(+1 A (+2 B C))"),
      rewr("(+1 A #(+2 B C))", "(+2 (+1 A B) C)"),
      rewr("(×2 #(×1 A B) C)", "(×1 A (×2 B C))"),
      rewr("(×1 A #(×2 B C))", "(×2 (×1 A B) C)"),
    ],
  },
  {
    title: <>Associativity</>,
    subtitle: <>Pull down op</>,
    rewrites: [
      rewr("#(+1 A (+2 B C))", "(+2 (+1 A B) C)"),
      rewr("#(+2 (+1 A B) C)", "(+1 A (+2 B C))"),
      rewr("#(×1 A (×2 B C))", "(×2 (×1 A B) C)"),
      rewr("#(×2 (×1 A B) C)", "(×1 A (×2 B C))"),
    ],
  },
  {
    title: <>Associativity</>,
    subtitle: <>Pull up operand</>,
    rewrites: [
      rewr("(+2 (+1 #A B) C)", "(+1 A (+2 B C))"),
      rewr("(+1 A (+2 B #C))", "(+2 (+1 A B) C)"),
      rewr("(×2 (×1 #A B) C)", "(×1 A (×2 B C))"),
      rewr("(×1 A (×2 B #C))", "(×2 (×1 A B) C)"),
    ],
  },
  {
    title: <>Associativity</>,
    subtitle: <>Pull down operand</>,
    rewrites: [
      rewr("(+1 #A (+2 B C))", "(+2 (+1 A B) C)"),
      rewr("(+2 (+1 A B) #C)", "(+1 A (+2 B C))"),
      rewr("(×1 #A (×2 B C))", "(×2 (×1 A B) C)"),
      rewr("(×2 (×1 A B) #C)", "(×1 A (×2 B C))"),
    ],
  },
  {
    title: <>Distributivity</>,
    subtitle: <>Distribute (drag +)</>,
    rewrites: [
      rewr("(× A #(+ B C))", "(+ (× A B) (× A C))"),
      rewr("(× #(+ B C) A)", "(+ (× B A) (× C A))"),
    ],
  },
  {
    title: <>Distributivity</>,
    subtitle: <>Distribute (drag operand)</>,
    rewrites: [
      rewr("(× #A (+ B C))", "(+ (× A B) (× A C))"),
      rewr("(× (+ B C) #A)", "(+ (× B A) (× C A))"),
    ],
  },
  {
    title: <>Distributivity</>,
    subtitle: <>Factor (drag +)</>,
    rewrites: [
      rewr("#(+ (× A B) (× A C))", "(× A (+ B C))"),
      rewr("#(+ (× B A) (× C A))", "(× A (+ B C))"),
    ],
  },
  {
    title: <>Distributivity</>,
    subtitle: <>Factor (drag operand)</>,
    rewrites: [
      rewr("(+ (× #A B) (× A C))", "(× A (+ B C))"),
      rewr("(+ (× A B) (× #A C))", "(× A (+ B C))"),
      rewr("(+ (× B #A) (× C A))", "(× A (+ B C))"),
      rewr("(+ (× B A) (× C #A))", "(× A (+ B C))"),
    ],
  },
  {
    title: <>Associativity</>,
    subtitle: (
      <>
        Pull op sideways
        <br />
        <span className="italic text-red-500">
          (Conflicts with commutativity!)
        </span>
      </>
    ),
    rewrites: [
      rewr("(+2 #(+1 A B) C)", "(+2 A #(+1 B C))"),
      rewr("(+1 A #(+2 B C))", "(+1 #(+2 A B) C)"),
      rewr("(×2 #(×1 A B) C)", "(×2 A #(×1 B C))"),
      rewr("(×1 A #(×2 B C))", "(×1 #(×2 A B) C)"),
    ],
  },
];

// # Tree rendering

export type Config = {
  activeRewriteSets: boolean[];
  enableEmergeAnimation: boolean;
  forceTransformScale: boolean;
};

export function draggableFactory(config: Config): Draggable<State> {
  const activeRewrites = _.zip(rewriteSets, config.activeRewriteSets).flatMap(
    ([set, enabled]) => (enabled ? set!.rewrites : []),
  );
  return ({ state, d, draggedId }) => {
    const passUp = passesUp(state, activeRewrites);
    // the node that's actually moving: the one grabbed, or what it passed up to
    const heldId = draggedId && (passUp.get(draggedId) ?? draggedId);
    return renderTree(
      state,
      state,
      d,
      activeRewrites,
      config,
      0,
      heldId,
      false,
      passUp,
    ).element;
  };
}

/** Only children that can't move on their own, and the ancestor whose drag
 * each takes over (its parent, or further up if that passes up too) */
function passesUp(state: State, rewrites: Rewrite[]): Map<string, string> {
  const up = new Map<string, string>();
  const visit = (tree: Tree, to: string | null) => {
    const passes =
      to !== null && allPossibleRewrites(state, rewrites, tree.id).length === 0;
    if (passes) up.set(tree.id, to);
    const only = tree.children.length === 1;
    for (const c of tree.children)
      visit(c, only ? (passes ? to : tree.id) : null);
  };
  visit(state, null);
  return up;
}

function renderTree(
  state: State,
  tree: Tree,
  d: DragSpecBuilder<State>,
  activeRewrites: Rewrite[],
  config: Config,
  depth: number,
  heldId: string | null,
  isDragged: boolean,
  passUp: Map<string, string>,
): {
  element: Svgx;
  w: number;
  h: number;
  id: string;
} {
  isDragged = isDragged || tree.id === heldId;

  const GAP = 10;
  const PADDING = 5;
  const LABEL_WIDTH = 20;
  const LABEL_MIN_HEIGHT = 20;

  const renderedChildren = tree.children.map((child) =>
    renderTree(
      state,
      child,
      d,
      activeRewrites,
      config,
      depth + 1,
      heldId,
      isDragged,
      passUp,
    ),
  );

  const renderedChildrenElements: Svgx[] = [];
  let childY = 0;
  for (const childR of renderedChildren) {
    renderedChildrenElements.push(
      <g transform={translate(0, childY)}>{childR.element}</g>,
    );
    childY += childR.h + GAP;
  }

  const innerW =
    LABEL_WIDTH +
    (renderedChildren.length > 0
      ? GAP + _.max(renderedChildren.map((c) => c.w))!
      : 0);
  const innerH =
    renderedChildren.length > 0
      ? _.sumBy(renderedChildren, (c) => c.h) +
        GAP * (renderedChildren.length - 1)
      : LABEL_MIN_HEIGHT;

  const w = innerW + PADDING * 2;
  const h = innerH + PADDING * 2;
  const rx = Math.min(14, 0.3 * Math.min(w, h));
  const dragAs = passUp.get(tree.id) ?? tree.id;
  // red only on what can actually move
  const held =
    tree.id === heldId &&
    allPossibleRewrites(state, activeRewrites, tree.id).length > 0;

  // Subtle warm fill that deepens with nesting
  const alpha = Math.min(0.02 + depth * 0.03, 0.15);
  const fill = `rgba(180, 170, 150, ${alpha})`;
  const strokeAlpha = Math.min(0.25 + depth * 0.08, 0.5);
  const stroke = `rgba(140, 130, 115, ${strokeAlpha})`;

  const element = (
    <g
      id={tree.id}
      dragologyOnDrag={() => dragTargets(d, state, dragAs, activeRewrites)}
      dragologyZIndex={depth + (isDragged ? 1000 : 0)}
      dragologyEmergeFrom={
        config.enableEmergeAnimation ? tree.emergeFrom : undefined
      }
      dragologyEmergeMode={
        tree.emergeMode ?? (config.forceTransformScale ? "scale" : undefined)
      }
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={rx}
        stroke={held ? RED : stroke}
        strokeWidth={held ? 1.5 : 0.75}
        fill={fill}
        // fill="transparent"
      />
      <text
        x={PADDING + LABEL_WIDTH / 2}
        y={PADDING + innerH / 2}
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={18}
        fill={held ? RED : INK}
      >
        {tree.label}
      </text>
      {renderedChildren.length > 0 && (
        <g transform={translate(PADDING + LABEL_WIDTH + GAP, PADDING)}>
          {renderedChildrenElements}
        </g>
      )}
    </g>
  );

  return { element, w, h, id: tree.id };
}

function dragTargets(
  d: DragSpecBuilder<State>,
  state: State,
  draggedKey: string,
  activeRewrites: Rewrite[],
) {
  const newTrees = allPossibleRewrites(state, activeRewrites, draggedKey);
  if (newTrees.length === 0) return d.between([state]);
  return d
    .closest(
      newTrees.map((newTree) => d.between([state, newTree])),
      { lockPast: 20 },
    )
    .withSnapRadius(1, { chain: true });
}

// # The card

export const VARIANTS = {
  minimal: [
    { key: "magnet", label: "🧲 for ⛅" },
    { key: "cherries", label: "🍒 for ⛅" },
    { key: "balloon", label: "🎈 for ⛅" },
  ],
  four: [
    { key: "star-koopa", label: "⭐ for ⛅, 🐢 for a 🍄" },
    { key: "star", label: "⭐ for ⛅" },
  ],
};

/** The leaves of (-a + b) + c */
const LEAVES: Record<string, [string, string, string]> = {
  magnet: ["🍄", "🧲", "🍄"],
  cherries: ["🍄", "🍒", "🍄"],
  balloon: ["🍄", "🎈", "🍄"],
  star: ["🍄", "⭐", "🍄"],
  "star-koopa": ["🍄", "⭐", "🐢"],
};

// Commutativity (2); Associativity: pull up operand (5), pull down operand (6)
const algebraCard = draggableFactory({
  activeRewriteSets: rewriteSets.map((_, i) => i === 2 || i === 5 || i === 6),
  enableEmergeAnimation: true,
  forceTransformScale: false,
});
const leaf = (id: string, label: string) => ({ id, label, children: [] });

export function Algebra() {
  const { variant } = useDemoTheme();
  const [a, b, c] = LEAVES[variant] ?? LEAVES.magnet;
  const initialState = useMemo(
    () => ({
      id: "root-1",
      label: "+",
      children: [
        {
          id: "root-1-1",
          label: "+",
          children: [
            {
              id: "root-1-1-2",
              label: "-",
              children: [leaf("root-1-1-2-1", a)],
            },
            leaf("root-1-1-1", b),
          ],
        },
        leaf("root-1-2", c),
      ],
    }),
    [a, b, c],
  );
  return (
    <DemoDraggable
      key={variant}
      draggable={algebraCard}
      initialState={initialState}
      width={300}
      height={350}
    />
  );
}
