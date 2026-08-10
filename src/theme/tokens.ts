/**
 * The theme contract (ADR-0004). Every shipped theme defines all of these, and
 * components reference them through Tailwind utilities — never a raw colour.
 */
export const themeTokens = [
  "--color-surface",
  "--color-surface-raised",
  "--color-ink",
  "--color-ink-muted",
  "--color-border",
  "--color-accent",
  "--color-danger",
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
