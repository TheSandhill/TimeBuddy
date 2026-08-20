# ADR-0004: Token-based theming — colour, motion, and the window chrome

- **Status**: Accepted
- **Date**: 2026-08-07
- **Amended**: 2026-08-12 — motion and the Mug join the token set; titlebar button geometry revised;
  no-maximize reaffirmed. Amended in place rather than superseded: nothing here was reversed.
- **Amended**: 2026-08-14 — shape and type join the token set (squircles, Inter → Nunito); the Mug is
  **deferred** after three rejected attempts, leaving the fidelity rule behind as provision.
- **Narrowed**: 2026-08-19 by ADR-0015 — the route transitions leave the motion library for the
  platform's own, so the count below is three rather than two. Marked where it is now wrong.
- **Narrowed**: 2026-08-17 by ADR-0014 — the app takes an icon set, and two more loops join the motion
  tokens. The no-icon-dependency sentence below survives for the titlebar's two glyphs only. This is
  the first amendment that reverses rather than adds, which is why it is an ADR of its own.
- **Narrowed**: 2026-08-20 by ADR-0016 — the Mug arrives, as a **raster** rather than as this ADR's
  fourth token class. Its nine colour tokens are never written; the fidelity provision below is
  narrowed to *drawn* assets and answered for this one by High-contrast dropping the mark. Two motion
  tokens are left unspent by the same change — see the note under *Motion*.
- **Amended**: 2026-08-20 — the Mug gains drawn steam (ADR-0016 amendment), which spends both tokens the
  parked mug had left stranded: `--animate-steam`, retuned from 3.2s to 5.4s, and `deliberate`, on the
  steam's fade in and out. The loops are still two, and every duration is in use again.
- **Amended**: 2026-08-20 — **`--text-dial` goes 66px to 60px**, to make room under the digits for the
  mark ADR-0016 puts there. The token is unchanged in kind and still the only size in the contract;
  what changed is that the digits are no longer the largest *thing* in the dial, only the largest type.
  Recorded here because a theme token changing value silently is how a contract stops being one.

## Context

The requested look is Japandi — dark walnut with sand tones — but themes must be switchable, with
user-authored themes plausible later. The window's titlebar is also expected to carry the theme's
colours, which native Windows decorations cannot do.

The 2026-08-12 amendment answers a second question the original left open. The app shipped with no
motion at all: every state change snapped, because nothing in the token set described how long
anything takes. The same amendment gives the app a logo — a smiling coffee mug — which is both an
identity and, once its coffee level tracks the block, a state indicator. *(The coffee level was
retired by ADR-0016 along with the drawing; the mark that shipped says held by dimming instead. This
paragraph is kept as the context the decision was taken in.)*

## Decision

A Theme is a set of **CSS custom properties** declared through Tailwind v4's `@theme`. Components
reference tokens; **a raw value in a component is a defect** — a hex, a duration and an easing alike.

A Theme covers three token classes:

- **Colour** — `--color-surface`, `--color-ink`, `--color-accent`, …
- **Shape** — `--radius-sm|md|lg|xl`, and squircle corners where the engine has them.
- **Motion** — five durations, five easings, two looping animations.

Motion belongs *inside* this decision rather than beside it in an ADR of its own. Otherwise two
documents would answer "what is a theme made of", and a user-authored theme would have to consult
both.

A fourth class — **the Mug** — was specified and then **abandoned as a token class** (ADR-0016). Three
attempts at drawing it were rejected; the mark that shipped instead is the app icon's own PNG, which
has no tokens to declare. The mark is in both slots now — the dial's centre and the titlebar's left
cell. The fidelity provision below survives, narrowed to drawn assets. See `CONTEXT.md` → Mug.

Shipped presets: **Walnut** (dark, default), **Sand** (light), **High-contrast**, plus an opt-in
"follow system" — off by default, because an app silently flipping to a light theme at sunset is a
bug, not a feature. The selection persists in the database.

### Motion

Five durations — `quick`, `base`, `bounce`, `page`, `deliberate` — five easings, and two loops, the
Mug's steam and the dial ring's breath. Values and rationale are in `CONTEXT.md`; what this ADR fixes
is where they live and what may not be written without them.

