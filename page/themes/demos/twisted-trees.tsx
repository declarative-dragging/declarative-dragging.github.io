// src/demos/twisted-trees/index.tsx, themed: the tree you drag is red
// (it was black), in bubbles of light gray or light red. (Just the 7→7 one,
// without the traditional representation.)

import { curveCardinal, line } from "d3-shape";
import {
  type Draggable,
  type DragSpecBuilder,
  Finalizers,
  pointRef,
  type PointRef,
  type Svgx,
  translate,
  Vec2,
} from "dragology";
import _ from "lodash";
import { useMemo } from "react";
import { overlapIntervals } from "../../demo-logic/twisted-trees/layout";
import {
  getAllMorphs,
  getNodeById,
  tree7,
  TreeMorph,
  TreeNode,
} from "../../demo-logic/twisted-trees/trees";
import { DemoDraggable } from "../../demo-ui-shim";
import { GRAY, RED, RED_MID, RED_SOFT } from "../palette";
import { useDemoTheme } from "../theme";

// returns the path from `node` to another node `n` such that `pred(n)==true`.
function traverseUntilPred<T>(
  node: T,
  next: (n: T) => T[],
  pred: (n: T) => boolean,
) {
  const visited = new Set([node]);
  const todo: [T, T[]][] = [[node, []]];
  while (todo.length > 0) {
    const [cur, path] = todo.pop()!;
    if (pred(cur)) return path;

    for (const nxt of next(cur)) {
      if (!visited.has(nxt)) {
        todo.push([nxt, [...path, nxt]]);
        visited.add(nxt);
      }
    }
  }
}

const nodeDist = (a: TreeNode, b: TreeNode) =>
  traverseUntilPred(
    a,
    (n) => (n ? [...n.children, ...(n.parent ? [n.parent] : [])] : []),
    (n) => n === b,
  )!.length;

// (The demo's other settings, its interpolation and its deliberately worse
// drags, are left out: the card shows the demo as it starts.)
type Config = {
  oneNodeAtATime: boolean;
  showTradRep: boolean;
};

const defaultConfig: Config = {
  oneNodeAtATime: false,
  showTradRep: false,
};

type State = {
  morph: TreeMorph;
  highlightedBgNode?: string;
};

// Pre-compute allMorphs at module level
export const allMorphs7 = getAllMorphs(tree7, tree7);

export const initialState7: State = { morph: allMorphs7[0] };

export const VARIANTS = {
  minimal: [
    { key: "gray", label: "red on light gray" },
    { key: "light-red", label: "red on light red" },
  ],
  four: [
    { key: "gray", label: "as minimal" },
    { key: "light-red", label: "red on light red" },
  ],
};

type Look = { fg: string; bg: string; bgHighlight: string };

function lookFor(variant: string): Look {
  return variant === "light-red"
    ? { fg: RED, bg: RED_SOFT, bgHighlight: RED_MID }
    : { fg: RED, bg: GRAY.g2, bgHighlight: RED_SOFT };
}

export function draggableFactory(
  domainTree: TreeNode,
  codomainTree: TreeNode,
  allMorphs: TreeMorph[],
  config: Config,
  yForTradRep: number,
  look: Look,
  bgRootCenterX?: number,
): Draggable<State> {
  return ({ state, d, draggedId }) => {
    const finalizers = new Finalizers();
    const ctx: Ctx = {
      finalizers,
      morph: state.morph,
      highlightedBgNode: state.highlightedBgNode,
      draggedId,
      d,
      allMorphs,
      codomainTree,
      domainTree,
      config,
      yForTradRep,
      look,
    };

    const elements: Svgx[] = [];
    const r = drawBgTree(codomainTree, domainTree, ctx);

    const rootOffsetX =
      bgRootCenterX !== undefined ? bgRootCenterX - r.bgRootCenterX : 0;

    elements.push(<g transform={translate(rootOffsetX, 0)}>{r.element}</g>);

    const mainTree = <g>{elements}</g>;
    return <g>{[mainTree, ...finalizers.run(mainTree)]}</g>;
  };
}

