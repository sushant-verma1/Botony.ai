/* ------------------------------------------------------------------------
   The spoken introduction.

   One timeline, and the recording is its clock: every value the face and the
   caption take is a pure function of the audio's currentTime (see stateAt).
   Nothing here schedules anything, so pausing the audio freezes the picture
   and seeking it moves the picture, without a single timer to keep in step.

   The face is still the hero's own two eyes and connector — no element is
   added and none is swapped. An expression is only a pair of eye radii; the
   connector's x and width are derived from them so it always meets both eyes.
   --------------------------------------------------------------------- */

import { eases } from "animejs";
import { EYE } from "./introConfig";

type Eye = { rx: number; ry: number };

/** The character's head width on the eye centreline, in the SVG's own units.
 *
 *  2 * rx * sqrt(1 - ((CY - cy)/ry)^2) for the head ellipse IntroSequence
 *  draws. Written down rather than derived because the head's geometry lives
 *  in the component; dialogue.test.ts recomputes it from the asset itself, so
 *  it cannot drift. */
export const HEAD_W = 220.9;

/** Eye extents read straight out of frontend/refrences/*.svg.
 *
 *  Each reference draws ONE path twice — the two eyes differ only in where
 *  they are translated to — so the whole of an expression is that path's
 *  width and height. Decoded from the `d` attributes:
 *
 *    attentif  M-10.5 -11.5 A10.5 ... 0 -22   ... 10.5 11.5  ->  21 x 44
 *    heureux   M-13.5 0     A8.5  ... 5 -8.5  ... 13.5 0     ->  27 x 17
 *    surpris   M-22.5 -1    A22.5 ... 0 -23.5 ... 22.5 1     ->  45 x 47
 *
 *  in those files' 200-unit head. K puts them in ours. Everything else the
 *  references do is deliberately not copied: they carry their own idle drift
 *  and their own blink (scaleY 0.99 -> 0.22, width untouched — the same blink
 *  this hero already has), and they space their eyes far closer together than
 *  this character does, which has a connector to span. */
const REF = {
  attentive: { w: 21, h: 44 },
  happy: { w: 27, h: 17 },
  surprised: { w: 45, h: 47 },
} as const;

const K = HEAD_W / 200;

const mix = (a: Eye, b: Eye, t: number): Eye => ({
  rx: a.rx + (b.rx - a.rx) * t,
  ry: a.ry + (b.ry - a.ry) * t,
});

const NEUTRAL: Eye = { rx: EYE.R, ry: EYE.R };

/** How much of the reference shape actually reaches the eye — 1 would draw it
 *  exactly as traced from the reference art, which reads as a shape swap
 *  rather than an expression on this character's own round eye. Pulling it
 *  most of the way back toward NEUTRAL keeps the same direction of change
 *  (narrower, squashed, wider) at a scale that still looks like an eye. */
export const SUBTLETY = 0.35;

const scaled = ({ w, h }: { w: number; h: number }): Eye =>
  mix(NEUTRAL, { rx: (w / 2) * K, ry: (h / 2) * K }, SUBTLETY);

/** The states the face moves between. `neutral` is the character's own resting
 *  eye, untouched, so the dialogue starts from and returns to exactly the hero
 *  the entrance built. */
export const EXPRESSION = {
  neutral: { rx: EYE.R, ry: EYE.R },
  attentive: scaled(REF.attentive),
  happy: scaled(REF.happy),
  surprised: scaled(REF.surprised),
  /** Attentive, softened a third of the way toward happy. */
  warm: mix(scaled(REF.attentive), scaled(REF.happy), 0.3),
} satisfies Record<string, Eye>;

export type Expression = keyof typeof EXPRESSION;

/** How long an expression takes to travel from one state to the next, and how
 *  far ahead of its phrase it sets off. The lead is what puts the face in the
 *  new state as the word lands rather than after it — most visibly on
 *  "owwww", which has 885ms of silence in front of it to move into. */
export const MORPH = 0.34;
export const LEAD = 0.2;

type Phrase = {
  start: number;
  end: number;
  expression: Expression;
  text: string;
};

/** Where the recording actually says each phrase, in seconds.
 *
 *  Measured off src/assets/d.wav rather than divided up by eye: a 5ms RMS
 *  envelope, speech taken as anything within 22dB of the file's peak, bursts
 *  less than 120ms apart merged into one. That found seven utterances —
 *  0.135-0.530, 0.940-1.890, 2.410-2.545, 2.695-3.095, 3.300-4.270,
 *  4.975-8.190, 9.075-9.345 — and the internal dips of the long one, at
 *  6.325-6.425 and 7.835-7.935, split it where the delivery pauses. The
 *  syllable rate comes out even across all of them (~0.17s), which is what
 *  says the words below sit on the right bursts.
 *
 *  The trailing `neutral` entry is the settle: no audio, no words, it only
 *  gives the face somewhere to come back to once the line is finished. */
