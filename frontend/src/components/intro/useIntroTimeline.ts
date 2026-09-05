import { useEffect, useRef, type RefObject } from "react";
import { createTimeline, spring, utils } from "animejs";
import {
  EYE,
  PALETTE,
  T,
  TILT_PEAK,
  boxHeight,
  boxWidth,
  circleFromEyeWidth,
  shapeRadius,
  shapeSize,
} from "./introConfig";

/**
 * The hero's state machine, as one Anime.js timeline:
 *
 *   INITIAL -> SHAPE_ENTER -> SHAPE_EXPAND -> INPUT_HOLD
 *           -> COLLAPSE -> CIRCLE -> EYE_FORMATION -> FINAL
 *
 * Every state is a position on a single timeline, so the whole sequence runs
 * off one clock: seekable, replayable, and impossible to desynchronise the way
 * a pile of setTimeouts would be. No duration, colour or coordinate is written
 * here — they all come from introConfig.ts.
 *
 * The one structural subtlety is the handoff at CIRCLE. The textbox has to be
 * real HTML (a <textarea> cannot be drawn in SVG) and the character has to be
 * the reference vector art, so the sequence is carried by two elements. They
 * trade places at exactly the frame where both are the same ink circle, in the
 * same place, at the same diameter — that diameter is *derived* from the SVG's
 * rendered width, so the two agree at every viewport by construction rather
 * than by two clamps happening to match.
 */

type El<E extends Element> = RefObject<E | null>;

export type IntroRefs = {
  hero: El<HTMLElement>;
  svg: El<SVGSVGElement>;
  bar: El<SVGRectElement>;
  eyeL: El<SVGCircleElement>;
  eyeR: El<SVGCircleElement>;
  box: El<HTMLElement>;
  content: El<HTMLElement>;
  headline: El<HTMLElement>;
  outro: El<HTMLElement>;
};

