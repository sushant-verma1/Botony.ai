import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Character from "./Character";
import ExpressionSlider from "./ExpressionSlider";
import PainCaption from "./PainCaption";
import { SCRIPT } from "./dialogue";
import { useDialogue } from "./useDialogue";
import { useFaceTracking } from "./useFaceTracking";
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
  const body = useRef<SVGGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const bar = useRef<SVGRectElement>(null);
  const caption = useRef<HTMLParagraphElement>(null);
  const eyeL = useRef<SVGEllipseElement>(null);
  const eyeR = useRef<SVGEllipseElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const headline = useRef<HTMLParagraphElement>(null);

  const navigate = useNavigate();

  /** What the scene is asking for. "rating" is the chest control and its
   *  question; "leaving" is the same two fading out on the confirm press,
   *  after which the page hands off to /login — the animationend below, so
   *  the duration is stated once, in the stylesheet, and the handoff cannot
   *  drift from it. */
  const [phase, setPhase] = useState<"rating" | "leaving">("rating");

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

  /** The control and the question, up until the form takes their place. */
  const asking = dialogue.settled;

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

      {/* The question the control is asking, split around the character and
          behind it, on the same beat the control arrives — it owns pain.wav,
          so the words and the cue are one thing (see PainCaption). */}
      {asking && <PainCaption leaving={phase === "leaving"} />}

      <div className="hero__stage">
        {/* The finished character, in the reference SVG's own coordinates.
            The timeline starts it as a single circle by stacking both eyes at
            CX_MID and collapsing the connector to zero width; what is written
            here is the end state, so the file always shows the real geometry.
            Markup and geometry live in Character, shared with the auth
            scene the confirm press below hands off to. */}
        <Character
          svg={svg}
          body={body}
          eyes={eyes}
          bar={bar}
          eyeL={eyeL}
          eyeR={eyeR}
          // Animation events bubble, so this one listener sees the control's
          // fade-out and nothing before it — only the confirm press's exit
          // moves the phase on.
          onChestAnimationEnd={() =>
            phase === "leaving" && navigate("/login", { state: { fromIntro: true } })
          }
          chest={
            /* Mounted only once the withdrawal has finished, which is the
               one thing it needs from the sequence; it owns its own state,
               so changing the expression re-renders this group and nothing
               else. */
            asking && (
              <ExpressionSlider
                leaving={phase === "leaving"}
                onConfirm={() => setPhase("leaving")}
              />
            )
          }
        />

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
