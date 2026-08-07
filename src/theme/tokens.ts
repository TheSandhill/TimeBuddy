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
