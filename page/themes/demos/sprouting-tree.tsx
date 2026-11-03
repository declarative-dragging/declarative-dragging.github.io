// src/demos/sprouting-tree.tsx, themed: a gray tree, the leaves you pull
// down red and a little smaller, for more room to pull. Its grays are the
// twisted trees' (or, in four colors, a green bush with red berries).

import { type Draggable, translate } from "dragology";
import { useMemo } from "react";
import { DemoDraggable } from "../../demo-ui-shim";
import { GRAY, HUES, RED, onWhite } from "../palette";
import { useDemoTheme } from "../theme";

const NODE_R = 11;
const LEVEL_H = 60;
const LEAF_W = 50;
// What a leaf can be grabbed by, beyond its dot: neighboring leaves on a row
// are LEAF_W apart (rows LEVEL_H), so these come close but never overlap
const GRAB_R = LEAF_W / 2 - 2;

type Tree = { id: string; children: Tree[]; emergeFrom?: string };
type State = { root: Tree };

function leafCount(node: Tree): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + leafCount(c), 0);
}

type Pos = { x: number; y: number };

function layout(node: Tree, x: number, y: number): Map<string, Pos> {
  const positions = new Map<string, Pos>();
  positions.set(node.id, { x, y });
  if (node.children.length === 0) return positions;

  const totalLeaves = leafCount(node);
  const totalWidth = totalLeaves * LEAF_W;
  let cx = x - totalWidth / 2;

  for (const child of node.children) {
    const childLeaves = leafCount(child);
    const childWidth = childLeaves * LEAF_W;
    const childX = cx + childWidth / 2;
    const childPositions = layout(child, childX, y + LEVEL_H);
    for (const [id, pos] of childPositions) {
      positions.set(id, pos);
    }
    cx += childWidth;
  }

  return positions;
}

// Contour-based compact layout: each subtree reports its horizontal
// extent at each depth, and siblings are placed as close as the
// contours allow.

type Contour = { min: number; max: number }[];

type CompactResult = {
  positions: Map<string, Pos>;
  contour: Contour;
};

function compactLayoutInner(node: Tree): CompactResult {
  if (node.children.length === 0) {
    const positions = new Map<string, Pos>();
    positions.set(node.id, { x: 0, y: 0 });
    return { positions, contour: [{ min: 0, max: 0 }] };
  }

  const childResults = node.children.map((c) => compactLayoutInner(c));

  // Place children left to right, computing shifts so contours don't overlap.
  const shifts: number[] = [0];
  for (let i = 1; i < childResults.length; i++) {
    const left = childResults[i - 1];
    const right = childResults[i];
    let minShift = 0;
    const sharedDepth = Math.min(left.contour.length, right.contour.length);
    for (let d = 0; d < sharedDepth; d++) {
      const needed = left.contour[d].max - right.contour[d].min + LEAF_W;
      minShift = Math.max(minShift, needed);
    }
    shifts.push(shifts[i - 1] + minShift);
  }

  // Center children around x=0.
  const totalSpan = shifts[shifts.length - 1];
  const offset = -totalSpan / 2;

  // Build merged positions and contour.
  const positions = new Map<string, Pos>();
  positions.set(node.id, { x: 0, y: 0 });

  const mergedContour: Contour = [{ min: 0, max: 0 }];

  for (let i = 0; i < childResults.length; i++) {
    const dx = shifts[i] + offset;
    const child = childResults[i];

    for (const [id, pos] of child.positions) {
      positions.set(id, { x: pos.x + dx, y: pos.y + LEVEL_H });
    }

    for (let d = 0; d < child.contour.length; d++) {
      const depth = d + 1; // child is one level deeper
      const entry = {
        min: child.contour[d].min + dx,
        max: child.contour[d].max + dx,
      };
      if (depth < mergedContour.length) {
        mergedContour[depth] = {
          min: Math.min(mergedContour[depth].min, entry.min),
          max: Math.max(mergedContour[depth].max, entry.max),
        };
      } else {
        mergedContour.push(entry);
      }
    }
  }

  return { positions, contour: mergedContour };
}

function compactLayout(node: Tree, x: number, y: number): Map<string, Pos> {
  const { positions } = compactLayoutInner(node);
  const result = new Map<string, Pos>();
  for (const [id, pos] of positions) {
    result.set(id, { x: pos.x + x, y: pos.y + y });
  }
  return result;
}

// Fresh ids carry this page load's own prefix, so a card that picks up from
// a state its clip logged (its nodes n0, n1, ...) never makes one twice.
const RUN = Math.random().toString(36).slice(2, 6);
let nextId = 1;
function freshId(): string {
  return `n${RUN}-${nextId++}`;
}

