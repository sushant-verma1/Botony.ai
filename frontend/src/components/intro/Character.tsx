import type { ReactNode, RefObject } from "react";
import newBody from "../../assets/canvas_continuous_body.svg";
import { BODY_OFFSET, EYE } from "./introConfig";

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

type El<E extends Element> = RefObject<E | null>;

type Props = {
  svg: El<SVGSVGElement>;
  body: El<SVGGElement>;
  eyes: El<SVGGElement>;
  bar: El<SVGRectElement>;
  eyeL: El<SVGEllipseElement>;
  eyeR: El<SVGEllipseElement>;
  /** Whatever sits on the chest — the intro's expression slider, or the auth
   *  scene's login/register form — in the same group the body is, and so in
   *  the same coordinates: centred on the torso and riding the character's
   *  scale without knowing anything about it. */
  chest?: ReactNode;
  /** The intro's own handoff: it fades the slider out with a CSS animation
   *  and listens for it to end on this group, since animationend bubbles up
   *  from whichever child is actually animating. The auth scene has no fade
   *  to listen for and leaves this unset. */
  onChestAnimationEnd?: () => void;
};

/**
 * The finished character, in the reference SVG's own coordinates. Shared by
 * the intro sequence, which animates every property here from a collapsed
 * circle, and the auth scene, which places it directly — this file owns only
 * the markup and the geometry, never a timing, so the two pages can never
 * draw two different characters.
 */
export default function Character({
  svg,
  body,
  eyes,
  bar,
  eyeL,
  eyeR,
  chest,
  onChestAnimationEnd,
}: Props) {
  return (
    <svg
      ref={svg}
      className="hero__eyes"
      viewBox={`0 0 ${EYE.VIEW_W} ${EYE.VIEW_H}`}
      role="img"
      aria-label="Botony"
    >
      {/* The replacement body is behind the old eye system and hidden until
          the glance begins (or, on the auth scene, drawn opaque from the
          start — see intro.css). Its asset contains no face; the uniform
          coordinate mapping only registers its removed-face centre to the
          old eyes, which retain every animation ref and selector below. */}
      <g ref={body} className="hero__body" transform={newBodyTransform} aria-hidden="true">
        <image
          href={newBody}
          x="0"
          y="0"
          width="275"
          height="370"
          preserveAspectRatio="xMidYMid meet"
        />
      </g>

      {/* The chest slot, in the same offset group the body is, so it is
          centred on the torso by construction and rides the withdrawal's
          scale and rise without knowing they happened. */}
      {chest && (
        <g
          transform={`translate(${BODY_OFFSET.x} ${BODY_OFFSET.y})`}
          onAnimationEnd={onChestAnimationEnd}
        >
          {chest}
        </g>
      )}

      {/* The eye system: the two eyes and the connector that joins them.
          Grouped so the glance moves all three with one transform — the bar
          cannot come away from the eyes or cross to the wrong side, because
          nothing ever moves them relative to each other. */}
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
  );
}
