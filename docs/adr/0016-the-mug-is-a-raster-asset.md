# ADR-0016: The Mug is a raster asset, and the first static file in the bundle

- **Status**: Accepted
- **Date**: 2026-08-20
- **Amends**: ADR-0004, whose fourth token class — the Mug — was deferred, and whose provision that a
  themed asset varies its fidelity is narrowed here to *drawn* assets. Nothing in ADR-0004 is reversed.
- **Relates to**: ADR-0014, which made inline path data the rule for the **icon set**. That rule is
  untouched: a brand mark is not an icon.
- **Amended**: 2026-08-20 — the mark **gains drawn steam**, so it is a raster body with an SVG overlay
  rather than a raster alone. `--animate-steam` stops being unspent and slows from 3.2s to 5.4s. One
  new rule comes with it: this is the app's first loop that reduced motion **removes** instead of
  stilling. Amended in place — the body is still the icon's own file and nothing below is reversed.

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
- **No motion token is left unspent.** Both that this ADR stranded — `--animate-steam` and
  `deliberate` — are spent by the 2026-08-20 steam amendment: the loop on the plumes, the tier on their
  fade in and out. The mug's nine *colour* tokens are still the ones never written, and they never will
  be.
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

## Amendment, 2026-08-20: the steam is drawn

The mark now steams while a block runs. The body is unchanged; the steam is five soft ellipses in an
inline SVG over it.

**Why this is not a fourth attempt at drawing the mug.** The rejected attempts were the *cup* — a
recognisable object with a face, where every proportion is judged against something everyone already
knows. A plume has no correct shape. It is the one part of this mark that can be authored without
seeing it render and still be defensible, and the one part a photograph fundamentally cannot do: a
raster cannot rise.

**Vapour rather than particles.** The naive version — a few wisps pulsing their opacity in place — is
what the brief explicitly rejected. Three things separate this from it, recorded because each is a
thing somebody would later "simplify" back out:

- **The plumes drift through a stationary noise field.** `feTurbulence` feeds an `feDisplacementMap` on
  the parent group, so the distortion is fixed in space while the plumes travel through it. Each plume
  is a different shape at every height and the group never repeats. Putting the filter on each plume
  instead gives three identically-distorted shapes, which is the particle look again.
- **They spread as they rise.** Something that only translates reads as an object moving. Vapour
  expands and thins, so scale and opacity travel with the position.
- **They are out of phase.** Staggered by fifths of the loop, with different drifts, widths and
  stretches, so no frame has them agreeing with each other. Negative delays start each one already
  mid-rise, so the column is continuous from the first frame rather than building up over a period.
- **There are enough of them.** Three left countable gaps in the column at this size, and anything you
  can count reads as particles. Five is the number the owner's eye settled on; the plume count is a look
  to tune, not a constant with a reason, and the test holds a floor rather than a figure.

**The turbulence is static, and that is a constraint rather than a compromise.** Animating a filter
primitive means SMIL, and **SMIL does not read CSS** — the exact defect ADR-0014 moved the spinner and
the pulse ring off. An animated turbulence would have kept billowing through High-contrast's
`--animate-steam: none` and through `prefers-reduced-motion` alike. Static field, CSS-driven subject,
one motion code path.

### Reduced motion removes this loop instead of stilling it

Every other loop is built so that stopping it costs the pleasure and not the message: a spinner that
does not turn is still a ring (ADR-0014), and the running indicator's dot never moves in the first
place. **Steam has no still form worth having.** Three blurred plumes frozen mid-rise are a grey
smudge above the cup — it reads as a rendering fault, not as calm.

So `prefers-reduced-motion` sets `display: none` on the steam layer rather than only zeroing its
animation. That is allowed by ADR-0004's actual rule rather than an exception to it: *running* is the
moving digits and the breathing ring, the steam never carried it, so nothing is lost by its absence.
`CONTEXT.md` → Motion records it as the one loop that is removed, because "the loops go to `none`" is
otherwise a fair description of every other one.

High-contrast drops it too, with the mug — the selector names both, because the two are siblings and a
rule naming only the image would leave plumes rising out of nothing.

### Consequences of the amendment

- **The titlebar does not steam**, and cannot be made to without contradicting `CONTEXT.md` → Motion:
  "nothing is on the titlebar", because the bar is on every screen and an animation there would be in
  the corner of the eye permanently. `AppMark` takes `steaming`, and only the dial passes it.
- **The steam follows the ring, not the block.** A held cup that went on steaming is the same
  disagreement as a ring breathing over a stopped countdown.
- **It fades rather than appears, and that spends `deliberate`.** Start and Stop are the moment that
  tier was written for — "the one animation allowed to be slow enough to notice, the Mug pouring out
  when a block is stopped by hand". The pour-out is not available to a photograph; the steam
  dissipating is, and it is the same beat. Soft in-out both ways rather than the usual quick-in on the
  way out, because an abrupt departure is the thing being fixed.
- **The layer is mounted before Start is pressed**, faded out rather than absent. A layer that arrived
  on Start would snap, for the reason the prototype recorded about disclosures: rebuilt already-open,
  there is no `0fr` to spring from. `visibility` is transitioned alongside the opacity so the hidden
  state still costs nothing — otherwise the turbulence repaints behind a transparent layer on an idle
  Timer screen.
- **The digits needed a stacking order.** The steam rises past them and the mark comes later in the
  tree, so painting order alone would put vapour over the countdown. The digits are `relative z-10`.
- **The optical offset moved from the image to its wrapper** when the mark steams, so the plumes and
  the cup shift together. Left on the image alone, the steam would rise 6px beside the mouth.
- Two of the steam's values live in `app-mark.tsx` rather than the stylesheet, because SVG filter
  primitives take attributes and an attribute cannot read a custom property. They are the two that
  decide whether this reads as vapour at all, which is unfortunate placement for the most important
  knobs; the comment says so at both ends.
- Cost: the turbulence and displacement repaint every frame the plumes move, over a filter region about
  twice the mark's box. Cheap at 88px on one screen; not a pattern to spread.
- **The steam takes a theme token, and the mug's body still cannot.** `--color-steam` joins the colour
  contract, because steam is the one thing whose tone relative to the surface has to invert — lighter
  than a dark room, a faint darker haze against a bright one. On `--color-ink-muted`, which it borrowed
  first, Sand got black smoke. Sand also takes a lower `--steam-opacity`: a haze that subtracts light
  accumulates where one that adds it does not.

  Worth noting what this means for the ADR above. The decision "the Mug is a raster, so its fidelity
  cannot vary" is intact for the *body* and now plainly false for the mark as a whole. The drawn half
  varies per theme exactly as ADR-0004's provision always said a drawn asset should, and it is the
  first thing in the app to do so.
- **A held block dims the circle.** A scrim covers the ring's inside — `bg-surface` at an alpha, so it
  pulls everything back towards whatever the theme's surface already is and reads correctly on a dark
  theme and a light one with no branch. It stops at the track on purpose: the ring is the one thing that
  says *how much is left*, and that stays true while a block is held. The glyph sits above it, and the
  two animate on different tiers — `bounce` for the glyph, which overshoots, and `base` for the scrim,
  because a dimming is a disclosure and a scrim swelling out of the middle reads as a bubble.
- Cost: thirteen values, and the look is the sum of them. Nobody can review this by reading the diff —
  it has to be looked at in the running app, which is the same exposure the mug itself had.
