/* ------------------------------------------------------------------------
   The question the chest control is asking.

   Same shape as dialogue.ts: the recording is the clock, and everything the
   caption looks like at an instant is a pure function of the playhead. The
   difference is only where the words are — this line is split around the
   character rather than laid over it, and the full stop after "1" crosses the
   gap between the two halves, passing behind the character on its way.
   --------------------------------------------------------------------- */

import { eases } from "animejs";
import { scriptOf, wordsSpoken, type Timed } from "./dialogue";

/** Where the recording says each phrase, in seconds.
 *
 *  Measured off src/assets/pain.wav the same way d.wav was: a 5ms RMS
 *  envelope, speech taken as anything within 22dB of the file's peak, bursts
 *  less than 60ms apart merged. That found five utterances in a 4.05s file —
 *  0.250-1.250, 1.335-1.765, 1.870-2.185, 2.575-3.210, 3.340-3.860 — and the
 *  word rate comes out at ~0.2s a syllable across all of them, which is what
 *  says the words below sit on the right bursts.
 *
 *  The split is structural, not stylistic: PAIN[0] is the left half of the
 *  composition and everything after it is the right half. Moving a word
 *  across the character means moving it across that boundary. */
export const PAIN: readonly Timed[] = [
  { start: 0.25, end: 1.25, text: "On a scale of 1" },
  { start: 1.335, end: 1.765, text: "to 10" },
  { start: 1.87, end: 2.185, text: "how would" },
  { start: 2.575, end: 3.21, text: "you rate your" },
  { start: 3.34, end: 3.86, text: "pain" },
];

export const LEFT = scriptOf(PAIN.slice(0, 1));
export const RIGHT = scriptOf(PAIN.slice(1));

/** The stop's flight: it leaves as "1" finishes — the word it belongs to is
 *  complete, so what is left of it is punctuation with somewhere to be — and
 *  lands on the beat "pain" starts, where it is the stop that ends the
 *  sentence. Its duration is that gap rather than a number, so it can never
 *  arrive early and hang in blank space, and the long crossing is what makes
 *  the passage behind the character legible instead of a flicker. */
export const DOT = {
  start: PAIN[0].end,
  duration: PAIN[PAIN.length - 1].start - PAIN[0].end,
} as const;

/** When there is nothing left to animate; the render loop stops here. */
export const END = PAIN[PAIN.length - 1].end + 0.4;

export type PainState = {
  /** How many words of LEFT + RIGHT have been said. */
  words: number;
  /** The dot's progress along its flight, 0 at home and 1 landed. */
  dot: number;
};

/** The whole caption as a pure function of the recording's playhead. */
export function painAt(t: number): PainState {
  const p = (t - DOT.start) / DOT.duration;
  return {
    words: wordsSpoken(PAIN, t),
    dot: eases.inOutCubic(Math.min(1, Math.max(0, p))),
  };
}
