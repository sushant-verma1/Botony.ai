import { describe, expect, it } from "vitest";
// Same trick as introConfig.test.ts: read the artwork, not a copy of its
// numbers, so replacing the asset fails this file rather than passing quietly.
import referenceSvg from "../../assets/svgviewer-output (1).svg?raw";
import {
  DIALOGUE,
  END,
  EXPRESSION,
  HEAD_W,
  LEAD,
  MORPH,
  SCRIPT,
  SUBTLETY,
  barFor,
  stateAt,
} from "./dialogue";
import { BODY_OFFSET, EYE } from "./introConfig";

const num = (attr: string, tag: string) => {
  const m = new RegExp(`${attr}\\s*=\\s*"([-\\d.]+)"`).exec(tag);
  if (!m) throw new Error(`no ${attr} in: ${tag}`);
  return Number(m[1]);
};

/** Every frame the face can be rendered on, a little either side. */
const frames = (() => {
  const out: number[] = [];
  for (let t = -0.5; t <= END + 0.5; t += 1 / 60) out.push(t);
  return out;
})();

describe("expression geometry", () => {
  it("scales the reference eyes by this character's own head", () => {
    // HEAD_W is the head ellipse's width on the eye centreline. Recomputed
    // here from the asset so the constant cannot drift from the artwork.
    const head = /<ellipse[\s\S]*?\/>/.exec(referenceSvg)?.[0] ?? "";
    const cy = num("cy", head) + BODY_OFFSET.y;
    const halfW =
      num("rx", head) * Math.sqrt(1 - ((EYE.CY - cy) / num("ry", head)) ** 2);
    expect(2 * halfW).toBeCloseTo(HEAD_W, 0);
  });

  it("pulls each reference shape back toward the resting round eye", () => {
    // Full-strength (SUBTLETY 1) would reproduce the reference's own aspect
    // ratio exactly; this character keeps only SUBTLETY of that shape change
    // and the rest is neutral (rx == ry == EYE.R), so it reads as an
    // expression on this eye rather than a swap to a traced one.
    const mixed = (w: number, h: number) => ({
      rx: EYE.R + ((w / 2) * (HEAD_W / 200) - EYE.R) * SUBTLETY,
      ry: EYE.R + ((h / 2) * (HEAD_W / 200) - EYE.R) * SUBTLETY,
    });
    const attentive = mixed(21, 44);
    const happy = mixed(27, 17);
    const surprised = mixed(45, 47);

    expect(EXPRESSION.attentive.rx).toBeCloseTo(attentive.rx, 9);
    expect(EXPRESSION.attentive.ry).toBeCloseTo(attentive.ry, 9);
    expect(EXPRESSION.happy.rx).toBeCloseTo(happy.rx, 9);
    expect(EXPRESSION.happy.ry).toBeCloseTo(happy.ry, 9);
    expect(EXPRESSION.surprised.rx).toBeCloseTo(surprised.rx, 9);
    expect(EXPRESSION.surprised.ry).toBeCloseTo(surprised.ry, 9);
  });

  it("reads as three different faces", () => {
    // Attentive is taller than wide, happy is wider than tall, surprised is
    // the biggest of the three. Lose any of those and the expression is gone.
    expect(EXPRESSION.attentive.ry).toBeGreaterThan(EXPRESSION.attentive.rx);
    expect(EXPRESSION.happy.rx).toBeGreaterThan(EXPRESSION.happy.ry);
    expect(EXPRESSION.surprised.rx).toBeGreaterThan(EXPRESSION.attentive.rx);
    expect(EXPRESSION.surprised.ry).toBeGreaterThan(EXPRESSION.happy.ry);
  });

  it("leaves the resting face exactly as the hero draws it", () => {
    expect(EXPRESSION.neutral).toEqual({ rx: EYE.R, ry: EYE.R });
    expect(barFor(EYE.R)).toEqual({ barX: EYE.BAR_X, barW: EYE.BAR_W });
  });

  it("keeps every eye inside the head", () => {
    const head = /<ellipse[\s\S]*?\/>/.exec(referenceSvg)?.[0] ?? "";
    const cx = num("cx", head) + BODY_OFFSET.x;
    const cy = num("cy", head) + BODY_OFFSET.y;
    const ry = num("ry", head);
    for (const [name, eye] of Object.entries(EXPRESSION)) {
      const halfW = num("rx", head) * Math.sqrt(1 - ((EYE.CY - cy) / ry) ** 2);
      expect(EYE.CX_L - eye.rx, name).toBeGreaterThan(cx - halfW);
      expect(EYE.CX_R + eye.rx, name).toBeLessThan(cx + halfW);
      expect(EYE.CY - eye.ry, name).toBeGreaterThan(cy - ry);
      expect(EYE.CY + eye.ry, name).toBeLessThan(cy + ry);
    }
  });
});

