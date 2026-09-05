export default function Footer() {
  return (
    <footer className="footer">
      <p className="footer__mark">Botony</p>
      <nav className="footer__links" aria-label="Legal">
        {/* Served straight out of /public — no route needed for two documents. */}
        <a href="/TERMS.md">Terms</a>
        <a href="/PRIVACY.MD">Privacy</a>
      </nav>
      <p className="footer__note">
        Prototype. Not a regulated medical device and not a diagnostic tool.
      </p>
    </footer>
  );
}
