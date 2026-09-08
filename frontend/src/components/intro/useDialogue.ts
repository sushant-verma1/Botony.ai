import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { animate, utils } from "animejs";
import voice from "../../assets/d.wav";
import { END, EXPRESSION, stateAt } from "./dialogue";
import { EYE, ZOOM } from "./introConfig";

type El<E extends Element> = RefObject<E | null>;

export type DialogueRefs = {
  eyeL: El<SVGEllipseElement>;
  eyeR: El<SVGEllipseElement>;
  bar: El<SVGRectElement>;
  /** The character, the scene it is placed against, and the words that leave
   *  with it — all three for the withdrawal that follows the line. */
  hero: El<HTMLElement>;
  svg: El<SVGSVGElement>;
  caption: El<HTMLElement>;
};

/**
 * Baymax speaking, with the recording as the only clock.
 *
 * One requestAnimationFrame loop reads audio.currentTime, asks dialogue.ts what
 * the face and the caption look like at that instant, and writes it. There is
 * no schedule to drift from: pause the audio and the playhead stops, so the
 * expression and the words stop with it; play it again and they carry on from
 * where the voice is. Restarting is `currentTime = 0` and nothing else.
 *
 * What it writes is deliberately narrow. An expression is only the eyes' rx and
 * ry and the connector's x and width — four attributes on three elements that
 * already exist. It never touches the eyes' cx, which the entrance owns, or
 * their scaleY, which the blink owns, so the blink keeps running underneath and
 * the rendered eye is the expression's geometry with the blink's compression on
 * top of it, exactly as the two compose in the SVG.
 */