describe("the connector, at every expression", () => {
  it("always keeps both ends buried inside an eye", () => {
    for (const t of frames) {
      const s = stateAt(t);
      expect(s.barW).toBeGreaterThan(0);
      // Left end inside the left eye, right end inside the right eye — so the
      // bar can never detach, and never reach past an eye to the wrong side.
      expect(s.barX).toBeLessThan(EYE.CX_L + s.rx);
      expect(s.barX).toBeGreaterThan(EYE.CX_L - s.rx);
      expect(s.barX + s.barW).toBeGreaterThan(EYE.CX_R - s.rx);
      expect(s.barX + s.barW).toBeLessThan(EYE.CX_R + s.rx);
    }
  });

  it("stays centred between the eyes", () => {
    for (const t of frames) {
      const s = stateAt(t);
      expect(s.barX + s.barW / 2).toBeCloseTo(EYE.CX_MID, 9);
    }
  });
});

describe("transitions", () => {
  it("never lets one expression start before the last has finished", () => {
    // This is what makes a jump impossible rather than merely unobserved: a
    // transition interpolates from the previous *state*, so it is only
    // continuous if that state has actually been reached.
    for (let i = 1; i < DIALOGUE.length; i++) {
      expect(DIALOGUE[i].start - DIALOGUE[i - 1].start).toBeGreaterThan(MORPH);
    }
    expect(LEAD).toBeGreaterThan(0);
    expect(LEAD).toBeLessThan(MORPH);
  });

  it("moves the face smoothly, frame to frame, for the whole line", () => {
    let worst = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = stateAt(frames[i - 1]);
      const b = stateAt(frames[i]);
      worst = Math.max(
        worst,
        Math.abs(b.rx - a.rx),
        Math.abs(b.ry - a.ry),
        Math.abs(b.barX - a.barX),
        Math.abs(b.barW - a.barW),
      );
    }
    // A pop would show up here as one frame carrying a whole expression —
    // 16 units of ry, or 26 of connector. The steepest real move is the
    // connector on attentive -> surprised, which changes at twice the eye's
    // rate and still spreads 26 units over the 20 frames of a MORPH.
    expect(worst).toBeLessThan(4.5);
  });

  it("starts and ends on the character's resting face", () => {
    expect(stateAt(-1).rx).toBeCloseTo(EYE.R, 9);
    expect(stateAt(-1).ry).toBeCloseTo(EYE.R, 9);
    expect(stateAt(END).rx).toBeCloseTo(EYE.R, 9);
    expect(stateAt(END).ry).toBeCloseTo(EYE.R, 9);
  });

  it("is already moving when the word lands, and holds it", () => {
    const ow = DIALOGUE[DIALOGUE.length - 2];
    expect(ow.expression).toBe("surprised");
    // Under way as "owwww" begins...
    expect(stateAt(ow.start).ry).toBeGreaterThan(EXPRESSION.happy.ry);
    // ...fully surprised inside the word...
    expect(stateAt(ow.start - LEAD + MORPH).ry).toBeCloseTo(
      EXPRESSION.surprised.ry,
      6,
    );
    expect(ow.start - LEAD + MORPH).toBeLessThan(ow.end);
    // ...and still there once it is over.
    expect(stateAt(ow.end).ry).toBeCloseTo(EXPRESSION.surprised.ry, 6);
  });
});

describe("the caption", () => {
  it("says the line it is supposed to say", () => {
    expect(SCRIPT.join(" ").replace(/[“”]/g, '"')).toBe(
      'Hello, I am Baymax, your personal healthcare companion. ' +
        'I was alerted to the need of medical attention when you said "owwww."',
    );
  });

  it("only ever reveals words, never takes one back", () => {
    let last = 0;
    for (const t of frames) {
      const { words } = stateAt(t);
      expect(words).toBeGreaterThanOrEqual(last);
      last = words;
    }
    expect(last).toBe(SCRIPT.length);
  });

  it("holds every word until its phrase is being spoken", () => {
    for (const p of DIALOGUE) {
      if (!p.text) continue;
      // Nothing of a phrase before it starts; all of it by the time it ends.
      const before = stateAt(p.start - 0.001).words;
      expect(stateAt(p.start).words).toBe(before + 1);
      expect(stateAt(p.end).words).toBe(before + p.text.split(" ").length);
    }
  });

  it("has nothing on screen before the recording starts", () => {
    expect(stateAt(0).words).toBe(0);
  });
});
