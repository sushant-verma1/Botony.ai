---
name: animejs
description: "Write correct Anime.js v4 code — imports, animate(), timelines, stagger, easings, scroll-linked effects, SVG drawing/morphing, text splitting, draggables, and framework cleanup with createScope(). Use this skill whenever the user mentions anime.js, animejs, createTimeline, createDraggable, onScroll, stagger, or imports from the 'animejs' package — and also when they ask for JS/DOM/SVG animation, scroll-triggered or scroll-scrubbed effects, staggered entrance animations, or timeline choreography in a project that already has anime.js installed. Consult this skill BEFORE writing any anime.js code, even when the request looks simple, because the v3 API (the global anime() function with targets and easing parameters) dominates training data and is entirely wrong for v4, so unverified recall produces code that silently does nothing."
---

# Anime.js

Anime.js v4 is a near-total rewrite of v3. Anything recalled from memory is likely v3 and will fail — usually silently, because a bad property name is just ignored. Work from this file, not from recall.

Current stable: **4.5.0** (June 2026). A `5.0.0-beta` exists but is not the default install.

## Step 1: check which version the project has

Do this before writing code. It changes everything downstream.

```bash
cat package.json | grep animejs     # or: npm ls animejs
```

- **`^4.x`** → this skill applies as written.
- **`^3.x` or `^2.x`** → the v4 syntax here will throw. Either write v3 syntax (see `references/migration.md`, which maps both directions) or offer to upgrade first. Do not mix.
- **No package.json / CodePen / single HTML file** → assume v4 via CDN, and say so.
- **Can't tell** → write v4 and state the assumption in one line.

## Install and import

```bash
npm install animejs
```

```js
// v4 has NO default export. `import anime from 'animejs'` is v3 and fails.
import { animate, createTimeline, stagger, utils, svg, text, onScroll,
         createScope, createDraggable, spring, eases, waapi } from 'animejs';
```

Everything is tree-shakeable from the root import, so prefer it. Subpath imports (`animejs/animation`, `animejs/timeline`, `animejs/utils`, `animejs/svg`, `animejs/text`, `animejs/events`, `animejs/draggable`, `animejs/scope`, `animejs/layout`, `animejs/waapi`, `animejs/engine`, `animejs/easings`, `animejs/adapters/three`) exist for bundler-free setups.

Browser without a bundler:

```html
<script type="module">
  import { animate } from 'https://cdn.jsdelivr.net/npm/animejs/+esm';
  animate('.box', { x: 200 });
</script>
```

## animate() — the 90% case

```js
animate('.card', {
  x: 250,              // individual transforms are top-level props
  rotate: '1turn',
  opacity: [0, 1],     // [from, to]
  duration: 800,
  delay: stagger(80),
  ease: 'outExpo',
  onComplete: self => console.log(self.targets.length),
});
```

Targets: CSS selector, Element, NodeList, array of any of these, or a plain JS object (`animate(state, { count: 100 })` — useful for driving canvas/Three.js values).

Animatable: CSS properties (`backgroundColor`, `'border-radius'`), individual transforms (`x`, `y`, `z`, `rotate`, `rotateX/Y/Z`, `scale`, `scaleX/Y`, `skew`, `skewX/Y`, `translateX/Y/Z`), CSS variables (`'--size'`), SVG attributes (`d`, `points`, `stroke-dashoffset`), HTML attributes (`value`), and JS object properties.

Value forms:

| Form | Meaning |
| --- | --- |
| `x: 100` | to 100 (px assumed for length props) |
| `x: '5rem'` | unit conversion from current value |
| `x: '+=100'` | relative to current |
| `x: [0, 100]` | explicit from → to |
| `x: { to: 100, duration: 400, ease: 'out' }` | per-property timing |
| `x: (el, i, len) => i * 50` | function-based, per target |
| `x: [{ to: 50, duration: 200 }, { to: 0, ease: 'inOut' }]` | keyframes |

### Defaults you can rely on

`duration: 1000`, `ease: 'out(2)'`, `delay: 0`, `loop: 0`, `alternate: false`, `autoplay: true`, `composition: 'replace'`. Times are milliseconds unless `engine.timeUnit = 's'`.

