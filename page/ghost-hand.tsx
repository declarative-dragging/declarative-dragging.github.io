// The ghost hand that plays the D2 page's live figures (the permutation lab,
// Figure 1) until the reader takes over.
//
// The ghost drives a real DraggableRenderer with synthetic PointerEvents,
// the way the slideshow's rails do (src/slideshow/rails.tsx), so everything
// it does is an ordinary drag: when the reader takes over, they carry on
// from whatever state it left. Its moves are shaped like a hand's: curved
// reaches with an early speed peak, a settle before grabbing, the odd
// overshoot and correction, a slight tremor. A figure subclasses GhostHand
// with what it does (`loop`) and where its points are on the page.

import { Vec2 } from "dragology";
import type { ReactNode } from "react";

// # Randomness and easing

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const chance = (p: number) => Math.random() < p;
export const pick = <T,>(xs: T[]): T =>
  xs[Math.floor(Math.random() * xs.length)];
export const sign = () => (chance(0.5) ? 1 : -1);

/** Minimum-jerk position profile: the bell-shaped speed of a human reach */
const minJerk = (t: number) => t * t * t * (10 - 15 * t + 6 * t * t);

function bezier(a: Vec2, b: Vec2, c: Vec2, d: Vec2, t: number): Vec2 {
  const s = 1 - t;
  return a
    .mul(s * s * s)
    .add(b.mul(3 * s * s * t), c.mul(3 * s * t * t), d.mul(t * t * t));
}

export function pickWeighted<T>(options: [T, number][]): T | null {
  const total = options.reduce((acc, [, w]) => acc + w, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [x, w] of options) if ((r -= w) <= 0) return x;
  return options[options.length - 1][0];
}

// # The ghost

export class Stopped extends Error {}

export type Run = { stopped: boolean };

export type Gesture = (run: Run) => Promise<void>;

export abstract class GhostHand {
  down = false;
  private pressed: Element | null = null;
  private run: Run | null = null;

  constructor(
    /** Where the ghost's pointer is, in the figure's coordinates */
    public pos: Vec2,
    private cursor: HTMLElement,
    /**
     * The size of the permutation lab's canvas px, which the motion is
     * tuned in, in the figure's units (and so on screen, about the same)
     */
    protected unit = 1,
  ) {}

  /** Where a point of the figure is on the page now, in client px */
  protected abstract client(p: Vec2): { clientX: number; clientY: number };
  /** Where a point of the figure is in the cursor's offset parent, in px */
  protected abstract place(p: Vec2): Vec2;
  /** Whether an element is part of the figure */
  protected abstract owns(el: Element): boolean;
  /** Keeps the pointer on the figure */
  protected abstract clamp(p: Vec2): Vec2;
  /** What the ghost does, over and over, until it's stopped */
  protected abstract loop(run: Run): Promise<void>;

  get running() {
    return this.run !== null;
  }

  start() {
    if (this.run) return;
    const run: Run = { stopped: false };
    this.run = run;
    this.drawCursor();
    this.cursor.style.opacity = "1";
    this.loop(run).catch((e) => {
      if (!(e instanceof Stopped)) console.error(e);
    });
  }

  /** Stops at once, letting go first if it's holding something. */
  stop() {
    if (!this.run) return;
    this.run.stopped = true;
    this.run = null;
    if (this.down) this.release();
    this.cursor.style.opacity = "0";
  }

  // ## Events

