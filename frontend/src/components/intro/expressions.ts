/* ------------------------------------------------------------------------
   The chest expression system.

   Five faces, taken verbatim from src/assets/canvas.svg, and the one
   operation that makes a spectrum out of them: every mouth is resampled into
   the same list of points, so two mouths drawn as completely different
   primitives — a semicircle, a shallow arc, a straight line — interpolate
   point by point like any other pair of numbers. Nothing is faded, hidden or
   swapped; at any value there is one face, and its geometry is the numbers
   below mixed.

   expressions.test.ts decodes the asset itself and asserts every number here
   against it, so this file cannot drift from the artwork.
   --------------------------------------------------------------------- */

/** What all five faces share: the reference draws each one in its own 24-unit
 *  square, with the same head, the same eye positions and the same stroke.
 *  Only the fill and the mouth differ, which is why those two are the only
 *  things FACES carries. */
export const FACE = {
  VIEW: 24,
  /** The head. */
  CX: 12,
  CY: 12,
  R: 10.4,
  /** The one ink the reference uses for every stroke and every eye. */
  INK: "#1e1e1e",
  RING: 1.7,
  /** Where the mouth meets its corners. Fixed: only its bow changes. */
  X1: 7.53,
  X2: 16.47,
  MOUTH_W: 1.5,
} as const;

/** A mouth, reduced to the three numbers that actually vary across the five
 *  reference faces. */
export type Mouth = {
  /** The y both corners sit on. */
  y: number;
  /** The arc's radius; 0 is the straight mouth. */
  r: number;
  /** Which way it bows — down the screen (a smile) or up it. */
  smile: boolean;
};

export type Face = {
  name: string;
  fill: string;
  /** Identical in all five reference faces. Kept per-face rather than hoisted
   *  to a constant so the morph picks up any future face that moves them. */
  eyes: { lx: number; rx: number; cy: number; r: number };
  mouth: Mouth;
};

const EYES = { lx: 8.46, rx: 15.54, cy: 9.3, r: 1.2 } as const;

/** The five states, in the order the slider runs them: 0, 25, 50, 75, 100.
 *
 *  This is not the order they are drawn in canvas.svg. The board's order is
 *  happy, sad, neutral, attentive, surprised; the slider runs them so that the
 *  range reads as one movement — the smile opens through attentive, flattens
 *  at neutral in the middle, and falls away through surprised into sad —
 *  rather than crossing from smile to frown twice. expressions.test.ts pairs
 *  each entry with its artwork by name, so this order is free to change and
 *  the numbers still cannot drift from the file. */
export const FACES: readonly Face[] = [
  { name: "happy", fill: "#6ee7a0", eyes: EYES, mouth: { y: 13.46, r: 4.47, smile: true } },
  { name: "attentive", fill: "#5fe0c0", eyes: EYES, mouth: { y: 13.46, r: 5.67, smile: true } },
  { name: "neutral", fill: "#ffe066", eyes: EYES, mouth: { y: 14.08, r: 0, smile: true } },
  { name: "surprised", fill: "#ffb366", eyes: EYES, mouth: { y: 14.5, r: 7.6, smile: false } },
  { name: "sad", fill: "#ff8b8b", eyes: EYES, mouth: { y: 17.41, r: 4.47, smile: false } },
];

/** How many points each mouth is resampled into. Enough that the polyline is
 *  indistinguishable from the arc it came from: the deepest mouth here is a
 *  semicircle, and at this count its chords sit 0.01 units off the true
 *  curve — a hundredth of a stroke width. */
const SAMPLES = 33;

/**
 * One mouth as SAMPLES points, evenly spaced along its own length.
 *
 * This is the normalisation the whole morph rests on. A straight line and a
 * semicircle have nothing in common as path data; sampled this way they are
 * two lists of the same length in the same coordinate system, and the average
 * of the two lists is a real mouth halfway between them.
 */
export function sample(m: Mouth): number[] {
  const out: number[] = [];
  const half = (FACE.X2 - FACE.X1) / 2;

  if (!m.r) {
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      out.push(FACE.X1 + (FACE.X2 - FACE.X1) * t, m.y);
    }
    return out;
  }

  // The circle through both corners has its centre on the mouth's vertical
  // bisector, `h` from the chord, on the far side from the bow. `bow` carries
  // the direction through every term, which also keeps the semicircles right:
  // there h is zero, and it is the sign on that zero that says which way an
  // exactly-half-circle mouth curves.
  const bow = m.smile ? 1 : -1;
  const h = bow * Math.sqrt(Math.max(0, m.r * m.r - half * half));
  const cy = m.y - h;
  const a1 = Math.atan2(h, -half);
  const a2 = Math.atan2(h, half);

  for (let i = 0; i < SAMPLES; i++) {
    const a = a1 + (a2 - a1) * (i / (SAMPLES - 1));
    out.push(FACE.CX + m.r * Math.cos(a), cy + m.r * Math.sin(a));
  }
  return out;
}

/** The five mouths, resampled once at module load. Dragging the slider mixes
 *  these; it never re-derives an arc. */
const MOUTHS = FACES.map((f) => sample(f.mouth));

const RGB = FACES.map((f) => [1, 3, 5].map((i) => parseInt(f.fill.slice(i, i + 2), 16)));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/**
 * The face at a slider value.
 *
 * The value is a position along all five states at once: 0, 25, 50, 75 and
 * 100 land exactly on a reference face, and everything between is that pair
 * mixed. The mix is linear on purpose — the brief's "drag slowly and watch
 * the features move" means the geometry has to track the thumb, so nothing
 * here eases, delays or animates. Call it on every change and render what it
 * returns.
 */
export function faceAt(value: number) {
  const span = FACES.length - 1;
  const p = (Math.min(Math.max(value, 0), 100) / 100) * span;
  // The last keyframe is a segment end, never a segment start.
  const i = Math.min(Math.floor(p), span - 1);
  const t = p - i;

  const a = FACES[i].eyes;
  const b = FACES[i + 1].eyes;
  const [ar, ag, ab] = RGB[i];
  const [br, bg, bb] = RGB[i + 1];

  const from = MOUTHS[i];
  const to = MOUTHS[i + 1];
  let mouth = "";
  for (let k = 0; k < from.length; k += 2) {
    const x = lerp(from[k], to[k], t).toFixed(3);
    const y = lerp(from[k + 1], to[k + 1], t).toFixed(3);
    mouth += `${k ? "L" : "M"}${x} ${y}`;
  }

  return {
    fill: `#${hex(lerp(ar, br, t))}${hex(lerp(ag, bg, t))}${hex(lerp(ab, bb, t))}`,
    eyes: {
      lx: lerp(a.lx, b.lx, t),
      rx: lerp(a.rx, b.rx, t),
      cy: lerp(a.cy, b.cy, t),
      r: lerp(a.r, b.r, t),
    },
    mouth,
  };
}

/** What the face at this value is closest to. Only for the control's
 *  accessible value text — nothing visual reads it. */
export function nameAt(value: number) {
  const span = FACES.length - 1;
  return FACES[Math.round(((Math.min(Math.max(value, 0), 100) / 100) * span))].name;
}
