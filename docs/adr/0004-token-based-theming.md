# ADR-0004: Token-based theming, including the window chrome

- **Status**: Accepted
- **Date**: 2026-08-07

## Context

The requested look is Japandi — dark walnut with sand tones — but themes must be switchable, with
user-authored themes plausible later. The window's titlebar is also expected to carry the theme's
colours, which native Windows decorations cannot do.

## Decision

A Theme is a set of **CSS custom properties** (`--color-surface`, `--color-ink`, `--color-accent`,
…) declared through Tailwind v4's `@theme`. Components reference tokens; **raw hex in a component
is a defect**.

Shipped presets: **Walnut** (dark, default), **Sand** (light), **High-contrast**, plus an opt-in
"follow system" — off by default, because an app silently flipping to a light theme at sunset is a
bug, not a feature. The selection persists in the database.

The window runs with `decorations: false` and a **custom titlebar** built from the same tokens:
wordmark left, live timer pill centre when running, and small (~12px) rounded **minimize + close**
buttons right — close hovering to a warm terracotta rather than the usual harsh red.

## Consequences

- Switching a theme swaps variable values at runtime. No rebuild, no class-name permutations.
- User-authored themes become "read a token set from a row instead of a constant" — additive, not a
  refactor.
- The titlebar is themeable and matches the app, which is the whole reason for `decorations: false`.
- Cost: dropping native decorations forfeits Windows Snap Layouts, double-click-to-maximize and
  drag-to-edge snapping. Mitigated by offering **no maximize at all** — the window is resizable with
  a minimum width, which suits a tool that is mostly a start button. That sidesteps reimplementing
  snap behaviour entirely.
- Dragging requires explicit `data-tauri-drag-region`, and the close button must be wired by hand.
  Here it minimises to tray (the timer keeps running), so **quitting lives in the tray menu** — with
  a one-off toast the first time, since silent tray-hiding reads as a crash.
- Windows only for v1. macOS puts these buttons on the left in a different order; that work is pure
  cost until someone else needs it.