  private dispatch(type: string, target: EventTarget) {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        ...this.client(this.pos),
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: type === "pointermove" ? -1 : 0,
        buttons: this.down ? 1 : 0,
      }),
    );
  }

  protected moveTo(p: Vec2) {
    this.pos = this.clamp(p);
    this.drawCursor();
    // While pressed, moves go where the press started, as with pointer
    // capture; DraggableRenderer listens on document, which they reach.
    if (this.down) this.dispatch("pointermove", this.pressed ?? document);
  }

  protected press(target: Element) {
    this.down = true;
    this.pressed = target;
    this.dispatch("pointerdown", target);
    this.drawCursor();
  }

  protected release() {
    this.down = false;
    this.dispatch("pointerup", this.pressed ?? document);
    this.pressed = null;
    this.drawCursor();
  }

  private drawCursor() {
    const at = this.place(this.pos);
    this.cursor.style.transform = `translate(${at.x}px, ${at.y}px)`;
    let shape = "arrow";
    if (this.down) {
      shape = "fist";
    } else {
      const { clientX, clientY } = this.client(this.pos);
      const under = document.elementFromPoint(clientX, clientY);
      if (
        under &&
        this.owns(under) &&
        /grab|resize|move|pointer/.test(getComputedStyle(under).cursor)
      )
        shape = "hand";
    }
    for (const el of this.cursor.children as HTMLCollectionOf<HTMLElement>)
      el.style.display = el.dataset.shape === shape ? "block" : "none";
  }

  // ## Motion

  private frame(run: Run): Promise<number> {
    return new Promise((resolve, reject) =>
      requestAnimationFrame((t) =>
        run.stopped ? reject(new Stopped()) : resolve(t),
      ),
    );
  }

  /** Waits, with the faint drift of a hand that's resting, not frozen. */
  protected async sleep(run: Run, ms: number) {
    const home = this.pos;
    const ph = rand(0, 6.3);
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      await this.frame(run);
      const u = (performance.now() - t0) / 1000;
      const drift = Vec2(
        Math.sin(u * 2.1 + ph),
        Math.sin(u * 1.7 + 2 * ph),
      ).mul(0.5 * this.unit);
      // only worth dispatching while it moves something
      if (this.down) this.moveTo(home.add(drift));
    }
  }

  /** One smooth curved movement to `to`. */
  protected async glide(
    run: Run,
    to: Vec2,
    { ms, bend, slow = 1 }: { ms?: number; bend?: number; slow?: number } = {},
  ) {
    const from = this.pos;
    const dist = from.dist(to);
    if (dist < 0.5) return;
    // Fitts-ish: longer reaches take longer, but not proportionally
    const duration =
      ms ??
      (200 + 105 * Math.log2(1 + dist / this.unit / 9)) *
        rand(0.85, 1.2) *
        slow;
    const dir = to.sub(from).div(dist);
    const n = dir.perp();
    // the hand swings in an arc, bowed to one side, more for longer reaches
    const b = (bend ?? rand(0.07, 0.22)) * dist * sign();
    const c1 = from.add(
      dir.mul(dist * rand(0.22, 0.4)),
      n.mul(b * rand(0.8, 1.2)),
    );
    const c2 = from.add(
      dir.mul(dist * rand(0.6, 0.82)),
      n.mul(b * rand(0.35, 0.8)),
    );
    // speed peaks a little before halfway, as in real reaches
    const skew = rand(0.72, 0.95);
    const ph = [rand(0, 6.3), rand(0, 6.3)];
    const tremor = rand(0.25, 0.7) * this.unit;
    const t0 = performance.now();
    for (;;) {
      await this.frame(run);
      const u = Math.min(1, (performance.now() - t0) / duration);
      const s = minJerk(u ** skew);
      const wobble = Vec2(
        Math.sin(u * 19 + ph[0]),
        Math.sin(u * 15 + ph[1]),
      ).mul(tremor * Math.sin(Math.PI * u));
      this.moveTo(bezier(from, c1, c2, to, s).add(wobble));
      if (u >= 1) return;
    }
  }

  /** Gets to `to` the way a hand does: sometimes a little past it, then back. */
  protected async reach(
    run: Run,
    to: Vec2,
    {
      overshoot = 0.25,
      slow = 1,
      bend,
    }: { overshoot?: number; slow?: number; bend?: number } = {},
  ) {
    const u = this.unit;
    const dist = this.pos.dist(to);
    if (dist > 40 * u && chance(overshoot)) {
      const dir = to.sub(this.pos).div(dist);
      const past = to.add(
        dir.mul(rand(5 * u, Math.min(16 * u, dist * 0.12))),
        dir.perp().mul(rand(-4, 4) * u),
      );
      await this.glide(run, past, { slow, bend });
      await this.sleep(run, rand(30, 90));
      await this.glide(run, to, {
        ms: rand(150, 260) * slow,
        bend: rand(0, 0.12),
      });
    } else {
      await this.glide(run, to, { slow, bend });
    }
  }

  /** Reach for `target` at `grab`, press, move through `path`, let go. */
  protected async drag(
    run: Run,
    target: Element,
    grab: Vec2,
    path: Vec2[],
    {
      slow = 1.2,
      bend = 0.12,
      linger = 1,
    }: {
      slow?: number;
      bend?: number;
      /** Scales the pauses along the way */
      linger?: number;
    } = {},
  ) {
    const u = this.unit;
    await this.reach(run, grab, { overshoot: 0.3 });
    // settle over it, the way you'd check you're on the thing
    await this.glide(
      run,
      grab.add(Vec2(rand(-1.5, 1.5), rand(-1.5, 1.5)).mul(u)),
      { ms: rand(140, 380) * linger },
    );
    if (!target.isConnected) return;
    this.press(target);
    await this.sleep(run, rand(70, 170) * linger);
    for (let k = 0; k < path.length; k++) {
      const last = k === path.length - 1;
      await this.reach(run, path[k], {
        overshoot: last ? 0.35 : 0.1,
        slow: slow * rand(0.9, 1.15),
        bend: bend * rand(0.5, 1.3),
      });
      if (!last) await this.sleep(run, rand(120, 420) * linger);
    }
    await this.sleep(run, rand(80, 260) * linger);
    this.release();
    // ease off so the cursor isn't left parked on what it dropped
    await this.glide(
      run,
      this.pos.add(Vec2.polarDeg(rand(14, 38) * u, rand(0, 360))),
      { ms: rand(260, 480) },
    );
  }
}

