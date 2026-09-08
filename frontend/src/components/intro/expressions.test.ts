import { describe, expect, it } from "vitest";
// Read the artwork rather than a copy of its numbers, so this file fails if the
// five faces are ever redrawn.
import canvas from "../../assets/canvas.svg?raw";
import { FACE, FACES, faceAt, nameAt, sample } from "./expressions";

/** canvas.svg is a board of five <image> tags, each one a whole face SVG
 *  inlined as base64. Decoding them back out is the only way to compare the
 *  config against what the file actually draws. */
const faces = (canvas.match(/base64,([A-Za-z0-9+/=]+)/g) ?? []).map((m) =>
  atob(m.slice(7)),
);

/** Pulls one numeric attribute out of a tag. */
const num = (attr: string, tag: string) => {
  const m = new RegExp(`${attr}="([^"]+)"`).exec(tag);
  if (!m) throw new Error(`no ${attr} in: ${tag}`);
  return Number(m[1]);
};
const head = (svg: string) => /<circle[^>]*r="10.4"[^>]*>/.exec(svg)?.[0] ?? "";
const eyes = (svg: string): [string, string] => {
  const found = svg.match(/<circle[^>]*r="1.20"[^>]*>/g) ?? [];
  if (found.length !== 2) throw new Error(`expected 2 eyes, found ${found.length}`);
  return [found[0]!, found[1]!];
};
const mouth = (svg: string) => /<path[^>]*d="([^"]+)"/.exec(svg)?.[1] ?? "";

/** The order the faces sit on the board, which is not the order the slider
 *  runs them in. Everything below compares the i-th picture in the file with
 *  the config entry of the same name, so the slider is free to reorder them
 *  and these tests still check the artwork. */
const BOARD = ["happy", "sad", "neutral", "attentive", "surprised"] as const;
const drawn = (i: number) => {
  const f = FACES.find((face) => face.name === BOARD[i]);
  if (!f) throw new Error(`FACES has no ${BOARD[i]}`);
  return f;
};

describe("the five reference faces", () => {
  it("are all there", () => {
    expect(faces).toHaveLength(FACES.length);
  });

  it("share the head this config draws", () => {
    for (const svg of faces) {
      expect(num("cx", head(svg))).toBe(FACE.CX);
      expect(num("cy", head(svg))).toBe(FACE.CY);
      expect(num("r", head(svg))).toBe(FACE.R);
      expect(head(svg)).toContain(`stroke-width="${FACE.RING}"`);
    }
  });

  it("carry the fills FACES lists", () => {
    faces.forEach((svg, i) => {
      expect(head(svg)).toContain(`fill="${drawn(i).fill}"`);
    });
  });

  it("draw both eyes where FACES puts them", () => {
    faces.forEach((svg, i) => {
      const [l, r] = eyes(svg);
      expect(num("cx", l)).toBe(drawn(i).eyes.lx);
      expect(num("cx", r)).toBe(drawn(i).eyes.rx);
      expect(num("cy", l)).toBe(drawn(i).eyes.cy);
      expect(num("cy", r)).toBe(drawn(i).eyes.cy);
      expect(num("r", l)).toBe(drawn(i).eyes.r);
    });
  });

  // Worth pinning down because it is not obvious from the pictures: across all
  // five faces only the fill and the mouth move. The eyes are still lerped, so
  // a face redrawn with different eyes morphs for free — this test is what
  // says so out loud, and fails if that stops being true.
  it("use identical eyes throughout, so only the mouth changes shape", () => {
    expect(new Set(faces.map((svg) => eyes(svg).join(""))).size).toBe(1);
  });

  it("draw each mouth with the corners, radius and direction FACES records", () => {
    faces.forEach((svg, i) => {
      const d = mouth(svg);
      const m = drawn(i).mouth;
      // Straight mouths are drawn "M<x1> <y>H<x2>", bowed ones as a single arc
      // "M<x1> <y>A<r> <r> 0 0 <sweep> <x2> <y>". Sweep 0 bows it down the
      // screen, which is the smile.
      const arc = /^M([\d.]+) ([\d.]+)A([\d.]+) [\d.]+ 0 0 (\d) ([\d.]+) ([\d.]+)$/.exec(d);
      const flat = /^M([\d.]+) ([\d.]+)H([\d.]+)$/.exec(d);

      if (!m.r) {
        expect(flat, d).not.toBeNull();
        expect([Number(flat![1]), Number(flat![2]), Number(flat![3])]).toEqual([
          FACE.X1, m.y, FACE.X2,
        ]);
        return;
      }
      expect(arc, d).not.toBeNull();
      expect([Number(arc![1]), Number(arc![2]), Number(arc![5]), Number(arc![6])]).toEqual([
        FACE.X1, m.y, FACE.X2, m.y,
      ]);
      expect(Number(arc![3])).toBe(m.r);
      expect(arc![4] === "0").toBe(m.smile);
    });
  });
});

