/**
 * The theme contract (ADR-0004). Every shipped theme defines all of these, and
 * components reference them through Tailwind utilities — never a raw value.
 *
 * A Theme is colour, shape, type and motion, not colour alone: a duration
 * written into a component is the same defect as a hex written into one, and
 * High-contrast has to be able to turn the motion down. So the contract is one
 * list and a theme either satisfies all of it or is not a theme.
 */

export const colourTokens = [
  "--color-surface",
  "--color-surface-raised",
  // The two that let content be grouped without a line drawn round it: a card
  // is a soft raised fill, and where a line is unavoidable it is a hairline.
  "--color-surface-soft",
  "--color-hairline",
  "--color-ink",
  "--color-ink-muted",
  "--color-border",
  "--color-accent",
  "--color-danger",
] as const;

/** Raised radii, so `corner-shape: squircle` has something to round. */
export const shapeTokens = [
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-xl",
] as const;

export const typeTokens = ["--font-sans"] as const;

/**
 * The motion tiers a component may name. `bounce` is its own tier rather than
 * a use of `base`: an overshoot inside 220ms has no room for its return leg and
 * reads as a glitch rather than as spring.
 */
export const motionTiers = [
  "quick",
  "base",
  "bounce",
  "page",
  "deliberate",
] as const;

export type MotionTier = (typeof motionTiers)[number];

export const motionTokens = [
  "--motion-quick",
  "--motion-base",
  "--motion-bounce",
  "--motion-page",
  "--motion-deliberate",
  // How far a route change travels along the tab bar's order. A length rather
  // than a duration, but it is turned down by the same hands.
  "--motion-page-travel",
  "--ease-out-soft",
  "--ease-in-quick",
  "--ease-in-out-soft",
  "--ease-bounce-soft",
  "--ease-bounce-snap",
  // The loops. Steam and breath were the first two; the icon set added the two
  // that carry activity. `--animate-spin` deliberately shadows Tailwind's own
  // built-in of that name, so a component reaching for `animate-spin` out of
  // habit gets the themed one and is turned down with everything else.
  "--animate-steam",
  "--animate-breath",
  "--animate-spin",
  "--animate-pulse-ring",
] as const;

export const themeTokens = [
  ...colourTokens,
  ...shapeTokens,
  ...typeTokens,
  ...motionTokens,
] as const;

export type ThemeToken = (typeof themeTokens)[number];

export const themeNames = ["walnut", "sand", "high-contrast"] as const;

export type ThemeName = (typeof themeNames)[number];

export const defaultTheme: ThemeName = "walnut";

/** What "follow the system" resolves to, once the OS has been asked. */
const systemThemes = { dark: "walnut", light: "sand" } as const;

/**
 * Which theme is on screen, given a choice and what the OS prefers.
 *
 * `followSystem` is off by default and has to be turned on deliberately: an app
 * flipping to a light theme at sunset is a bug, not a feature (ADR-0004). While
 * it is on it is the only thing in charge — so the Settings screen disables the
 * picker rather than showing a choice that nothing acts on.
 */
export function resolveTheme(
  chosen: { theme: ThemeName; followSystem: boolean },
  prefersDark: boolean,
): ThemeName {
  if (!chosen.followSystem) {
    return chosen.theme;
  }
  return prefersDark ? systemThemes.dark : systemThemes.light;
}

/**
 * Switching a theme swaps custom-property values on the document root. No
 * rebuild, no class-name permutations.
 */
export function applyTheme(
  theme: ThemeName,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme;
}