// # Handing over to the reader

/**
 * Plays `ghost` while `box` is at least half on screen, and hands the
 * figure over to the reader when they click on it: the ghost lets go where
 * it is and fades, and the drawing is theirs from whatever state it's in.
 * Once they've left it alone for `resumeMs` (moved off it, or just stopped
 * moving over it), the ghost picks up from there.
 *
 * While the ghost plays, `box` has the class `ghosting`, so the page can
 * offer a "click to take over" tag on hover. Call `dragEnded` when any drag
 * in the figure ends: one of the reader's may end outside the box.
 */
export function autoplay(
  box: HTMLElement,
  ghost: GhostHand,
  {
    dragging,
    resumeMs = 5000,
  }: {
    /** Whether a drag is going on in the figure (the ghost's or not) */
    dragging: () => boolean;
    resumeMs?: number;
  },
) {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let visible = false;
  /** The reader has taken over, and the ghost waits for them to leave it be */
  let yours = false;
  let timer = 0;
  const setMode = () => box.classList.toggle("ghosting", ghost.running);
  const canRun = () => visible && !reduceMotion && !(dragging() && !ghost.down);
  const resumeIn = (ms: number) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!canRun()) return;
      yours = false;
      ghost.start();
      setMode();
    }, ms);
  };
  const halt = () => {
    clearTimeout(timer);
    ghost.stop();
    setMode();
  };
  const dragEnded = () => {
    if (!ghost.running) resumeIn(resumeMs);
  };

  // Hovering leaves the ghost playing. Once the reader's taken over, each
  // move over the figure puts off the ghost's return.
  const onMove = (e: PointerEvent) => {
    if (e.isTrusted && yours && !ghost.running) resumeIn(resumeMs);
  };
  box.addEventListener("pointermove", onMove);

  // DraggableRenderer follows every pointermove on the page while it's
  // dragging, so the reader's own mouse, elsewhere on the page, would
  // pull the ghost's drag around. Keep those away from it while the
  // ghost holds something.
  const guard = (e: PointerEvent) => {
    if (e.isTrusted && ghost.down) e.stopPropagation();
  };
  // A click on the figure takes over, and carries on as the reader's own
  // press: the ghost has let go by the time it arrives, so pressing on
  // something grabs it. A press anywhere else stops the ghost for a while
  // too, so it can't hold a drag through the reader's own.
  const onPress = (e: PointerEvent) => {
    if (!e.isTrusted || !ghost.running) return;
    halt();
    if (box.contains(e.target as Node)) yours = true;
    resumeIn(resumeMs);
  };
  window.addEventListener("pointermove", guard, { capture: true });
  window.addEventListener("pointerup", guard, { capture: true });
  window.addEventListener("pointerdown", onPress, { capture: true });

  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.intersectionRatio >= 0.5;
      if (visible) resumeIn(900);
      else halt();
    },
    { threshold: [0, 0.5] },
  );
  io.observe(box);

  return {
    dragEnded,
    cleanup() {
      halt();
      io.disconnect();
      box.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointermove", guard, { capture: true });
      window.removeEventListener("pointerup", guard, { capture: true });
      window.removeEventListener("pointerdown", onPress, { capture: true });
    },
  };
}

