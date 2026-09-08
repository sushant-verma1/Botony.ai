/* ------------------------------------------------------------------------
   The thumb's physics.

   The slider's value is not in here and never passes through here. The value
   is set by the input, immediately, and the face is drawn from it in the same
   render — see ExpressionSlider. What this file describes is only where the
   *drawing* of the thumb is, which is a mass on a spring being dragged along
   behind that value, and how much that mass deforms while it moves.

   Kept apart from the component because it is the only real arithmetic in the
   control, and because a spring is worth being able to test without a DOM.
   --------------------------------------------------------------------- */

/** Position and velocity, both on the slider's own 0-100 scale (velocity per
 *  second). Nothing here knows about pixels. */
export type Spring = { x: number; v: number };

/** Stiffness and damping, in the usual `x'' = -k(x - target) - c·x'` sense.
 *
 *  The damping ratio is c / 2√k ≈ 0.69 — deliberately under 1. That is the
 *  overshoot: released mid-range the thumb passes the value by around 5% of
 *  the distance it was travelling and settles back, which is what makes it
 *  read as something with weight rather than something that stops dead. */
const STIFFNESS = 170;
const DAMPING = 18;

/** Longest step the integrator will take. A backgrounded tab hands back one
 *  enormous frame; without this the spring takes a single huge step and flies
 *  off. Anything longer is walked in slices of at most this. */
const MAX_STEP = 1 / 120;

/** One frame of the spring, as a new state. `dt` is in seconds. */
export function step(s: Spring, target: number, dt: number): Spring {
  let { x, v } = s;
  let left = Math.min(Math.max(dt, 0), 1 / 15);

  while (left > 0) {
    const h = Math.min(left, MAX_STEP);
    v += (-STIFFNESS * (x - target) - DAMPING * v) * h;
    x += v * h;
    left -= h;
  }
  return { x, v };
}

/** Near enough to stop drawing: within a hundredth of a slider unit and
 *  barely moving. At this distance the thumb is inside its own antialiasing. */
export function settled(s: Spring, target: number): boolean {
  return Math.abs(s.x - target) < 0.01 && Math.abs(s.v) < 0.05;
}

/** The speed, in slider units per second, at which the thumb is as deformed
 *  as it is ever allowed to get. A brisk drag across the whole range is about
 *  400; this sits below that so an ordinary drag deforms fully and a slow,
 *  careful one barely deforms at all. */
const FULL_SPEED = 240;

/** How far the thumb stretches along its travel at FULL_SPEED. */
const STRETCH = 0.12;

/**
 * The deformation at a given velocity: soft rubber, not a rigid control.
 *
 * Stretch along the direction of travel, thinned across it — the shape a
 * dropped ball of gel takes when it is moving, and the reason the same number
 * has to drive both axes. Volume is not conserved exactly (`sy` gives back
 * half of what `sx` takes) because exact conservation reads as a wobble at
 * this size; half of it reads as softness.
 *
 * Direction is not a factor: the travel is horizontal either way, so a drag
 * left deforms exactly like a drag right, and reversing mid-drag passes
 * through a round thumb at the moment the velocity crosses zero.
 */
export function squash(velocity: number) {
  const t = Math.min(Math.abs(velocity) / FULL_SPEED, 1);
  return {
    /** Along the travel. 1 → 1.12. */
    sx: 1 + t * STRETCH,
    /** Across it. 1 → 0.94. */
    sy: 1 - t * STRETCH * 0.5,
    /** The filled track's thickness. It ends under the thumb and is pulled by
     *  the same movement, so it thins a little further than the thumb does —
     *  a band under tension rather than a bar that happens to be the right
     *  length. 1 → 0.86. */
    track: 1 - t * STRETCH * 1.2,
  };
}