/** Sprout a leaf into a parent with two children.
 *  The child at `keepIndex` keeps the original leaf's ID (so the framework tracks it moving).
 *  The new parent and sibling are new elements. */
function sprout(tree: Tree, targetId: string, keepIndex: 0 | 1): Tree {
  if (tree.id === targetId && tree.children.length === 0) {
    const newParentId = freshId();
    const siblingId = freshId();
    const kept: Tree = { id: targetId, children: [] };
    const sibling: Tree = { id: siblingId, emergeFrom: targetId, children: [] };
    return {
      id: newParentId,
      emergeFrom: targetId,
      children: keepIndex === 0 ? [kept, sibling] : [sibling, kept],
    };
  }
  return {
    ...tree,
    emergeFrom: undefined,
    children: tree.children.map((c) => sprout(c, targetId, keepIndex)),
  };
}

/** Prune: replace the target's parent with just the target.
 *  The target keeps its ID and moves up to the parent's position. */
function prune(tree: Tree, targetId: string): Tree {
  if (tree.children.some((c) => c.id === targetId)) {
    return { id: targetId, children: [] };
  }
  return {
    ...tree,
    emergeFrom: undefined,
    children: tree.children.map((c) => prune(c, targetId)),
  };
}

const initialState: State = {
  root: { id: "n0", children: [] },
};

const WIDTH = 500;
const HEIGHT = 300;

type Config = { compact: boolean };

export const VARIANTS = {
  minimal: [
    { key: "flat", label: "gray, no outlines" },
    { key: "outlined", label: "gray, outlined" },
  ],
  four: [
    { key: "flat", label: "as minimal" },
    { key: "bush", label: "green bush, red berries" },
  ],
};

type Look = {
  edge: string;
  node: { fill: string; stroke?: string };
  leaf: { fill: string; stroke?: string };
};

function lookFor(variant: string): Look {
  const green = HUES.more.green;
  switch (variant) {
    case "outlined":
      return {
        edge: GRAY.g3,
        node: { fill: GRAY.g1, stroke: GRAY.g3 },
        leaf: { fill: onWhite(RED, 0.75), stroke: RED },
      };
    case "bush":
      return {
        edge: green.stroke,
        node: { fill: green.stroke },
        leaf: { fill: RED },
      };
    default:
      // the twisted trees' bubble gray
      return { edge: GRAY.g2, node: { fill: GRAY.g2 }, leaf: { fill: RED } };
  }
}

function draggableFactory(config: Config, look: Look): Draggable<State> {
  return ({ state, d, draggedId }) => {
    const doLayout = config.compact ? compactLayout : layout;
    const positions = doLayout(state.root, WIDTH / 2, 40);

    function renderNode(node: Tree): React.ReactElement {
      const pos = positions.get(node.id)!;
      const leaf = node.children.length === 0;

      return (
        <g id={`tree-${node.id}`}>
          {/* edges to children */}
          {node.children.map((child, i) => {
            const childPos = positions.get(child.id)!;
            return (
              <line
                id={`edge-${node.id}-${i}`}
                x1={pos.x}
                y1={pos.y}
                x2={childPos.x}
                y2={childPos.y}
                stroke={look.edge}
                strokeWidth={3}
                dragologyEmergeFrom={node.emergeFrom || child.emergeFrom}
              />
            );
          })}

          {/* children */}
          {node.children.map((child) => renderNode(child))}

          {/* this node */}
          <g
            id={node.id}
            transform={translate(pos.x, pos.y)}
            dragologyZIndex={draggedId === node.id ? 3 : 1}
            dragologyEmergeFrom={node.emergeFrom}
            dragologyOnDrag={
              leaf &&
              (() => {
                return d
                  .closest([
                    // to children
                    d.between([
                      state,
                      { root: sprout(state.root, node.id, 0) },
                    ]),
                    d.between([
                      state,
                      { root: sprout(state.root, node.id, 1) },
                    ]),
                    // to parent (if not root)
                    state.root.id !== node.id
                      ? d.between([state, { root: prune(state.root, node.id) }])
                      : null,
                  ])
                  .withSnapRadius(5, { chain: true });
              })
            }
          >
            <circle r={leaf ? GRAB_R : NODE_R} fill="transparent" />
            <circle
              r={NODE_R}
              fill={(leaf ? look.leaf : look.node).fill}
              stroke={(leaf ? look.leaf : look.node).stroke}
              strokeWidth={2}
            />
          </g>
        </g>
      );
    }

    return <g>{renderNode(state.root)}</g>;
  };
}

export function SproutingTree() {
  const { variant } = useDemoTheme();
  const draggable = useMemo(
    () => draggableFactory({ compact: false }, lookFor(variant)),
    [variant],
  );
  return (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={WIDTH}
      height={HEIGHT}
    />
  );
}