type Ctx = {
  finalizers: Finalizers;
  morph: TreeMorph;
  highlightedBgNode: string | undefined;
  draggedId: string | null;
  d: DragSpecBuilder<State>;
  allMorphs: TreeMorph[];
  codomainTree: TreeNode;
  domainTree: TreeNode;
  config: Config;
  yForTradRep: number;
  look: Look;
};

// # Drag spec

function dragSpec(draggedNodeId: string, ctx: Ctx) {
  const domainIds = Object.keys(ctx.morph);

  let newMorphs;

  if (ctx.config.oneNodeAtATime) {
    newMorphs = ctx.allMorphs.filter((newMorph) =>
      domainIds.every(
        (nodeId) =>
          nodeId === draggedNodeId || ctx.morph[nodeId] === newMorph[nodeId],
      ),
    );
  } else {
    // Group morphisms by where they send draggedNodeId
    const morphsByDragTarget = _.groupBy(
      ctx.allMorphs,
      (targetMorph) => targetMorph[draggedNodeId],
    );

    // For each group, pick the morphism with minimum total movement
    newMorphs = Object.values(morphsByDragTarget).map(
      (morphsWithDragTarget) =>
        _.minBy(morphsWithDragTarget, (newMorph) =>
          _.sum(
            domainIds.map((nodeId) =>
              nodeDist(
                getNodeById(ctx.codomainTree, ctx.morph[nodeId])!,
                getNodeById(ctx.codomainTree, newMorph[nodeId])!,
              ),
            ),
          ),
        )!,
    );
  }

  return ctx.d
    .between(
      newMorphs.map((morph) => ({ morph })),
      { interpolation: "natural-neighbor" },
    )
    .withSnapRadius(20, { transition: true });
}

// # Drawing constants

const BG_NODE_PADDING = 10;
const BG_NODE_GAP = 40;
const FG_NODE_SIZE = 40;
const FG_NODE_GAP = 20;
// What a node can be grabbed by, beyond its circle: nodes are at least
// FG_NODE_SIZE + FG_NODE_GAP apart, so these come close but never overlap
const GRAB_R = (FG_NODE_SIZE + FG_NODE_GAP) / 2 - 2;

// # Main drawing functions

function drawBgTree(
  bgNode: TreeNode,
  fgNode: TreeNode,
  ctx: Ctx,
): { element: Svgx; w: number; h: number; bgRootCenterX: number } {
  const result = drawBgSubtree(bgNode, [fgNode], ctx);
  return {
    element: result.element,
    w: result.w,
    h: result.h,
    bgRootCenterX: result.bgRootCenterX,
  };
}