export function useDialogue(refs: DialogueRefs) {
  const [words, setWords] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** True once the withdrawal below has finished — the beat the chest control
   *  is waiting for. It starts true under reduced motion, where the timeline
   *  places the finished character directly and the line never runs at all:
   *  the control is part of the page, not part of the performance, so it must
   *  not be gated on an animation that path never plays. */
  const [settled, setSettled] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const audio = useRef<HTMLAudioElement | null>(null);
  /** Runs the line without its voice. Populated by the effect below, because
   *  that is where the render loop lives. */
  const silent = useRef<() => void>(() => {});

  /** Writes one face. Shared by the loop and by reset, so there is one
   *  definition of what "the face right now" means. */
  const paint = useCallback(
    (rx: number, ry: number, barX: number, barW: number) => {
      for (const eye of [refs.eyeL.current, refs.eyeR.current]) {
        eye?.setAttribute("rx", String(rx));
        eye?.setAttribute("ry", String(ry));
      }
      refs.bar.current?.setAttribute("x", String(barX));
      refs.bar.current?.setAttribute("width", String(barW));
    },
    [refs.eyeL, refs.eyeR, refs.bar],
  );

  /**
   * POST_DIALOGUE — the character withdraws.
   *
   * It rises and shrinks in one move: a translate and a uniform scale on the
   * SVG element itself, which is the only way to reframe it without touching a
   * coordinate. The artwork, the viewBox and every proportion inside it are
   * exactly what they were, scaleX and scaleY cannot drift apart because there
   * is one number, and the blink and the expressions carry on underneath.
   *
   * Where it lands is measured rather than assumed: the eye centreline is put
   * ZOOM.eyeLine down the scene from wherever it currently is, so the rise is
   * whatever that viewport asks for. The caption leaves on the same beat.
   *
   * It is a one-time transition, and the character's own scale is what says so:
   * one that has already withdrawn is left alone, and the sequence re-arms
   * itself whenever the timeline puts the close framing back (toInitial).
   */
  const pullBack = useCallback(() => {
    const hero = refs.hero.current;
    const svg = refs.svg.current;
    if (!hero || !svg) return;
    // Also what the translate below continues from: `f` is the offset the
    // settle left on the character, which this move adds to rather than drops.
    const from = new DOMMatrixReadOnly(getComputedStyle(svg).transform);
    if (from.a !== 1) return;

    const rect = svg.getBoundingClientRect();
    const scene = hero.getBoundingClientRect();
    // The element's box is centred on the eyes and the scale is taken about
    // that centre, so this point does not move under the scale and the rise is
    // a plain difference between where it is and where it should end up.
    const eyeLine = rect.top + rect.height / 2;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    animate(svg, {
      scale: ZOOM.scale,
      translateY: from.f + (scene.top + scene.height * ZOOM.eyeLine - eyeLine),
      duration: still ? 0 : ZOOM.duration,
      ease: "inOutQuad",
      // The character is in its final framing from here on, which is what the
      // chest control appears against.
      onComplete: () => setSettled(true),
    });

    if (refs.caption.current) {
      animate(refs.caption.current, {
        opacity: 0,
        duration: still ? 0 : ZOOM.captionOut,
        ease: "outQuad",
      });
    }
  }, [refs.hero, refs.svg, refs.caption]);

  useEffect(() => {
    // 1.8MB of uncompressed WAV: fetched when it is asked for, not on landing.
    const a = new Audio(voice);
    a.preload = "metadata";
    audio.current = a;

    let raf = 0;
    let endedAt = 0;
    /** Set only when the browser refused to play the voice; see `silent`. */
    let mutedFrom = 0;

    const frame = () => {
      // The settle runs past the last word, so the clock has to outlive the
      // recording by a beat. It is still the recording's clock: `ended` is the
      // only thing that starts the extension, and a paused audio is not ended.
      const t = mutedFrom
        ? (performance.now() - mutedFrom) / 1000
        : a.ended
          ? a.duration + (performance.now() - endedAt) / 1000
          : a.currentTime;
      const s = stateAt(t);
      paint(s.rx, s.ry, s.barX, s.barW);
      setWords((w) => (w === s.words ? w : s.words));

      if (t < END) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
        setPlaying(false);
        // The line is over on the same frame the withdrawal starts, so there is
        // no gap between the two — the move reads as the end of the line.
        pullBack();
      }
    };

    /** Starts the render loop, whatever is driving it. Bringing the caption
     *  back belongs here rather than in a reset: the words are visible because
     *  the line is running, so they re-arm every time it starts, and the fade
     *  the withdrawal leaves behind can never strand a later run. */
    const begin = () => {
      if (refs.caption.current) utils.set(refs.caption.current, { opacity: 1 });
      // A replay is back in the close framing, so the withdrawal — and the
      // control that waits on it — re-arm with the rest of the sequence.
      setSettled(false);
      setPlaying(true);
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const onPlay = () => {
      mutedFrom = 0;
      begin();
    };

    /** The line performs without its voice.
     *
     *  A page may not play audio it was not asked to play, and there is no
     *  longer anything on the hero to ask with, so the first attempt is usually
     *  refused. Rather than leave the character mid-sequence — no caption, no
     *  expressions, and nothing to trigger the pull-back that follows them —
     *  the same timeline runs off a wall clock at the same rate. Every value is
     *  a function of `t` either way (see stateAt), so this is the identical
     *  performance with the recording's clock swapped for a plain one. */
    silent.current = () => {
      if (raf) return;
      mutedFrom = performance.now();
      begin();
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      endedAt = performance.now();
    };

    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);

    return () => {
      cancelAnimationFrame(raf);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.pause();
      audio.current = null;
    };
  }, [paint, pullBack, refs.caption]);

  /** Play, or pause where it stands. A finished line starts over. */
  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (!a.paused) return a.pause();
    if (a.ended) {
      a.currentTime = 0;
      setWords(0);
    }
    void a.play().catch(() => silent.current());
  }, []);

  /** Put the face and the caption back to the hero's resting state. The intro's
   *  Replay rewinds the whole sequence and owns some of the same elements, so
   *  the dialogue has to be out of the way before it runs. */
  const reset = useCallback(() => {
    const a = audio.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setWords(0);
    paint(EXPRESSION.neutral.rx, EXPRESSION.neutral.ry, EYE.BAR_X, EYE.BAR_W);
  }, [paint]);

  return { words, playing, settled, toggle, reset };
}
