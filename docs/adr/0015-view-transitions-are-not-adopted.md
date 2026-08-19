# ADR-0015: View transitions are not adopted; departures stay with the motion library

- **Status**: Accepted
- **Date**: 2026-08-19

## Context

This amends nothing. ADR-0004 chose one motion library for exactly the problem this was meant to solve,
and that choice is reaffirmed rather than revisited — what follows is a road not taken, written down so
the next person to notice `startViewTransition` finds the reasoning instead of repeating the prototype.

The Clients screen's disclosures animate open on `grid-template-rows` and close badly: React unmounts
the form the moment the condition goes false, so what collapses over 220ms is an empty box. #68 asked
whether the CSS View Transitions API — `document.startViewTransition()` — should answer that, and, if
it did, whether route changes should follow.

It is available: WebView2 is evergreen Chromium, the same reason `corner-shape: squircle` is allowed
to be an enhancement here.

A prototype was built under #68 and kept in history as `19b0eaf`: the Clients form open/close and the
accordion toggle wrapped in a view transition, driven by the motion tokens. It builds, and the suite
passes against it. What follows is what it found.

## Decision

**Not adopted.** Transient UI keeps animating out through the motion library
(`src/components/transient.tsx`), and the fix for the Clients disclosures is to put them on that same
mechanism rather than on a second one. Route changes stay as they are.

The margin is narrower than "not adopted" makes it sound, and the section below on what it gets right
is the more useful half of this document.

### What it gets right

**The tokens reach it with no runtime read at all.** `::view-transition-old|new|group` are ordinary
pseudo-elements parented to `:root`, so custom properties inherit into them:

```css
::view-transition-group(*) {
  animation-duration: var(--motion-base);
  animation-timing-function: var(--ease-out-soft);
}
```

That is *better* than what the motion library needs. `src/theme/motion.ts` exists because a JavaScript
transition wants seconds and four control points and cannot read `var(--motion-base)`; this wants
neither. High-contrast's 1ms and `prefers-reduced-motion`'s 1ms are applied by the cascade before
anything resolves, so there is no second code path and the motion guard passes untouched.

**The exclusive accordion is a good fit, not a bad one.** Opening one Client row closes the last
(`CONTEXT.md` → Client), and that is a *single* `setExpanded`. One state change is one transition, and
the two rows are two named groups inside it animating in parallel — the case the API is at its best
on, and one the motion library needs layout animations to match. An earlier draft of this ADR claimed
the opposite and rested on it; it was wrong, and the correction is why this section exists.

### Why it loses anyway

**The problem it solves is what ADR-0004 already bought `motion` for.** That ADR took the dependency on
the grounds that "exit animations on unmount ... are not things plain CSS does without hand-rolled
state". `Transient` is that answer, shipping since #52. It does not cover disclosures today — it
exports `TransientBanner` and `TransientToast`, and a disclosure would need a third variant beside
them (#77) — but that is one export on a mechanism already carried, against a second motion model for
the whole app. `CONTEXT.md` names the systems as two, CSS and springs, and says so deliberately; this
would make three.

**Every animated element needs a document-unique name, and the app is full of lists.** `:root` must
give up its own name or the browser lays a frozen screenshot of the whole document over the live one —
and this app always has something looping on it, the dial ring's breath, the Mug's steam, the
countdown. So scoping is mandatory rather than an optimisation, and scoping means naming: the prototype
carried a generated name on every Client row. A collision does not pass silently — it rejects the
transition's `ready` and Chromium logs it — but the prototype swallowed exactly that signal with
`transition.ready.catch(() => {})`, which is how it would be swallowed in practice. Newer Chromium has
`view-transition-name: auto`, which would generate the names and retire this objection; it was not
relied on here because the prototype predates checking what WebView2's floor actually is.

**Overlapping transitions still drop one.** Not the accordion — but a second `startViewTransition()`
while one is running skips the first and animates only the second. Two disclosures driven by two
separate user actions inside 220ms is not the common case, so this is a real but small cost rather
than the decisive one.

**It costs a synchronous render, and reduced motion does not buy it back.** React batches state
updates, so the update must be wrapped in `flushSync` inside the callback or the browser captures a
frame identical to the one it started with. The prototype has a test that fails if the flush is
removed. React 19.2 ships no stable `<ViewTransition>` to hide that. And turning the motion down turns
down the *animation*, not the *mechanism*: at 1ms a user on reduced motion still pays the flush and the
snapshot on every disclosure. Everywhere else in the app, 1ms is genuinely nothing happening.

**No test can reach the real thing.** jsdom has no `startViewTransition`, so the existing suite takes
the fallback path throughout — the prototype passed all of it without the browser's implementation ever
running. What the prototype's own tests exercise is a hand-written stub, which can confirm the
`flushSync` contract and nothing about an actual cross-fade. The shipped path is reachable only in a
real window, where e2e drives UI Automation rather than the DOM (ADR-0012) and cannot assert one.
Adopting this means motion that no guard covers, in a repo where every other motion rule is enforced by
a test.

### Route changes: reasoned, not prototyped

`AppShell` slides the outgoing screen along the tab bar's order using `--motion-page-travel` and a
direction from `routeDirection`. A view transition gives a cross-fade for free and a *directional*
slide only by writing per-direction keyframes and setting a class on `:root` before each transition —
rebuilding what `AnimatePresence` already does, with more parts. The tab indicator is a spring
(`layoutId`, ADR-0004's named exception), which view transitions cannot express, so the library does
not leave either way.

Stated plainly: this half of #68 was answered from the code and the spec, and never prototyped. It is
the weaker half of this document for that reason.

## Consequences

- The Clients disclosures still close badly. That is now a known defect with a known fix — a disclosure
  variant on `Transient` — rather than an open question. Ticketed as #77.
- `motion` stays the single answer for anything that has to outlive its condition. Two motion systems,
  not three.
- **Reopen on this, not on the whole document.** The token result and the accordion result both came
  out in favour. What would tip it is React shipping a stable `<ViewTransition>` — removing the
  `flushSync` cost — together with `view-transition-name: auto` being safely inside WebView2's floor,
  which between them retire two of the four objections above. The untestability does not go away.
- **Not verified in a running window.** The prototype was evaluated from the spec, the built CSS and
  the test suite; nobody watched a cross-fade in WebView2. For a ticket whose words were "worth a
  prototype", that is the honest gap in this decision — and one load-bearing claim had to be corrected
  out of it after review, which is what evaluating an animation without watching it costs.