function drawBgSubtree(
  bgNode: TreeNode,
  fgNodes: TreeNode[],
  ctx: Ctx,
): {
  element: Svgx;
  w: number;
  h: number;
  rootCenter: PointRef;
  bgRootCenterX: number;
} {
  const elements: Svgx[] = [];

  const [fgNodesHere, fgNodesBelow] = _.partition(
    fgNodes,
    (n) => ctx.morph[n.id] === bgNode.id,
  );

  const bgNodeR = drawBgNodeWithFgNodesInside(bgNode, fgNodesHere, ctx);

  fgNodesBelow.push(...bgNodeR.fgNodesBelow);

  if (bgNode.children.length === 0) {
    return {
      element: bgNodeR.element,
      w: bgNodeR.w,
      h: bgNodeR.h,
      rootCenter: bgNodeR.rootCenter,
      bgRootCenterX: bgNodeR.bgRootCenterX,
    };
  }

  const childRs = bgNode.children.map((child) =>
    drawBgSubtree(child, fgNodesBelow, ctx),
  );

  const childrenWidth =
    _.sumBy(childRs, (r) => r.w) + BG_NODE_GAP * (childRs.length - 1);

  const params = {
    aLength: bgNodeR.w,
    aAnchor: bgNodeR.w / 2,
    bLength: childrenWidth,
    bAnchor: childrenWidth / 2,
  };
  const { aOffset, bOffset, length: width } = overlapIntervals(params);

  elements.push(
    <g id={`bg-node-group-${bgNode.id}`} transform={translate(aOffset, 0)}>
      {bgNodeR.element}
    </g>,
  );

  let x = bOffset;
  const y = bgNodeR.h + BG_NODE_GAP;
  let maxY = bgNodeR.h;

  for (const [i, childR] of childRs.entries()) {
    const child = bgNode.children[i];
    const childOffset = Vec2(x, y);
    elements.push(
      <g
        id={`bg-child-group-${bgNode.id}-${child.id}`}
        transform={translate(childOffset)}
      >
        {childR.element}
      </g>,
    );

    x += childR.w + BG_NODE_GAP;
    maxY = Math.max(maxY, y + childR.h);

    const bgRootCenter = bgNodeR.rootCenter;
    const childRootCenter = childR.rootCenter;

    ctx.finalizers.push((resolve) => {
      const from = resolve(bgRootCenter);
      const to = resolve(childRootCenter);
      return (
        <line
          id={`bg-edge-${bgNode.id}-${child.id}`}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke={ctx.look.bg}
          strokeWidth={12}
          dragologyZIndex="/-2"
        />
      );
    });
  }

  return {
    element: <g>{elements}</g>,
    w: width,
    h: maxY,
    rootCenter: bgNodeR.rootCenter,
    bgRootCenterX: aOffset + bgNodeR.bgRootCenterX,
  };
}

function drawBgNodeWithFgNodesInside(
  bgNode: TreeNode,
  fgNodesHere: TreeNode[],
  ctx: Ctx,
): {
  element: Svgx;
  w: number;
  h: number;
  fgNodesBelow: TreeNode[];
  rootCenter: PointRef;
  bgRootCenterX: number;
} {
  const elementsInRect: Svgx[] = [];

  let x = BG_NODE_PADDING;
  let y = BG_NODE_PADDING;
  let maxX = x + 10;
  let maxY = y + 10;
  const fgNodesBelow: TreeNode[] = [];

  for (const fgNode of fgNodesHere) {
    const r = drawFgSubtreeInBgNode(fgNode, bgNode.id, ctx);
    elementsInRect.push(
      <g id={`fg-in-bg-${bgNode.id}-${fgNode.id}`} transform={translate(x, y)}>
        {r.element}
      </g>,
    );

    x += r.w + FG_NODE_GAP;
    maxX = Math.max(maxX, x - FG_NODE_GAP);
    maxY = Math.max(maxY, y + r.h);

    fgNodesBelow.push(...r.fgNodesBelow);
  }

  maxX += BG_NODE_PADDING;
  maxY += BG_NODE_PADDING;

  const nodeCenterInRect = Vec2(maxX / 2, maxY / 2);
  const circleRadius = nodeCenterInRect.len();
  const nodeCenterInCircle = Vec2(circleRadius);
  const offset = nodeCenterInCircle.sub(nodeCenterInRect);

  const circleId = `bg-circle-${bgNode.id}`;

  return {
    element: (
      <g>
        <circle
          id={circleId}
          cx={nodeCenterInCircle.x}
          cy={nodeCenterInCircle.y}
          r={circleRadius}
          fill={
            ctx.highlightedBgNode === bgNode.id
              ? ctx.look.bgHighlight
              : ctx.look.bg
          }
          dragologyZIndex="/-1"
        />
        <g transform={translate(offset)}>{elementsInRect}</g>
      </g>
    ),
    w: 2 * circleRadius,
    h: 2 * circleRadius,
    fgNodesBelow,
    rootCenter: pointRef(circleId, nodeCenterInCircle),
    bgRootCenterX: nodeCenterInCircle.x,
  };
}

