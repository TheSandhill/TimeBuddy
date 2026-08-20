# ADR-0014: Phosphor bold, inlined — the icon set the app refused to take

- **Status**: Accepted
- **Date**: 2026-08-17
- **Amends**: ADR-0004, which held that "an icon dependency for a horizontal rule and a cross is not
  worth the bundle or the licence". That sentence is narrowed rather than deleted — see *What survives*.
- **Amended**: 2026-08-18 — which of `error` and `warning` a failure takes is now a rule rather than a
  judgement call per banner. Amended in place: nothing here was reversed.

## Context

The app drew every glyph by hand: five `<path d="…">` strings on a 12×12 grid in the tab bar, two more
in the titlebar. Nothing else in the app had an icon at all.

ADR-0004 reasoned that correctly for what existed then. Two paths are not a library, and taking a
dependency to draw a rule and a cross would have been absurd.

Three things changed underneath that reasoning:

- **The tab bar made glyphs load-bearing.** Only the open tab shows its label; the other four are icon
  alone. Five hand-drawn paths went from decoration to being the whole of navigation.
- **They were not good enough, and quietly wrong.** The clients glyph shipped `a2 0 0 1 0 4` — a
  degenerate arc with an `ry` of zero — so the head drew as a semicircle with a lid on it. Nobody
  noticed, because nothing checks a path by eye.
- **The screens still to come need a vocabulary that does not exist.** Every `role="alert"` in the app
  is red text, every confirmation a bare word, and all eight busy states are communicated by swapping a
  button's label. There is no shape for *error*, *success*, *warning* or *busy* anywhere.

Hand-drawing thirty glyphs to a consistent weight is not a thing to do by hand, and the arc bug is the
evidence.

## Decision

The app takes **Phosphor, bold weight**, inlined as path data in `src/components/icon.tsx`.

**Bold specifically.** At Phosphor's 256 grid its stroke is 24 units — 2.25px once drawn at 24px, within
a hair of the 1.25-in-a-12-box the hand-drawn glyphs used. The set arrives at the weight the app already
had, rather than asking every screen to be re-tuned around it. Its rounded terminals and open counters
are the same property Nunito was chosen for in ADR-0004, so glyphs and type read as one voice.

**Inlined, not installed.** No package, no runtime fetch. Iconify's components resolve icons over its
API, which an offline desktop app cannot rely on and should not want to. Path data in the source keeps
`currentColor` doing the work it always did and keeps the bundle honest.

**Fills, not strokes.** Bold Phosphor ships pre-outlined, so `Icon` has no `strokeWidth` and a glyph
scales without its line thickening. This is the one place the set differs from what it replaced.

**Named for meaning, not artwork.** `clients`, not `user-list`. A screen asks for what it means, so
swapping the artwork underneath leaves every caller still asking the right question. The names are
type-checked, so a glyph that does not exist is a compile error rather than an empty box.

**One glyph may be more than one path.** The set ships no triangle holding an exclamation, so `warning`
is assembled: Phosphor's triangle, plus an exclamation drawn to sit inside it.

That exclamation is **authored at final size, not scaled down**. Taking the standalone exclamation and
shrinking it — the obvious route, and the one tried first — thins its stroke by the scale factor, so it
arrives lighter than the triangle holding it and the single glyph reads as two weights. Drawn instead
with a stem a full 24 units wide, it matches the triangle and the rest of the set. Composition is
allowed; a scaled-down borrow is not, and neither is a hand-drawn *new* shape.

### `error` answers a question; `warning` reports a condition

