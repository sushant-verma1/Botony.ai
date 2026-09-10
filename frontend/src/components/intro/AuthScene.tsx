import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { animate, spring, utils } from "animejs";
import Character from "./Character";
import { createBlink } from "./blink";
import { useFaceTracking } from "./useFaceTracking";
import TopographyBackdrop from "../landing/TopographyBackdrop";
import { AUTH_ENTER, CHEST, FORM_SHIFT, IDLE, shutScale, ZOOM } from "./introConfig";
import "./intro.css";
import "../landing/landing.css";

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Whether an event happened anywhere inside the password field — the input,
 *  its label, or its reveal button. The forms mark that one field; nothing
 *  else here knows what a password is. */
const inSecret = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest("[data-secret]");

/**
 * /login and /register: the character the intro leaves behind, wearing
 * whichever form the route asks for. A pathless layout route (see App.tsx)
 * keeps this mounted across the two, which is what lets the character step
 * back for the taller register form instead of the page remounting it.
 *
 * Two arrivals land at the identical resting position (the same ZOOM framing
 * the intro's withdrawal — see useDialogue's pullBack — settles into).
 * Pressing Confirm on the intro hands off `state.fromIntro`, and the
 * character is placed there directly: it is already mid-animation on `/`, so
 * nothing here should restart it. Anything else — a typed URL, a nav link,
 * the PrivateRoute redirect — springs the character up from below the fold.
 */