// # The cursor

// The slideshow's cursor art (src/slideshow/rails.tsx), so the ghost looks
// like the talk's: each shape on a 24-unit grid, outlined dark, then filled
// white on top, so overlapping parts merge into one silhouette.
const INK = "#1d1d24";
const OUTLINE = 2.3;
const CURSOR_SCALE = 24 / (21.35 - 1.5 + OUTLINE); // the arrow, 24px tall

function finger(
  cx: number,
  top: number,
  bottom: number,
  w: number,
  deg: number,
) {
  return (
    <rect
      x={cx - w / 2}
      y={top}
      width={w}
      height={bottom - top}
      rx={w / 2}
      transform={`rotate(${deg} ${cx} ${bottom})`}
    />
  );
}

const CURSOR_SHAPES: Record<
  string,
  { hotspot: [number, number]; shapes: ReactNode }
> = {
  arrow: {
    hotspot: [2, 1.5],
    shapes: (
      <path d="M2 1.5 L2 18.6 L6.15 14.75 L9.05 21.35 L12.05 20.05 L9.2 13.55 L14.85 13.55 Z" />
    ),
  },
  hand: {
    hotspot: [12.3, 12.5],
    shapes: (
      <g>
        <path d="M6.6 11.2 C6.6 9.9 7.6 9.4 8.6 9.4 L17.4 9.4 C18.8 9.4 19.6 10.4 19.4 11.8 L18.6 16.8 C18.2 19.4 16.6 21.6 14.2 21.9 L11 21.9 C8.8 21.6 7.4 20 6.8 18 Z" />
        {finger(8.25, 4.1, 13, 2.9, -11)}
        {finger(11.45, 2.3, 12.4, 2.9, -3)}
        {finger(14.65, 3.1, 12.4, 2.9, 5)}
        {finger(17.6, 5.6, 13.2, 2.6, 14)}
        <rect
          x={5.45}
          y={9.3}
          width={3.1}
          height={8.6}
          rx={1.55}
          transform="rotate(-38 7 17.4)"
        />
      </g>
    ),
  },
  fist: {
    hotspot: [12.5, 13.5],
    shapes: (
      <g>
        <path d="M6.4 12.6 C6.4 11.1 7.4 10.2 8.8 10.2 L17.6 10.2 C19 10.2 19.8 11.3 19.6 12.8 L18.9 17.3 C18.5 19.8 16.8 21.8 14.4 22 L11.2 22 C8.9 21.7 7.4 20.1 6.9 18.1 Z" />
        {finger(8.6, 7.4, 12.8, 3, -4)}
        {finger(11.8, 6.6, 12.4, 3, 0)}
        {finger(15, 6.9, 12.4, 3, 3)}
        {finger(18, 8.4, 13, 2.7, 9)}
        <rect
          x={4.9}
          y={11.4}
          width={3.1}
          height={6.6}
          rx={1.55}
          transform="rotate(-24 6.45 17.6)"
        />
      </g>
    ),
  },
};

export function Cursor() {
  return (
    <>
      {Object.entries(CURSOR_SHAPES).map(([name, { hotspot, shapes }]) => (
        <svg
          key={name}
          data-shape={name}
          viewBox="0 0 24 24"
          width={24 * CURSOR_SCALE}
          height={24 * CURSOR_SCALE}
          style={{
            position: "absolute",
            left: -hotspot[0] * CURSOR_SCALE,
            top: -hotspot[1] * CURSOR_SCALE,
            overflow: "visible",
            display: name === "arrow" ? "block" : "none",
            filter:
              "drop-shadow(0 2px 3px rgba(0,0,0,0.32)) drop-shadow(0 0 1px rgba(0,0,0,0.25))",
          }}
        >
          <g
            fill={INK}
            stroke={INK}
            strokeWidth={OUTLINE}
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            {shapes}
          </g>
          <g fill="white">{shapes}</g>
        </svg>
      ))}
    </>
  );
}
