// src/demos/braid-old.tsx, themed. Minimal: black strands, red ends to
// pull. Four colors: each strand its own color (as the permutation lab's
// wires are), its end in its color or red.

import { type Draggable, translate } from "dragology";
import { produce } from "immer";
import _ from "lodash";
import { useMemo } from "react";
import { DemoDraggable } from "../../demo-ui-shim";
import { FOUR, INK, RED } from "../palette";
import { useDemoTheme } from "../theme";

type State = {
  n: number;
  seq: [number, number][];
};

const initialState: State = { n: 4, seq: [] };

export const VARIANTS = {
  minimal: [{ key: "red-ends", label: "black strands, red ends" }],
  four: [
    { key: "strand-ends", label: "colored strands, ends to match" },
    { key: "thick", label: "thicker colored strands, ends to match" },
    { key: "red-ends", label: "colored strands, red ends" },
  ],
};

type Look = {
  strand: (p: number) => string;
  end: (p: number) => string;
  width: number;
};

function lookFor(scheme: string, variant: string): Look {
  if (scheme === "minimal")
    return { strand: () => INK, end: () => RED, width: 2 };
  const strand = (p: number) => FOUR[p % 4].ink;
  return {
    strand,
    end: variant === "red-ends" ? () => RED : strand,
    width: variant === "thick" ? 4 : 2.5,
  };
}

function makeDraggable(look: Look): Draggable<State> {
  return ({ state, d, setState }) => {
    const TILE_SIZE = 50;
    let perm = _.range(state.n);
    const line = (
      id: string | undefined,
      p: number,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      z?: number,
    ) => (
      <line
        id={id}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={look.strand(p)}
        strokeWidth={look.width}
        strokeLinecap="round"
        // the zero-length lines at the bottom (there for the next row's
        // strands to grow from) would show as dots; an opacity, unlike a
        // cap, blends as they grow
        strokeOpacity={x1 === x2 && y1 === y2 ? 0 : 1}
        dragologyZIndex={z}
      />
    );

    return (
      <g>
        <style>{`.braid-flip-target:hover { opacity: 0.15 !important; }`}</style>
        <g>
          {_.range(state.n).map((i) =>
            line(undefined, i, i * TILE_SIZE, 0, i * TILE_SIZE, TILE_SIZE),
          )}
        </g>
        {state.seq.map(([i, j], idx) => {
          perm = perm.slice();
          [perm[i], perm[j]] = [perm[j], perm[i]];
          return (
            <g
              id={`swap-${idx}`}
              transform={translate(0, (idx + 1) * TILE_SIZE)}
            >
              {line(
                `line-${perm[i]}-${idx}`,
                perm[i],
                j * TILE_SIZE,
                0,
                i * TILE_SIZE,
                TILE_SIZE,
                -1,
              )}
              <circle
                id={`line-bkgrnd-${perm[i]}-${idx}`}
                cx={((i + j) * TILE_SIZE) / 2}
                cy={TILE_SIZE / 2}
                r={TILE_SIZE / 7}
                fill="white"
                dragologyZIndex={0}
              />
              {line(
                `line-${perm[j]}-${idx}`,
                perm[j],
                i * TILE_SIZE,
                0,
                j * TILE_SIZE,
                TILE_SIZE,
                1,
              )}
              <circle
                id={`flip-${idx}`}
                cx={((i + j) * TILE_SIZE) / 2}
                cy={TILE_SIZE / 2}
                r={TILE_SIZE / 3}
                fill={RED}
                dragologyZIndex={2}
                onClick={() =>
                  setState(
                    produce(state, (s) => {
                      s.seq[idx] = [j, i];
                    }),
                  )
                }
                cursor="pointer"
                opacity={0}
                className="braid-flip-target"
              />
              {_.range(state.n).map((k) =>
                k !== i && k !== j
                  ? line(
                      `line-${perm[k]}-${idx}`,
                      perm[k],
                      k * TILE_SIZE,
                      0,
                      k * TILE_SIZE,
                      TILE_SIZE,
                    )
                  : null,
              )}
            </g>
          );
        })}
        <g transform={translate(0, (state.seq.length + 1) * TILE_SIZE)}>
          {perm.map((p, i) =>
            line(
              `line-${p}-${state.seq.length}`,
              p,
              i * TILE_SIZE,
              0,
              i * TILE_SIZE,
              0,
            ),
          )}
        </g>
        {perm.map((p, i) => (
          <g
            id={`strand-end-${p}`}
            transform={translate(
              i * TILE_SIZE,
              (state.seq.length + 1) * TILE_SIZE,
            )}
            dragologyZIndex={1}
            dragologyOnDrag={() =>
              d
                .closest([
                  d.between([
                    state,
                    i > 0 &&
                      produce(state, (s) => {
                        s.seq.push([i, i - 1]);
                      }),
                    i < state.n - 1 &&
                      produce(state, (s) => {
                        s.seq.push([i, i + 1]);
                      }),
                  ]),
                  state.seq.length > 0 &&
                    d.between([
                      state,
                      produce(state, (s) => {
                        s.seq.pop();
                      }),
                    ]),
                ])
                .withSnapRadius(1, { chain: true })
            }
          >
            {/* grabbed a little beyond the dot: the ends are TILE_SIZE apart */}
            <circle r={TILE_SIZE / 2 - 3} fill="transparent" />
            <circle r={look.width > 3 ? 7 : 6} fill={look.end(p)} />
          </g>
        ))}
      </g>
    );
  };
}

export function Braid() {
  const { scheme, variant } = useDemoTheme();
  const draggable = useMemo(
    () => makeDraggable(lookFor(scheme, variant)),
    [scheme, variant],
  );
  return (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={250}
      height={400}
    />
  );
}