*Added 2026-08-18, when the status glyphs were wired to their first callers (#70).*

`success` and `error` are the same circle carrying a different mark, so the pair reads as one answer to
one question — and a question implies somebody asked. That is what separates them from `warning`:

- **`error`** — the user asked for something and it did not happen. A submit that was rejected, an
  install they clicked, a screen that crashed out from under them.
- **`warning`** — something the app does on its own did not happen, and a fallback is intact. The user
  did not ask, so there is no question outstanding; there is a condition to know about and usually a
  retry to press.

Worked through the app's failures, this is not a close call. A failed backup runs unbidden on launch and
its banner *says which copy is still good* (ADR-0007), so the news is a gap in protection, not a loss —
`warning`. A failed restore's whole message is that the current database was left alone (ADR-0008) —
`warning`. The refusal line (`form-error` when this was written, `refusal-line` since #88) and a failed
update install are both things the user just pressed — `error`. The crash boundary is `error` despite the
app initiating it, because the fallback test decides it: there is no older screen still good to fall
back to.

The rule exists because the alternative is deciding per banner, which is how six banners end up with
four opinions. A new failure asks these two questions and gets its glyph.

**Two glyphs are not Phosphor and do not live in the record.** `Spinner` and `RunningIndicator` came
from a spinner set, on a 24 grid, and their meaning is a loop rather than a shape. They are separate
exports for that reason.

### The loops belong to the theme

Both arrived animating themselves through SMIL `<animate>` elements. **SMIL does not read CSS.** Those
glyphs would have kept turning through High-contrast's `--animate-*: none` and through
`prefers-reduced-motion` alike — precisely the second motion code path ADR-0004 exists to prevent.

So `--animate-spin` and `--animate-pulse-ring` join the motion tokens, declared by all three themes and
set to `none` in High-contrast alongside steam and breath. The artwork is unchanged; only the engine is.

`--animate-spin` deliberately **shadows Tailwind's built-in of the same name**, so a component reaching
for `animate-spin` out of habit gets the themed one and is turned down with everything else.

Each is built so that stopping the loop costs the pleasure and not the message — ADR-0004's rule that no
state is signalled by motion alone. A spinner that does not turn is still a ring, and the button beside
it still says "Saving…". The running indicator's dot is the state and never moves; only the ring around
it pulses, and it starts at the dot's own radius so the still version is a ring resting on a dot rather
than an empty box. The original artwork grew a ring from `r="0"`, which would have vanished completely
the moment a theme turned the loop off.

## What survives from ADR-0004

**The titlebar's minimize and close stay hand-drawn.** Two paths still are not a library, and the
sentence this ADR amends is still true of them. What changed is not the principle but the scope: the set
earns its place on navigation, on row actions and on a status vocabulary — none of which existed when
that sentence was written.

**No icon names a colour.** Every glyph is `currentColor`, so ADR-0004's rule that a raw hex in a
component is a defect holds for artwork too, with no exception carved out. A guard reads the source and
fails on a hex.

**Themed assets vary fidelity, not only hue** (ADR-0004) is untouched and still unexercised. An icon
inherits its colour and is the same shape in every theme; it is not a themed asset in that sense. The
provision still waits for the Mug.

## Consequences

- Adding a glyph is adding a path to one record. No install, no version bump, no licence question at
  the point of use — Phosphor is MIT, once, here.
- Glyphs are `aria-hidden` with no way to pass a label in. A glyph that has to speak is a control
  missing its `aria-label`, and that is the bug to fix rather than route around.
- The set is stocked ahead of its callers, so #56, #57 and #58 consume a name instead of pasting a path.
  The cost is a record with entries nothing references yet.
- Stocking ahead has a second cost, found on 2026-08-18: the components with no open issue against them
  had nowhere to receive the pointer, so the status vocabulary sat unused while every banner stayed text
  only. #70 wires them. A set stocked ahead of its callers needs the callers ticketed at the same time.
- `warning` is the composite glyph, and #70 is the first thing to render it anywhere. Until those banners
  are looked at in the running app, the assembled exclamation has only ever been reasoned about.
- Cost: the app carries a copy of somebody else's artwork rather than a dependency that could be
  updated. Re-fetching a glyph is a manual act. This is the right trade for an offline app with roughly
  thirty icons and the wrong one at three hundred.
- Cost: `warning` is the one glyph nobody upstream drew, so its correctness is not obvious from its
  source and no test can judge it. It was checked by eye across all three themes at 16, 32 and 96px.
  The guard asserts its two paths carry **no** `transform` — the signature of somebody having scaled a
  borrowed glyph down again, which is exactly the mistake that made the first attempt read wrong.
- Two icon *sets* are now in play — Phosphor for shape, a spinner set for the two loops. Held to one
  set, not two, was the rule going in; the exception is that a loop is not a shape and Phosphor does not
  draw one.
