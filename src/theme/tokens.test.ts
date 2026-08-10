import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fg from "fast-glob";
import { describe, expect, it } from "vitest";
import {
  defaultTheme,
  resolveTheme,
  themeNames,
  themeTokens,
} from "./tokens";

const srcDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const stylesheet = readFileSync(path.join(srcDir, "styles.css"), "utf8");

describe("theme tokens", () => {
  it("declares the default theme's tokens in the Tailwind @theme block", () => {
    const [, themeBlock] = stylesheet.match(/@theme\s*\{([^}]*)\}/) ?? [];
    expect(themeBlock, "no @theme block in styles.css").toBeDefined();

    for (const token of themeTokens) {
      expect(themeBlock, `${token} missing from @theme`).toContain(`${token}:`);
    }
  });

  it("overrides every token in every non-default theme", () => {
    const overrides = new Map(
      [...stylesheet.matchAll(/\[data-theme="([\w-]+)"\]\s*\{([^}]*)\}/g)].map(
        ([, theme, body]) => [theme, body],
      ),
    );

    for (const theme of themeNames.filter((name) => name !== defaultTheme)) {
      const body = overrides.get(theme);
      expect(body, `no [data-theme="${theme}"] block in styles.css`).toBeDefined();

      for (const token of themeTokens) {
        expect(body, `${token} missing from theme "${theme}"`).toContain(
          `${token}:`,
        );
      }
    }
  });

  it("gives the default theme no override block of its own", () => {
    expect(stylesheet).not.toContain(`[data-theme="${defaultTheme}"]`);
  });
});

describe("which theme is actually on screen", () => {
  it("uses the chosen theme, whatever the OS thinks", () => {
    for (const prefersDark of [true, false]) {
      expect(
        resolveTheme({ theme: "sand", followSystem: false }, prefersDark),
      ).toBe("sand");
      expect(
        resolveTheme(
          { theme: "high-contrast", followSystem: false },
          prefersDark,
        ),
      ).toBe("high-contrast");
    }
  });

  it("follows the OS only when asked to", () => {
    expect(resolveTheme({ theme: "sand", followSystem: true }, true)).toBe(
      "walnut",
    );
    expect(resolveTheme({ theme: "walnut", followSystem: true }, false)).toBe(
      "sand",
    );
  });
});

describe("ADR-0004: components reference tokens, never raw hex", () => {
  it("finds no colour literals in component source", () => {
    const files = fg.sync(["**/*.{ts,tsx}"], {
      cwd: srcDir,
      absolute: true,
      ignore: ["**/*.test.{ts,tsx}"],
    });
    expect(files.length, "guard scanned no files").toBeGreaterThan(0);

    const offenders = files.flatMap((file) => {
      const lines = readFileSync(file, "utf8").split("\n");
      return lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) =>
          /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\s*\(/.test(line),
        )
        .map(
          ({ line, index }) =>
            `${path.relative(srcDir, file)}:${index + 1}: ${line.trim()}`,
        );
    });

    expect(offenders).toEqual([]);
  });
});
