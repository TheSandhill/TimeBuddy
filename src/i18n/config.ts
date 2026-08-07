import i18next, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import nl from "./locales/nl.json";

export const supportedLanguages = ["nl", "en"] as const;
export type Language = (typeof supportedLanguages)[number];

/** Dutch is the shipped default; English is the fallback for missing keys. */
export const defaultLanguage: Language = "nl";

export const resources = {
  nl: { translation: nl },
  en: { translation: en },
} as const;

/**
 * Builds an isolated i18next instance. Tests render against their own instance
 * so a language switch in one test cannot leak into the next.
 */
export function createI18n(language: Language = defaultLanguage): I18nInstance {
  const instance = i18next.createInstance();

  instance.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: defaultLanguage,
    interpolation: { escapeValue: false },
  });

  return instance;
}

export const i18n = createI18n();
