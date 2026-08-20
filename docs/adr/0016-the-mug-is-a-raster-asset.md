# ADR-0016: The Mug is a raster asset, and the first static file in the bundle

- **Status**: Accepted
- **Date**: 2026-08-20
- **Amends**: ADR-0004, whose fourth token class — the Mug — was deferred, and whose provision that a
  themed asset varies its fidelity is narrowed here to *drawn* assets. Nothing in ADR-0004 is reversed.
- **Relates to**: ADR-0014, which made inline path data the rule for the **icon set**. That rule is
  untouched: a brand mark is not an icon.

## Context

ADR-0004 specified a smiling coffee mug as the app's mark and its fourth token class — nine custom
properties, so a theme could flatten a shaded mug to an outline declaratively. Three attempts at
drawing it as hand-authored SVG were rejected, the last reading as a bowl of coffee with a face on it,
and the mark was deferred with the fidelity provision left behind as the rule any future one would face.

The diagnosis recorded on the prototype branch was **the method, not the drawing**: an agent authoring
SVG path data without ever seeing it render is a bad loop, and it took three passes to say so. That
diagnosis is why this is not a fourth attempt.

There is now a real asset. `src-tauri/icons/Mug.png` — cream cup, dark coffee, seen from slightly above,
884x776 with alpha — became the app icon on 2026-08-19 and was fanned out into `src-tauri/icons/` by
`npx tauri icon`. The dial's centre has carried an empty reserved slot for the mark since the overhaul,
and the titlebar's left cell has been the wordmark alone for the same reason.

Two things stood in the way of simply using it, and both are decisions rather than obstacles:

- **A raster cannot be themed.** Not by hue and not by fidelity.
- **No static-asset pattern existed.** Nothing in `src/` imported an image, there was no `public/` and
  no `src/assets/`, and every piece of artwork in the app was inline path data.

## Decision

The Mug is the **PNG**, imported as a static asset. `src/assets/mug.png`, 256x225, downscaled from the
icon source with alpha intact and committed. It is the same mug as the app icon, which is the point:
one face, one file lineage, no second drawing to keep in sync.

**Two slots, one component.** `AppMark` is the only thing that draws it — the dial's centre and the
titlebar's left cell both call it and decide nothing but a width. The reason is the one ADR-0004 gives
for the control vocabulary living in two files: the copies disagree, and by the time anyone notices
there are four of them.

**Not traced to SVG.** Tracing a gradient-shaded render produces a pile of paths nobody authored, which
is the loop that failed three times wearing a different hat, and it would buy themeability of artwork
that is photographic rather than drawn. Rejected on the strength of the recorded diagnosis.

**A static asset is now a pattern, named once.** `src/assets/` holds files that are artwork in their own
right; Vite fingerprints and inlines them and the bundle stays offline-complete. This is deliberately
*not* a licence to add PNGs where a glyph belongs — ADR-0014's rule stands for anything in the icon set,
and the test for this directory is whether the thing is a drawing the app makes or an asset the app has.

### Fidelity varies to absence

ADR-0004's provision — a Theme may vary an asset's fidelity, not only its hue — is narrowed to **drawn**
assets, where a token set is what makes it possible. The Mug is not one, so the provision is answered the
only honest way available:

- **Walnut** and **Sand** show the mark unchanged. It is one shaded cream object in both.
- **High-contrast** shows **no mark at all**. That theme's contract is that nothing is soft; a shaded
  photograph cannot flatten to an outline, and outlining one means nothing. Absence is a fidelity.

Nothing is lost by dropping it, and that is the test it had to pass: the mark is decorative, and the
digits and the word *paused* carry everything it could have said.

The rule is spent in the **stylesheet**, not in the component. A theme is answered by the cascade — the
same reason ADR-0004 gives for there being no reduced-motion branch anywhere in `src/`.

### The mark carries the held block's third signal

`CONTEXT.md` recorded that a held block had dropped to two signals — the word *paused*, the muted ring —
where the mug design had five, "so there is no spare. Whatever replaces the mug should carry one."

