// How a themed demo learns its theme: the card (or review page) that
// mounts it provides the scheme and which of the demo's variants to draw.

import { createContext, useContext } from "react";
import { DEFAULT_LOOK, type Look, type Scheme } from "./palette";

export type DemoTheme = {
  scheme: Scheme;
  /** One of the demo's VARIANTS[scheme] keys; "" for its first */
  variant: string;
  /** Figure 1's and the permutation lab's tiles */
  look: Look;
};

export const DemoThemeContext = createContext<DemoTheme>({
  scheme: "minimal",
  variant: "",
  look: DEFAULT_LOOK,
});

export const useDemoTheme = () => useContext(DemoThemeContext);

/** A demo's variants, per scheme; the first of each is its default. */
export type Variants = Record<Scheme, { key: string; label: string }[]>;
