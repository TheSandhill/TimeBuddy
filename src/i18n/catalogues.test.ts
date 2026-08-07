import { describe, expect, it } from "vitest";
import { defaultLanguage, resources, supportedLanguages } from "./config";

/** Flattens a nested catalogue into dot-separated leaf keys. */
function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n catalogues", () => {
  it("defaults to Dutch", () => {
    expect(defaultLanguage).toBe("nl");
  });

  it("ships exactly nl and en", () => {
    expect([...supportedLanguages].sort()).toEqual(["en", "nl"]);
    expect(Object.keys(resources).sort()).toEqual(["en", "nl"]);
  });

  it("has the same keys in every language", () => {
    const nl = leafKeys(resources.nl.translation).sort();
    const en = leafKeys(resources.en.translation).sort();
    expect(en).toEqual(nl);
  });

  it("has no empty translations", () => {
    for (const [language, bundle] of Object.entries(resources)) {
      const empty = leafKeys(bundle.translation).filter((key) => {
        const value = key
          .split(".")
          .reduce<any>((node, part) => node?.[part], bundle.translation);
        return typeof value !== "string" || value.trim() === "";
      });
      expect(empty, `empty keys in ${language}`).toEqual([]);
    }
  });
});
