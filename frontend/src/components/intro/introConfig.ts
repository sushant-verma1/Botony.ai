/* ------------------------------------------------------------------------
   The hero sequence's single source of truth.

   Every duration, colour, coordinate and size the intro uses is defined here
   and nowhere else. useIntroTimeline.ts reads them; intro.css mirrors only
   the resting state so the scene still composes with scripting off. Retiming
   the animation should never mean opening a component.
   --------------------------------------------------------------------- */

export const PALETTE = {
  ink: "#03120E",
  line: "#E6E6EA",
  surface: "#F4F4F8",
  paper: "#FFFFFF",
  /** `line` at zero alpha. The box animates its border between this and
   *  `line`; starting from `transparent` would interpolate through black. */
  lineFaded: "rgba(230, 230, 234, 0)",
} as const;

/** Milliseconds. Every one of these was measured off the reference recording
 *  frame by frame, except `hold`, which the brief specifies. */
export const T = {
  /** Dead air before anything moves, so the page reads as empty first. */
  blank: 150,
  /** SHAPE_ENTER. `outExpo` halves the remaining distance every duration/10,
   *  so this is a ~140ms half-life — the recording's exponential settle. */
  enter: 1400,
  /** The tilt is thrown on the way up and unwound before arrival. */
  tiltOut: 260,
  tiltBack: 480,
  /** SHAPE_EXPAND. */
  expand: 800,
  expandBounce: 0.15,
  /** The expansion starts before the entrance finishes. The overlap is what
   *  stops the sequence reading as two moves with a seam between them. */
  expandOverlap: 300,
  contentIn: 420,
  contentOut: 200,
  headlineIn: 900,
  headlineOut: 420,
  /** INPUT_HOLD, per the brief. Measured from the *finished* state. */
  hold: 5000,
  /** COLLAPSE, in two beats: box -> pill, then pill -> circle. */
  collapse: 780,
  toCircle: 440,
  /** How long the SVG and the HTML circle overlap before the div is dropped. */
  handoff: 120,
  /** EYE_FORMATION. */
  split: 820,
  splitBounce: 0.2,
  outroIn: 700,
} as const;

/** Peak tilt in degrees during the entrance.
 *
 *  Derived from the recording, not chosen: the shape's widest measured pixel
 *  bounding box is 154px for a 100px squircle with a 25px corner radius. A
 *  rotated rounded square measures 2*(halfInner*(|cos|+|sin|) + r), where
 *  halfInner = size/2 - r, so 154 = 2*(38*(|cos|+|sin|) + 25) gives 33 deg.
 *  (getBoundingClientRect ignores border-radius; measuring pixels does not —
 *  mixing the two is what makes this look 3 deg too steep.) */
export const TILT_PEAK = 33;

/** The finished character, in the reference SVG's own coordinates.
 *
 *  Taken verbatim from src/assets/svgviewer-output (1).svg, which has:
 *    <circle cx="250" cy="171" r="19"/>  <circle cx="355" cy="171" r="19"/>
 *    <rect x="263" y="171" width="79" height="6"/>
 *  translated so the artwork sits at the origin. introConfig.test.ts asserts
 *  that parity against the asset itself, so this cannot drift from the file.
 *
 *  One deliberate departure: see BAR_Y. */
export const EYE = {
  VIEW_W: 143,
  VIEW_H: 38,
  R: 19,
  CX_L: 19,
  CX_R: 124,
  CY: 19,
  /** Where both eyes sit while the character is still a single circle. */
  CX_MID: 71.5,
  BAR_X: 32,
  /** Centred on the eyes — the source file has 19, which puts the bar's *top*
   *  edge on the eye centreline and leaves it visibly drooping below them.
   *  That is off by exactly half the bar height, the signature of a missing
   *  `- height/2`, so this corrects it. Every other number here is the file's. */
  BAR_Y: 16,
  BAR_W: 79,
  BAR_H: 6,
} as const;

const clamp = (min: number, v: number, max: number) =>
  Math.max(min, Math.min(v, max));

/** The squircle that enters from below, sized off the hero's width. */
export const shapeSize = (w: number) => clamp(78, w * 0.065, 125);

/** Held constant through the expansion — a corner radius that changes with
 *  the box is what makes a morph look like two different elements. */
export const shapeRadius = (size: number) => size * 0.2;

/** The textbox. 51.9% of the viewport matches the reference composition; the
 *  `w - 32` guard keeps it inside the scene's gutter on narrow screens. */
export const boxWidth = (w: number) =>
  Math.min(w - 32, clamp(288, w * 0.519, 996));

/** Shorter on phones so a two-line placeholder still leaves the toolbar room. */
export const boxHeight = (w: number) => (w < 560 ? 148 : 172);

/** The diameter the box must collapse to for the handoff to be invisible.
 *
 *  Derived from the character's *rendered* width rather than clamped
 *  separately, so the HTML circle and the SVG's eye agree exactly at every
 *  viewport by construction instead of by two magic numbers happening to
 *  match. intro.css owns the character's size; this follows it. */
export const circleFromEyeWidth = (renderedEyeW: number) =>
  (renderedEyeW * EYE.R * 2) / EYE.VIEW_W;
