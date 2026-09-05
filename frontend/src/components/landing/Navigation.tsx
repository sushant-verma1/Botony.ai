import { Link } from "react-router-dom";
import { EYE } from "../intro/introConfig";

/**
 * The wordmark reuses the reference SVG's own eye construction at small size,
 * so the mark in the corner and the character the hero animates into are
 * literally the same geometry rather than two drawings that resemble one
 * another. EYE stays the single definition of it.
 */
function Mark() {
  return (
    <svg
      className="nav__mark"
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

export default function Navigation() {
  return (
    <header className="nav">
      <Link to="/" className="nav__brand" aria-label="Botony, home">
        <Mark />
        <span className="nav__wordmark">Botony</span>
      </Link>

      <nav className="nav__links" aria-label="Primary">
        <a href="#how">How it works</a>
        <a href="#safety">Safety</a>
        <Link to="/login" className="nav__signin">
          Sign in
        </Link>
        <Link to="/register" className="nav__cta">
          Start a conversation
        </Link>
      </nav>
    </header>
  );
}
