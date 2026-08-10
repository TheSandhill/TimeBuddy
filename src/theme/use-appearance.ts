/**
 * Everything the saved settings change about how the app looks, applied while
 * it runs.
 *
 * Both halves are deliberately a swap rather than a reload: a theme is a set of
 * custom property values on the document root (ADR-0004), and a language is a
 * call to the live i18next instance. Nothing here rebuilds, remounts, or
 * restarts — which is what makes the Settings screen feel like a preference
 * pane instead of a config file.
 */

import { useEffect, useSyncExternalStore } from "react";
import type { i18n as I18nInstance } from "i18next";
import { useSettings } from "../data/use-settings";
import { defaultLanguage, i18n as appI18n } from "../i18n/config";
import type { Language } from "../i18n/config";
import {
  applyTheme,
  defaultTheme,
  resolveTheme,
  type ThemeName,
} from "./tokens";

const DARK = "(prefers-color-scheme: dark)";

/**
 * The OS preference, or `false` where there is nothing to ask — jsdom, a
 * locked-down webview. A fixed theme beats an unstyled one.
 */
function darkQuery(): MediaQueryList | null {
  return typeof matchMedia === "function" ? matchMedia(DARK) : null;
}

function subscribe(onChange: () => void): () => void {
  const query = darkQuery();
  if (query === null) {
    return () => {};
  }
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Re-renders when Windows switches between its light and dark mode. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => darkQuery()?.matches ?? false,
    () => false,
  );
}

export interface Appearance {
  theme: ThemeName;
  followSystem: boolean;
  language: Language;
  /** The instance to switch. Tests pass their own; the app has only one. */
  i18n?: I18nInstance;
}

export function useAppearance({
  theme,
  followSystem,
  language,
  i18n = appI18n,
}: Appearance): void {
  const prefersDark = usePrefersDark();
  const shown = resolveTheme({ theme, followSystem }, prefersDark);

  useEffect(() => {
    applyTheme(shown);
  }, [shown]);

  useEffect(() => {
    // Screen readers and hyphenation read this, not the i18next instance.
    document.documentElement.lang = language;

    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [i18n, language]);
}

/**
 * The app's own appearance, off the settings row.
 *
 * It reads the same query the Settings screen writes, so saving is all that
 * screen has to do — there is no second, prettier copy of the truth. Until the
 * row arrives, and if it never does, the shipped defaults hold: a database that
 * cannot be read is not a reason to render the app unstyled.
 */
export function useSavedAppearance(): void {
  const settings = useSettings();

  useAppearance({
    theme: settings.data?.theme ?? defaultTheme,
    followSystem: settings.data?.followSystem ?? false,
    language: settings.data?.language ?? defaultLanguage,
  });
}