export const DIALOGUE: readonly Phrase[] = [
  { start: 0.135, end: 0.53, expression: "attentive", text: "Hello," },
  { start: 0.94, end: 1.89, expression: "warm", text: "I am Baymax," },
  {
    start: 2.41,
    end: 4.27,
    expression: "happy",
    text: "your personal healthcare companion.",
  },
  {
    start: 4.975,
    end: 6.325,
    expression: "attentive",
    text: "I was alerted to the",
  },
  {
    start: 6.425,
    end: 7.835,
    expression: "surprised",
    text: "need of medical attention",
  },
  { start: 7.935, end: 8.19, expression: "happy", text: "when you said" },
  {
    start: 9.075,
    end: 9.345,
    expression: "surprised",
    text: "“owwww.”",
  },
  { start: 9.9, end: 9.9, expression: "neutral", text: "" },
];

const wordsOf = (text: string) => (text ? text.split(" ") : []);

/** Every word of the script, in order. The caption renders all of them from
 *  the first frame and only changes their opacity, so the paragraph's height
 *  is fixed and revealing a word cannot reflow the page under the character. */
export const SCRIPT = DIALOGUE.flatMap((p) => wordsOf(p.text));

/** Index of each phrase's first word in SCRIPT. */
const WORD_FROM = DIALOGUE.map((_, i) =>
  DIALOGUE.slice(0, i).reduce((n, p) => n + wordsOf(p.text).length, 0),
);

/** When there is nothing left to animate; the render loop stops here. */
export const END = DIALOGUE[DIALOGUE.length - 1].start + MORPH;

/** How far the connector runs *inside* each eye.
 *
 *  Derived from the character's own resting geometry rather than picked, so
 *  barFor(EYE.R) reproduces the reference file's connector exactly — the
 *  neutral face is the hero as drawn, to the unit. */
const OVERLAP = EYE.CX_L + EYE.R - EYE.BAR_X;

/** The connector spanning a pair of eyes of half-width `rx`. Both ends are
 *  anchored inside an eye, so the bar cannot come away from either one or
 *  cross to the wrong side at any expression. */
export const barFor = (rx: number) => {
  const barX = EYE.CX_L + rx - OVERLAP;
  return { barX, barW: EYE.CX_R - rx + OVERLAP - barX };
};

export type FaceState = {
  rx: number;
  ry: number;
  barX: number;
  barW: number;
  /** How many words of SCRIPT have been spoken. */
  words: number;
};

/**
 * The whole sequence as a pure function of the recording's playhead.
 *
 * Expressions are interpolated, never assigned: at any t the face is somewhere
 * on an eased path between the state before and the state now. No phrase sets
 * off within MORPH of the one before it (dialogue.test.ts proves it), so every
 * transition finishes before the next begins and the face cannot pop.
 */
export function stateAt(t: number): FaceState {
  let i = -1;
  for (let k = 0; k < DIALOGUE.length; k++) {
    if (t >= DIALOGUE[k].start - LEAD) i = k;
  }

  const to = EXPRESSION[i < 0 ? "neutral" : DIALOGUE[i].expression];
  const was = EXPRESSION[i < 1 ? "neutral" : DIALOGUE[i - 1].expression];
  const p = i < 0 ? 1 : (t - (DIALOGUE[i].start - LEAD)) / MORPH;
  const e = eases.inOutCubic(Math.min(1, Math.max(0, p)));

  const rx = was.rx + (to.rx - was.rx) * e;
  const ry = was.ry + (to.ry - was.ry) * e;

  return { rx, ry, ...barFor(rx), words: wordsAt(t) };
}

/** Words are revealed evenly across the phrase that carries them: the phrase
 *  boundaries are measured, the word boundaries inside one are not, and
 *  pretending otherwise would only put them in the wrong place more precisely. */
function wordsAt(t: number): number {
  let words = 0;
  for (let i = 0; i < DIALOGUE.length; i++) {
    const p = DIALOGUE[i];
    if (t < p.start) break;
    const n = wordsOf(p.text).length;
    if (!n) continue;
    words =
      WORD_FROM[i] +
      (t >= p.end
        ? n
        : Math.min(n, 1 + Math.floor(((t - p.start) / (p.end - p.start)) * n)));
  }
  return words;
}
