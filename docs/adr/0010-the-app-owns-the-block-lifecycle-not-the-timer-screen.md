# ADR-0010: The app owns the block's lifecycle, not the Timer screen

- **Status**: Accepted
- **Date**: 2026-08-12

## Context

A Pomodoro Block outlives whatever is on screen. Close minimises to the tray and the block keeps
running (ADR-0004); the titlebar pill and the tray tooltip count it down from every screen. But the
state that *governed* the block lived in the Timer screen, and every screen is a child route rendered
through the router's `<Outlet/>` — so navigating unmounts it.

The block itself was never at risk: it is a row in `running_timer`, read through the `["runningTimer"]`
query owned by `WindowFrame`, which never unmounts. What was lost was everything the screen kept in
component state:

- **`startedHere`**, the ref distinguishing a block this session started from one found on launch.
  Reset on every navigation, so returning to the Timer re-classified a perfectly healthy block as a
  crash survivor and put the recovery prompt up in place of the countdown. The prompt offers only
  Keep and Discard — no "carry on" — so **both exits destroyed a block that was still running**, and
  under a minute in, the only button offered was Discard. That was data loss reachable by clicking a
  nav link.
- **The auto-stop-at-zero effect**, which was the only implementation of settlement anywhere in the
  app. Rust has no scheduler; the titlebar and tray only display. A block that ran out while Rapporten
  was open stayed in flight with the pill clamped at `00:00` until someone navigated back.
- **`breakEndsAt`**, so an in-progress Break vanished silently, chime included.

Three symptoms, one cause: the lifecycle sat below the boundary the block was designed to cross.

The code argued the opposite, in two comments — that the Timer screen owns the arithmetic, and that
it is "the one place that knows what a stopped block is worth". The first was never really true (the
arithmetic is in `timer/block`, pure); the second was true and is what this ADR reverses.

## Decision

The block's lifecycle lives **above the `<Outlet/>`**, in a `TimerLifecycleProvider` rendered by
`WindowFrame` — the component that already owns the query the pill and the tooltip read. It is
reached through one hook, `useTimerLifecycle()`.

It owns the block and the clock, the Orphaned Block question, the Break, the chosen project, the
start/stop/keep/discard writes, the announcements, and the tray's Start/Stop. The Timer screen becomes
a **view** over it — a rich one, with the dial and the picker — and the tray becomes a second view.
Neither decides anything.

The invariant that was wrong is now right by construction: **a block is an Orphaned Block iff this
process did not start it.** `WindowFrame` outlives navigation and window hide/show, so the ref is
false again only after a genuine restart — which is exactly the case worth asking about.

React context rather than a module-level singleton or router context. A singleton would match
"process-scoped" most literally but leaks between tests, which the suite's `cleanup()` cannot undo;
router context would tie the lifecycle to the router this ADR is trying to decouple it from.

Two things deliberately stay as they are:

- **`RecoveryPrompt` keeps two options.** After the hoist, navigation no longer raises it, so the trap
  closes without changing what the prompt means. Resuming a crash survivor would mean vouching for
  minutes nobody watched, which `CONTEXT.md` deliberately does not do.
- **Settlement stays gated on `revealsWork`**, so a block that runs out behind the lock screen settles
  at unlock. The hours are identical either way — a completed block ends at the instant it ran out,
  not when anyone noticed — so settling while locked would buy a second code path and a chime that
  would have to be suppressed.

## Consequences

- Navigating away from a running block and back shows the countdown, and a block that ends on another
  screen is logged, announced, and followed by its Break.
- The tray's Start/Stop is answered wherever the user is. The latch and the navigate-to-Timer in
  `AppShell` still work but are no longer load-bearing — the beat they existed to cover is gone.
- The chosen project moved into the lifecycle, because the tray needs to know it as much as the picker
  does. It is app state that happens to be edited by a control on one screen.
- `WindowFrame` is mounted behind the lock screen too, so the provider is — watching nothing, writing
  nothing, but present. Tests that mock the command module need the timer commands stubbed even when
  no timer is on screen.
- `useRunningBlock` is gone; the `RunningBlock` type it carried lives in `timer/lifecycle`.
- The Timer screen is testable as a view, and the boundary itself is testable: `timer-navigation.test.tsx`
  drives the **real** route tree over a memory history, which is the first router-level test in the
  repo. Rebuilding the tree inside the test would have made it unable to fail when something moved
  back across the `<Outlet/>`.
- Cost: one more provider between the window and the app, and the Timer screen now takes fifteen
  things off a hook instead of holding them. That is the trade — a wider seam in one place, in
  exchange for a lifecycle that cannot be unmounted by a nav link.
