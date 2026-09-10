import { animate, type JSAnimation } from "animejs";
import { IDLE } from "./introConfig";

/**
 * The blink, as its own animation rather than a timeline position — it has to
 * outlive whatever staged it, which is true both of the intro (where a
 * looping timeline entry would restage the whole hero) and of the auth scene
 * (which stages nothing at all). It compresses each eye vertically and lets
 * it come back up slightly slower; the width is never written, so the eye
 * keeps exactly the shape the SVG draws, and the connector between the two
 * eyes is untouched.
 */
export function createBlink(
  eyeL: SVGEllipseElement,
  eyeR: SVGEllipseElement,
): JSAnimation {
  return animate([eyeL, eyeR], {
    scaleY: [
      { to: 1, duration: IDLE.blinkHold },
      { to: IDLE.blinkScale, duration: IDLE.blinkClose, ease: "inQuad" },
      { to: 1, duration: IDLE.blinkOpen, ease: "outQuad" },
    ],
    loop: true,
    autoplay: false,
  });
}
