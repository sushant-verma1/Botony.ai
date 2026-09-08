import { useEffect, type RefObject } from "react";
import { animate, utils } from "animejs";
import { EYE, IDLE } from "./introConfig";

type EyeRefs = {
  svg: RefObject<SVGSVGElement | null>;
  eyes: RefObject<SVGGElement | null>;
  eyeL: RefObject<SVGEllipseElement | null>;
  eyeR: RefObject<SVGEllipseElement | null>;
};

// The new body's head, expressed in the established eye coordinate system.
// It defines the maximum gaze excursion, not a hit area: the pointer is read
// across the whole viewport and its vector is clamped to this face-safe bound.
const FACE = {
  cx: 71.7,
  cy: 30,
  w: 222,
  h: 191,
} as const;

const INWARD_AT_CENTRE = 4;
const TRACK_DURATION = 100;

/**
 * Adds the post-dialogue, pointer-driven version of the existing glance.
 *
 * The group still carries the primary look shift and the far eye receives the
 * extra shift, exactly like the scripted left/right glance. The only addition
 * is a small resting convergence when the pointer is between the eyes. It
 * writes translations only: blink owns scaleY and dialogue owns rx/ry.
 */
export function useFaceTracking(refs: EyeRefs, enabled: boolean) {
  useEffect(() => {
    const svg = refs.svg.current;
    const eyes = refs.eyes.current;
    const eyeL = refs.eyeL.current;
    const eyeR = refs.eyeR.current;
    if (!enabled || !svg || !eyes || !eyeL || !eyeR) return;

    let motions: Array<{ cancel: () => unknown }> = [];

    const moveTo = (nx: number, ny: number, converge = true) => {
      motions.forEach((motion) => motion.cancel());

      // The group moves toward the pointer. The far eye takes the additional
      // distance used by the original glance; at centre the pair turns inward
      // toward the pointer between them.
      const groupX = nx * IDLE.lookShift;
      const groupY = ny * IDLE.lookShift;
      const inward = converge ? INWARD_AT_CENTRE : 0;
      const leftX = inward + Math.max(nx, 0) * IDLE.lookShiftOpposite;
      const rightX = -inward + Math.min(nx, 0) * IDLE.lookShiftOpposite;

      motions = [
        animate(eyes, {
          translateX: groupX,
          translateY: groupY,
          duration: TRACK_DURATION,
          ease: "inOut",
        }),
        animate(eyeL, {
          translateX: leftX,
          duration: TRACK_DURATION,
          ease: "inOut",
        }),
        animate(eyeR, {
          translateX: rightX,
          duration: TRACK_DURATION,
          ease: "inOut",
        }),
      ];
    };

    const onPointerMove = ({ clientX, clientY }: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const unit = rect.width / EYE.VIEW_W;
      if (!unit) return;

      const faceX = rect.left + FACE.cx * unit;
      const faceY = rect.top + FACE.cy * unit;
      const nx = (clientX - faceX) / ((FACE.w * unit) / 2);
      const ny = (clientY - faceY) / ((FACE.h * unit) / 2);

      // Track anywhere on screen, then saturate the direction at the face
      // boundary. A distant cursor still gives a meaningful look direction,
      // but the eyes remain inside the head at every distance.
      const distance = Math.hypot(nx, ny);
      const range = Math.max(1, distance);
      moveTo(nx / range, ny / range);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      motions.forEach((motion) => motion.cancel());
      // Preserve blink's scaleY; reset only the translations owned here.
      utils.set(eyes, { translateX: 0, translateY: 0 });
      utils.set([eyeL, eyeR], { translateX: 0, translateY: 0 });
    };
  }, [enabled, refs.svg, refs.eyes, refs.eyeL, refs.eyeR]);
}
