import { useCallback, useEffect, useRef, useState } from "react";
import { FACE, faceAt, nameAt } from "./expressions";
import { settled, squash, step, type Spring } from "./jelly";
import { CHEST } from "./introConfig";

/**
 * The expression control on the character's chest.
 *
 * There is one face here, not five. Four elements are mounted once — a head,
 * two eyes and a mouth — and the slider rewrites their geometry: `cx`, `cy`,
 * `r` and the mouth's points, recomputed from the value on every change. No
 * element is added, removed, hidden, faded or swapped at any point on the
 * range, so the five reference expressions are positions along one continuous
 * shape rather than five pictures taking turns. expressions.ts holds the
 * geometry and the mixing; this file is what draws the result.
 *
 * It is drawn in the character's own coordinate system (see CHEST), which is
 * what keeps it centred on the chest and stationary: the character's framing
 * is a transform on the SVG above it, so the control moves with the body
 * without knowing anything about it, and changing the expression moves
 * nothing but the features themselves.
 *
 * The control itself is two layers over one another, and which is which
 * matters:
 *
 *   - The `<input type="range">` is the slider. It holds the value, it takes
 *     every pointer and every key, it carries the label and the focus ring,
 *     and it is untouched — the range, the step, the handler and the face
 *     rendered from it are exactly what they were. Only its own paint is off.
 *   - The track and thumb beneath it are the picture of that slider, drawn in
 *     the character's coordinates, springing after the value (jelly.ts) and
 *     deforming with the speed of the drag. They take no input and hold no
 *     state: delete this layer and the control still works, with the native
 *     thumb back.
 *
 * So the value is never late. The change handler sets state as it always did
 * and the face is drawn from that state in the same render; the spring only
 * decides where the *drawing* of the thumb is, and it is written straight to
 * the DOM inside the animation frame rather than through state — so the jelly
 * costs the value nothing and re-renders nothing.
 */

/** The control, in the artwork's units. These mirror what the CSS used to
 *  paint: a 3-unit track and a 15-unit thumb. */
const TRACK_H = 3;
const THUMB_R = 7.5;
const X0 = CHEST.cx - CHEST.sliderW / 2;
const CY = CHEST.top + CHEST.face + CHEST.gap + CHEST.sliderH / 2;

/** Where the thumb's centre sits at a value. The travel is inset by the
 *  thumb's radius at both ends, which is where a range input puts its own
 *  thumb — this is what keeps the drawing under the pointer. */
const TRAVEL = CHEST.sliderW - THUMB_R * 2;
const px = (value: number) => X0 + THUMB_R + (TRAVEL * value) / 100;

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function ExpressionSlider() {
  const [value, setValue] = useState<number>(CHEST.initial);
  const face = faceAt(value);

  const thumb = useRef<SVGGElement>(null);
  const fill = useRef<SVGRectElement>(null);
  /** The value the spring is chasing. A ref as well as state because the
   *  animation frame reads it without wanting a re-render to see it. */
  const target = useRef<number>(CHEST.initial);
  const spring = useRef<Spring>({ x: CHEST.initial, v: 0 });
  const frame = useRef(0);
  const last = useRef(0);

  /** The whole of the visual layer: two transforms, written directly. */
  const paint = useCallback((x: number, sx: number, sy: number, track: number) => {
    thumb.current?.setAttribute("transform", `translate(${px(x)} ${CY}) scale(${sx} ${sy})`);
    fill.current?.setAttribute("transform", `scale(${(px(x) - X0) / CHEST.sliderW} ${track})`);
  }, []);

  const run = useCallback(() => {
    if (frame.current) return;
    last.current = performance.now();

    const tick = (now: number) => {
      spring.current = step(spring.current, target.current, (now - last.current) / 1000);
      last.current = now;

      if (settled(spring.current, target.current)) {
        spring.current = { x: target.current, v: 0 };
        paint(target.current, 1, 1, 1);
        frame.current = 0;
        return;
      }

      const { sx, sy, track } = squash(spring.current.v);
      paint(spring.current.x, sx, sy, track);
      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
  }, [paint]);

  useEffect(() => {
    paint(CHEST.initial, 1, 1, 1);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [paint]);

  return (
    <g className="hero__mood">
      {/* The reference draws each face in a 24-unit square; this is the only
          thing that changes about it — the size it is drawn at. Scaling the
          group rather than the numbers keeps the artwork's proportions and
          its stroke weight exactly as the file has them. */}
      <g
        transform={`translate(${CHEST.cx - CHEST.face / 2} ${CHEST.top}) scale(${
          CHEST.face / FACE.VIEW
        })`}
      >
        <circle
          cx={FACE.CX}
          cy={FACE.CY}
          r={FACE.R}
          fill={face.fill}
          stroke={FACE.INK}
          strokeWidth={FACE.RING}
        />
        <circle cx={face.eyes.lx} cy={face.eyes.cy} r={face.eyes.r} fill={FACE.INK} />
        <circle cx={face.eyes.rx} cy={face.eyes.cy} r={face.eyes.r} fill={FACE.INK} />
        {/* A polyline of fixed length, resampled from whichever arc the value
            lands between — which is what lets a semicircle become a straight
            line without either one being replaced. */}
        <path
          d={face.mouth}
          fill="none"
          stroke={FACE.INK}
          strokeWidth={FACE.MOUTH_W}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* The picture of the control. Every event here belongs to the input
          above it. */}
      <g transform={`translate(${X0} ${CY})`} pointerEvents="none">
        <rect
          x={0}
          y={-TRACK_H / 2}
          width={CHEST.sliderW}
          height={TRACK_H}
          rx={TRACK_H / 2}
          fill="rgba(3, 18, 14, 0.16)"
        />
        {/* The travelled part. Full width, scaled down to the thumb: a
            transform rather than a width, so the band is stretched rather
            than redrawn, and it thins as it is pulled. */}
        <rect
          ref={fill}
          x={0}
          y={-TRACK_H / 2}
          width={CHEST.sliderW}
          height={TRACK_H}
          rx={TRACK_H / 2}
          fill="#03120e"
        />
      </g>

      {/* Drawn at the origin so that scaling it is about its own centre — the
          stretch has to leave the thumb where it is, not slide it. */}
      <g ref={thumb} pointerEvents="none">
        <circle r={THUMB_R} fill="#03120e" />
      </g>

      {/* A foreignObject lays the input out in CSS pixels inside the
          character's coordinates, so the control is sized against the chest it
          sits on and scales with it — it is part of the character rather than
          a form control parked in front of one. */}
      <foreignObject
        x={CHEST.cx - CHEST.sliderW / 2}
        y={CHEST.top + CHEST.face + CHEST.gap}
        width={CHEST.sliderW}
        height={CHEST.sliderH}
      >
        <input
          type="range"
          className="hero__moodRange"
          min={0}
          max={100}
          step={1}
          value={value}
          // The value *is* the interpolation parameter: this sets state, the
          // render mixes the geometry, and that is the whole path from the
          // thumb to the face. Nothing is scheduled, eased or animated in
          // between, so the features track the drag frame for frame. The
          // spring is only started afterwards, and only moves the drawing.
          onChange={(e) => {
            const next = e.currentTarget.valueAsNumber;
            target.current = next;
            setValue(next);
            if (still()) {
              spring.current = { x: next, v: 0 };
              paint(next, 1, 1, 1);
            } else {
              run();
            }
          }}
          aria-label="Expression"
          aria-valuetext={nameAt(value)}
        />
      </foreignObject>
    </g>
  );
}