/** Returns a callback that plays the sequence again from a clean slate. */
export function useIntroTimeline(refs: IntroRefs): () => void {
  const replay = useRef<() => void>(() => {});

  useEffect(() => {
    const hero = refs.hero.current;
    const svg = refs.svg.current;
    const bar = refs.bar.current;
    const eyeL = refs.eyeL.current;
    const eyeR = refs.eyeR.current;
    const box = refs.box.current;
    const content = refs.content.current;
    const headline = refs.headline.current;
    const outro = refs.outro.current;
    if (
      !hero || !svg || !bar || !eyeL || !eyeR ||
      !box || !content || !headline || !outro
    ) {
      return;
    }

    /* -- measurements, read at tween time so a resize is honoured -------- */
    const heroW = () => hero.getBoundingClientRect().width || window.innerWidth;
    const heroH = () => hero.getBoundingClientRect().height || window.innerHeight;
    /** The character's rendered width. intro.css is the only place it is
     *  sized; everything that must line up with it measures it from here. */
    const eyesW = () => svg.getBoundingClientRect().width;
    const circleD = () => circleFromEyeWidth(eyesW());

    /* -- INITIAL --------------------------------------------------------- */
    /** Puts every animated property back to frame zero. Run before each play
     *  so the sequence is deterministic however it is entered. */
    const toInitial = () => {
      const size = shapeSize(heroW());
      utils.set(box, {
        opacity: 1,
        width: size,
        height: size,
        borderRadius: shapeRadius(size),
        backgroundColor: PALETTE.ink,
        borderColor: PALETTE.lineFaded,
        rotate: 0,
        // clear of the bottom edge: half the hero, plus its own height
        y: heroH() / 2 + size,
      });
      utils.set(content, { opacity: 0 });
      utils.set(headline, { opacity: 0, y: 18 });
      utils.set(svg, { opacity: 0 });
      utils.set([eyeL, eyeR], { cx: EYE.CX_MID });
      // The connector grows symmetrically out of the midpoint: its left edge
      // is translated to the centre while its width is zero, and the two
      // unwind together, which pins its centre at CX_MID for every frame.
      utils.set(bar, { width: 0, translateX: EYE.CX_MID - EYE.BAR_X });
      utils.set(outro, { opacity: 0, y: 14 });
    };

    /** The resting end state, for the reduced-motion path. */
    const toFinal = () => {
      toInitial();
      utils.set(box, { opacity: 0 });
      utils.set(svg, { opacity: 1 });
      utils.set(eyeL, { cx: EYE.CX_L });
      utils.set(eyeR, { cx: EYE.CX_R });
      utils.set(bar, { width: EYE.BAR_W, translateX: 0 });
      utils.set(outro, { opacity: 1, y: 0 });
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      toFinal();
      replay.current = toFinal;
      return;
    }

    /* -- the timeline ---------------------------------------------------- */
    toInitial();
    const tl = createTimeline({ autoplay: false, defaults: { ease: "outQuad" } });

    // SHAPE_ENTER — a pure exponential settle, matching the recording, with
    // the tilt thrown and unwound across the flight so the arrival reads as
    // momentum bleeding off rather than a property finishing.
    tl.add(box, { y: 0, duration: T.enter, ease: "outExpo" }, T.blank)
      .add(box, { rotate: TILT_PEAK, duration: T.tiltOut }, T.blank)
      .add(box, { rotate: 0, duration: T.tiltBack }, T.blank + T.tiltOut);

    // SHAPE_EXPAND — the same element grows; nothing is faded in or swapped.
    // The corner radius is deliberately left alone: holding it constant while
    // width and height change is what makes this read as one object stretching
    // rather than a small square being replaced by a large one.
    const expandAt = T.blank + T.enter - T.expandOverlap;
    tl.add(
      box,
      {
        width: () => boxWidth(heroW()),
        height: () => boxHeight(heroW()),
        ease: spring({ bounce: T.expandBounce, duration: T.expand }),
      },
      expandAt,
    )
      // The surface turns to paper faster than the shape finishes growing, so
      // it is already a textbox by the time it stops moving.
      .add(
        box,
        {
          backgroundColor: PALETTE.paper,
          borderColor: PALETTE.line,
          duration: T.expand * 0.6,
        },
        expandAt,
      )
      .add(content, { opacity: 1, duration: T.contentIn }, expandAt + T.expand * 0.55)
      .add(
        headline,
        { opacity: 1, y: 0, duration: T.headlineIn, ease: "out(3)" },
        expandAt + T.expand * 0.45,
      );

    // INPUT_HOLD — measured from the moment the interface is complete, so the
    // five seconds are five seconds of *finished* state, as specified.
    const settledAt = expandAt + T.expand + T.contentIn;
    const collapseAt = settledAt + T.hold;

    tl.add(content, { opacity: 0, duration: T.contentOut }, collapseAt - T.contentOut)
      .add(
        headline,
        { opacity: 0, y: -14, duration: T.headlineOut, ease: "in(2)" },
        collapseAt - T.headlineOut,
      );

    // COLLAPSE, in two beats. First the box crushes onto its own axis until it
    // is a pill exactly as wide as the finished character and exactly as tall
    // as one eye; then the pill closes into that eye. Two beats rather than one
    // scale-down is what gives CIRCLE its own moment in the machine, and the
    // intermediate pill is already the character's footprint, so the split that
    // follows looks like the object reopening along a line it had folded on.
    tl.add(
      box,
      {
        width: () => eyesW(),
        height: circleD,
        borderRadius: () => circleD() / 2,
        backgroundColor: PALETTE.ink,
        borderColor: PALETTE.lineFaded,
        duration: T.collapse,
        ease: "inOutQuart",
      },
      collapseAt,
    ).add(
      box,
      { width: circleD, duration: T.toCircle, ease: "inOutQuart" },
      collapseAt + T.collapse,
    );

    // CIRCLE — the handoff. For T.handoff ms the SVG's two coincident circles
    // sit exactly on top of an identical HTML circle before it is dropped.
    const circleAt = collapseAt + T.collapse + T.toCircle;
    tl.set(svg, { opacity: 1 }, circleAt)
      .set(box, { opacity: 0 }, circleAt + T.handoff);

    // EYE_FORMATION — one spring drives both eyes and the connector, so the
    // line is not an element arriving late but the middle of the same object
    // being drawn out as its two halves separate. The bar's left edge stays
    // inside the left eye for the whole travel (and through the overshoot), so
    // the three shapes never visibly come apart.
    const splitAt = circleAt + T.handoff;
    const splitSpring = spring({ bounce: T.splitBounce, duration: T.split });
    tl.add(eyeL, { cx: EYE.CX_L, ease: splitSpring }, splitAt)
      .add(eyeR, { cx: EYE.CX_R, ease: splitSpring }, splitAt)
      .add(bar, { width: EYE.BAR_W, translateX: 0, ease: splitSpring }, splitAt);

    // FINAL
    tl.add(
      outro,
      { opacity: 1, y: 0, duration: T.outroIn, ease: "out(3)" },
      splitAt + T.split * 0.6,
    );

    tl.play();
    replay.current = () => {
      toInitial();
      tl.restart();
    };

    /* -- resize ---------------------------------------------------------- */
    // Anime resolves the function values above when each tween starts, so a
    // resize mid-flight would leave the box at a stale width. Replaying is both
    // the shortest fix and the honest one. Height-only changes are ignored: on
    // mobile those are the address bar, not a new layout.
    let lastW = heroW();
    let debounce = 0;
    const onResize = () => {
      const w = heroW();
      if (Math.abs(w - lastW) < 40) return;
      lastW = w;
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => replay.current(), 200);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.clearTimeout(debounce);
      window.removeEventListener("resize", onResize);
      tl.revert();
    };
    // Ref objects are stable for the life of the component, so this effect
    // runs once — listing them individually rather than the wrapper object
    // keeps it that way even though the caller builds the wrapper inline.
  }, [
    refs.hero, refs.svg, refs.bar, refs.eyeL, refs.eyeR,
    refs.box, refs.content, refs.headline, refs.outro,
  ]);

  // Stable identity, so handing this to a button never re-renders the tree.
  return () => replay.current();
}
