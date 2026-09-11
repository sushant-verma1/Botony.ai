import { EYE } from "./intro/introConfig";

/**
 * The wordmark's eye, drawn from the same geometry the hero character is
 * animated from — so the mark in the nav, the mark in the chat sidebar and
 * the face on the landing page are one drawing rather than three that
 * resemble each other. EYE stays the single definition of it.
 */
export default function Mark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${EYE.VIEW_W} ${EYE.VIEW_H}`}
      aria-hidden="true"
    >
      <rect
        x={EYE.BAR_X}
        y={EYE.BAR_Y}
        width={EYE.BAR_W}
        height={EYE.BAR_H}
        fill="currentColor"
      />
      <circle cx={EYE.CX_L} cy={EYE.CY} r={EYE.R} fill="currentColor" />
      <circle cx={EYE.CX_R} cy={EYE.CY} r={EYE.R} fill="currentColor" />
    </svg>
  );
}
