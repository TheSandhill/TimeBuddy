# ADR-0015: Route changes are the platform's view transition; forms stay with the motion library

- **Status**: Accepted
- **Date**: 2026-08-19
- **Amends**: ADR-0004, which held that `motion` covers "the tab indicator, the route transitions, the
  undo toast and the three banners", and that two motion systems is honest. The route transitions leave;
  the count becomes three. ADR-0004 carries the back-pointer.
- **Amended**: 2026-08-19 — the first draft of this ADR turned view transitions down for *everything*,
  route changes included. The route half is reversed and this title with it. Amended in place because
  nothing had been built on the old conclusion, and because the reasoning that was wrong is worth
  keeping visible rather than deleting — see *What the first draft got wrong*.

## Context

The Clients screen's disclosures animate open on `grid-template-rows` and close badly: React unmounts
the form the moment the condition goes false, so what collapses over 220ms is an empty box. #68 asked
whether the CSS View Transitions API — `document.startViewTransition()` — should answer that, and, if
it did, whether route changes should follow.

It is available: WebView2 is evergreen Chromium, the same reason `corner-shape: squircle` is allowed
to be an enhancement here.

Two prototypes, both in history: `19b0eaf` wrapped the Clients form open/close and the accordion
toggle by hand, and is reverted. The route change is the one that shipped.

## Decision

**Route changes are a view transition. Form disclosures are not.** The split is the finding, and the
two halves fail for opposite reasons.

### Why routes win

The screen slide was already the app's least comfortable animation: `AppShell` held the previous path
in a `useRef`, computed a direction on every render, turned it into `travel` of `-1 | 0 | 1`, and fed
that to an `AnimatePresence` with `mode="popLayout"` — plus a second ref to force the tray's
navigation neutral, because the tray pulls up a screen along no path the user walked.

All of it is gone. The router names the direction, once:

```tsx
defaultViewTransition: {
  types: ({ fromLocation, toLocation }) => [
    routeDirection(fromLocation?.pathname, toLocation.pathname),
  ],
},
```

and the direction lands in the cascade as `:active-view-transition-type(left|right)`, which picks a
sign for `--screen-travel`. The whole slide is then two keyframes spending `--motion-page` and
`--motion-page-travel`. `AppShell` lost twenty-five lines, both refs and its dependency on the motion
library; the tray's neutral navigation is now a `viewTransition: { types: ["neutral"] }` on the one
`navigate` that needs it, rather than a ref read on the next render.

The costs the first draft named against routes turn out not to apply:

- **No `flushSync`.** TanStack Router owns the update and calls
  `document.startViewTransition({ update, types })` itself. The synchronous-render cost — real, and
  proven by a test in `19b0eaf` — is the router's problem, not a component's.
- **No naming bookkeeping.** `:root` gives up its name and `<main>` takes one, so there is exactly one
  `view-transition-name` in the app. The document-uniqueness hazard needs a list to bite, and a route
  change is not a list.
- **The tokens do all of it.** `::view-transition-*` are ordinary pseudo-elements parented to `:root`,
  so custom properties inherit into them. High-contrast's 1ms and `prefers-reduced-motion`'s 1ms and
  0px are applied by the cascade before anything resolves — the lean flattens and the duration
  collapses through the same hands that do it everywhere else. No second code path, and unlike the
  motion library nothing reads CSS from JavaScript.

**A third motion system, named as a third.** `CONTEXT.md` said two — CSS for state transitions, springs
for layout — and this makes three. That is the real price, and it is worth paying here because it
*removes* the one place the library was doing most work for least benefit. The library keeps the tab
indicator's spring and everything that has to outlive its condition.

### Why forms lose

**The naming hazard needs a list, and the Clients screen is a list.** Every animated element needs a
document-unique name; the by-hand prototype carried a generated one on every Client row. A collision
does not pass silently — it rejects the transition's `ready` and Chromium logs it — but `19b0eaf`
swallowed exactly that signal with `transition.ready.catch(() => {})`, which is how it would be
swallowed in practice. Newer Chromium has `view-transition-name: auto`, which would retire this; what
WebView2's floor actually is has not been checked.

**Nothing owns the update.** There is no router here, so a form disclosure is back to hand-rolled
`flushSync` at each call site — the cost routes avoid by delegation.

**The library is already bought for it.** ADR-0004 took `motion` because "exit animations on unmount
... are not things plain CSS does without hand-rolled state". `Transient` is that answer, shipping
since #52. It does not cover disclosures today — a third variant beside `TransientBanner` and
`TransientToast` is #77 — but that is one export on a mechanism already carried.

### What the first draft got wrong

Worth recording, because both errors came from the same habit — reasoning about an animation instead of
building it.

It claimed the exclusive accordion needed **two overlapping transitions** and that the API drops one.
It needs one: opening a row closes the last in a single `setExpanded`, which is one transition with two
named groups animating in parallel — the case the API is best at.

It claimed routes would mean **"rebuilding what `AnimatePresence` already does, with more parts"**. The
opposite: the router already had the seam, and adopting it deleted more code than it added. That claim
was reasoned from the API alone without checking what TanStack Router 1.170 offered, which is the whole
error in one sentence.

## Consequences

- **A direction is now a string agreed between TypeScript and CSS**, and nothing type-checks that
  crossing: rename `right` on one side and the screen silently stops leaning.
  `src/theme/route-transition.test.ts` guards the seam, beside the guard that holds the token contract
  and the stylesheet to each other.
- Route motion is no longer reachable from a unit test. jsdom has no `startViewTransition`, so the
  suite proves the *direction* and the *tokens spent*, never the animation. That was already true of
  the motion library's version; e2e drives UI Automation, not the DOM (ADR-0012).
- `:active-view-transition-type()` is the newest thing here. Where it is not understood,
  `--screen-travel` keeps its `0px` default and the screen cross-fades without leaning — a degradation,
  not a break. The router guards it with `CSS.supports` before sending a type at all.
- **The snapshot is painted in the top layer, which the page cannot hold.** Two things follow, and both
  needed a rule rather than a hope. The user-agent gives `::view-transition-group` a quarter-second, so
  overriding only the two images leaves reduced motion with an instant cross-fade under an overlay that
  outlasts it — the visuals turned down and the mechanism still running. And nothing clips the lean:
  `overflow-y-auto` on `<main>` used to contain the slide, and a pseudo-element in the top layer is
  outside it, so 12px of screen would travel over the window's own rounded edge. `overflow: clip` on the
  group restores that boundary. Both are guarded by `route-transition.test.ts`; **neither has been seen
  in a window**, and the clip especially is the kind of claim that wants eyes.
- The floating tab bar is not snapshotted and keeps animating through the change — but it is *under* the
  top layer while the transition runs, not above it. What makes that survivable is that the screen's own
  bottom is `pb-20` of nothing, so the pixels passing over the bar are transparent. Worth knowing before
  anything opaque is put down there.
- The Clients disclosures still close badly, with a known fix. #77.
- **Watched in a running window on 2026-08-19, and correct.** The lean goes the right way, the clip
  holds at the window's edge, the tab bar's spring keeps running underneath the top layer, and the
  tray's navigation crosses without leaning. Recorded because the rest of this ADR is a record of what
  reasoning alone got wrong twice: the accordion claim, and the route conclusion this document is now
  named for. The two top-layer rules above were also found by reading rather than looking, and they
  happened to be right — that is luck the next decision should not spend.
