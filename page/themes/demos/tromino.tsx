// src/demos/tromino.tsx, themed. The square you drag is red; the
// trominoes are gray or light red (in four colors, a color per size), with
// rounded corners; the board under them is a quiet grid of rounded cells,
// with no outlines of its own to double the trominoes'.

import {
  amb,
  type Draggable,
  rotateDeg,
  runAmb,
  translate,
  Vec2,
} from "dragology";
import _ from "lodash";
import { useMemo } from "react";
import { DemoDraggable } from "../../demo-ui-shim";
import { GRAY, HUES, RED, RED_MID, RED_WASH } from "../palette";
import { useDemoTheme } from "../theme";

type State = {
  missingSquare: Vec2;
};

const initialState: State = {
  missingSquare: Vec2(0),
};

type Config = {
  snappyMode: boolean;
  mazeMode: boolean;
  boardLevel: number;
};

const defaultConfig: Config = {
  snappyMode: false,
  mazeMode: false,
  boardLevel: 3,
};

export const VARIANTS = {
  minimal: [
    { key: "gray", label: "gray trominoes" },
    { key: "light-red", label: "light-red trominoes" },
  ],
  four: [
    { key: "light-red", label: "as minimal: light red" },
    { key: "colors", label: "a color per size" },
    { key: "colors-flat", label: "a color per size, no outlines" },
  ],
};

/** Trominoes' colors by size (level 1 the smallest), and the board's cells */
type Look = {
  tromino: (level: number) => { fill: string; stroke: string | undefined };
  cell: string;
};

function lookFor(variant: string): Look {
  const hues = [HUES.more.blue, HUES.more.green, HUES.more.yellow];
  switch (variant) {
    case "light-red":
      return {
        tromino: () => ({ fill: RED_WASH, stroke: RED_MID }),
        cell: GRAY.g0,
      };
    case "colors":
      return {
        tromino: (l) => ({
          fill: hues[(l - 1) % 3].fill,
          stroke: hues[(l - 1) % 3].stroke,
        }),
        cell: GRAY.g0,
      };
    case "colors-flat":
      return {
        tromino: (l) => ({ fill: hues[(l - 1) % 3].fill, stroke: undefined }),
        cell: GRAY.g0,
      };
    default:
      return {
        tromino: () => ({ fill: GRAY.g1, stroke: GRAY.g3 }),
        cell: GRAY.g0,
      };
  }
}

/** A closed polygon with its corners rounded to radius `r` (or less, where
 * an edge is short) */
function roundedPolygon(pts: [number, number][], r: number): string {
  const n = pts.length;
  const parts: string[] = [];
  for (let k = 0; k < n; k++) {
    const p = Vec2(pts[k]);
    const prev = Vec2(pts[(k + n - 1) % n]);
    const next = Vec2(pts[(k + 1) % n]);
    const rr = Math.min(r, p.dist(prev) / 2, p.dist(next) / 2);
    const a = p.towards(prev, rr);
    const b = p.towards(next, rr);
    parts.push(
      `${k === 0 ? "M" : "L"} ${a.x} ${a.y} Q ${p.x} ${p.y} ${b.x} ${b.y}`,
    );
  }
  return parts.join(" ") + " Z";
}

const DEFAULT_CELL_SIZE = 40;
const PADDING_RATIO = 6 / 40;
const MAX_DIAGRAM_SIZE = 370;

function draggableFactory(config: Config, look: Look): Draggable<State> {
  const { boardLevel } = config;
  const cellSize = Math.min(
    DEFAULT_CELL_SIZE,
    MAX_DIAGRAM_SIZE / 2 ** boardLevel,
  );
  const padding = cellSize * PADDING_RATIO;
  return ({ state, d }) => (
    <g>
      {drawState(state, boardLevel, cellSize, look)}
      <g
        id="missing-square"
        dragologyZIndex={1}
        transform={translate(state.missingSquare.mul(cellSize))}
        dragologyOnDrag={() => {
          if (config.mazeMode) {
            const singleRotations = singleRotationStates(state, boardLevel);
            return config.snappyMode
              ? d
                  .closest([state, singleRotations])
                  .withFloating({ ghost: { opacity: 0.2 } })
                  .withChaining()
              : d
                  .closest(singleRotations.map((s) => d.between([state, s])))
                  .withSnapRadius(1, { chain: true });
          } else {
            const all = allStates(boardLevel);
            return config.snappyMode
              ? d.closest(all).withFloating({ ghost: { opacity: 0.2 } })
              : d.between(all);
          }
        }}
      >
        {/* grabbed anywhere in its cell, and a little beyond (the trominoes
            around it can't be dragged), but not past the board's edge, so
            the board's size stays put */}
        {grabArea(state.missingSquare, 2 ** boardLevel, cellSize)}
        <rect
          transform={translate(padding, padding)}
          width={cellSize - 2 * padding}
          height={cellSize - 2 * padding}
          rx={cellSize * 0.12}
          fill={RED}
        />
      </g>
    </g>
  );
}

