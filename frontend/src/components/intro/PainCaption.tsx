import { useEffect, useRef, useState } from "react";
import pain from "../../assets/pain.wav";
import { DOT, END, LEFT, RIGHT, painAt } from "./painLine";

/**
 * The question, split around the character.
 *
 * Same performance as the spoken introduction and the same clock — one rAF
 * loop reads the recording's currentTime and asks painLine.ts what the caption
 * looks like at that instant, so pausing or seeking the audio moves the words
 * with it and there is no schedule to drift from.
 *
 * What is new is where the words are. The left half sits beside the character
 * and the right half on its other side, in a row whose middle column is the
 * character's own width, so nothing here is positioned against the artwork by
 * hand. The full stop after "1" is a real inline element in the left half; the
 * loop translates it onto the ghost stop at the end of the right half, by the
 * measured difference between the two — so it lands exactly where the sentence
 * ends at any viewport, with no coordinate written down. Both halves render
 * behind .hero__stage, so the stop crosses behind the character.
 *
 * This owns pain.wav, and it is mounted at the moment the chest control
 * appears, so the cue and the caption cannot come apart.
 */
export default function PainCaption({ leaving }: { leaving: boolean }) {
  const [words, setWords] = useState(0);
  const dot = useRef<HTMLSpanElement>(null);
  const mark = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const dotEl = dot.current;
    const markEl = mark.current;
    if (!dotEl || !markEl) return;

    // Measured once, with the dot still at home and untransformed: the flight
    // is a plain difference between where it is and where the other line
    // ends. A resize replays the whole intro, which remounts this.
    const from = dotEl.getBoundingClientRect();
    const to = markEl.getBoundingClientRect();
    const dx = to.left - from.left;
    const dy = to.top - from.top;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const a = new Audio(pain);
    let raf = 0;
    /** Set only when the browser refused to play the cue; see below. */
    let mutedFrom = 0;

    const frame = () => {
      const t = mutedFrom ? (performance.now() - mutedFrom) / 1000 : a.currentTime;
      const s = painAt(t);
      // Reduced motion gets the same caption with a zero-length flight: the
      // stop is at one end or the other, never travelling.
      const p = still ? (t >= DOT.start ? 1 : 0) : s.dot;
      dotEl.style.transform = `translate(${dx * p}px, ${dy * p}px)`;
      setWords((w) => (w === s.words ? w : s.words));
      raf = t < END ? requestAnimationFrame(frame) : 0;
    };

    const begin = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    // A page may not play audio it was not asked to play, and this cue is not
    // asked for — it fires when the control arrives. Refused, the caption runs
    // off a wall clock at the same rate rather than never appearing: every
    // value is a function of t either way (see painAt).
    void a.play().then(begin, () => {
      mutedFrom = performance.now();
      begin();
    });

    return () => {
      cancelAnimationFrame(raf);
      a.pause();
    };
  }, []);

  /** One half of the line. `offset` is where these words start in the whole,
   *  which is what keeps the reveal continuous across the two paragraphs. */
  const half = (list: string[], offset: number) =>
    list.map((word, i) => {
      const at = offset + i;
      const className =
        at === words - 1 ? "is-active" : at < words - 1 ? "is-said" : undefined;
      return (
        <span key={at} className={className}>
          {word}
        </span>
      );
    });

  return (
    <div className={`hero__painLine${leaving ? " is-leaving" : ""}`}>
      <p className="hero__pain hero__pain--left">
        {half(LEFT, 0)}
        {/* The travelling stop. Inline, so it starts exactly where the
            sentence puts it rather than where a coordinate says, and revealed
            with the word it belongs to — it is the stop after "1", so it
            cannot be on the page before "1" is. */}
        <span
          ref={dot}
          className={`hero__painDot${words >= LEFT.length ? " is-active" : ""}`}
        >
          .
        </span>
      </p>
      <p className="hero__pain hero__pain--right">
        {half(RIGHT, LEFT.length)}
        {/* Its destination: the same glyph, in the same type, never shown — it
            only holds the place the stop is flying to, which is the end of the
            sentence, where the same stop is the one that closes it. */}
        <span ref={mark} className="hero__painDot is-ghost" aria-hidden="true">
          .
        </span>
      </p>
    </div>
  );
}
