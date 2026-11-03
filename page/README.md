# The project page

The page at [declarative-dragging.github.io](https://declarative-dragging.github.io) is `../home/`, and this is where it's edited. andrewblinn.com/papers/d2 is a copy made from it by a script outside this repo, so don't edit that one.

- `home/index.html` is the page: its text, layout and CSS, all hand-written.
- `home/header.js`, `home/cards.js` and `home/drag-shared.js` make the header and the demo cards draggable.
- `home/clips/` holds the demo cards' and perm lab's clips, with logs that say which state each frame shows, so a card can go live where its clip had got to.
- `page/` (here) is the source of the live figures: Figure 1 (`fig1.tsx`, `themes/fig1.tsx`), the perm lab (`perm.tsx`, `themes/permutation-lab.tsx`), the whiteboard (`whiteboard.tsx`) and the demo cards' live pictures (`cards-demos.tsx`, `themes/demos/`). `npm run build` bundles them into `home/js/`, which isn't committed: the Pages workflow builds it.

With a mouse, the figures and the header are live from the start. On a touch screen each figure goes live when tapped, with layouts and grab targets sized for fingers (Figure 1's phone layout, the perm lab's tall one), and the header stays put so it doesn't get in the way of scrolling.

## Working on it

```bash
cd page
npm install
npm run build        # or npm run watch
npm run typecheck
python3 -m http.server 8768 --directory ../home   # then http://localhost:8768
```

React comes from esm.sh, through the page's import map, so the bundles leave it out.

## Dragology

The figures use the `dragology` package, but for now it's a build vendored in `vendor/`: the org repo's main plus [declarative-dragging/dragology#4](https://github.com/declarative-dragging/dragology/pull/4), which exports a few things the page needs (`npm view dragology` has 0.1.7, from May). Once a release has them, swap it in and delete `vendor/`:

```bash
npm install dragology@<that version>
```

The library doesn't ship its demos, so the logic the demo cards share with them is copied into `demo-logic/` (animate-algebra's trees and rewrites, twisted trees' morphs and layout). `arrowhead.tsx` is likewise copied from the library's `src/arrows.tsx`, and `whiteboard-live/wb.tsx` from the talk.

## The other tools

- **The walk figure** (under Josh's quote) is a baked image, `home/walk/walk-figure.webp`, made from `home/walk/layout.json` and the pieces beside it by `home/walk.js`. To change it, run `npm run walk-editor` and open http://localhost:8767/review/walk-editor.html. It saves the layout as you edit and bakes the image from its button. Baking needs Chrome.
- **The clips** are remade with a recorder; see `record/README.md`.
- `fig1-design-notes.md` has the rules Figure 1's drag follows, settled with Andrew.