/** The missing square's grab area, in its cell's frame: the cell and a fifth
 * of a cell around it, within the `n`×`n` board */
function grabArea(at: Vec2, n: number, cellSize: number) {
  const m = 0.2;
  const x0 = -Math.min(m, at.x);
  const y0 = -Math.min(m, at.y);
  const x1 = 1 + Math.min(m, n - 1 - at.x);
  const y1 = 1 + Math.min(m, n - 1 - at.y);
  return (
    <rect
      transform={translate(x0 * cellSize, y0 * cellSize)}
      width={(x1 - x0) * cellSize}
      height={(y1 - y0) * cellSize}
      fill="transparent"
    />
  );
}

function allStates(boardLevel: number): State[] {
  return runAmb(() => ({
    missingSquare: Vec2(
      amb(_.range(2 ** boardLevel)),
      amb(_.range(2 ** boardLevel)),
    ),
  }));
}

function singleRotationStates(state: State, boardLevel: number): State[] {
  return _.range(1, boardLevel + 1).flatMap((level) => {
    const fullCount = 2 ** level;
    const halfCount = 2 ** (level - 1);
    const isCenterL = state.missingSquare.x % fullCount === halfCount - 1;
    const isCenterR = state.missingSquare.x % fullCount === halfCount;
    const isCenterT = state.missingSquare.y % fullCount === halfCount - 1;
    const isCenterB = state.missingSquare.y % fullCount === halfCount;
    if ((isCenterL || isCenterR) && (isCenterT || isCenterB)) {
      return [
        {
          ...state,
          missingSquare: state.missingSquare.add([isCenterL ? 1 : -1, 0]),
        },
        {
          ...state,
          missingSquare: state.missingSquare.add([0, isCenterT ? 1 : -1]),
        },
      ];
    } else {
      return [];
    }
  });
}

function drawState(
  state: State,
  boardLevel: number,
  cellSize: number,
  look: Look,
) {
  const padding = cellSize * PADDING_RATIO;
  if (boardLevel === 0) {
    const inset = cellSize * 0.04;
    return (
      <rect
        x={inset}
        y={inset}
        width={cellSize - 2 * inset}
        height={cellSize - 2 * inset}
        rx={cellSize * 0.14}
        fill={look.cell}
      />
    );
  }

  const halfCount = 2 ** (boardLevel - 1);
  const missingLeft = state.missingSquare.x < halfCount;
  const missingTop = state.missingSquare.y < halfCount;

  return (
    <g>
      <g transform={translate(0, 0)}>
        {drawState(
          {
            missingSquare:
              missingLeft && missingTop
                ? state.missingSquare
                : Vec2(halfCount - 1, halfCount - 1),
          },
          boardLevel - 1,
          cellSize,
          look,
        )}
      </g>
      <g transform={translate(halfCount * cellSize, 0)}>
        {drawState(
          {
            missingSquare:
              !missingLeft && missingTop
                ? state.missingSquare.sub(Vec2(halfCount, 0))
                : Vec2(0, halfCount - 1),
          },
          boardLevel - 1,
          cellSize,
          look,
        )}
      </g>
      <g transform={translate(0, halfCount * cellSize)}>
        {drawState(
          {
            missingSquare:
              missingLeft && !missingTop
                ? state.missingSquare.sub(Vec2(0, halfCount))
                : Vec2(halfCount - 1, 0),
          },
          boardLevel - 1,
          cellSize,
          look,
        )}
      </g>
      <g transform={translate(halfCount * cellSize, halfCount * cellSize)}>
        {drawState(
          {
            missingSquare:
              !missingLeft && !missingTop
                ? state.missingSquare.sub(Vec2(halfCount, halfCount))
                : Vec2(0),
          },
          boardLevel - 1,
          cellSize,
          look,
        )}
        {/* the tromino! */}
        <path
          d={roundedPolygon(
            [
              [padding, padding],
              [padding - cellSize, padding],
              [padding - cellSize, cellSize - padding],
              [cellSize - padding, cellSize - padding],
              [cellSize - padding, padding - cellSize],
              [padding, padding - cellSize],
            ],
            cellSize * 0.14,
          )}
          transform={rotateDeg(
            missingLeft ? (missingTop ? 0 : 270) : missingTop ? 90 : 180,
            [0, 0],
          )}
          fill={look.tromino(boardLevel).fill}
          stroke={look.tromino(boardLevel).stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}

// # Component

export function Tromino() {
  const { variant } = useDemoTheme();
  const config = defaultConfig;
  const draggable = useMemo(
    () => draggableFactory(config, lookFor(variant)),
    [config, variant],
  );
  const diagramSize = Math.min(
    2 ** config.boardLevel * DEFAULT_CELL_SIZE,
    MAX_DIAGRAM_SIZE,
  );
  return (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={diagramSize}
      height={diagramSize}
    />
  );
}
