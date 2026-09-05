import { describe, expect, it } from "vitest";
// Read the actual asset rather than a copy of its numbers, so this file fails
// if the artwork is ever replaced with different geometry.
import referenceSvg from "../../assets/svgviewer-output (1).svg?raw";
import {
  EYE,
  T,
  boxHeight,
  boxWidth,
  circleFromEyeWidth,
  shapeRadius,
  shapeSize,
} from "./introConfig";

/** Pulls one numeric attribute out of a tag in the raw SVG source. */
const num = (attr: string, tag: string) => {
  const m = new RegExp(`${attr}\\s*=\\s*"([-\\d.]+)"`).exec(tag);
  if (!m) throw new Error(`no ${attr} in: ${tag}`);
  return Number(m[1]);
};

const found = referenceSvg.match(/<circle[^>]*r="19"[^>]*>/g) ?? [];
const rect = /<rect[\s\S]*?\/>/.exec(referenceSvg)?.[0] ?? "";
// Fail loudly at import time if the asset stops containing a two-eye
// character, rather than letting every assertion below read `undefined`.
if (found.length !== 2) throw new Error(`expected 2 eyes, found ${found.length}`);
const [leftEye, rightEye] = found as [string, string];

// The config expresses the artwork at the origin; the file draws it inside a
// 600x800 canvas. One translation relates the two.
const dx = num("cx", leftEye) - EYE.CX_L;
const dy = num("cy", leftEye) - EYE.CY;

describe("reference SVG parity", () => {
  it("finds the two eyes and the connector in the asset", () => {
    expect(found).toHaveLength(2);
    expect(rect).toContain("width");
  });

  it("uses the reference eye radius", () => {
    expect(num("r", leftEye)).toBe(EYE.R);
    expect(num("r", rightEye)).toBe(EYE.R);
  });

  it("preserves the eye separation", () => {
    expect(num("cx", rightEye) - num("cx", leftEye)).toBe(EYE.CX_R - EYE.CX_L);
  });

  it("keeps both eyes on one baseline", () => {
    expect(num("cy", leftEye)).toBe(num("cy", rightEye));
    expect(num("cy", rightEye) - dy).toBe(EYE.CY);
  });

  it("preserves the connector's x, width and height", () => {
    expect(num("x", rect) - dx).toBe(EYE.BAR_X);
    expect(num("width", rect)).toBe(EYE.BAR_W);
    expect(num("height", rect)).toBe(EYE.BAR_H);
  });

  // The one deliberate departure from the file, asserted in both directions so
  // it can never be mistaken for drift: the source puts the connector's TOP
  // edge on the eye centreline, which leaves it hanging below the eyes. That is
  // off by exactly half the bar's height. We centre it instead.
  it("centres the connector on the eyes, unlike the source file", () => {
    expect(num("y", rect) - dy).toBe(EYE.CY);
    expect(EYE.BAR_Y).toBe(EYE.CY - EYE.BAR_H / 2);
    expect(EYE.BAR_Y).not.toBe(num("y", rect) - dy);
  });

  it("sizes the viewBox to exactly contain the character", () => {
    expect(EYE.CX_L - EYE.R).toBe(0);
    expect(EYE.CX_R + EYE.R).toBe(EYE.VIEW_W);
    expect(EYE.VIEW_H).toBe(EYE.R * 2);
  });
});

describe("connector formation", () => {
  // The timeline animates width 0 -> BAR_W and translateX (CX_MID - BAR_X) -> 0
  // on one spring, so both are the same progress value p.
  const barAt = (p: number) => {
    const width = EYE.BAR_W * p;
    const left = EYE.BAR_X + (EYE.CX_MID - EYE.BAR_X) * (1 - p);
    return { left, right: left + width, centre: left + width / 2 };
  };
  const eyeAt = (p: number) => ({
    l: EYE.CX_MID + (EYE.CX_L - EYE.CX_MID) * p,
    r: EYE.CX_MID + (EYE.CX_R - EYE.CX_MID) * p,
  });

  it("pins the connector's centre to the midpoint for the whole split", () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      expect(barAt(p).centre).toBeCloseTo(EYE.CX_MID, 6);
    }
  });

  it("never lets the connector come away from either eye", () => {
    // Including the spring's overshoot, where the eyes travel past their marks.
    for (const p of [0, 0.25, 0.5, 0.75, 1, 1.15, 1.3]) {
      const bar = barAt(p);
      const eye = eyeAt(p);
      expect(bar.left).toBeLessThanOrEqual(eye.l + EYE.R);
      expect(bar.right).toBeGreaterThanOrEqual(eye.r - EYE.R);
    }
  });

  it("ends on the reference geometry exactly", () => {
    expect(barAt(1).left).toBeCloseTo(EYE.BAR_X, 6);
    expect(barAt(1).right).toBeCloseTo(EYE.BAR_X + EYE.BAR_W, 6);
  });
});

describe("the CIRCLE handoff", () => {
  it("derives a diameter equal to one rendered eye", () => {
    // At the SVG's own scale the eye is 2R wide, so the derivation is exact.
    expect(circleFromEyeWidth(EYE.VIEW_W)).toBe(EYE.R * 2);
  });

  it("stays exact at any rendered width", () => {
    for (const w of [132, 150, 168, 230.4, 248]) {
      expect(circleFromEyeWidth(w)).toBeCloseTo((w * EYE.VIEW_H) / EYE.VIEW_W, 9);
    }
  });
});

describe("responsive sizing", () => {
  const widths = [320, 375, 390, 560, 768, 834, 1024, 1280, 1512, 1920, 2560];

  it("never lets the box overflow the viewport", () => {
    for (const w of widths) expect(boxWidth(w)).toBeLessThanOrEqual(w - 32);
  });

  it("grows the box monotonically with the viewport", () => {
    for (let i = 1; i < widths.length; i++) {
      expect(boxWidth(widths[i])).toBeGreaterThanOrEqual(boxWidth(widths[i - 1]));
    }
  });

  it("clamps the entering shape at both ends", () => {
    expect(shapeSize(320)).toBe(78);
    expect(shapeSize(2560)).toBe(125);
    for (const w of widths) {
      expect(shapeSize(w)).toBeGreaterThanOrEqual(78);
      expect(shapeSize(w)).toBeLessThanOrEqual(125);
    }
  });

  it("keeps the squircle a squircle, not a pill", () => {
    for (const w of widths) {
      const size = shapeSize(w);
      expect(shapeRadius(size)).toBeCloseTo(size / 5, 9);
      expect(shapeRadius(size)).toBeLessThan(size / 2);
    }
  });

  it("gives phones the shorter box", () => {
    expect(boxHeight(390)).toBe(148);
    expect(boxHeight(834)).toBe(172);
  });
});

describe("timing contract", () => {
  it("holds the finished input for the specified five seconds", () => {
    expect(T.hold).toBe(5000);
  });

  it("overlaps the expansion with the entrance rather than queuing it", () => {
    expect(T.expandOverlap).toBeGreaterThan(0);
    expect(T.expandOverlap).toBeLessThan(T.enter);
  });

  it("unwinds the tilt before the shape arrives", () => {
    expect(T.tiltOut + T.tiltBack).toBeLessThanOrEqual(T.enter);
  });
});
