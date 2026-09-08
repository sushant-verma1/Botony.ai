import IntroSequence from "../components/intro/IntroSequence";
import TopographyBackdrop from "../components/landing/TopographyBackdrop";
import Sections from "../components/landing/Sections";
import CallToAction from "../components/landing/CallToAction";
import Footer from "../components/landing/Footer";
import "../components/landing/landing.css";

/**
 * The landing page is two halves that deliberately do not interfere.
 *
 * The first viewport is the animation and nothing else: everything written
 * begins below the fold, so the sequence opens on genuinely empty space.
 * Scrolling past it reaches the ordinary page.
 *
 * Home composes; it holds no state and knows no timings.
 */
export default function Home() {
  return (
    <div className="landing">
      {/* Behind the first viewport and before the hero in the markup, which is
          what puts it behind everything the hero paints. */}
      <TopographyBackdrop />
      <IntroSequence />
      <main>
        <Sections />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
