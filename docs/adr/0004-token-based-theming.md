# ADR-0004: Token-based theming — colour, motion, and the window chrome

- **Status**: Accepted
- **Date**: 2026-08-07
- **Amended**: 2026-08-12 — motion and the Mug join the token set; titlebar button geometry revised;
  no-maximize reaffirmed. Amended in place rather than superseded: nothing here was reversed.
- **Amended**: 2026-08-14 — shape and type join the token set (squircles, Inter → Nunito); the Mug is
  **deferred** after three rejected attempts, leaving the fidelity rule behind as provision.

## Context

The requested look is Japandi — dark walnut with sand tones — but themes must be switchable, with
user-authored themes plausible later. The window's titlebar is also expected to carry the theme's
colours, which native Windows decorations cannot do.

The 2026-08-12 amendment answers a second question the original left open. The app shipped with no
motion at all: every state change snapped, because nothing in the token set described how long
anything takes. The same amendment gives the app a logo — a smiling coffee mug — which is both an
identity and, once its coffee level tracks the block, a state indicator.

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

A fourth class — **the Mug** — was specified and is **deferred**: three attempts at drawing it were
rejected, so the app ships no mark and the titlebar's left cell is the wordmark alone. The provision
it left behind is the one below about fidelity, which is what a themed *asset* would need whenever one
arrives. See `CONTEXT.md` → Mug.

Shipped presets: **Walnut** (dark, default), **Sand** (light), **High-contrast**, plus an opt-in
"follow system" — off by default, because an app silently flipping to a light theme at sunset is a
bug, not a feature. The selection persists in the database.

### Motion

Five durations — `quick`, `base`, `bounce`, `page`, `deliberate` — five easings, and two loops, the
Mug's steam and the dial ring's breath. Values and rationale are in `CONTEXT.md`; what this ADR fixes
is where they live and what may not be written without them.

Tailwind v4 has `--ease-*` and `--animate-*` theme namespaces but **no duration namespace**, so
`duration-150` is a bare value that reads nothing. Durations are therefore plain `--motion-*` custom
properties plus `@utility` shorthands, so a component writes `motion-base` and never a number. A test
enforces it, alongside the one that already forbids hardcoded UI strings: a rule about what may not
appear in a component is worth what it costs to break.

One exception, named as one: **the spring is not a token.** The tab bar's active pill and its sliding
neighbours are a spring, which is not a cubic-bézier and cannot be a CSS variable. It is a single
config in TypeScript. Two motion systems — CSS for state transitions, springs for layout — is honest;
a token only one library can read is not.

**No state is signalled by motion alone.** This is the constraint that makes motion safe to tokenise:
because reduced motion — the OS's, or High-contrast's own token values — sets the loops to `none` and
the durations to a millisecond, any state that only moved would vanish. So the Mug's coffee level (a
level, not a movement), the countdown digits and the word *paused* each carry the state on their own,
and motion is the pleasure rather than the message.

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

### Themed assets vary fidelity

A Theme may vary an asset's **fidelity, not only its hue**: High-contrast wants an outline where Walnut
wants something soft, and recolouring a soft thing to yellow would honour the token while breaking that
theme's promise that nothing is soft. This is why a themed asset is a token set rather than a file.

Nothing exercises it yet — it was written for the Mug, which is deferred — so treat it as the rule any
future mark is held to rather than as a description of something shipping.

### The window chrome

The window runs with `decorations: false` and a custom titlebar built from the same tokens: the
wordmark left, live timer pill centre when running, **minimize + close** right.

Those buttons are **28×28 with inline-SVG glyphs**, transparent until hover — revised from the
original ~12px bare circles, which were both unlabelled and genuinely hard to hit. Close still hovers
to the warm terracotta `--color-danger` rather than the usual harsh red. The glyphs are two hand-drawn
paths on `currentColor`; an icon dependency for a horizontal rule and a cross is not worth the bundle
or the licence.

**Still no maximize**, and the reason is now stronger than when it was a mitigation. Every screen is
single-column by design — the Clients screen became an accordion rather than a master-detail pair
precisely because the window is narrow — so a maximized TimeBuddy would be one column of content in
the middle of an empty desktop. There is nothing for the width to do.

## Consequences

- Switching a theme swaps variable values at runtime. No rebuild, no class-name permutations.
- User-authored themes become "read a token set from a row instead of a constant" — additive, not a
  refactor. That now includes motion and the Mug, so an author can make the app calmer or stiller.
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
  route transitions, the undo toast and the three banners. Its weight is local — a desktop app pays
  no network cost for it.
- A themed asset costs one deliberate authoring per theme, not one asset and two tints — the mug
  attempts proved that much: on Sand a cream mug on a cream surface is simply invisible, so it had to
  become a dark object on a light table. Worth knowing before the next mark is attempted.
- Windows only for v1. macOS puts these buttons on the left in a different order; that work is pure
  cost until someone else needs it.
