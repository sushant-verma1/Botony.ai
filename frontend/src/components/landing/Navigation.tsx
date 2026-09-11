import { Link } from "react-router-dom";
import Mark from "../Mark";

export default function Navigation() {
  return (
    <header className="nav">
      <Link to="/" className="nav__brand" aria-label="Botony, home">
        <Mark className="nav__mark" />
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
