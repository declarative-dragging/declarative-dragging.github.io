# Figure 1, live: design notes (2026-10-28)

## Why the live version is shaky

- The paper's figure is a storyboard: five frozen stages of one drag of one tile, read in order (render → targets → speculative renders → drop zones → interaction).
- Live, all five panels update at once, so it reads as five synchronized views, not a sequence.
- With both live, panels 1 and 5 are the same view at two sizes.
- It always needs a subject (which tile 2–4 are about). The shadow hand on the focal tile patches this; it doesn't fix it.
- At column width it's small: tiles ~25px, captions ~10px. Fine for a still, cramped to drag.

## If designed live from the start

- One large live view, serving as both 1 and 5.
- During a drag, the drop zones drawn on that view (absorbing 4).
- Under it, a strip of the target states, lighting up the one the drag would drop into (2 and 3).
- Model-state code above, updating on drop.

## Options

1. Keep the paper's still figure as Figure 1, and add a small live companion under it with a layout made for dragging. (Recommended.)
2. Redesign Figure 1 as one live figure, as above.
3. Keep the current live figure (paper layout, shadow hand, hover to refocus).

Code: `themes/fig1.tsx` (mounted by `fig1.tsx`) in this folder; built by `build.mjs`.

## Decided (2026-10-29)

Layout A ("side": captions 1–3 down the left, 4 beside the view) is live on both sites, `ConceptFigure` in `themes/fig1.tsx`. Its rules, settled with Andrew:

- At rest: no drop zones or links; the hand (cursor-sized, opaque, no animation) rests on A, or on the tile last clicked or dragged. Hover changes nothing; the hand hides while the pointer is on a tile and comes back 250ms after it leaves.
- While dragging: zones, links, a soft shadow on the dragged tile. The model card keeps the state the drag started from until the drop (Andrew, 2026-11-01: the highlighted target already shows where it will go; it used to show that target, marked "on drop").
- Each target shows its state (code), a render arrow, and its rendering.

Layout C ("rows") was dropped (2026-10-30); a review page (`fig1.html`, retired) showed layout A beside the paper's original.

### Links from targets to drop zones (settled 2026-10-30)

- Every link is one cubic, no curvier than an S: straight up out of its target's column, then into its zone (`entry`, `linkPath` in `themes/fig1.tsx`).
- Links never cross. The targets are ordered by where each link comes up past the bottom row (`lane`):
  - the top row's first zone: the leftmost column, coming in steeply from the lower left (as an S, not an arc);
  - the top row's last zone: the rightmost column, from the lower right, under caption 4. With a zone under it, at about 55°, the steepest that clears the zone right of that one;
  - a top-row zone in between: up through the gap right of the zone under it;
  - bottom-row zones: straight up from below.
- So with two zones on top the columns read top 1, bottom 1–3, top 2; with three, top 1, bottom 1–2, top 2–3. This order shows at rest, unlike the paper's.
- Rejected: two-part links (a rise, then a turn into the top row) had snags; with the paper's order, link 4 had to squeeze between zone 5 and link 5.

## Colors (settled 2026-10-30)

The page's four-color theme (`themes/palette.ts`): tiles lettered A B X Y in a game pad's colors (A red, B yellow, X blue, Y green), a step more saturated than before, the red a true red (#dc2626); the dragged tile's marks (zones, links, rings) in the page's red, #dc3400, where the paper had magenta; render arrows black. In the code, each tile's string is in its tile's color.
