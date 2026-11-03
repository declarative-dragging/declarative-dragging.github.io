// src/demos/bezier.tsx, themed. Dots lose their outlines and labels; the
// curve is light red (it's draggable too) or black. In four colors the
// points are a game pad's buttons, lettered: A and Y the ends, B and X the
// controls.

import { type Draggable, param, translate } from "dragology";
import { useMemo } from "react";
import { DemoDraggable } from "../../demo-ui-shim";
import { GRAY, HUES, INK, RED, RED_MID, RED_SOFT, WHITE } from "../palette";
import { useDemoTheme } from "../theme";

type State = {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
};

const state2: State = {
  p0: { x: 50, y: 50 },
  p1: { x: 200, y: 50 },
  p2: { x: 100, y: 200 },
  p3: { x: 300, y: 200 },
};

function evalBezier(state: State, t: number): { x: number; y: number } {
  const { p0, p1, p2, p3 } = state;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}

function bezierPath(state: State): string {
  const { p0, p1, p2, p3 } = state;
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
}

/** How a point is drawn */
type Dot = {
  r: number;
  fill: string;
  stroke?: string;
  label?: string;
  labelFill?: string;
};

type Look = { curve: string; ends: Dot; controls: [Dot, Dot]; endB?: Dot };

export const VARIANTS = {
  minimal: [
    { key: "light", label: "light-red controls, light-red curve" },
    { key: "white-black", label: "white controls, black curve" },
    { key: "white-light", label: "white controls, light-red curve" },
    { key: "light-black", label: "light-red controls, black curve" },
  ],
  four: [
    { key: "abxy-black", label: "A B X Y, black curve" },
    { key: "abxy-light", label: "A B X Y, light-red curve" },
  ],
};

function lookFor(variant: string): Look {
  const end: Dot = { r: 12, fill: RED };
  const light: Dot = { r: 8, fill: RED_MID };
  const white: Dot = { r: 7.5, fill: WHITE, stroke: INK };
  const lettered = (hue: keyof typeof HUES.more, label: string): Dot => ({
    r: 11,
    fill: HUES.more[hue].ink,
    label,
    labelFill: WHITE,
  });
  switch (variant) {
    case "white-black":
      return { curve: INK, ends: end, controls: [white, white] };
    case "white-light":
      return { curve: RED_MID, ends: end, controls: [white, white] };
    case "light-black":
      return { curve: INK, ends: end, controls: [light, light] };
    case "abxy-black":
    case "abxy-light":
      return {
        curve: variant === "abxy-black" ? INK : RED_MID,
        ends: lettered("red", "A"),
        controls: [lettered("yellow", "B"), lettered("blue", "X")],
        endB: lettered("green", "Y"),
      };
    default:
      return { curve: RED_MID, ends: end, controls: [light, light] };
  }
}

/** What a point can be grabbed by, beyond its dot (a fingertip's worth) */
const GRAB_R = 22;

function dot(d: Dot, dragged: boolean) {
  return (
    <g>
      <circle r={GRAB_R} fill="transparent" />
      <circle
        r={d.r}
        fill={d.fill}
        stroke={d.stroke}
        strokeWidth={d.stroke ? 2 : undefined}
        opacity={dragged ? 0.85 : 1}
      />
      {d.label && (
        <text
          y={0.5}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight={700}
          fontSize={d.r * 1.15}
          fill={d.labelFill}
          style={{ pointerEvents: "none" }}
        >
          {d.label}
        </text>
      )}
    </g>
  );
}

function makeDraggable(look: Look): Draggable<State> {
  return ({ state, d, draggedId }) => {
    const { p0, p1, p2, p3 } = state;
    const CURVE_SAMPLES = 9;
    const tValues = Array.from(
      { length: CURVE_SAMPLES },
      (_, i) => (i + 1) / (CURVE_SAMPLES + 1),
    );
    const point = (
      id: string,
      p: { x: number; y: number },
      dd: Dot,
      key: "p0" | "p1" | "p2" | "p3",
    ) => (
      <g
        id={id}
        transform={translate(p.x, p.y)}
        dragologyOnDrag={() =>
          d.vary(state, [param(key, "x"), param(key, "y")])
        }
      >
        {dot(dd, draggedId === id)}
      </g>
    );

    return (
      <g>
        <line
          x1={p0.x}
          y1={p0.y}
          x2={p1.x}
          y2={p1.y}
          stroke={GRAY.g3}
          strokeWidth={1}
          strokeDasharray="4,4"
        />
        <line
          x1={p3.x}
          y1={p3.y}
          x2={p2.x}
          y2={p2.y}
          stroke={GRAY.g3}
          strokeWidth={1}
          strokeDasharray="4,4"
        />
        <path
          d={bezierPath(state)}
          fill="none"
          stroke={look.curve}
          strokeWidth={6}
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />
        {tValues.map((t) => {
          const pt = evalBezier(state, t);
          const isDragged = draggedId === `curve-t-${t}`;
          return (
            <circle
              id={`curve-t-${t}`}
              transform={translate(pt.x, pt.y)}
              r={isDragged ? 8 : 16}
              fill={isDragged ? RED_SOFT : "transparent"}
              opacity={isDragged ? 0.8 : 1}
              dragologyOnDrag={() =>
                d.vary(
                  state,
                  [
                    param("p1", "x"),
                    param("p1", "y"),
                    param("p2", "x"),
                    param("p2", "y"),
                  ],
                  { pin: (s) => [s.p2.x - s.p1.x, s.p2.y - s.p1.y] },
                )
              }
            />
          );
        })}
        {point("control-p1", p1, look.controls[0], "p1")}
        {point("control-p2", p2, look.controls[1], "p2")}
        {point("endpoint-p0", p0, look.ends, "p0")}
        {point("endpoint-p3", p3, look.endB ?? look.ends, "p3")}
      </g>
    );
  };
}

export function Bezier() {
  const { variant } = useDemoTheme();
  const draggable = useMemo(() => makeDraggable(lookFor(variant)), [variant]);
  return (
    <DemoDraggable
      draggable={draggable}
      initialState={state2}
      width={400}
      height={250}
    />
  );
}
