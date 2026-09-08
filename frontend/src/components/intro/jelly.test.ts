import { describe, expect, it } from "vitest";
import { settled, squash, step, type Spring } from "./jelly";

/** Runs the spring at 60fps for `seconds`, returning every position it took. */
const run = (from: Spring, target: number, seconds: number) => {
  const xs: number[] = [];
  let s = from;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    s = step(s, target, 1 / 60);
    xs.push(s.x);
  }
  return { xs, end: s };
};

describe("the thumb's spring", () => {
  it("arrives at the value and stays there", () => {
    const { end } = run({ x: 50, v: 0 }, 80, 1);
    expect(end.x).toBeCloseTo(80, 2);
    expect(settled(end, 80)).toBe(true);
  });

  // Released mid-range the thumb should carry past the value and come back:
  // that is the whole of the "settle", and it is a property of the damping
  // ratio, so it is worth pinning rather than trusting.
  it("overshoots slightly, then settles", () => {
    const { xs } = run({ x: 50, v: 0 }, 80, 1);
    const furthest = Math.max(...xs);

    expect(furthest).toBeGreaterThan(80);
    // Slight: a few percent of the distance travelled, not a bounce.
    expect(furthest - 80).toBeLessThan(0.1 * 30);
    expect(xs[xs.length - 1]).toBeCloseTo(80, 2);
  });

  it("settles rather than oscillating: each swing is a fraction of the last", () => {
    const { xs } = run({ x: 50, v: 0 }, 80, 2);
    const peak = xs.indexOf(Math.max(...xs));
    const over = xs[peak] - 80;
    const under = 80 - Math.min(...xs.slice(peak));

    // It does come back past the value — this is a spring, not an ease-out...
    expect(under).toBeGreaterThan(0);
    // ...but the return swing is a small fraction of the first, so what the
    // eye sees is one soft settle, not a bounce.
    expect(under).toBeLessThan(0.4 * over);
  });

  // A backgrounded tab hands back one frame worth several seconds. An
  // unsliced integrator diverges on it; this is the guard against a thumb
  // that comes back from another tab having left the slider.
  it("survives an enormous frame instead of exploding", () => {
    const after = step({ x: 50, v: 0 }, 80, 4);
    expect(Number.isFinite(after.x)).toBe(true);
    expect(after.x).toBeGreaterThan(50);
    expect(after.x).toBeLessThan(90);
  });

  it("does not move when it is already there", () => {
    const after = step({ x: 30, v: 0 }, 30, 1 / 60);
    expect(after.x).toBe(30);
    expect(after.v).toBe(0);
  });
});

describe("the thumb's deformation", () => {
  it("is a perfect circle at rest", () => {
    expect(squash(0)).toEqual({ sx: 1, sy: 1, track: 1 });
  });

  it("stretches along the travel and thins across it, within the brief", () => {
    const fast = squash(240);
    expect(fast.sx).toBeCloseTo(1.12, 6);
    expect(fast.sy).toBeCloseTo(0.94, 6);
    expect(fast.track).toBeLessThan(fast.sy);

    // The whole usable range stays inside the 1.08-1.12 / 0.92-0.96 band the
    // brief asks for once the drag is genuinely fast.
    for (const v of [160, 200, 240, 600]) {
      expect(squash(v).sx).toBeGreaterThanOrEqual(1.08);
      expect(squash(v).sx).toBeLessThanOrEqual(1.12);
      expect(squash(v).sy).toBeGreaterThanOrEqual(0.92);
      expect(squash(v).sy).toBeLessThanOrEqual(0.96);
    }
  });

  it("deforms the same in both directions, so reversing passes through round", () => {
    expect(squash(-180)).toEqual(squash(180));
    expect(squash(-0.0001).sx).toBeCloseTo(1, 4);
  });

  it("cannot deform further than its limit, however fast the drag", () => {
    expect(squash(100000)).toEqual(squash(240));
  });

  it("barely moves at a slow drag", () => {
    expect(squash(12).sx).toBeLessThan(1.01);
  });
});