**`deliberate` is spent again.** It was written for the mug pouring out on a manual stop, which a raster
mark cannot do, and was briefly unspent for that reason. ADR-0016's steam amendment gives it the same
moment back: the steam fades in on Start and dissipates on Stop, slow enough to notice, which is the
whole of what that tier was ever for. **All five durations are in use.**

**`--animate-steam` was unspent and now is not.** ADR-0016's 2026-08-20 amendment gives the mark drawn
steam, and slows the loop from 3.2s to 5.4s — at this scale the original read as a twitch rather than as
vapour. It is also the app's **one loop that reduced motion removes rather than stills**: steam has no
still form, and it never carried a state, so `display: none` costs only the pleasure. Every other loop
still degrades to `none` in place.

Tailwind v4 has `--ease-*` and `--animate-*` theme namespaces but **no duration namespace**, so
`duration-150` is a bare value that reads nothing. Durations are therefore plain `--motion-*` custom
properties plus `@utility` shorthands, so a component writes `motion-base` and never a number. A test
enforces it, alongside the one that already forbids hardcoded UI strings: a rule about what may not
appear in a component is worth what it costs to break.

One exception, named as one: **the spring is not a token.** The tab bar's active pill and its sliding
neighbours are a spring, which is not a cubic-bézier and cannot be a CSS variable. It is a single
config in TypeScript. Two motion systems — CSS for state transitions, springs for layout — is honest;
a token only one library can read is not.

*Three since ADR-0015*, which moved the route change onto the platform's own view transitions. The
exception above is untouched by it: a spring is precisely what a view transition still cannot express,
which is why the tab indicator stayed behind when the screen underneath it left.

**No state is signalled by motion alone.** This is the constraint that makes motion safe to tokenise:
because reduced motion — the OS's, or High-contrast's own token values — sets the loops to `none` and
the durations to a millisecond, any state that only moved would vanish. So the pause glyph, the Mug's
greyness (a level, not a movement), the drained digits and the word *paused* each carry the state on
their own, and motion is the pleasure rather than the message. The held overlay animates in on
`bounce`; collapse that to a millisecond and the glyph is simply *there*, which is the whole test. The mug's *coffee* level was the original example
and is gone with the drawing (ADR-0016); that its replacement is still a level and not a movement is
the part of it that mattered.

### Shape, and type

Radii of 6 / 12 / 18 / 26 and a pill, with `corner-shape: squircle` layered on top. That property is
real in evergreen Chromium, which is what WebView2 is, and it degrades to the plain rounded corner the
radius already asked for — enhancement, never a dependency. The radii had to rise for it: a squircle at
4px is a rounded corner with extra steps.

Type moves from **Inter to Nunito** (`@fontsource-variable/nunito`, bundled — no CDN, the app must
render identically offline). Rounded terminals and open shapes read as warm rather than merely legible,
and it keeps the tabular figures a countdown cannot do without.

Two colour tokens exist purely to *remove* lines: `--color-surface-soft` and `--color-hairline`. A card
is a soft raised fill, not an outlined box — outlining every card, field, well and control at once is
what made the first prototype read as chaotic.

### One control vocabulary, in two files

Buttons live in `src/components/button.ts` and fields, labels and quiet headings in
`src/components/field.ts`. A screen imports from them and never dresses its own control: the commit
button had already been copied into four screens and the quiet one into four more, and by then the
copies disagreed. Reshaping the strings once is what let the whole app turn cosy without a screen-level
override anywhere.

`src/components/vocabulary.test.ts` guards it, next to the raw-hex and raw-duration guards and modelled
on them. It fails three things: a class list pairing `uppercase` with `tracking-*`, because a label is
sentence case and quiet rather than a wall of tracked capitals; a rounded box outlined in the neutral
`--color-border`, because a soft raised fill needs no line round it; and any file outside those two
declaring a constant named like a button, field or label treatment.

The fill itself is a `soft-fill` utility rather than `bg-surface-soft` written into the strings, because
High-contrast has to answer it differently: there the soft fill is `#0a0a0a` on `#000000`, which is
1.04:1 and not an edge at all. That theme outlines the same controls instead — the fidelity rule above,
finally exercised by something that ships. A screen reaching for that fill is inventing a field or a
control, so the guard fails that too.

