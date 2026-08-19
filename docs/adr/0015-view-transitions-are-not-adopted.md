# ADR-0015: View transitions are not adopted; departures stay with the motion library

- **Status**: Accepted
- **Date**: 2026-08-19
- **Relates to**: ADR-0004, which chose one motion library for exactly the problem this was meant to
  solve. Nothing there is amended — this records a road not taken, so that the next person to notice
  `startViewTransition` finds the reasoning instead of repeating the prototype.

## Context

The Clients screen's disclosures animate open on `grid-template-rows` and close badly: React unmounts
the form the moment the condition goes false, so what collapses over 220ms is an empty box. #68 asked
whether the [CSS View Transitions API](https://developer.chrome.com/docs/web-platform/view-transitions)
should answer that — and, if it did, whether route changes should follow.

It is available: WebView2 is evergreen Chromium, the same reason `corner-shape: squircle` is allowed
to be an enhancement here.

A prototype was built and is the commit directly before this one: the Clients form open/close and the
accordion toggle wrapped in `document.startViewTransition()`, driven by the motion tokens. It builds
and the whole suite passes against it. What follows is what it found.

## Decision

**Not adopted.** Transient UI keeps animating out through the motion library
(`src/components/transient.tsx`), and the fix for the Clients disclosures is to put them on that same
mechanism rather than on a second one. Route changes stay as they are.

### What the prototype got right, and it is worth keeping on record

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

This is the part that would change the answer if the surrounding facts ever change, which is why it is
written down rather than summarised as "it didn't work out".

### Why it loses anyway

**The problem is already solved, by a dependency the app already carries.** ADR-0004 took `motion` on
the grounds that "exit animations on unmount ... are not things plain CSS does without hand-rolled
state". `Transient` is that answer, shipping since #52 for the three banners and the undo toast. A
disclosure whose content outlives its condition is the same shape as a banner whose content outlives
its condition. Reaching for a second motion model to solve a problem the first one was bought for is
the trade backwards.

**Only one transition runs at a time, and this app routinely wants two.** A second
`startViewTransition()` skips the first. The Clients accordion is *exclusive* by design — opening one
row closes another (`CONTEXT.md` → Client) — and a rename form can open while a row is collapsing. So
the API gives up precisely under the interaction the screen is built around, and gives up silently:
the state change still lands, the animation simply does not happen. Motion that works except when the
user is being normal is worse than the CSS it replaces.

**`view-transition-name` is document-unique, and the screen is a list.** Every Client row needs a
generated name; two elements answering to the same one abort the whole transition with no error
anywhere. `AnimatePresence` is per-instance by construction and cannot collide. The prototype needed
`` `client-${client.id}` `` on every row, which is a uniqueness invariant maintained by hand across a
rendered list — a new defect class, in exchange for an animation.

**The default subject is the entire page.** Unless `:root` gives up its name, the browser lays a frozen
screenshot of the whole document over the live one for the duration. This app always has something
looping on it — the dial ring's breath, the Mug's steam, the countdown — so a ghost of all three
cross-fading over the real ones is the double-image the motion budget exists to prevent. Scoping is
therefore mandatory rather than an optimisation, which feeds straight back into the naming problem
above.

**It costs a synchronous render, and reduced motion does not buy it back.** React batches state
updates, so the update has to be wrapped in `flushSync` inside the callback or the browser captures a
frame identical to the one it started with. React 19.2 ships no stable `<ViewTransition>` to hide
that. And turning the motion down turns down the *animation*, not the *mechanism*: at 1ms a user on
reduced motion still pays the flush and the snapshot on every disclosure. Everywhere else in the app,
1ms is genuinely nothing happening.

**Nothing in the suite can see it.** jsdom has no `startViewTransition`, so all 504 tests take the
fallback path — the prototype passed the entire suite without the feature ever executing. The shipped
path is reachable only in a real window, where e2e drives UI Automation rather than the DOM
(ADR-0012) and cannot assert a cross-fade. Adopting it means motion that no guard covers, in a repo
where every other motion rule is enforced by a test.

### Route changes: no, and not close

`AppShell` slides the outgoing screen along the tab bar's order using `--motion-page-travel` and a
direction from `routeDirection`. A view transition gives a cross-fade for free and a *directional*
slide only by writing per-direction keyframes and setting a class on `:root` before each transition —
rebuilding what `AnimatePresence` already does, with more parts. And the tab indicator is a spring
(`layoutId`, ADR-0004's named exception), which view transitions cannot express at all, so the library
does not leave either way. The result would be two motion systems where there is one.

## Consequences

- The Clients disclosures still close badly. That is now a known defect with a known fix — put them on
  `Transient` — rather than an open question, and it needs a ticket of its own.
- `motion` stays the single answer for anything that has to outlive its condition. "CSS for state
  transitions, springs for layout" (`CONTEXT.md` → Motion) remains two systems, not three.
- The token-compatibility result above is the thing to re-read if this is reopened. The likeliest
  trigger is React shipping a stable `<ViewTransition>`, which would remove the `flushSync` cost and
  the naming bookkeeping in one go — but not the one-at-a-time limit, which is the finding that
  actually decides it.
- **Not verified in a running window.** The prototype was evaluated from the spec, the built CSS and
  the test suite; nobody watched the cross-fade in WebView2. Every reason above is structural, so
  seeing it would not change them — but "it looked good" is not among the things this ADR claims.
