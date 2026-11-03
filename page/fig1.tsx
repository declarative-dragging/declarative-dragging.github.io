// Figure 1 of the paper ("How it works"), live: mounts the figure
// (themes/fig1.tsx, where its code and the story of its layout are) in the
// page's look (themes/palette.ts).
//
// Mounted into #fig1-figure in place of its image (which stays without
// JS). On a touch screen, on a phone held upright, it takes the phone's
// layout instead: about a screen tall, the live view at the bottom.

import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { tapToWake } from "./tap-to-wake";
import {
  ARROW_STYLES,
  type ArrowStyle,
  ConceptFigure,
  ConceptFigurePhone,
  FN_MARKS,
  type FnMark,
  type WebFont,
} from "./themes/fig1";
import { DEFAULT_LOOK } from "./themes/palette";

/** `?fig1arrow=`: how the render arrows are drawn (themes/fig1.tsx); block arrows carrying "fn" if it's absent */
const ARROWS: ArrowStyle =
  ARROW_STYLES.find(
    (s) => s === new URLSearchParams(location.search).get("fig1arrow"),
  ) ?? "block";

/** `?fig1fn=`: the function's mark on those arrows; "fn" if it's absent */
const MARK: FnMark =
  (Object.keys(FN_MARKS) as FnMark[]).find(
    (m) => m === new URLSearchParams(location.search).get("fig1fn"),
  ) ?? "fn";

/**
 * Loads the web fonts a mark needs (Google Fonts stylesheets, font files), so
 * its glyphs are drawn in them from the start; gives up after a few seconds.
 */
function loadFonts(fonts: WebFont[]): Promise<unknown> {
  const all = Promise.all(
    fonts.map(async (f) => {
      if (f.url) {
        const face = new FontFace(f.family, `url(${f.url}) format("woff2")`, {
          style: f.style,
        });
        document.fonts.add(face);
        await face.load();
        return;
      }
      if (!document.querySelector(`link[href="${f.css}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = f.css!;
        await new Promise((done) => {
          link.onload = link.onerror = done;
          document.head.append(link);
        });
      }
      await document.fonts.load(`${f.style} 20px "${f.family}"`, f.text);
    }),
  );
  return Promise.race([
    all.catch(() => {}),
    new Promise((done) => setTimeout(done, 4000)),
  ]);
}

/** A phone held upright: narrower than this */
const NARROW = "(max-width: 540px)";

// The phone layout's figure reaches out near the screen's edges, over the
// column's padding, so its row of targets can be as wide as the screen
const PHONE_CSS = `
  @media ${NARROW} {
    #fig1-figure.fig1-phone { margin-inline: -14px; padding: 0.5rem 4px 0.6rem; }
    #fig1-figure.fig1-phone > figcaption { margin-top: 0.8rem; padding-inline: 0.4rem; }
  }
`;

/** The figure, in the phone's layout while the screen is narrow */
function PhoneOrNot() {
  const narrow = useSyncExternalStore(
    (changed) => {
      const q = matchMedia(NARROW);
      q.addEventListener("change", changed);
      return () => q.removeEventListener("change", changed);
    },
    () => matchMedia(NARROW).matches,
  );
  return narrow ? (
    <ConceptFigurePhone look={DEFAULT_LOOK} arrows={ARROWS} mark={MARK} />
  ) : (
    <ConceptFigure look={DEFAULT_LOOK} arrows={ARROWS} mark={MARK} />
  );
}

async function main() {
  // the page's figure: live with a mouse, and on a touch screen once tapped
  const figure = document.getElementById("fig1-figure");
  const hover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!figure) return;
  const fallback = figure.querySelector(":scope > img");
  if (!fallback) return;
  // the image stays until the mark's fonts are in
  await loadFonts(FN_MARKS[MARK].fonts);
  const host = document.createElement("div");
  fallback.replaceWith(host);
  if (hover) {
    createRoot(host).render(
      <ConceptFigure look={DEFAULT_LOOK} arrows={ARROWS} mark={MARK} />,
    );
    return;
  }
  const style = document.createElement("style");
  style.textContent = PHONE_CSS;
  document.head.append(style);
  figure.classList.add("fig1-phone");
  createRoot(host).render(<PhoneOrNot />);
  tapToWake(host);
}

main();
