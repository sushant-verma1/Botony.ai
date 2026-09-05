import { describe, expect, it } from "vitest";
import { computeLayout, EXPRESSION_ASPECT, OVERSCAN } from "./expressionLayout";

/**
 * The marquee's two failure modes are a half-track narrower than the screen
 * (a blank gap opens as the copy arrives late) and too few rows (a bare strip
 * at an edge). Both depend on the viewport, and neither shows up reliably in
 * a screenshot, so they are checked here across the range of real screens.
 */

const FACES = 10;

const VIEWPORTS: Array<[string, number, number]> = [
  ["desktop 1440x900", 1440, 900],
  ["laptop 1280x720", 1280, 720],
  ["ultrawide 3440x1440", 3440, 1440],
  ["wide short 1920x620", 1920, 620],
  ["tablet 768x1024", 768, 1024],
  ["phone 390x844", 390, 844],
  ["small phone 320x568", 320, 568],
];

describe.each(VIEWPORTS)("expression layout — %s", (_label, vw, vh) => {
  const l = computeLayout(vw, vh, FACES);

  // The plane is tilted and oversized, so coverage is owed to the plane's
  // box rather than the viewport's — the corners the rotation swings into
  // frame sit outside the viewport rect.
  it("covers the plane width with a single half-track", () => {
    // Each face occupies width + its trailing gap, so a half is exactly this.
    const halfW = l.repeats * FACES * (l.faceW + l.gapX);
    expect(halfW).toBeGreaterThanOrEqual(vw * OVERSCAN);
  });

  it("covers the plane height, with a row to spare", () => {
    const covered = l.rowCount * l.faceH + (l.rowCount - 1) * l.rowGap;
    expect(covered).toBeGreaterThan(vh * OVERSCAN);
  });

  it("keeps every face at the SVG's own aspect ratio", () => {
    expect(l.faceW / l.faceH).toBeCloseTo(EXPRESSION_ASPECT, 10);
  });

  it("keeps the faces large enough to read as faces", () => {
    expect(l.faceW).toBeGreaterThanOrEqual(96);
  });

  it("asks for a sane amount of DOM", () => {
    // both halves, every row
    const imgs = l.rowCount * 2 * l.repeats * FACES;
    expect(imgs).toBeLessThan(800);
  });
});
