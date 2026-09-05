import '@testing-library/jest-dom/vitest'

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom has no media queries; the expression background asks for reduced-motion.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      media: query,
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom does no SVG layout. Null is a value the intro timeline already handles:
// with no screen matrix it skips the camera work, which is right when nothing
// is being painted.
if (!SVGSVGElement.prototype.getScreenCTM) {
  SVGSVGElement.prototype.getScreenCTM = () => null
}