Because the default ease is `'out(2)'` and not linear, an animation that looks "wrong at the end" is usually just easing — set `ease: 'linear'` to check.

## Timelines

```js
import { createTimeline, stagger } from 'animejs';

const tl = createTimeline({ defaults: { duration: 600, ease: 'outQuad' } });

tl.add('.title',  { y: [-40, 0], opacity: [0, 1] })
  .add('.card',   { scale: [.9, 1], opacity: [0, 1], delay: stagger(60) }, '<<+=200')
  .label('cardsIn')
  .set('.cta',    { visibility: 'visible' })
  .call(() => console.log('halfway'), 'cardsIn')
  .add('.cta',    { opacity: [0, 1] }, '-=100');
```

Position argument (third for `add`/`set`, second for `call`/`label`/`sync`):

| Value | Meaning |
| --- | --- |
| *omitted* | at the end of the timeline |
| `500` | absolute 500ms |
| `'+=100'` / `'-=100'` | after / before the end of the timeline |
| `'*=.5'` | at a fraction of the total duration |
| `'<'` | **end** of the previous child |
| `'<<'` | **start** of the previous child |
| `'<<+=250'` | 250ms after the previous child started |
| `'myLabel'` | at a label |
| `stagger(100)` | staggered positions across targets |

`'<'` and `'<<'` are the inverse of GSAP's convention. In GSAP `'<'` means the previous animation's start; in Anime.js that is `'<<'`. Getting this backwards is the most common timeline bug.

Other methods: `.sync(otherTimelineOrAnimation, position)`, `.remove()`, `.init()`, plus all playback methods below.

## Playback control

Settings: `loop` (number or `true`), `loopDelay`, `alternate`, `reversed`, `autoplay` (`false` or `onScroll({...})`), `frameRate`, `playbackRate`, `playbackEase`.

Methods: `play()`, `pause()`, `resume()`, `restart()`, `reverse()`, `alternate()`, `complete()`, `cancel()`, `revert()`, `reset()`, `seek(ms)`, `stretch(ms)`, `refresh()`.

Callbacks all receive the instance: `onBegin`, `onUpdate`, `onBeforeUpdate`, `onRender`, `onLoop`, `onPause`, `onComplete`, plus `then()` which returns a Promise.

Properties: `currentTime`, `progress`, `duration`, `paused`, `began`, `completed`, `reversed`.

`cancel()` stops the animation and leaves the current inline styles. `revert()` stops it and restores what was there before. Prefer `revert()` for teardown.

## stagger()

```js
stagger(100)                              // 100ms apart
stagger(100, { start: 500 })              // begin the ramp at 500ms
stagger(100, { from: 'center' })          // 'first' | 'center' | 'last' | 'random' | index
stagger([-20, 20])                        // distribute values across a range
stagger(50, { grid: [10, 6], from: 'center', axis: 'x' })
stagger(80, { ease: 'inOutQuad', reversed: true })
```

It returns a function value, so it works for `delay`, for any animatable property, and as a timeline position.

## Easing

String grammar: a type (`in`, `out`, `inOut`, `outIn`) plus an optional family (`Quad`, `Cubic`, `Quart`, `Quint`, `Sine`, `Circ`, `Expo`, `Bounce`, `Back`, `Elastic`). So `'outExpo'`, `'inOutQuad'`, `'outInCirc'`. Bare `'out(3)'` is a power ease (default exponent 1.68). `'inBack(1.7)'` sets overshoot; `'outElastic(1, .3)'` sets amplitude and period. Also `'linear'` and `'none'`.

v3 names (`'easeOutExpo'`, `'easeInOutQuad'`) are not recognised.

Function easings: `spring({ bounce: .3, duration: 500 })` or `spring({ stiffness: 90, damping: 14 })`, plus `cubicBezier(.5, 0, .5, 1)`, `steps(5)`, `linear('0 0%', '.5 60%', '1')`, `irregular(10, 2)`. A spring overrides `duration` with its own settling time; give the spring its own `onComplete` if you need the *perceived* finish.

`createSpring()` still exists as a legacy alias for `spring()` — prefer `spring()`.

## Framework integration — always scope and clean up

React's StrictMode mounts effects twice, and any SPA unmounts components mid-animation. Without cleanup you get duplicate animations and stale inline styles.

