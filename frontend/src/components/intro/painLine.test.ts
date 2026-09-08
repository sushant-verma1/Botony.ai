import { describe, expect, it } from "vitest";
import { DOT, END, LEFT, PAIN, RIGHT, painAt } from "./painLine";

/** Every frame the caption can be rendered on, a little either side. */
const frames = (() => {
  const out: number[] = [];
  for (let t = -0.5; t <= END + 0.5; t += 1 / 60) out.push(t);
  return out;
})();

describe("the split question", () => {
  it("fits inside the recording", () => {
    // pain.wav is 4.053s. Nothing may be timed past the end of the file, or
    // the audio clock stops before the caption is finished.
    expect(PAIN[0].start).toBeGreaterThan(0);
    expect(PAIN[PAIN.length - 1].end).toBeLessThan(4.053);
    for (const p of PAIN) expect(p.end).toBeGreaterThan(p.start);
    for (let i = 1; i < PAIN.length; i++) {
      expect(PAIN[i].start).toBeGreaterThanOrEqual(PAIN[i - 1].end);
    }
  });

  it("splits the line at the character", () => {
    expect(LEFT.join(" ")).toBe("On a scale of 1");
    expect(RIGHT.join(" ")).toBe("to 10 how would you rate your pain");
  });

  it("reveals every word, once, in order", () => {
    let last = 0;
    for (const t of frames) {
      const { words } = painAt(t);
      expect(words).toBeGreaterThanOrEqual(last);
      expect(words).toBeLessThanOrEqual(LEFT.length + RIGHT.length);
      last = words;
    }
    expect(last).toBe(LEFT.length + RIGHT.length);
  });

  it("flies the stop from the word it belongs to onto the last one", () => {
    // It is at home until "1" is finished and lands exactly as "pain" starts,
    // so it is never a stop with nothing to punctuate at either end.
    expect(painAt(PAIN[0].end - 0.01).dot).toBe(0);
    expect(painAt(PAIN[PAIN.length - 1].start).dot).toBe(1);
    expect(painAt(PAIN[PAIN.length - 1].start - 0.2).dot).toBeLessThan(1);
    expect(DOT.start + DOT.duration).toBeCloseTo(PAIN[PAIN.length - 1].start, 9);

    let last = 0;
    for (const t of frames) {
      const { dot } = painAt(t);
      expect(dot).toBeGreaterThanOrEqual(last);
      expect(dot).toBeLessThanOrEqual(1);
      last = dot;
    }
  });
});