The Mug **dims when held**. It is a **level rather than a movement**, which is what the parked
coffee-level idea was actually about: reduced motion and High-contrast alike set every loop to `none`, so
a state that only moved would vanish, and held is the one state of this screen that reads as a broken app
if it goes unsaid. A raster cannot drain, so the level it carries is its own opacity.

That is the debt paid. Three signals, and the mark is the third.

## Consequences

- **Both reserved slots are filled** — the dial's `data-dial-mark`, now `data-app-mark`, and the
  titlebar's left cell. The test that asserted the dial slot stay empty is inverted into one that
  asserts the mark is there and dims. The titlebar's mark does **not** dim: held is the pill's to say,
  and a bar present on every screen is the wrong place to repeat it.
- **The Mug's nine colour tokens are never written.** ADR-0004's fourth token class does not arrive; it
  is answered by a file instead. A user-authored theme cannot restyle the mark — it can only be shown or
  hidden, which is what High-contrast does.
- **Two motion tokens are left unspent.** `--animate-steam` has nothing to rise from, and `deliberate`
  was written for the mug pouring out on a manual stop. Both stay declared by all three themes rather
  than being deleted, because the cost is three lines and removing a tier is the kind of change that
  reshapes every duration around it. Recorded in `CONTEXT.md` → Motion so neither reads as an oversight.
- **Sand needs no second file, and the reason is measurable.** ADR-0004 recorded the cost that killed
  the earlier attempts — "on Sand a cream mug on a cream surface is simply invisible, so it had to
  become a dark object on a light table" — and the shipped raster cannot invert. Measured against
  `--color-surface`, its ceramic is indeed invisible on Sand at **1.07:1**. What saves it is that the
  asset carries *two* tones: the coffee reads there at **10.38:1**, and on Walnut the pair swaps
  (ceramic 12.90:1, coffee 1.33:1). Its internal contrast is 9.71:1 in both.

  So a one-file mark survives a light theme and a dark one **only if it is not one tone**, which is
  luck rather than design here and is now a test: `contrast.test.ts` asserts that at least one of the
  Mug's tones clears the non-text bar in every theme that shows it. A flat single-tone mug fails it.
  That is also the honest reading of ADR-0004's "one deliberate authoring per theme" cost — the way out
  of paying it is an asset with its own light and dark, not a tint.
- The mark's size is **one constant per slot** — `pomodoro-dial.tsx` and `titlebar.tsx` — and both are
  perceptual values. `AppMark` takes a width and derives only the height, from the asset's own aspect.
- The asset has **three measurements, and they live apart**: its aspect ratio in `app-mark.tsx`, because
  that is where the `height` attribute is written, and its optical offset in `styles.css`, because that
  is a nudge in the same family as `glyph-label`'s and belongs with the other one. Each points at the
  other, and its two tones in `contrast.test.ts` for the visibility guard. All three are properties of
  `mug.png` and all three have to be redone together if it is replaced, which is the cost of the split
  and the reason it is written down here.
- **`--text-dial` went 66px to 60px** as part of this change, so the digits give the mark room. Recorded
  as an amendment on ADR-0004, since it is that ADR's token: a theme token changing value silently is
  how a contract stops being one.
- The dial's mark is **88px against 60px digits** — the wider of the two — tuned by the owner's eye on
  the running app. `CONTEXT.md` → Mug was reworded for it, from "never grows enough to compete with the
  digits" to the digits leading by **weight**: largest type, the only thing that moves, the only thing
  in the circle that speaks. The old wording would have left the app knowingly failing its own rule,
  and it was the weaker statement anyway — the 190px prototype variant it was written about failed
  because it had no ring, not because of a ratio. What a test can still hold is containment inside the
  ring, and that is what it holds.
- Cost: the app carries a 39KB binary that no diff can review. The same trade ADR-0014 took for
  borrowed path data, in a form that is more opaque and less likely to change.
