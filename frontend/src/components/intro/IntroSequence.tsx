import { useRef } from "react";
import { EYE } from "./introConfig";
import { useIntroTimeline } from "./useIntroTimeline";
import "./intro.css";

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
  const bar = useRef<SVGRectElement>(null);
  const eyeL = useRef<SVGCircleElement>(null);
  const eyeR = useRef<SVGCircleElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const headline = useRef<HTMLParagraphElement>(null);
  const outro = useRef<HTMLDivElement>(null);

  const replay = useIntroTimeline({
    hero,
    svg,
    bar,
    eyeL,
    eyeR,
    box,
    content,
    headline,
    outro,
  });

  return (
    <div ref={hero} className="hero__scene">
      <p ref={headline} className="hero__headline">
        Tell it where it hurts.
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
          <rect
            ref={bar}
            x={EYE.BAR_X}
            y={EYE.BAR_Y}
            width={EYE.BAR_W}
            height={EYE.BAR_H}
            fill="currentColor"
          />
          <circle
            ref={eyeL}
            cx={EYE.CX_L}
            cy={EYE.CY}
            r={EYE.R}
            fill="currentColor"
          />
          <circle
            ref={eyeR}
            cx={EYE.CX_R}
            cy={EYE.CY}
            r={EYE.R}
            fill="currentColor"
          />
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

      <div ref={outro} className="hero__outro">
        <p className="hero__eyebrow">Symptom guidance · Not a diagnosis</p>
        <p className="hero__lede">
          Describe how you feel in your own words. Botony helps you make sense
          of it — and is direct about when to see someone who can examine you.
        </p>
        <button type="button" className="hero__replay" onClick={replay}>
          Replay
        </button>
      </div>
    </div>
  );
}
