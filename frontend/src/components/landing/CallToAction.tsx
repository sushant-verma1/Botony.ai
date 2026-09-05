import { Link } from "react-router-dom";

export default function CallToAction() {
  return (
    <section className="cta" aria-labelledby="cta-heading">
      <h2 id="cta-heading" className="display display--cta">
        Start with how you feel.
      </h2>
      <div className="cta__actions">
        <Link to="/register" className="button button--solid">
          Start a conversation
        </Link>
        <Link to="/login" className="button button--quiet">
          I already have an account
        </Link>
      </div>
      <p className="note note--cta">
        Educational guidance only. Botony does not diagnose, and is not a
        substitute for a healthcare professional.
      </p>
    </section>
  );
}
