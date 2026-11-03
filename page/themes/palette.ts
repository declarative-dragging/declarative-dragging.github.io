// The two color themes for the page's interactives (chosen between on
// review pages that have since been retired: the page uses the four-color one).
//
// - Minimal: white, black and the page's red, plus one ramp of grays. Red
//   is the interaction color: it marks what you grab. "Light red" is red
//   at partial opacity, flattened onto white so overlaps don't darken.
// - Four-color: the same, plus yellow, green and blue: a game pad's four
//   face buttons, A (red) B (yellow) X (blue) Y (green), a little short of
//   fully primary.
//
// Figure 1 and the permutation lab use the four-color tiles in both
// themes; the demo cards are what the themes differ on.

export type Scheme = "minimal" | "four";

export const INK = "#1d1d1f";
export const WHITE = "#ffffff";
/** The page's accent (--accent) */
export const RED = "#dc3400";

/** `hex` at opacity `a`, flattened onto white */
export function onWhite(hex: string, a: number): string {
  const ch = (i: number) =>
    Math.round(255 - a * (255 - parseInt(hex.slice(i, i + 2), 16)))
      .toString(16)
      .padStart(2, "0");
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}

/** Light red, for fills: what's grabbable but not the point */
export const RED_SOFT = onWhite(RED, 0.2);
/** Light red, for lines and small marks */
export const RED_MID = onWhite(RED, 0.45);
/** Lightest red, a wash */
export const RED_WASH = onWhite(RED, 0.1);

/** One ramp of warm grays for every interactive, from the page's rule
 * color (#e7e4dc) and muted text (#6b6b70). */
export const GRAY = {
  /** faint areas: the backs of things */
  g0: "#f6f5f1",
  g1: "#eeece6",
  /** bubbles, panels' rows; about the page's rule */
  g2: "#e4e1d9",
  /** lines and edges */
  g3: "#ccc8bf",
  /** secondary marks */
  g4: "#a19d95",
  /** muted text: the page's --muted */
  g5: "#6b6b70",
};

// # The four colors

export type Hue = "red" | "yellow" | "green" | "blue";

/** A tile's look, as Figure 1 draws it, plus `ink`: the hue at full
 * strength, for wires, dots and text on white. */
export type HueStyle = {
  fill: string;
  stroke: string;
  text: string;
  ink: string;
};

/** `now`: Figure 1's tiles as they are. `more`: a step more saturated,
 * and the red moved onto the page's red. */
export type Saturation = "now" | "more";

const INKS: Record<Hue, string> = {
  red: RED,
  yellow: "#e2a400",
  green: "#16a34a",
  blue: "#2563eb",
};

export const HUES: Record<Saturation, Record<Hue, HueStyle>> = {
  now: {
    blue: {
      fill: "#cde7fc",
      stroke: "#7ab9ef",
      text: "#56a6e8",
      ink: INKS.blue,
    },
    yellow: {
      fill: "#f9e4b0",
      stroke: "#e2b54e",
      text: "#d49b2c",
      ink: INKS.yellow,
    },
    green: {
      fill: "#c4f0dc",
      stroke: "#5cc88a",
      text: "#3aae6a",
      ink: INKS.green,
    },
    red: { fill: "#f3b7b9", stroke: "#d9666c", text: "#c94f56", ink: INKS.red },
  },
  more: {
    blue: {
      fill: "#cfe1fe",
      stroke: "#5d95f1",
      text: "#2f72e4",
      ink: INKS.blue,
    },
    yellow: {
      fill: "#fde7a3",
      stroke: "#eeb820",
      text: "#cc9200",
      ink: INKS.yellow,
    },
    green: {
      fill: "#c8f0d2",
      stroke: "#41bf68",
      text: "#1e9c4b",
      ink: INKS.green,
    },
    red: { fill: "#fdd3c3", stroke: "#f07a50", text: RED, ink: INKS.red },
  },
};

// # Tiles: Figure 1's, the permutation lab's

/** What four tiles are called, and so how they're colored: Figure 1's
 * letters, in the paper's colors (A blue, B yellow, C green, D red), or
 * a game pad's face buttons, in theirs (A red, B yellow, X blue, Y green). */
export type Letters = "ABCD" | "ABXY";

/** The tiles' red (at `more` saturation): built on the page's red, or on
 * a truer red, as the permutation lab's wires had it (#dc2626). The page's
 * red is the more orange of the two. */
export type TileRed = "page" | "true";

export type Look = { letters: Letters; sat: Saturation; red: TileRed };

/** The page's: A B X Y, a step more saturated, the truer red */
export const DEFAULT_LOOK: Look = { letters: "ABXY", sat: "more", red: "true" };

const TRUE_RED: HueStyle = {
  fill: "#f8cfcc",
  stroke: "#e8605c",
  text: "#dc2626",
  ink: "#dc2626",
};

const PAPER: Hue[] = ["blue", "yellow", "green", "red"];
const PAD: Hue[] = ["red", "yellow", "blue", "green"];

/** Tile `i` (0-based): its name and look. Past four, the hues repeat. */
export function tile(
  look: Look,
  i: number,
): { name: string; hue: Hue; style: HueStyle } {
  const pad = look.letters === "ABXY";
  const hue = (pad ? PAD : PAPER)[i % 4];
  const style =
    hue === "red" && look.sat === "more" && look.red === "true"
      ? TRUE_RED
      : HUES[look.sat][hue];
  return {
    name:
      (pad ? "ABXY" : "ABCD")[i % 4] +
      (i >= 4 ? String(Math.floor(i / 4) + 1) : ""),
    hue,
    style,
  };
}

/** The four hues in a demo's own order (`more` saturation): red first,
 * since it's what you grab. */
export const FOUR: HueStyle[] = (
  ["red", "yellow", "green", "blue"] as Hue[]
).map((h) => HUES.more[h]);