function drawFgSubtreeInBgNode(
  fgNode: TreeNode,
  bgNodeId: string,
  ctx: Ctx,
): {
  element: Svgx;
  fgNodesBelow: TreeNode[];
  w: number;
  h: number;
} {
  const childrenElements: Svgx[] = [];
  const childrenId = `fg-children-${fgNode.id}`;
  const fgNodesBelow: TreeNode[] = [];
  let childrenX = 0;
  let childrenMaxH = 0;

  for (const [i, child] of fgNode.children.entries()) {
    if (i > 0) {
      childrenX += FG_NODE_GAP;
    }

    const edgeId = `fg-edge-${fgNode.id}-${child.id}`;

    if (ctx.morph[child.id] === bgNodeId) {
      const r = drawFgSubtreeInBgNode(child, bgNodeId, ctx);
      childrenElements.push(
        <g
          id={`fg-child-${fgNode.id}-${child.id}`}
          transform={translate(childrenX, 0)}
        >
          {r.element}
        </g>,
      );
      fgNodesBelow.push(...r.fgNodesBelow);
      childrenX += r.w;
      childrenMaxH = Math.max(childrenMaxH, r.h);

      ctx.finalizers.push((resolve) => {
        const from = resolve(pointRef(fgNode.id, Vec2(0)));
        const to = resolve(pointRef(child.id, Vec2(0)));
        return (
          <path
            id={edgeId}
            d={
              line().curve(curveCardinal)([
                [from.x, from.y],
                [from.x, from.y],
                [to.x, to.y],
              ])!
            }
            fill="none"
            stroke={ctx.look.fg}
            strokeWidth={2}
            dragologyZIndex="/-1"
          />
        );
      });
    } else {
      fgNodesBelow.push(child);

      const intermediateRef = pointRef(childrenId, Vec2(childrenX, 0));
      ctx.finalizers.push((resolve) => {
        const myCenter = resolve(pointRef(fgNode.id, Vec2(0)));
        const intermediate = resolve(intermediateRef);
        const childCenter = resolve(pointRef(child.id, Vec2(0)));
        return (
          <path
            id={edgeId}
            d={
              line().curve(curveCardinal)([
                myCenter.arr(),
                intermediate.arr(),
                childCenter.arr(),
              ])!
            }
            fill="none"
            stroke={ctx.look.fg}
            strokeWidth={2}
          />
        );
      });
    }
  }

  let nodeX;
  let childrenTransform;
  if (childrenX < FG_NODE_SIZE) {
    nodeX = FG_NODE_SIZE / 2;
    childrenTransform = translate(
      (FG_NODE_SIZE - childrenX) / 2,
      FG_NODE_SIZE + FG_NODE_GAP,
    );
  } else {
    nodeX = childrenX / 2;
    childrenTransform = translate(0, FG_NODE_SIZE + FG_NODE_GAP);
  }

  const childrenContainer = (
    <g id={childrenId} transform={childrenTransform}>
      {childrenElements}
    </g>
  );

  const nodeCenter = Vec2(nodeX, FG_NODE_SIZE / 2);

  return {
    element: (
      <g>
        <g
          id={fgNode.id}
          transform={translate(nodeCenter)}
          dragologyOnDrag={() => dragSpec(fgNode.id, ctx)}
        >
          <circle r={GRAB_R} fill="transparent" />
          <circle r={FG_NODE_SIZE / 2} fill={ctx.look.fg} />
        </g>
        {childrenContainer}
      </g>
    ),
    fgNodesBelow,
    w: Math.max(childrenX, FG_NODE_SIZE),
    h: FG_NODE_SIZE + (childrenMaxH > 0 ? FG_NODE_GAP + childrenMaxH : 0),
  };
}

// # Component

export function TwistedTrees() {
  const { variant } = useDemoTheme();
  const draggable = useMemo(
    () =>
      draggableFactory(
        tree7,
        tree7,
        allMorphs7,
        defaultConfig,
        500,
        lookFor(variant),
      ),
    [variant],
  );
  return (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState7}
      width={400}
      height={600}
    />
  );
}
