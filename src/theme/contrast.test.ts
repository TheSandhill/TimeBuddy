import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AA_BODY_TEXT,
  AA_NON_TEXT,
  contrastRatio,
  luminance,
  parseHex,
} from "./contrast";
import { defaultTheme, themeNames, type ThemeName } from "./tokens";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stylesheet = readFileSync(path.join(srcDir, "styles.css"), "utf8");

/**
 * The values a theme actually resolves to.
 *
 * Only the non-default themes have a block of their own; Walnut lives in
 * `@theme` and every other theme is read as an override on top of it, exactly
 * as the cascade does it at runtime.
 */
function tokensOf(theme: ThemeName): Record<string, string> {
  const block = (source: string) =>
    Object.fromEntries(
      [...source.matchAll(/(--color-[\w-]+):\s*([^;]+);/g)].map(
        ([, token, value]) => [token, value.trim()],
      ),
    );

  const base = block(stylesheet.match(/@theme\s*\{([^}]*)\}/)?.[1] ?? "");
  if (theme === defaultTheme) {
    return base;
  }

  const override = stylesheet.match(
    new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`),
  )?.[1];
  expect(override, `no block for theme "${theme}"`).toBeDefined();

  return { ...base, ...block(override ?? "") };
}

describe("the contrast maths", () => {
  it("reads both hex spellings", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("#2A211B")).toEqual([42, 33, 27]);
  });

  it("refuses anything that is not a colour", () => {
    expect(() => parseHex("var(--color-ink)")).toThrow();
  });

  it("agrees with the WCAG reference values", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
    expect(luminance("#000000")).toBeCloseTo(0, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#808080", "#808080")).toBeCloseTo(1, 5);
  });

  it("does not care which colour is named first", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#000000"),
      5,
    );
  });
});

/**
 * The gate from issue 7: "Every shipped theme passes a contrast check on body
 * text." A theme that fails this is not shippable, however nice it looks to
 * whoever picked the colours.
 */
describe("every shipped theme is readable", () => {
  it.each(themeNames)("%s puts body text well clear of AA", (theme) => {
    const tokens = tokensOf(theme);

    for (const background of [
      "--color-surface",
      "--color-surface-raised",
      // A soft fill is still a fill text sits on, so it is held to the same bar
      // as the surface it replaced a border on.
      "--color-surface-soft",
    ]) {
      expect(
        contrastRatio(tokens["--color-ink"], tokens[background]),
        `--color-ink on ${background} in "${theme}"`,
      ).toBeGreaterThanOrEqual(AA_BODY_TEXT);
    }
  });

  it.each(themeNames)("%s draws the scrollbar thumb visibly", (theme) => {
    const tokens = tokensOf(theme);

    // The thumb floats over whatever a screen is made of, and it is the app's
    // only readout of the scroll position now that the native bar is hidden
    // (#71). Not text, so the non-text bar — but a mark nobody can pick out of
    // the background is the same defect as unreadable body text. This is the
    // gate the cream that reads beautifully on Walnut fails on Sand at 1.2:1,
    // which is why the thumb has a token rather than a colour.
    for (const background of [
      "--color-surface",
      "--color-surface-raised",
      "--color-surface-soft",
    ]) {
      expect(
        contrastRatio(tokens["--color-scroll-thumb"], tokens[background]),
        `--color-scroll-thumb on ${background} in "${theme}"`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it.each(themeNames)(
    "%s keeps the highlighted dropdown option readable",
    (theme) => {
      const tokens = tokensOf(theme);

      // The open list highlights on the accent (#72), which makes the accent a
      // background text sits on for the first time — a light tan in Walnut, a
      // dark brown in Sand, a yellow in High-contrast. `surface-raised` is the
      // one ink that clears AA on all three, and it is the pairing the switch
      // thumb already leans on. A theme that retuned its accent without this
      // gate would land unreadable text in the one place nobody screenshots.
      expect(
        contrastRatio(
          tokens["--color-surface-raised"],
          tokens["--color-accent"],
        ),
        `--color-surface-raised on --color-accent in "${theme}"`,
      ).toBeGreaterThanOrEqual(AA_BODY_TEXT);
    },
  );

  it.each(themeNames)("%s keeps secondary text legible too", (theme) => {
    const tokens = tokensOf(theme);

    // Muted text carries dates, totals and hints — smaller and quieter, but
    // still text someone has to read, so it is held to the same bar. Quiet
    // buttons and labels sit on the soft fill, which is why it is in the list.
    for (const background of [
      "--color-surface",
      "--color-surface-raised",
      "--color-surface-soft",
    ]) {
      expect(
        contrastRatio(tokens["--color-ink-muted"], tokens[background]),
        `--color-ink-muted on ${background} in "${theme}"`,
      ).toBeGreaterThanOrEqual(AA_BODY_TEXT);
    }
  });
});
