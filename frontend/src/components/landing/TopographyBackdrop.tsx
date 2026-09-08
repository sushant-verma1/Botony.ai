import Topography from "../Topography/Topography";

/* ------------------------------------------------------------------------
   The hero backdrop: a contour field, drawn in the page's own ink.

   Everything here is scenery. It sits behind the first viewport, takes no
   pointer and no focus, and knows nothing about the intro sequence in front
   of it — the hero's timeline, dialogue, blinking, withdrawal and chest
   slider are untouched by this file.

   The reference component's palette is a purple/pink gradient, which this
   page has no room for. What is left is the site's own ink at low opacity:
   contour lines on paper, the way an instrument plots a surface. Deep ink in
   the valleys lifting to a faint sea-green at the ridges — the character's
   own colour, far enough back that you read it as depth rather than hue.
   --------------------------------------------------------------------- */

export default function TopographyBackdrop() {
  return (
    <div className="landing__backdrop">
      <Topography
        /* The three inks the elevation ramp runs through (see :root in
           src/index.css for the two the rest of the page uses). */
        lowColor="#03120e"
        midColor="#0a2a24"
        highColor="#3f6f63"
        /* Slow enough that the field reads as still and only turns out to
           have moved if you keep watching it. */
        speed={0.12}
        morphSpeed={0.04}
        morphAmount={3.0}
        /* Hairlines, spaced like a survey map rather than a ripple. */
        bands={2.6}
        thickness={0.012}
        glow={0}
        contrast={2.4}
        opacity={0.28}
        /* No film grain: this page's only texture is its typography. */
        grain={false}
        /* The backdrop is pointer-transparent, so the component's own cursor
           listeners would never fire — say so rather than leave them armed. */
        mouseInteraction={false}
      />
    </div>
  );
}