describe("resampling a mouth", () => {
  it("keeps both corners exactly where the file draws them", () => {
    for (const f of FACES) {
      const p = sample(f.mouth);
      expect(p[0]).toBeCloseTo(FACE.X1, 9);
      expect(p[1]).toBeCloseTo(f.mouth.y, 9);
      expect(p[p.length - 2]).toBeCloseTo(FACE.X2, 9);
      expect(p[p.length - 1]).toBeCloseTo(f.mouth.y, 9);
    }
  });

  it("gives every mouth the same point count, which is what lets them mix", () => {
    expect(new Set(FACES.map((f) => sample(f.mouth).length)).size).toBe(1);
  });

  // The one place the maths can silently invert: an exact semicircle has zero
  // sagitta offset, so which way it bows rests entirely on the sign carried
  // through `bow`. Both semicircles here (happy, sad) bow opposite ways.
  it("bows each mouth the way the arc flag says, by the sagitta its radius implies", () => {
    const half = (FACE.X2 - FACE.X1) / 2;
    for (const f of FACES) {
      const p = sample(f.mouth);
      const midY = p[p.length - 1] && p[Math.floor(p.length / 4) * 2 + 1];
      const sagitta = f.mouth.r
        ? f.mouth.r - Math.sqrt(f.mouth.r * f.mouth.r - half * half)
        : 0;
      expect(midY).toBeCloseTo(f.mouth.y + (f.mouth.smile ? sagitta : -sagitta), 6);
    }
  });
});

describe("the expression spectrum", () => {
  /** The mouth string a reference face resamples to, unmixed. */
  const exact = (i: number) =>
    sample(FACES[i].mouth)
      .reduce<string[]>((acc, n, k) => {
        if (k % 2) acc[acc.length - 1] += ` ${n.toFixed(3)}`;
        else acc.push(`${k ? "L" : "M"}${n.toFixed(3)}`);
        return acc;
      }, [])
      .join("");

  it("lands on the exact reference geometry at every quarter", () => {
    [0, 25, 50, 75, 100].forEach((v, i) => {
      const f = faceAt(v);
      expect(f.fill).toBe(FACES[i].fill);
      expect(f.eyes).toEqual(FACES[i].eyes);
      expect(f.mouth).toBe(exact(i));
    });
  });

  it("is a real mouth between two faces, not either of them", () => {
    for (const v of [12.5, 37.5, 63, 88]) {
      const mid = faceAt(v).mouth;
      expect(mid).not.toBe(exact(Math.floor(v / 25)));
      expect(mid).not.toBe(exact(Math.ceil(v / 25)));
    }
  });

  // The assertion that rules out an image swap: no half-step of the slider
  // moves any point of the mouth more than a fraction of a unit, anywhere on
  // the range — including across the four keyframes, where a swap would jump.
  it("moves continuously across the whole range, keyframes included", () => {
    const points = (v: number) => faceAt(v).mouth.split(/[ML]/).slice(1).flatMap((s) => s.split(" ").map(Number));
    let prev = points(0);
    for (let v = 0.5; v <= 100; v += 0.5) {
      const next = points(v);
      for (let i = 0; i < prev.length; i++) {
        expect(Math.abs(next[i] - prev[i]), `at ${v}`).toBeLessThan(0.15);
      }
      prev = next;
    }
  });

  it("holds at both ends rather than running off them", () => {
    expect(faceAt(-10).mouth).toBe(exact(0));
    expect(faceAt(140).mouth).toBe(exact(4));
  });

  it("names the face it is nearest, for the control's value text", () => {
    expect([0, 12, 13, 50, 100].map(nameAt)).toEqual([
      "happy", "happy", "attentive", "neutral", "sad",
    ]);
  });
});
