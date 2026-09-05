import { useEffect, useRef, useState } from "react";
import { animate } from "animejs";
import {
  computeLayout,
  ROW_DURATIONS,
  type ExpressionLayout,
} from "./expressionLayout";
import "./ExpressionBackground.css";

/**
 * The 10 expression SVGs, taken straight from src/assets/expressions.
 * The numbered filenames sort into the intended order, and dropping an
 * eleventh face into that folder needs no change here.
 */
const EXPRESSIONS = Object.entries(
  import.meta.glob<string>("../assets/expressions/*.svg", {
    eager: true,
    query: "?url",
    import: "default",
  }),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

const readLayout = () =>
  computeLayout(window.innerWidth, window.innerHeight, EXPRESSIONS.length);

/**
 * A decorative field of slowly drifting robot expressions, with a white veil
 * over it. Renders layers 0 and 1 of the stack; the caller supplies layer 2.
 */
export default function ExpressionBackground() {
  const [layout, setLayout] = useState<ExpressionLayout>(readLayout);
  const trackRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* Re-measure on resize, but keep the previous object when nothing actually
     changed. Returning `prev` makes React bail out of the re-render, which
     matters here: re-rendering swaps the row elements and would restart every
     marquee mid-travel. */
  useEffect(() => {
    const onResize = () =>
      setLayout((prev) => {
        const next = readLayout();
        return next.faceW === prev.faceW &&
          next.repeats === prev.repeats &&
          next.rowCount === prev.rowCount
          ? prev
          : next;
      });

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* One linear, infinitely looping tween per row. Because the two halves of a
     track are identical, translating by exactly -50% (or +50%) lands on a
     frame indistinguishable from the start, so the loop restart is invisible.
     Constant velocity throughout — easing anywhere in a marquee reads as the
     background surging and stalling. */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const anims = trackRefs.current.slice(0, layout.rowCount).map((el, i) =>
      el
        ? animate(el, {
            // even rows drift left, odd rows right
            translateX:
              i % 2 === 0
                ? { from: "0%", to: "-50%" }
                : { from: "-50%", to: "0%" },
            duration: ROW_DURATIONS[i % ROW_DURATIONS.length],
            ease: "linear",
            loop: true,
          })
        : null,
    );

    return () => anims.forEach((a) => a?.revert());
  }, [layout]);

  // Two identical halves; the second is what replaces the first as it leaves.
  const half = Array.from(
    { length: layout.repeats * EXPRESSIONS.length },
    (_, i) => EXPRESSIONS[i % EXPRESSIONS.length],
  );
  const track = [...half, ...half];

  return (
    <>
      <div className="background-perspective" aria-hidden="true">
        <div
          className="expression-layer"
          style={{
            gap: `${layout.rowGap}px`,
            ["--expression-gap" as string]: `${layout.gapX}px`,
          }}
        >
          {Array.from({ length: layout.rowCount }, (_, row) => (
            <div className="expression-row" key={row}>
              <div
                className="expression-track"
                ref={(el) => {
                  trackRefs.current[row] = el;
                }}
              >
                {track.map((src, i) => (
                  <img
                    key={i}
                    className="expression-face"
                    src={src}
                    alt=""
                    width={layout.faceW}
                    height={layout.faceH}
                    draggable={false}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="background-overlay" />
    </>
  );
}