```jsx
import { useEffect, useRef } from 'react';
import { animate, createScope, stagger } from 'animejs';

function Panel({ items }) {
  const root = useRef(null);
  const scope = useRef(null);

  useEffect(() => {
    scope.current = createScope({ root }).add(self => {
      // selectors here only match inside <div ref={root}>
      animate('.item', { opacity: [0, 1], y: [16, 0], delay: stagger(60) });

      // register methods callable from event handlers
      self.add('pulse', () => animate('.item', { scale: [1, 1.05, 1] }));
    });

    return () => scope.current.revert();   // reverts every instance in the scope
  }, []);

  return <div ref={root}>{items.map(i => <div className="item" key={i.id}>{i.name}</div>)}</div>;
}
```

Call registered methods as `scope.current.methods.pulse()`.

`createScope` also handles responsive and reduced-motion branching:

```js
createScope({
  mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' }
}).add(self => {
  animate('.box', { x: 200, duration: self.matches.reduceMotion ? 0 : 800 });
});
```

Vue/Svelte follow the same shape: create the scope on mount, `revert()` on destroy. In Next.js or any SSR setup, animations must run in a client component inside an effect — never at module scope.

## Common mistakes

| Wrong | Right |
| --- | --- |
| `import anime from 'animejs'` | named imports; there is no default export |
| `anime({ targets: '.box', ... })` | `animate('.box', { ... })` |
| `easing: 'easeOutExpo'` | `ease: 'outExpo'` |
| `anime.timeline()` | `createTimeline()` |
| `anime.stagger()` / `anime.random()` | `stagger()` / `utils.random()` |
| `transform: 'translateX(100px)'` | `x: 100` |
| `.add({ targets, ... }, offset)` | `.add(targets, { ... }, position)` |
| `'<'` meaning previous start | `'<<'` is previous start; `'<'` is previous end |
| `direction: 'alternate'` | `alternate: true` |
| `loop: true` for finite repeats | `loop: 3` repeats 3 extra times |
| Leaving animations running on unmount | `createScope(...)` + `scope.revert()` |

Two animations on the same property: the default `composition: 'replace'` cancels the first. Use `'add'` or `'blend'` for additive motion (drag + idle float), and `'none'` when animating hundreds of targets that never overlap — it skips the lookup and is measurably faster.

## Performance

Animate `x`/`y`/`scale`/`rotate`/`opacity`; avoid `top`/`left`/`width`/`height`, which force layout. For fire-and-forget CSS transitions that can run off the main thread, use `waapi.animate(target, { ... })` instead of `animate()`. Use `utils.set()` for instant state changes rather than a zero-duration animation, and `utils.cleanInlineStyles(animation)` to strip leftover inline styles once an animation settles.

## Reference files

Read these when the task goes past the basics — don't guess parameter names.

- **`references/api-reference.md`** — full surface: every playback setting, callback, method and property; `utils` (`$`, `get`, `set`, `remove`, `random`, `clamp`, `snap`, `wrap`, `lerp`, `damp`, `mapRange`, `keepTime`, `sync`, chainable forms); `createTimer`, `createAnimatable`, `createLayout`, `engine`, `waapi`, the Three.js adapter.
- **`references/effects.md`** — `onScroll` (thresholds, `sync` scrubbing, callbacks), SVG (`createDrawable`, `morphTo`, `createMotionPath`), text (`splitText`, `scrambleText`), and `createDraggable` (axes, containers, snapping, physics).
- **`references/recipes.md`** — copy-ready patterns: scroll reveal, hero timeline, line-drawing logo, text entrance, drag-to-reorder, counter, loading state, page transition, canvas/Three.js value driving.
- **`references/migration.md`** — v3 ↔ v4 mapping table, for reading old code or upgrading a project.

## Before finishing

- Every imported name is a real v4 export, and no default import is used.
- `ease`, not `easing`; no `'ease…'`-prefixed ease strings.
- Timeline positions are intentional, with `'<'` vs `'<<'` checked against the table above.
- Anything created in a component has a corresponding `revert()` on teardown.
- Selectors match the actual markup in the file being edited, and the elements exist when the animation runs.
- Reduced-motion is respected on entrance and looping animations.
