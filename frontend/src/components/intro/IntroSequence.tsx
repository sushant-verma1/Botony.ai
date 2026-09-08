import { useRef } from "react";
import newBody from "../../assets/canvas_continuous_body.svg";
import ExpressionSlider from "./ExpressionSlider";
import { SCRIPT } from "./dialogue";
import { BODY_OFFSET, EYE } from "./introConfig";
import { useDialogue } from "./useDialogue";
import { useFaceTracking } from "./useFaceTracking";
import { useIntroTimeline } from "./useIntroTimeline";
import "./intro.css";

/**
 * The new artwork's head is 66.52 units wide and its removed face was centred
 * at (136.99, 35.68). Uniformly scaling that head to the previous 222-unit
 * head, then registering its former face centre to the existing eye centre,
 * leaves the eye coordinate system entirely untouched.
 *
 * `canvas_continuous_body.svg` is a body-only derivative of the supplied SVG:
 * its white canvas plus its two eyes and mouth have been deliberately removed.
 */
const NEW_BODY = {
  faceCx: 136.9926816,
  faceCy: 35.6759256,
  scale: 3.33794,
} as const;

const newBodyTransform = `translate(${EYE.CX_MID - NEW_BODY.faceCx * NEW_BODY.scale} ${
  EYE.CY - NEW_BODY.faceCy * NEW_BODY.scale
}) scale(${NEW_BODY.scale})`;

/**
 * The hero. Markup and copy only — it holds no timings and no geometry of its
 * own; the timeline drives every animated property and introConfig owns every
 * number. Editing the words here cannot break the animation.
 *
 * The character and the morphing box share one grid cell (see intro.css), so
 * they are co-centred without any positioning maths, which is what makes the
 * handoff between them at CIRCLE invisible.
 */
export default function IntroSequence() {
  const hero = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const body = useRef<SVGGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const bar = useRef<SVGRectElement>(null);
  const caption = useRef<HTMLParagraphElement>(null);
  const eyeL = useRef<SVGEllipseElement>(null);
  const eyeR = useRef<SVGEllipseElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const headline = useRef<HTMLParagraphElement>(null);

  // Declared before the timeline so its (stable, useCallback'd) toggle can be
  // handed in as the glance's settle callback — the line starts itself once
  // the character has dropped into place, no click required.
  const dialogue = useDialogue({ eyeL, eyeR, bar, hero, svg, caption });

  useIntroTimeline(
    { hero, svg, body, eyes, bar, eyeL, eyeR, box, content, headline },
    dialogue.toggle,
  );
  // The pointer-driven look is deliberately unavailable during the scripted
  // performance. It starts only with the chest expression slider, after the
  // post-dialogue withdrawal is complete.
  useFaceTracking({ svg, eyes, eyeL, eyeR }, dialogue.settled);

  return (
    <div ref={hero} className="hero__scene">
      <p ref={headline} className="hero__headline">
        Tell it where it hurts.
      </p>

      {/* What Baymax is saying, laid out like the headline above — the same
          shared grid cell, centred over the character — but stacked behind
          .hero__stage so the character sits in front of its own words rather
          than the words appearing beside or under it. */}
      <p ref={caption} className="hero__dialogue">
        {SCRIPT.map((word, i) => {
          const spoken =
            i === dialogue.words - 1
              ? "is-active"
              : i < dialogue.words - 1
                ? "is-said"
                : "";
          // The character's own name is a brand mark, not a spoken beat — it
          // stays full ink throughout rather than dimming once said.
          const brand = word.startsWith("Baymax") ? "is-brand" : "";
          const className = [spoken, brand].filter(Boolean).join(" ") || undefined;
          return (
            <span key={i} className={className}>
              {word}
            </span>
          );
        })}
      </p>

      <div className="hero__stage">
        {/* The finished character, in the reference SVG's own coordinates.
            The timeline starts it as a single circle by stacking both eyes at
            CX_MID and collapsing the connector to zero width; what is written
            here is the end state, so the file always shows the real geometry. */}
        <svg
          ref={svg}
          className="hero__eyes"
          viewBox={`0 0 ${EYE.VIEW_W} ${EYE.VIEW_H}`}
          role="img"
          aria-label="Botony"
        >
          {/* The replacement body is behind the old eye system and hidden
              until the glance begins. Its asset contains no face; the uniform
              coordinate mapping only registers its removed-face centre to the
              old eyes, which retain every animation ref and selector below. */}
          <g
            ref={body}
            className="hero__body"
            transform={newBodyTransform}
            aria-hidden="true"
          >
            <image
              href={newBody}
              x="0"
              y="0"
              width="275"
              height="370"
              preserveAspectRatio="xMidYMid meet"
            />
          </g>

          {/* The expression control, on the chest. It is drawn in the same
              offset group the body is, so it is centred on the torso by
              construction and rides the withdrawal's scale and rise without
              knowing they happened — nothing here positions it against the
              character, because it is in the character's coordinates.

              Mounted only once the withdrawal has finished, which is the one
              thing it needs from the sequence; it owns its own state, so
              changing the expression re-renders this group and nothing else. */}
          {dialogue.settled && (
            <g transform={`translate(${BODY_OFFSET.x} ${BODY_OFFSET.y})`}>
              <ExpressionSlider />
            </g>
          )}

          {/* The eye system: the two eyes and the connector that joins them.
              Grouped so the glance moves all three with one transform — the
              bar cannot come away from the eyes or cross to the wrong side,
              because nothing ever moves them relative to each other. */}
          <g ref={eyes}>
            <rect
              ref={bar}
              x={EYE.BAR_X}
              y={EYE.BAR_Y}
              width={EYE.BAR_W}
              height={EYE.BAR_H}
              fill="currentColor"
            />
            {/* Ellipses rather than circles, at rx = ry = R: identical to the
                reference's <circle r="19"> as drawn, but with two radii the
                dialogue can move independently. That is the whole expression
                system — no element is added, swapped or hidden to change the
                face, and with the radii untouched this is the character. */}
            <ellipse
              ref={eyeL}
              className="hero__eye"
              cx={EYE.CX_L}
              cy={EYE.CY}
              rx={EYE.R}
              ry={EYE.R}
              fill="currentColor"
            />
            <ellipse
              ref={eyeR}
              className="hero__eye"
              cx={EYE.CX_R}
              cy={EYE.CY}
              rx={EYE.R}
              ry={EYE.R}
              fill="currentColor"
            />
          </g>
        </svg>

        {/* The one element that is the squircle, the textbox, the pill and the
            circle. It is never swapped, faded or duplicated. */}
        <div ref={box} className="hero__morph">
          <div ref={content} className="hero__content">
            <textarea
              className="hero__input"
              aria-label="Describe how you are feeling"
              placeholder="How are you feeling today?"
              rows={1}
            />
            <div className="hero__toolbar">
              <span className="hero__hint">
                Educational guidance — not a diagnosis.
              </span>
              <button
                type="button"
                className="hero__send"
                aria-label="Send message"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 19V5M12 5l-6 6M12 5l6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
