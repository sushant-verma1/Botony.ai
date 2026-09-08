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
} as const;

/** IDLE — everything after the character has formed.
 *
 *  Three animations share one start beat and are then independent: the body
 *  fades in, the eyes glance left and right once, and the blink loops for as
 *  long as the page is open. Each is retimed on its own here; none of them
 *  touches a property any earlier state animates. */
export const IDLE = {
  /** Body fade-in, on the same beat as the first glance. */
  fade: 900,
  /** One glance: `step` to dart, `dwell` to hold the look before moving on.
   *  CENTRE-L-CENTRE-R-CENTRE is four darts and three dwells. */
  lookStep: 520,
  lookDwell: 980,
  /** Horizontal travel, in the SVG's own units — 7% of the character's width,
   *  either side of centre. The eyes and the connector translate as one group,
   *  so the bar cannot come away from the eyes whatever this is; what actually
   *  bounds it is the head, and introConfig.test.ts holds the eyes inside it
   *  at full deflection using the head ellipse from the asset itself. */
  lookShift: 10,
  /** Extra travel for the *opposite* eye — the one on the far side of the
   *  glance's direction moves a little further than the near eye, which is
   *  what keeps the look from feeling like a single rigid slab. */
  lookShiftOpposite: 12,
  /** Once the glance finishes, the character settles this far down before the
   *  recorded line starts — a small easeInOut drop that reads as "about to
   *  speak", not a bounce. */
  settleShift: 20,
  settleDuration: 420,
  /** The blink. Closing faster than opening is what makes it read as a lid
   *  dropping rather than the eyes pulsing. */
  blinkClose: 90,
  blinkOpen: 130,
  /** Eyes-open time between blinks; a resting human rate is ~3-4s. Regular,
   *  not randomised — irregular blinking reads as a broken animation. */
  blinkHold: 3400,
  /** How flat the eye gets, as a fraction of its height. Not 0: an ellipse of
   *  zero height renders nothing at all, which reads as the eyes vanishing
   *  rather than closing. The width is untouched by construction — only
   *  scaleY is animated. */
  blinkScale: 0.07,
} as const;

/** The glance, end to end. Derived rather than written down so retiming a
 *  beat cannot leave a stale total behind. ~5s, per the brief. */
export const lookDuration = IDLE.lookStep * 4 + IDLE.lookDwell * 3;

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

/** Where the reference file draws the left eye, before the translation above.
 *  The only place the asset's untranslated coordinates appear. */
const REF_EYE_L = { cx: 250, cy: 171 } as const;

/** What to translate the *rest* of the character by so it registers with the
 *  eyes.
 *
 *  The head, torso, arms and legs are used verbatim from the reference, which
 *  draws them in its own 600x800 canvas. Drawing them inside a group offset by
 *  this puts them in the eyes' coordinate system, so the whole character is
 *  one set of geometry in one viewBox: it scales with the eyes, cannot drift
 *  from them at any viewport, and needed no change to the eyes to accommodate
 *  it. The SVG's viewBox still frames the eye pair alone — the body simply
 *  overflows it (see .hero__eyes { overflow: visible }). */
export const BODY_OFFSET = {
  x: EYE.CX_L - REF_EYE_L.cx,
  y: EYE.CY - REF_EYE_L.cy,
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

/** POST_DIALOGUE — the character withdraws the moment the recording finishes.
 *
 *  It rises and shrinks in one move, and the caption goes with it. A framing
 *  change and nothing else: one uniform scale on the whole SVG, so the artwork
 *  cannot stretch, no coordinate and no viewBox is touched, and the blink and
 *  the expressions carry on underneath because neither of them writes
 *  `scale`. */
export const ZOOM = {
  /** What the character is left at, as a fraction of the size it played the
   *  line at. Uniform: this is the only scale, on both axes. */
  scale: 0.9,
  /** Where it comes to rest, as a fraction of the scene's height measured to
   *  the eye centreline. Below 0.5 is above the middle, so the character rises
   *  as it shrinks; anchoring it to the scene rather than shifting it by a
   *  fixed distance puts it in the same place at every viewport. */
  eyeLine: 0.3,
  /** Long enough to read as a camera move rather than a resize. */
  duration: 1200,
  /** The caption leaves on the same beat, a little quicker than the move, so
   *  the words are gone before the character has finished settling. */
  captionOut: 620,
} as const;

/** CHEST — where the expression control sits on the character.
 *
 *  Written in the reference artwork's own coordinates, the same space the
 *  torso path is drawn in, and rendered inside a group carrying BODY_OFFSET
 *  exactly like the body is. That registers the control to the chest by
 *  construction: it rides the character's scale and the post-dialogue
 *  withdrawal with no measurement, no resize handler and nothing that can
 *  drift, and it cannot be centred on anything other than the torso's
 *  centreline because that centreline is the number below.
 *
 *  The vertical budget is what the framing leaves: ZOOM puts the eyes (y 171
 *  here) three tenths down the scene, so on a short desktop viewport the
 *  visible artwork runs out around y 480. Everything here fits above that —
 *  the face, the slider, the scale under it and the confirm button below that
 *  are one stack sharing those 190 units, which is why the first four numbers
 *  are tighter than the composition alone would want. */
export const CHEST = {
  /** The torso's centreline. Everything in the stack is centred on it. */
  cx: 300,
  /** The top of the face — clear of the head, which ends at y 261. */
  top: 288,
  /** What the face's 24-unit square is drawn to. */
  face: 86,
  /** Between the face and the slider. */
  gap: 14,
  /** The slider. The torso is ~364 wide across the chest, so this leaves a
   *  comfortable margin either side at every viewport. */
  sliderW: 230,
  sliderH: 30,
  /** The login form that takes the control's place once a rating is
   *  confirmed. Same centreline and same top as the face, and the same
   *  vertical budget the whole control stack had: 190 units from CHEST.top
   *  runs out at y 478, just inside the framing. Its internal lengths are in
   *  intro.css — what belongs here is the hole it is drawn into. */
  formW: 240,
  formH: 190,
  /** The register form asks for five fields and two consents where the login
   *  form asks for two fields, so it cannot be made to fit those 190 units at
   *  a legible size. The character makes the room instead of the form giving
   *  it up — see FORM_SHIFT. */
  registerH: 300,
  /** Where the control rests before it is touched, on the same 0-100 scale
   *  the slider uses: the middle of the range, which is neutral — the thumb
   *  starts centred, with as much expression to give either way. */
  initial: 50,
} as const;

/** FORM_SHIFT — the character making room for the taller form.
 *
 *  Registering asks for five fields and two consents; signing in asks for two
 *  fields. Rather than shrink the type until the difference fits, the
 *  character steps back: it rises a little and scales down a little, in one
 *  spring, whenever the register form is what the chest is showing.
 *
 *  It writes the same two properties the post-dialogue withdrawal does, on the
 *  same element, from the resting values that withdrawal left behind — so the
 *  artwork, the viewBox and the chest's coordinates are all untouched, and the
 *  move is symmetric: coming back to the login form is this transition played
 *  the other way, not a separate animation. */
export const FORM_SHIFT = {
  /** Of the scale the withdrawal left the character at, so this composes with
   *  ZOOM.scale rather than replacing it. */
  scale: 0.95,
  /** How far it rises, as a fraction of the scene's height — the same way ZOOM
   *  places the eye line, so the move is the same part of the composition at
   *  every viewport instead of a fixed number of pixels. */
  lift: 0.1,
  /** Under half a second, per the brief. The bounce is what makes this read as
   *  the character stepping back rather than the page resizing. */
  duration: 460,
  bounce: 0.28,
} as const;