export default function AuthScene() {
  const location = useLocation();
  const isRegister = location.pathname === "/register";
  const fromIntro = Boolean(
    (location.state as { fromIntro?: boolean } | null)?.fromIntro,
  );

  const hero = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const body = useRef<SVGGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const bar = useRef<SVGRectElement>(null);
  const eyeL = useRef<SVGEllipseElement>(null);
  const eyeR = useRef<SVGEllipseElement>(null);

  /** The character's resting transform at ZOOM framing, before FORM_SHIFT —
   *  measured once on arrival and reused by every later step-back, so
   *  switching forms back and forth can never accumulate drift. */
  const rest = useRef<{ y: number; scale: number } | null>(null);
  /** The form mounts only once the arrival has finished, so its own
   *  hero-fade-in follows the character rather than racing it. Already true
   *  under a seamless handoff or reduced motion, where nothing is left to
   *  wait for. */
  const [ready, setReady] = useState(() => fromIntro || reducedMotion());

  /** The two ways the password field can be attended to. Hovering it shuts
   *  the eyes; so does focusing it, and the focus outlasts the pointer — look
   *  away mid-password and the character is still not watching. */
  const [overPassword, setOverPassword] = useState(false);
  const [inPassword, setInPassword] = useState(false);
  const shut = overPassword || inPassword;

  useLayoutEffect(() => {
    const el = svg.current;
    const scene = hero.current;
    if (!el || !scene) return;

    const shiftFor = (register: boolean, base: { y: number; scale: number }) => ({
      translateY:
        base.y - (register ? scene.getBoundingClientRect().height * FORM_SHIFT.lift : 0),
      scale: base.scale * (register ? FORM_SHIFT.scale : 1),
    });

    if (!rest.current) {
      // Measured before any transform is applied — identical to pullBack's
      // own measurement in useDialogue.ts, so the two arrivals agree exactly.
      const rect = el.getBoundingClientRect();
      const sceneRect = scene.getBoundingClientRect();
      const eyeLine = rect.top + rect.height / 2;
      rest.current = {
        y: sceneRect.top + sceneRect.height * ZOOM.eyeLine - eyeLine,
        scale: ZOOM.scale,
      };

      // A direct /register visit folds its shift into the very first target
      // rather than landing unshifted and animating into place a moment
      // later — there is nothing to switch back from yet.
      const target = shiftFor(isRegister, rest.current);

      if (fromIntro || reducedMotion()) {
        // `ready`'s own initial state already covers this case (same two
        // conditions), so there is nothing to set here — only to place.
        utils.set(el, target);
        return;
      }

      // Below the fold: the same eye line the resting position uses, pushed
      // past the scene's bottom edge by the character's own (shrunk) height,
      // so the spring has somewhere real to rise from at every viewport.
      const offscreen =
        sceneRect.height * (1 - ZOOM.eyeLine) + (rect.height * target.scale) / 2;
      utils.set(el, { scale: target.scale, translateY: target.translateY + offscreen });
      animate(el, {
        translateY: target.translateY,
        // No `duration` here, deliberately: anime runs a spring tween for the
        // spring's *settling* time whatever duration is stated, so one here
        // would be silently ignored. The form hangs off the spring's own
        // onComplete for the same reason — that fires when the character
        // arrives, not half a second later when the last sub-pixel of
        // overshoot has died down.
        ease: spring({
          bounce: AUTH_ENTER.bounce,
          duration: AUTH_ENTER.duration,
          onComplete: () => setReady(true),
        }),
      });
      return;
    }

    // The arrival is long done; only a login <-> register switch reaches
    // here, so this is the character stepping back to make room (or forward
    // again), same as the intro's own FORM_SHIFT.
    const target = shiftFor(isRegister, rest.current);
    if (reducedMotion()) {
      utils.set(el, target);
      return;
    }
    animate(el, {
      ...target,
      ease: spring({ bounce: FORM_SHIFT.bounce, duration: FORM_SHIFT.duration }),
    });
  }, [isRegister, fromIntro]);

  // The same pointer-driven look the intro gives the character once it has
  // settled — here, once it has arrived. It writes translations only, so it
  // composes with the blink, and with the eyes being held shut, rather than
  // fighting either.
  useFaceTracking({ svg, eyes, eyeL, eyeR }, ready);

  // The eyes. They blink on a loop while open, and stay shut for as long as
  // the password field is hovered or focused. Rebuilt on each change rather
  // than toggled, so exactly one animation writes scaleY at a time; the
  // outgoing one is paused rather than reverted, so the lids carry on from
  // wherever they had got to instead of snapping.
  useEffect(() => {
    const l = eyeL.current;
    const r = eyeR.current;
    if (!l || !r) return;

    if (shut) {
      const close = animate([l, r], {
        scaleY: shutScale,
        duration: IDLE.blinkClose,
        ease: "inQuad",
      });
      return () => {
        close.pause();
      };
    }

    const blink = createBlink(l, r);
    const open = animate([l, r], {
      scaleY: 1,
      duration: IDLE.blinkOpen,
      ease: "outQuad",
      onComplete: () => blink.play(),
    });
    return () => {
      open.pause();
      blink.pause();
    };
  }, [shut]);

  return (
    <div
      ref={hero}
      className="hero__scene hero__scene--auth"
      // Delegated rather than handed to the forms: the scene owns the face,
      // and Login/Register only mark which field is the secret one. onFocus
      // and onBlur are React's bubbling focusin/focusout, so they see the
      // input inside the foreignObject.
      onPointerOver={(e) => setOverPassword(inSecret(e.target))}
      onPointerLeave={() => setOverPassword(false)}
      onFocus={(e) => setInPassword(inSecret(e.target))}
      onBlur={() => setInPassword(false)}
    >
      <TopographyBackdrop />
      <div className="hero__stage">
        <Character
          svg={svg}
          body={body}
          eyes={eyes}
          bar={bar}
          eyeL={eyeL}
          eyeR={eyeR}
          chest={
            ready && (
              // Same hole in the chest the intro's slider occupied (see
              // CHEST in introConfig): centred on the torso and sized for
              // whichever form is currently routed to.
              <foreignObject
                className="hero__loginSlot"
                x={CHEST.cx - CHEST.formW / 2}
                y={CHEST.top}
                width={CHEST.formW}
                height={isRegister ? CHEST.registerH : CHEST.formH}
              >
                {/* Keyed on the route: React replaces the subtree on a
                    switch, so the arrival animation plays in both
                    directions rather than only the first time. */}
                <div
                  key={location.pathname}
                  className={`hero__login${isRegister ? " is-register" : ""}`}
                >
                  <Outlet />
                </div>
              </foreignObject>
            )
          }
        />
      </div>
    </div>
  );
}
