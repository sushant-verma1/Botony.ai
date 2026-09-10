/**
 * The written half of the landing page.
 *
 * Every claim below is one the backend actually implements — emergency
 * detection running ahead of the model, limits stated where they apply,
 * conversations scoped to an account. Nothing here asserts accuracy, clinical
 * validation, or an outcome, because the project provides no evidence for any
 * of those and a medical product is the worst place to imply them.
 */

function Eyebrow({ children }: { children: string }) {
  return <p className="eyebrow">{children}</p>;
}

/* ---- 1. value proposition ---------------------------------------------- */

function ValueProposition() {
  return (
    <section className="section section--lead" aria-labelledby="value-heading">
      <Eyebrow>What it is</Eyebrow>
      <h2 id="value-heading" className="display">
        A calm first read on symptoms, before you decide what to do next.
      </h2>
      <p className="lede">
        Most symptoms arrive without a clear next step. Botony reads what you
        write, asks the questions a careful listener would, and helps you tell
        the difference between something to watch, something to book, and
        something to act on now. It does not diagnose, and it says so every
        time it answers.
      </p>
    </section>
  );
}

/* ---- 2. how it works ---------------------------------------------------- */

const STEPS = [
  {
    title: "You describe it in your own words",
    body: "No symptom checklists and no dropdowns. Plain language, the way you would tell a friend or a nurse.",
  },
  {
    title: "Red flags are checked first",
    body: "Every message is screened for emergency signs before the model is asked anything. If one is found, you get the emergency response and nothing else — the model is never consulted.",
  },
  {
    title: "You get guidance, not a verdict",
    body: "Possible explanations, what would make each more or less likely, and a clear line on when to see someone who can examine you.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="section" aria-labelledby="how-heading">
      <Eyebrow>How it works</Eyebrow>
      <h2 id="how-heading" className="heading">
        Three steps, in this order, always.
      </h2>
      <ol className="steps">
        {STEPS.map((step, i) => (
          <li key={step.title} className="step">
            <span className="step__index" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="step__title">{step.title}</h3>
            <p className="step__body">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---- 3. capabilities ---------------------------------------------------- */

const CAPABILITIES = [
  {
    title: "Emergency detection ahead of everything",
    body: "The screen runs before the model, not after it. It cannot be skipped by phrasing, and it cannot be turned off.",
  },
  {
    title: "Limits stated where they matter",
    body: "Not a warning block bolted onto every reply. When an answer touches your symptoms, your medication, or a real result, it says so plainly — and a standing note sits under the composer either way.",
  },
  {
    title: "Conversations that keep their thread",
    body: "Follow-ups build on what you already said, so you are not restating your history in every message.",
  },
  {
    title: "Your account, and only your account",
    body: "Conversations are tied to your login. Sessions are short-lived by design and tokens are never left sitting in browser storage.",
  },
];

function Capabilities() {
  return (
    <section className="section" aria-labelledby="capabilities-heading">
      <Eyebrow>Capabilities</Eyebrow>
      <h2 id="capabilities-heading" className="heading">
        Built around what should never fail.
      </h2>
      <ul className="grid">
        {CAPABILITIES.map((item) => (
          <li key={item.title} className="grid__item">
            <h3 className="grid__title">{item.title}</h3>
            <p className="grid__body">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---- 4. trust and safety ------------------------------------------------ */

const LIMITS = [
  "It does not diagnose conditions.",
  "It does not prescribe or adjust medication.",
  "It does not replace a clinician who can examine you.",
  "It is a prototype, and is not a regulated medical device.",
];

function Safety() {
  return (
    <section id="safety" className="section section--safety" aria-labelledby="safety-heading">
      <Eyebrow>Safety</Eyebrow>
      <h2 id="safety-heading" className="heading">
        The honest boundaries.
      </h2>
      <p className="lede lede--narrow">
        A medical assistant earns trust by being precise about what it will not
        do. These are ours, stated plainly rather than buried in terms.
      </p>
      <ul className="limits">
        {LIMITS.map((limit) => (
          <li key={limit} className="limits__item">
            {limit}
          </li>
        ))}
      </ul>
      <p className="note">
        If you think you are having a medical emergency, contact your local
        emergency number now rather than typing it here.
      </p>
    </section>
  );
}

export default function Sections() {
  return (
    <>
      <ValueProposition />
      <HowItWorks />
      <Capabilities />
      <Safety />
    </>
  );
}
