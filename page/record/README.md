# Remaking the page's demo clips

The page's clips (`home/clips/*.mp4`) were Josh's screen recordings of his
demos, in their original colors. These remake them in the page's four-color
theme: the same demos, the same gestures, at the same speeds, filmed
frame-exactly with vrec, the talk's recorder (`d2-talk/recorder/vrec.js` in
the Dragology talk's checkout; it isn't in this repo).

1. **Track the original's cursor.** Extract its frames (the originals are in
   `originals/`: `ffmpeg -i originals/<name>.mp4 <frames>/<name>/f%04d.png`), then
   `ORIG_FRAMES=<frames> python3 -I track.py <frames>/<name> tracks/<name>.json [scales...] [--templates tracks/<name>-templates.json]`.
   It finds the cursor in each frame by masked cross-correlation against
   templates cut from the originals (`templates.json`: an arrow and a fist from
   the bézier clip); a clip whose cursor is drawn at another size wants its
   own templates or scales. The track is the hotspot per frame, which cursor,
   and a score; low scores are gaps (cursor hidden or off the edge).
2. **Write a clip** (`clips/<name>.js`, see `clips/bezier.js`): `card(id, …)`
   from `clips/card.js` films the recording page (`index.html?id=…&size=240`,
   one card's `LiveDemo` alone, built by `build.mjs`) at 2× with a cursor a
   little larger than the originals'. Start the demo where the original starts
   (`state`), in the square of the canvas it showed if the card's own framing
   would differ (`view`), map the original's pixels onto the demo's canvas
   (`toCanvas`, from two landmarks), and `replay` the track: the pointer follows the
   original's path at its speeds, carried through the card's framing as it
   moves, with the button down wherever the original shows a fist (or over
   `downs`, for clips whose cursor never changes).
3. **Film it**: build the recording page (`node page/record/build.mjs`), serve
   `page/` on port 5192 (any static server), then
   `node <talk>/d2-talk/recorder/vrec.js page/record/clips/<name>.js --no-webm`
   (`RECORD_BASE` points it at another server). Out come
   `out/<name>.mp4` (480×480) and `out/<name>.log.json`: each state the demo
   was dropped into and, through each drag, each state it would drop into,
   with the square the card showed, and each press and release, in seconds of
   the video, so a card can go live from wherever its clip had got to.

The perm lab's clip is filmed differently: it replays the talk's take, a
recording of a real mouse on the Permutation Playground slide
(`permutation-lab-take.json`, from the talk's slideshow), on the page's live figure (the
talk's layout). `perm.html` (`perm.tsx`, built by `build-perm.mjs` to
`out/perm.js`) mounts the figure at its canvas's size (960×540);
`clips/permutation-lab.js` maps the take from the slide onto that canvas and
plays it, with vrec's cursor, into `out/permutation-lab.mp4` (1200×674).

The figure can also play itself, with its ghost hand: `perm.html?seed=n`
seeds the ghost, so on vrec's clock a seed always plays the same way, and
`clips/permutation-lab-ghost.js` films a stretch of one seed's play
(`TAKE`), chosen to loop by `perm-windows.mjs` from surveys of many seeds
(see that clip's header), into `out/permutation-lab-ghost.mp4`.

Once a clip looks right, `node page/record/publish.mjs <name>` puts it on the
page: the video, its log (compacted) and its poster, in `home/clips/`. `out/`
itself isn't committed.
