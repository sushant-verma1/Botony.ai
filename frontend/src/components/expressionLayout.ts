/* ------------------------------------------------------------------------
   Sizing for the animated expression background.

   Kept out of the component file so it can be exported and tested on its own:
   the two coverage guarantees below — a half-track at least as wide as the
   screen, and enough rows to reach past the bottom — are what stop blank gaps
   appearing mid-scroll, and neither is something a screenshot reliably shows.
   --------------------------------------------------------------------- */

/** Every expression SVG shares viewBox "0 0 300 240". */
export const EXPRESSION_ASPECT = 300 / 240;

/** Per-row cycle times. Deliberately not multiples of one another, so the
 *  rows never line up into a single visible pulse. */
export const ROW_DURATIONS = [28000, 34000, 30000, 36000];

/** The plane is tilted, so its far edge shrinks and its near edge swings off
 *  screen. .expression-layer is inset -15% to compensate; this is the matching
 *  size factor (1 + 2×0.15). Change one and change the other. */
export const OVERSCAN = 1.3;

export interface ExpressionLayout {
  faceW: number;
  faceH: number;
  gapX: number;
  rowGap: number;
  /** how many times the full set of faces is repeated per half-track */
  repeats: number;
  rowCount: number;
}

export function computeLayout(
  viewportW: number,
  viewportH: number,
  faceCount: number,
): ExpressionLayout {
  // Large enough to read as faces rather than as a texture.
  const faceW = viewportW < 640 ? 96 : 132;
  const faceH = faceW / EXPRESSION_ASPECT;
  const gapX = Math.round(faceW * 0.6);
  const rowGap = Math.round(faceH * 0.6);

  // Cover the oversized tilted plane, not the viewport it is clipped to.
  const planeW = viewportW * OVERSCAN;
  const planeH = viewportH * OVERSCAN;

  // One pass of the whole set, counting each face's trailing gap.
  const sequenceW = faceCount * (faceW + gapX);
  // A half-track must already cover the plane on its own; if it did not, the
  // copy replacing it would arrive late and open a gap mid-cycle.
  const repeats = Math.max(1, Math.ceil(planeW / sequenceW));
  // One row more than fits, so the clipped overflow never bares an edge.
  const rowCount = Math.ceil(planeH / (faceH + rowGap)) + 1;

  return { faceW, faceH, gapX, rowGap, repeats, rowCount };
}
