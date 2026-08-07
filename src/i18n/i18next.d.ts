import type nl from "./locales/nl.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof nl };
  }
}