**A hard border survives only where a line carries meaning.** `border-danger` on a failure and
`border-hairline` on a division are left alone by the guard, and the frame of the app — the titlebar and
the banners across the top — keeps `--color-border`. Nothing inside a screen outlines a card, a field
and a control all at once.

### Themed assets vary fidelity

A Theme may vary an asset's **fidelity, not only its hue**: High-contrast wants an outline where Walnut
wants something soft, and recolouring a soft thing to yellow would honour the token while breaking that
theme's promise that nothing is soft. This is why a themed asset is a token set rather than a file.

Narrowed by ADR-0016 to **drawn** assets, where a token set is what makes varying fidelity possible.
The Mug is not one — it is a raster — so it answers this the only way left: **High-contrast shows no
mark at all**. Varying fidelity includes varying it to nothing, and the test the mark had to pass is
that dropping it loses nothing, which holds because it is decorative.

The provision's other exerciser is the **control fill**, described further up under *One control
vocabulary*: High-contrast outlines what the other themes fill softly. That one is a treatment rather
than an asset, which is why both are named here — between them they are the whole of what "fidelity"
has ever meant in this ADR.

### The window chrome

The window runs with `decorations: false` and a custom titlebar built from the same tokens: the
wordmark left, live timer pill centre when running, **minimize + close** right.

Those buttons are **28×28 with inline-SVG glyphs**, transparent until hover — revised from the
original ~12px bare circles, which were both unlabelled and genuinely hard to hit. Close still hovers
to the warm terracotta `--color-danger` rather than the usual harsh red. The glyphs are two hand-drawn
paths on `currentColor`; an icon dependency for a horizontal rule and a cross is not worth the bundle
or the licence. **Narrowed by ADR-0014**, which takes an icon set for the rest of the app: this
sentence still holds for these two glyphs, and they stay hand-drawn.

**Still no maximize**, and the reason is now stronger than when it was a mitigation. Every screen is
single-column by design — the Clients screen became an accordion rather than a master-detail pair
precisely because the window is narrow — so a maximized TimeBuddy would be one column of content in
the middle of an empty desktop. There is nothing for the width to do.

## Consequences

- Switching a theme swaps variable values at runtime. No rebuild, no class-name permutations.
- User-authored themes become "read a token set from a row instead of a constant" — additive, not a
  refactor. That now includes motion. It does **not** include the Mug: since ADR-0016 the mark is a
  file, so an author can make the app calmer or stiller but cannot restyle its face — only show or
  hide it, which is what High-contrast does.
- The titlebar is themeable and matches the app, which is the whole reason for `decorations: false`.
- Cost: dropping native decorations forfeits Windows Snap Layouts, double-click-to-maximize and
  drag-to-edge snapping. Mitigated by offering **no maximize at all** — the window is resizable with
  a minimum width, which suits a tool that is mostly a start button. That sidesteps reimplementing
  snap behaviour entirely.
- Dragging requires explicit `data-tauri-drag-region`, and the close button must be wired by hand.
  Here it minimises to tray (the timer keeps running), so **quitting lives in the tray menu** — with
  a one-off toast the first time, since silent tray-hiding reads as a crash.
- Motion needs a library: exit animations on unmount and a shared sliding indicator are not things
  plain CSS does without hand-rolled state. One dependency (`motion`) covers the tab indicator, the
  route transitions, the undo toast and the three banners. **The route transitions left in ADR-0015**;
  the other three are why the dependency stays, and are the ones this reasoning was always really about. Its weight is local — a desktop app pays
  no network cost for it.
- A themed asset costs one deliberate authoring per theme, not one asset and two tints — the mug
  attempts proved that much: on Sand a cream mug on a cream surface is simply invisible, so it had to
  become a dark object on a light table. **The shipped mark does not pay that cost and so is exposed to
  it**: it is one cream raster, and Sand's surface is within a few points of its body. Looked at on
  Sand on 2026-08-20 it reads — the coffee and the shading are enough — but it is the theme to check
  first if the asset is ever replaced, and a second file for Sand is the fix.
- Windows only for v1. macOS puts these buttons on the left in a different order; that work is pure
  cost until someone else needs it.
